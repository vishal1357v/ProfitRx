import { OrderRepository, OrderWithLineItems } from "../../infrastructure/repositories/order.repository";
import { ExecutionLogRepository, ExecutionLogRecord } from "../../infrastructure/repositories/execution-log.repository";
import { LearningRecordRepository } from "../../infrastructure/repositories/learning-record.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { FeatureConfidenceCalculator } from "../../services/order-features/feature-confidence.calculator";

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
  };
  executionLogs: Array<{
    id: string;
    step: string;
    status: string;
    message: string | null;
    createdAt: string;
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
    const [executionLogs, learningRecords, settings] = await Promise.all([
      ExecutionLogRepository.findByOrderId(shop, orderId),
      LearningRecordRepository.findByOrderId(shop, orderId),
      SettingsRepository.getByShop(shop),
    ]);

    // 3. Compute domain intelligence values
    const riskScore = order.riskScore ?? 0;
    const riskLevel = order.riskLevel || (riskScore > 60 ? "CRITICAL" : riskScore > 30 ? "HIGH" : "LOW");
    const riskReasons = (order.riskReasons as Array<{ reason: string; impact: number }>) || [];
    const decision = order.merchantRecommendation || (order.isCOD ? (riskScore > 50 ? "OTP_VERIFY" : "ALLOW_COD") : "ALLOW_COD");

    const hasRealCogs = order.cogsAtTimeOfOrder != null;
    const defaultCogsPct = ((settings?.defaultCOGSPct ?? 35) / 100);
    const cogsUsed = order.cogsAtTimeOfOrder ?? (order.totalPrice * defaultCogsPct);
    const forwardShipping = settings?.defaultForwardShipping ?? 60;
    const returnShipping = settings?.defaultReturnShipping ?? 70;

    // Expected Value = (ProfitIfDelivered * (1 - pRto)) - (LossIfRTO * pRto)
    const profitIfDelivered = order.totalPrice - cogsUsed - forwardShipping;
    const lossIfRto = forwardShipping + returnShipping;
    const pRto = riskScore / 100;
    const expectedValue = (profitIfDelivered * (1 - pRto)) - (lossIfRto * pRto);

    // Compute evidence confidence score
    const evidenceQuality = Math.round(
      FeatureConfidenceCalculator.calculate({
        cogsSource: hasRealCogs ? "PRODUCT_STORED" : "MERCHANT_DEFAULT",
        customerOrderCount: 0,
        hasCustomerId: !!order.customerId,
        pincodeSampleSize: 0,
        hasRegionalHistory: false,
        shippingSource: "MERCHANT_DEFAULT",
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
      economicJustification = `Elevated RTO probability of ${riskScore}% creates an expected loss exposure of ₹${Math.round(lossIfRto * pRto)}. OTP verification costs ~₹10 to protect ₹${Math.round(lossIfRto)} in reverse logistics loss.`;
    } else {
      economicJustification = `High RTO risk of ${riskScore}% creates a negative expected value (-₹${Math.round(Math.abs(expectedValue))}). Restricting COD protects against ₹${Math.round(lossIfRto)} in guaranteed return transit fees.`;
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
        merchantRecommendation: order.merchantRecommendation,
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
      },
      executionLogs: executionLogs.map((log) => ({
        id: log.id,
        step: log.step,
        status: log.status,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      })),
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
}
