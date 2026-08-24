import { OrderRepository, OrderWithLineItems } from "../../infrastructure/repositories/order.repository";
import { ExecutionLogRepository, ExecutionLogRecord } from "../../infrastructure/repositories/execution-log.repository";
import { LearningRecordRepository } from "../../infrastructure/repositories/learning-record.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { FeatureConfidenceCalculator } from "../../services/order-features/feature-confidence.calculator";
import { ProfitService } from "../../services/profit.service";
import { CanonicalEconomicsCalculator } from "../../services/economics/canonical-economics.calculator";
import { EventBus } from "../../infrastructure/events/event.bus";
import { ExecutionContextFactory } from "../../infrastructure/context/execution.context";

export interface OrderIntelligenceDTO {
  order: {
    id: string;
    orderNumber: number;
    totalPrice: number;
    subtotalPrice: number;
    totalTax: number;
    shippingPrice: number;
    discountAmount: number;
    isCOD: boolean;
    gateway: string | null;
    financialStatus: string;
    fulfillmentStatus: string;
    channelAttribution: string | null;
    customerName: string | null;
    customerEmail: string | null;
    city: string | null;
    province: string | null;
    pincode: string | null;
    createdAt: string;
    cogsAtTimeOfOrder: number | null;
    riskScore: number;
    riskLevel: string;
    riskReasons: Array<{ reason: string; impact: number }>;
    merchantRecommendation: string | null;
    protectionMode: string;
    executionStatus: string;
    lineItems: Array<{
      id: string;
      shopifyLineItemId: string;
      productId: string | null;
      title: string;
      variantTitle: string | null;
      quantity: number;
      unitPrice: number;
    }>;
  };
  intelligence: {
    riskScore: number;
    riskLevel: string;
    riskReasons: Array<{ reason: string; impact: number }>;
    decision: string;
    expectedValue: number;
    hasRealCogs: boolean;
    cogsUsed: number;
    forwardShipping: number;
    returnShipping: number;
    profitIfDelivered: number;
    lossIfRto: number;
    evidenceQuality: number;
    economicJustification: string;
    protectionMode: string;
    executionStatus: string;
  };
  economics: {
    revenue: { value: number; state: string; source: string };
    customerPaidShipping: { value: number; state: string; source: string };
    tax: { value: number; state: string; source: string };
    cogs: { value: number; state: string; source: string };
    forwardShipping: { value: number; state: string; source: string };
    returnShipping: { value: number; state: string; source: string };
    packaging: { value: number; state: string; source: string };
    codFee: { value: number; state: string; source: string };
    gatewayFee: { value: number; state: string; source: string };
    deliveredProfit: { value: number; state: string; source: string };
    rtoLossExposure: { value: number; state: string; source: string };
    expectedValue: { value: number; state: string; source: string };
    expectedROI: { value: number; state: string; source: string };
    expectedLoss: { value: number; state: string; source: string };
    deliveryProbability: number;
    rtoProbability: number;
    dataCompleteness: {
      hasActualCogs: boolean;
      hasActualShipping: boolean;
      hasWeight: boolean;
      warnings: string[];
    };
  };
  evidence: {
    addressScore: number;
    hasRealCogs: boolean;
    cogsSource: string;
    shippingSource: string;
    pincode: string | null;
    province: string | null;
    city: string | null;
  };
  executionLogs: Array<{
    id: string;
    step: string;
    status: string;
    message: string | null;
    createdAt: string;
  }>;
  overrideHistory: Array<{
    previousDecision: string;
    newDecision: string;
    reason: string;
    actor: string;
    timestamp: string;
  }>;
  learningRecords: Array<{
    id: string;
    predictedRto: number;
    actualRto: boolean;
    createdAt: string;
  }>;
  settings: any;
  shop: string;
}

export class OrderDetailApplicationService {
  /**
   * Orchestrates the Order Intelligence detail view.
   * Enforces shop isolation and aggregates Order + Intelligence + Execution Logs + ML Learning.
   */
  static async getOrderDetail(shop: string, orderId: string): Promise<OrderIntelligenceDTO | null> {
    if (!shop || !orderId) {
      return null;
    }

    // 1. Fetch Order with shop isolation
    const order = await OrderRepository.findById(shop, orderId);
    if (!order) {
      return null;
    }

    // 2. Fetch associated Logs, Learnings, and Store Settings in parallel
    const [executionLogs, learningRecords, rawSettings, policy] = await Promise.all([
      ExecutionLogRepository.findByOrderId(shop, orderId),
      LearningRecordRepository.findByOrderId(shop, orderId),
      SettingsRepository.getByShop(shop),
      SettingsRepository.getMerchantPolicy(shop),
    ]);

    const settings = ProfitService.getSettings(rawSettings);
    const protectionMode = policy.protectionMode || "OBSERVE";

    // Latest execution status
    const latestExecutionLog = [...executionLogs].reverse().find((l) => l.step === "EXECUTION");
    let executionStatus = "UNPROCESSED";
    if (latestExecutionLog) {
      executionStatus = latestExecutionLog.status;
    } else if (protectionMode === "OBSERVE") {
      executionStatus = "ADVISORY_ONLY";
    }

    // Extract override history from execution logs
    const overrideLogs = executionLogs.filter((l) => l.step === "MERCHANT_OVERRIDE");
    const overrideHistory = overrideLogs.map((l) => ({
      previousDecision: (l.data as any)?.previousDecision || (l.data as any)?.previousAction || "ALLOW_COD",
      newDecision: (l.data as any)?.newDecision || (l.data as any)?.overriddenAction || "MANUAL",
      reason: (l.data as any)?.reason || l.message || "Manual override",
      actor: (l.data as any)?.actor || "MERCHANT",
      timestamp: l.createdAt.toISOString(),
    }));

    // 3. Compute domain intelligence values via Canonical Economics
    const riskScore = order.riskScore ?? (order.isCOD ? 35 : 5);
    const riskLevel =
      order.riskLevel ||
      (riskScore >= 70 ? "CRITICAL" : riskScore >= 50 ? "HIGH" : riskScore >= 30 ? "MEDIUM" : "LOW");
    const riskReasons = (order.riskReasons as Array<{ reason: string; impact: number }>) || [];
    const decision =
      order.merchantRecommendation || (order.isCOD ? (riskScore > 50 ? "OTP_VERIFY" : "ALLOW_COD") : "ALLOW_COD");

    const econResult = CanonicalEconomicsCalculator.calculate({
      isCOD: order.isCOD,
      grossOrderValue: order.totalPrice,
      customerPaidShipping: order.shippingPrice,
      totalTax: order.totalTax,
      actualSkuCogs: order.cogsAtTimeOfOrder,
      defaultCogsPct: settings.defaultCOGSPct,
      weightGrams: order.totalWeight,
      shippingSlabs: settings.shippingSlabs,
      actualShippingCost: order.actualShippingCost,
      defaultForwardShipping: settings.defaultForwardShipping,
      defaultReturnShipping: settings.defaultReturnShipping,
      defaultPackagingCost: settings.defaultPackaging,
      defaultCodHandlingFee: settings.defaultCODHandling,
      defaultGatewayFeePct: settings.defaultGatewayFeePct,
      gatewayFixedFee: settings.gatewayFixedFee,
      shopifyPlanName: settings.shopifyPlanName,
      rtoProbability: riskScore / 100,
    });

    const hasRealCogs = econResult.cogs.state === "ACTUAL";
    const cogsUsed = econResult.cogs.value;
    const forwardShipping = econResult.forwardShipping.value;
    const returnShipping = econResult.returnShipping.value;
    const profitIfDelivered = econResult.deliveredProfit.value;
    const lossIfRto = econResult.rtoLossExposure.value;
    const expectedValue = econResult.expectedValue.value;
    const pRto = econResult.rtoProbability;

    // Compute evidence confidence score
    const evidenceQuality = Math.round(
      FeatureConfidenceCalculator.calculate({
        cogsSource: hasRealCogs ? "PRODUCT_STORED" : "MERCHANT_DEFAULT",
        customerOrderCount: 0,
        hasCustomerId: !!order.customerId,
        pincodeSampleSize: 0,
        hasRegionalHistory: false,
        shippingSource: econResult.forwardShipping.state === "ACTUAL" ? "ACTUAL" : "MERCHANT_DEFAULT",
        adCostSource: "UNAVAILABLE",
        features: {
          pincode: order.pincode,
          customerId: order.customerId,
          province: order.province,
        },
      }) * 100
    );

    // Economic Justification summary
    let economicJustification = "";
    if (decision === "ALLOW_COD") {
      economicJustification = `Positive expected payoff of ₹${Math.round(expectedValue)}. The estimated delivered profit (₹${Math.round(profitIfDelivered)}) comfortably exceeds expected RTO exposure (₹${Math.round(lossIfRto * pRto)}).`;
    } else if (decision === "OTP_VERIFY") {
      economicJustification = `Elevated RTO risk (${Math.round(pRto * 100)}%) creates ₹${Math.round(lossIfRto * pRto)} expected loss. Low-cost OTP verification is economically justified to confirm buyer intent.`;
    } else if (decision === "PREPAID_ONLY" || decision === "BLOCK_COD") {
      economicJustification = `Negative expected value (₹${Math.round(expectedValue)}). High RTO probability (${Math.round(pRto * 100)}%) exposes store to ₹${Math.round(lossIfRto)} freight and damage loss.`;
    } else {
      economicJustification = `Order risk evaluated at ${Math.round(pRto * 100)}% with expected value of ₹${Math.round(expectedValue)}.`;
    }

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalPrice: order.totalPrice,
        subtotalPrice: order.subtotalPrice,
        totalTax: order.totalTax,
        shippingPrice: order.shippingPrice,
        discountAmount: order.discountAmount,
        isCOD: order.isCOD,
        gateway: order.gateway,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        channelAttribution: order.channelAttribution,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        city: order.city,
        province: order.province,
        pincode: order.pincode,
        createdAt: order.createdAt.toISOString(),
        cogsAtTimeOfOrder: order.cogsAtTimeOfOrder,
        riskScore,
        riskLevel,
        riskReasons,
        merchantRecommendation: decision,
        protectionMode,
        executionStatus,
        lineItems: (order.lineItems || []).map((li) => ({
          id: li.id,
          shopifyLineItemId: li.shopifyLineItemId,
          productId: li.productId,
          title: li.title,
          variantTitle: li.variantTitle,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
        })),
      },
      intelligence: {
        riskScore,
        riskLevel,
        riskReasons,
        decision,
        expectedValue,
        hasRealCogs,
        cogsUsed,
        forwardShipping,
        returnShipping,
        profitIfDelivered,
        lossIfRto,
        evidenceQuality,
        economicJustification,
        protectionMode,
        executionStatus,
      },
      economics: econResult,
      evidence: {
        addressScore: evidenceQuality,
        hasRealCogs,
        cogsSource: econResult.cogs.source,
        shippingSource: econResult.forwardShipping.source,
        pincode: order.pincode,
        province: order.province,
        city: order.city,
      },
      executionLogs: executionLogs.map((log) => ({
        id: log.id,
        step: log.step,
        status: log.status,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      })),
      overrideHistory,
      learningRecords: learningRecords.map((rec) => ({
        id: rec.id,
        predictedRto: rec.predictedRto,
        actualRto: rec.actualRto,
        createdAt: rec.createdAt.toISOString(),
      })),
      settings,
      shop,
    };
  }

  /**
   * Applies a merchant override on an order's decision, logging the reason and updating the audit trail.
   */
  static async overrideDecision(
    shop: string,
    orderId: string,
    action: string,
    reason: string = "Manual merchant review override"
  ): Promise<{ success: boolean; message: string }> {
    const order = await OrderRepository.findById(shop, orderId);
    if (!order) {
      return { success: false, message: "Order not found" };
    }

    // 1. Update the order decision recommendation
    await OrderRepository.updateDecision(shop, orderId, {
      merchantRecommendation: action,
    });

    // 2. Persist audit log
    await ExecutionLogRepository.createLog({
      shop,
      orderId,
      step: "MERCHANT_OVERRIDE",
      status: "SUCCESS",
      message: `Merchant manually changed decision to ${action}. Reason: ${reason}`,
      data: {
        overriddenAction: action,
        previousAction: order.merchantRecommendation,
        reason,
        timestamp: new Date().toISOString(),
      },
    });

    // 3. Publish event for analytics and learning records
    const context = ExecutionContextFactory.create(shop, orderId, `override_${Date.now()}`);
    await EventBus.publish({
      type: "DECISION_MADE",
      context,
      payload: {
        action,
        confidence: 1.0,
        expectedValue: 0,
        riskScore: order.riskScore || 0,
        isOverride: true,
        overrideReason: reason,
      },
    });

    return { success: true, message: `Order decision updated to ${action}` };
  }
}

