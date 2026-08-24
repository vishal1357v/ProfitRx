import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { CodOrderRepository } from "../../infrastructure/repositories/cod-order.repository";
import { ExecutionLogRepository } from "../../infrastructure/repositories/execution-log.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { CanonicalEconomicsCalculator } from "../../services/economics/canonical-economics.calculator";
import { ProfitService } from "../../services/profit.service";
import { EventBus } from "../../infrastructure/events/event.bus";
import { ExecutionContextFactory } from "../../infrastructure/context/execution.context";

export interface OperationOrderDTO {
  id: string;
  orderNumber: number;
  totalPrice: number;
  isCOD: boolean;
  gateway: string | null;
  financialStatus: string;
  fulfillmentStatus: string;
  customerName: string | null;
  city: string | null;
  province: string | null;
  pincode: string | null;
  riskScore: number;
  riskLevel: string;
  confidence: number;
  merchantRecommendation: string;
  protectionMode: string;
  executionStatus: string;
  expectedProfit: number;
  expectedProfitState: string;
  rtoExposure: number;
  rtoExposureState: string;
  expectedValue: number;
  hasRealCogs: boolean;
  needsAttention: boolean;
  attentionReason: string | null;
  createdAt: string;
  age: string;
}

export interface OperationsDataDTO {
  orders: OperationOrderDTO[];
  actionQueue: OperationOrderDTO[];
  codVerifications: any[];
  executionLogs: any[];
  protectionMode: string;
  summary: {
    totalOrders: number;
    totalCodOrders: number;
    needsAttentionCount: number;
    atRiskCodCount: number;
    atRiskCodExposure: number;
    failedActionCount: number;
    pendingReviewCount: number;
  };
}

function getRelativeAge(date: Date): string {
  const now = Date.now();
  const diffMs = now - new Date(date).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export class OperationsApplicationService {
  /**
   * Aggregates recent orders, action queue, COD verifications, and real execution logs.
   * All economics calculated via CanonicalEconomicsCalculator.
   */
  static async getOperationsData(shop: string): Promise<OperationsDataDTO> {
    // 1. Fetch Store Settings & Policy
    const [rawSettings, policy] = await Promise.all([
      SettingsRepository.getByShop(shop),
      SettingsRepository.getMerchantPolicy(shop),
    ]);
    const settings = ProfitService.getSettings(rawSettings);
    const protectionMode = policy.protectionMode || "OBSERVE";

    // 2. Fetch Orders (recent 50) and Execution Logs (recent 100) in parallel
    const [recentOrders, codVerifications, executionLogs] = await Promise.all([
      OrderRepository.findByShop(shop, 50),
      CodOrderRepository.findByShop(shop, { limit: 50 }),
      ExecutionLogRepository.findByShop(shop, 100),
    ]);

    // Build latest execution log map per order
    const executionLogMap = new Map<string, { status: string; step: string; message: string | null }>();
    for (const log of executionLogs) {
      const cleanId = log.orderId.replace("gid://shopify/Order/", "");
      if (!executionLogMap.has(cleanId) && log.step === "EXECUTION") {
        executionLogMap.set(cleanId, {
          status: log.status,
          step: log.step,
          message: log.message,
        });
      }
    }

    // 3. Process each order with canonical unit economics
    const formattedOrders: OperationOrderDTO[] = recentOrders.map((o) => {
      const cleanOrderId = String(o.id).replace("gid://shopify/Order/", "");
      const riskScore = o.riskScore ?? (o.isCOD ? 35 : 5);
      const riskLevel =
        o.riskLevel ||
        (riskScore >= 70 ? "CRITICAL" : riskScore >= 50 ? "HIGH" : riskScore >= 30 ? "MEDIUM" : "LOW");
      const recommendation =
        o.merchantRecommendation || (o.isCOD ? (riskScore > 50 ? "OTP_VERIFY" : "ALLOW_COD") : "ALLOW_COD");

      // Canonical Unit Economics from Phase A
      const econResult = CanonicalEconomicsCalculator.calculate({
        isCOD: o.isCOD,
        grossOrderValue: o.totalPrice,
        customerPaidShipping: o.shippingPrice,
        totalTax: o.totalTax,
        actualSkuCogs: o.cogsAtTimeOfOrder,
        defaultCogsPct: settings.defaultCOGSPct,
        weightGrams: o.totalWeight,
        shippingSlabs: settings.shippingSlabs,
        actualShippingCost: o.actualShippingCost,
        defaultForwardShipping: settings.defaultForwardShipping,
        defaultReturnShipping: settings.defaultReturnShipping,
        defaultPackagingCost: settings.defaultPackaging,
        defaultCodHandlingFee: settings.defaultCODHandling,
        defaultGatewayFeePct: settings.defaultGatewayFeePct,
        gatewayFixedFee: settings.gatewayFixedFee,
        shopifyPlanName: settings.shopifyPlanName,
        rtoProbability: riskScore / 100,
      });

      // Match execution status
      const matchedLog = executionLogMap.get(cleanOrderId);
      let executionStatus = "UNPROCESSED";
      if (matchedLog) {
        executionStatus = matchedLog.status;
      } else if (protectionMode === "OBSERVE") {
        executionStatus = "ADVISORY_ONLY";
      } else if (protectionMode === "REVIEW" && recommendation !== "ALLOW_COD") {
        executionStatus = "PENDING_MERCHANT_REVIEW";
      }

      // Determine Needs Attention criteria
      let needsAttention = false;
      let attentionReason: string | null = null;

      if (executionStatus === "FAILED") {
        needsAttention = true;
        attentionReason = "Execution failed - action required";
      } else if (executionStatus === "PENDING_MERCHANT_REVIEW") {
        needsAttention = true;
        attentionReason = `Awaiting review (${recommendation})`;
      } else if (protectionMode === "REVIEW" && recommendation !== "ALLOW_COD") {
        needsAttention = true;
        attentionReason = `Review required for ${recommendation}`;
      } else if (o.isCOD && (riskLevel === "CRITICAL" || riskLevel === "HIGH")) {
        needsAttention = true;
        attentionReason = `High RTO Exposure (₹${Math.round(econResult.rtoLossExposure.value)})`;
      } else if (o.isCOD && econResult.expectedValue.value < 0) {
        needsAttention = true;
        attentionReason = `Negative Expected Payoff (-₹${Math.abs(Math.round(econResult.expectedValue.value))})`;
      } else if (o.isCOD && econResult.cogs.state !== "ACTUAL" && o.totalPrice >= 3000) {
        needsAttention = true;
        attentionReason = "High-value COD missing SKU COGS";
      }

      return {
        id: String(o.id),
        orderNumber: o.orderNumber || 0,
        totalPrice: o.totalPrice,
        isCOD: o.isCOD,
        gateway: o.gateway || (o.isCOD ? "COD" : "Prepaid"),
        financialStatus: o.financialStatus || "pending",
        fulfillmentStatus: o.fulfillmentStatus || "unfulfilled",
        customerName: o.customerName || "Customer",
        city: o.city || null,
        province: o.province || null,
        pincode: o.pincode || null,
        riskScore,
        riskLevel,
        confidence: 0.85,
        merchantRecommendation: recommendation,
        protectionMode,
        executionStatus,
        expectedProfit: econResult.deliveredProfit.value,
        expectedProfitState: econResult.deliveredProfit.state,
        rtoExposure: econResult.rtoLossExposure.value,
        rtoExposureState: econResult.rtoLossExposure.state,
        expectedValue: econResult.expectedValue.value,
        hasRealCogs: econResult.cogs.state === "ACTUAL",
        needsAttention,
        attentionReason,
        createdAt: o.createdAt.toISOString(),
        age: getRelativeAge(o.createdAt),
      };
    });

    const actionQueue = formattedOrders.filter((o) => o.needsAttention);
    const totalCodOrders = formattedOrders.filter((o) => o.isCOD).length;
    const failedActionCount = formattedOrders.filter((o) => o.executionStatus === "FAILED").length;
    const pendingReviewCount = formattedOrders.filter(
      (o) => o.executionStatus === "PENDING_MERCHANT_REVIEW"
    ).length;

    const atRiskCodExposure = actionQueue
      .filter((o) => o.isCOD)
      .reduce((sum, o) => sum + o.rtoExposure, 0);

    // Link COD verification records to orders
    const verificationMap = codVerifications.map((cod) => {
      const cleanCodOrderId = cod.orderId.replace("gid://shopify/Order/", "");
      const related = formattedOrders.find(
        (o) =>
          o.id === cod.orderId ||
          o.id === `gid://shopify/Order/${cod.orderId}` ||
          o.id.replace("gid://shopify/Order/", "") === cleanCodOrderId
      );
      return {
        ...cod,
        orderNumber: related ? related.orderNumber : null,
      };
    });

    return {
      orders: formattedOrders,
      actionQueue,
      codVerifications: verificationMap,
      executionLogs,
      protectionMode,
      summary: {
        totalOrders: formattedOrders.length,
        totalCodOrders,
        needsAttentionCount: actionQueue.length,
        atRiskCodCount: actionQueue.length,
        atRiskCodExposure: Math.round(atRiskCodExposure),
        failedActionCount,
        pendingReviewCount,
      },
    };
  }

  /**
   * Applies merchant review action directly from Operations Center.
   * Persists original decision, override decision, reason, actor, and timestamp.
   */
  static async applyOrderAction(
    shop: string,
    orderId: string,
    action: string,
    reason = "Operations review action"
  ): Promise<{ success: boolean; message: string }> {
    const order = await OrderRepository.findById(shop, orderId);
    if (!order) {
      return { success: false, message: "Order not found" };
    }

    const previousRecommendation = order.merchantRecommendation || "ALLOW_COD";

    await OrderRepository.updateDecision(shop, orderId, {
      merchantRecommendation: action,
    });

    await ExecutionLogRepository.createLog({
      shop,
      orderId,
      step: "MERCHANT_OVERRIDE",
      status: "SUCCESS",
      message: `Merchant manually decided: ${action}. Reason: ${reason}`,
      data: {
        previousDecision: previousRecommendation,
        newDecision: action,
        reason,
        actor: "MERCHANT",
        timestamp: new Date().toISOString(),
      },
    });

    const context = ExecutionContextFactory.create(shop, orderId, `ops_act_${Date.now()}`);
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

    return { success: true, message: `Order #${order.orderNumber} decision updated to ${action}` };
  }
}


