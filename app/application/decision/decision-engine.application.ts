import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { CustomerRepository } from "../../infrastructure/repositories/customer.repository";
import { PincodeRepository } from "../../infrastructure/repositories/pincode.repository";
import {
  DecisionRecordRepository,
  DecisionRecordSnapshot,
  OrderOutcomeSnapshot,
  DecisionPerformanceSummary,
} from "../../infrastructure/repositories/decision-record.repository";
import { CanonicalEconomicsCalculator } from "../../services/economics/canonical-economics.calculator";
import { ProfitService } from "../../services/profit.service";
import { CODManagementService } from "../../services/cod-management.service";
import { ShopifyService } from "../../services/shopify.service";
import { ExecutionLogRepository } from "../../infrastructure/repositories/execution-log.repository";
import { roundMoney } from "../../utils/money";
import { calibrateRiskScoreToProbability } from "../../utils/risk-calibration";

export interface OrderDecisionCardDTO {
  order: {
    id: string;
    orderNumber: number;
    totalPrice: number;
    subtotalPrice: number;
    totalTax: number;
    shippingPrice: number;
    isCOD: boolean;
    gateway: string | null;
    fulfillmentStatus: string;
    financialStatus: string;
    customerName: string | null;
    city: string | null;
    province: string | null;
    pincode: string | null;
    createdAt: string;
    currency: string;
  };
  economics: {
    grossOrderValue: number;
    customerPaidShipping: number;
    tax: number;
    cogs: number;
    cogsState: string;
    cogsSource: string;
    forwardShipping: number;
    returnShipping: number;
    packaging: number;
    codFee: number;
    gatewayFee: number;
    deliveredContribution: number;
    rtoLossExposure: number;
    expectedContribution: number;
    expectedContributionState: string;
    currency: string;
    currencyMatch: boolean;
    dataCompleteness: {
      hasActualCogs: boolean;
      hasActualShipping: boolean;
      hasWeight: boolean;
      currencyMatch: boolean;
      warnings: string[];
    };
  };
  risk: {
    riskScore: number;
    riskBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    confidence: number;
    customerSignals: {
      totalOrders: number;
      successfulDeliveries: number;
      rtoCount: number;
      isRepeatCustomer: boolean;
      hasDeliveryTrackRecord: boolean;
    };
    pincodeHistory: {
      pincode: string | null;
      city: string | null;
      province: string | null;
      rtoRate: number;
      totalOrders: number;
      isBlocked: boolean;
    };
    riskFactors: Array<{ key: string; contribution: number; explanation: string }>;
    primaryReason: string;
    isFlagged: boolean;
  };
  recommendation: {
    action: "ALLOW_COD" | "VERIFY" | "PREPAID_ONLY" | "BLOCK_COD";
    actionLabel: string;
    tone: "success" | "attention" | "warning" | "critical";
    explanation: string;
    economicJustification: string;
  };
  decisionState: {
    initialRecommendation: string;
    currentAction: string;
    isOverridden: boolean;
    overrideReason?: string;
    executionStatus: string;
    executionMessage?: string;
    decisionDate: string;
  };
  outcome?: {
    outcomeState: "DELIVERED" | "RTO" | "CANCELLED" | "UNRESOLVED";
    realizedProfit: number;
    rtoLoss: number;
    verifiedSavings: number;
    explanation: string;
    resolvedAt: string;
    comparison: {
      estimatedExpectedValue: number;
      actualRealized: number;
      variance: number;
    };
  };
}

export class DecisionEngineApplicationService {
  /**
   * Deterministically evaluates an order's economics, risk signals, and financial recommendation.
   * Pure deterministic calculation adhering to the canonical financial engine.
   */
  static evaluateOrderDecision(params: {
    order: any;
    settings: any;
    customerRisk?: any | null;
    pincodeStats?: any | null;
  }): {
    economics: OrderDecisionCardDTO["economics"];
    risk: OrderDecisionCardDTO["risk"];
    recommendation: OrderDecisionCardDTO["recommendation"];
  } {
    const { order, settings, customerRisk, pincodeStats } = params;
    const storeSettings = ProfitService.getSettings(settings);

    // 1. Currency Integrity Verification
    const storeCurrency = (storeSettings.currency || "INR").toUpperCase();
    const orderCurrency = (order.currency || storeCurrency).toUpperCase();
    const currencyMatch = orderCurrency === storeCurrency;

    // 2. Risk Signals & Customer/Pincode Context
    const customerOrders = customerRisk?.totalOrders ?? 0;
    const customerDeliveries = customerRisk?.successfulDeliveries ?? 0;
    const customerRtos = customerRisk?.rtoCount ?? 0;
    const isRepeatCustomer = customerOrders > 1;
    const hasDeliveryTrackRecord = isRepeatCustomer && customerDeliveries >= 1 && customerRtos === 0;

    const pincodeRtoRate = pincodeStats?.rtoRate ?? 0;
    const pincodeOrderCount = pincodeStats?.totalOrders ?? 0;
    const zip = order.pincode?.trim() || "";
    const rawBlockedPincodes: string[] =
      (settings as any)?.codBlockedPincodes ||
      (settings as any)?.blockSpecificPincodes ||
      (storeSettings as any)?.codBlockedPincodes ||
      [];
    const isPincodeBlocked = Boolean(zip && rawBlockedPincodes.includes(zip));

    // Risk Score Calculation
    let riskScore = 20; // default baseline for COD
    const riskFactors: Array<{ key: string; contribution: number; explanation: string }> = [];

    if (!order.isCOD) {
      riskScore = 5;
      riskFactors.push({
        key: "PREPAID_PAYMENT",
        contribution: -15,
        explanation: "Prepaid order with zero payment collection/remittance risk",
      });
    } else {
      riskFactors.push({
        key: "COD_BASELINE",
        contribution: 20,
        explanation: "Cash on Delivery payment method requires buyer delivery acceptance",
      });

      if (isPincodeBlocked) {
        riskScore = 95;
        riskFactors.push({
          key: "PINCODE_BLOCKED",
          contribution: 75,
          explanation: `Destination pincode ${zip} is explicitly blocked in merchant settings`,
        });
      } else if (pincodeOrderCount >= 5 && pincodeRtoRate >= 30) {
        riskScore += 25;
        riskFactors.push({
          key: "HIGH_RTO_PINCODE",
          contribution: 25,
          explanation: `Elevated historical RTO rate (${Math.round(pincodeRtoRate)}%) in pincode ${zip}`,
        });
      }

      if (customerRtos >= 2) {
        riskScore = Math.max(riskScore, 85);
        riskFactors.push({
          key: "REPEAT_RTO_OFFENDER",
          contribution: 40,
          explanation: `Customer has ${customerRtos} previous returned/failed deliveries`,
        });
      } else if (hasDeliveryTrackRecord) {
        riskScore = Math.max(5, riskScore - 20);
        riskFactors.push({
          key: "VERIFIED_REPEAT_BUYER",
          contribution: -20,
          explanation: `Repeat buyer with ${customerDeliveries} successful deliveries and 0 RTOs`,
        });
      }

      if (order.totalPrice >= 5000) {
        riskScore += 15;
        riskFactors.push({
          key: "HIGH_CART_VALUE",
          contribution: 15,
          explanation: `High order value (₹${Math.round(order.totalPrice)}) increases potential RTO damage exposure`,
        });
      }
    }

    riskScore = Math.min(100, Math.max(0, riskScore));

    const riskBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" =
      riskScore >= 70 ? "CRITICAL" : riskScore >= 50 ? "HIGH" : riskScore >= 30 ? "MEDIUM" : "LOW";

    // 3. Authoritative Canonical Unit Economics (Calibrated probability: never treat uncalibrated 70/100 risk score as 70% probability)
    const rtoProb = calibrateRiskScoreToProbability(riskScore, order.isCOD);
    const econResult = CanonicalEconomicsCalculator.calculate({
      isCOD: order.isCOD,
      grossOrderValue: order.totalPrice,
      customerPaidShipping: order.shippingPrice,
      totalTax: order.totalTax,
      actualSkuCogs: order.cogsAtTimeOfOrder,
      defaultCogsPct: storeSettings.defaultCOGSPct,
      weightGrams: order.totalWeight,
      shippingSlabs: storeSettings.shippingSlabs,
      actualShippingCost: order.actualShippingCost,
      defaultForwardShipping: storeSettings.defaultForwardShipping,
      defaultReturnShipping: storeSettings.defaultReturnShipping,
      defaultPackagingCost: storeSettings.defaultPackaging,
      defaultCodHandlingFee: storeSettings.defaultCODHandling,
      defaultGatewayFeePct: storeSettings.defaultGatewayFeePct,
      gatewayFixedFee: storeSettings.gatewayFixedFee,
      shopifyPlanName: storeSettings.shopifyPlanName,
      rtoProbability: rtoProb,
    });

    const hasActualShipping = Boolean(
      order.actualShippingCost !== undefined &&
      order.actualShippingCost !== null &&
      Number(order.actualShippingCost) > 0
    );

    const warnings = [...econResult.dataCompleteness.warnings];
    if (!hasActualShipping) {
      warnings.push("DEFAULT_SHIPPING_USED");
    }
    if (!currencyMatch) {
      warnings.push(`CURRENCY_MISMATCH: Order (${orderCurrency}) does not match store (${storeCurrency})`);
    }

    const economics: OrderDecisionCardDTO["economics"] = {
      grossOrderValue: econResult.revenue.value,
      customerPaidShipping: econResult.customerPaidShipping.value,
      tax: econResult.tax.value,
      cogs: econResult.cogs.value,
      cogsState: econResult.cogs.state,
      cogsSource: econResult.cogs.source,
      forwardShipping: econResult.forwardShipping.value,
      returnShipping: econResult.returnShipping.value,
      packaging: econResult.packaging.value,
      codFee: econResult.codFee.value,
      gatewayFee: econResult.gatewayFee.value,
      deliveredContribution: econResult.deliveredProfit.value,
      rtoLossExposure: econResult.rtoLossExposure.value,
      expectedContribution: econResult.expectedValue.value,
      expectedContributionState: !currencyMatch ? "INCOMPLETE" : econResult.expectedValue.state,
      currency: orderCurrency,
      currencyMatch,
      dataCompleteness: {
        hasActualCogs: econResult.cogs.state === "ACTUAL",
        hasActualShipping,
        hasWeight: Boolean(order.totalWeight && order.totalWeight > 0),
        currencyMatch,
        warnings,
      },
    };

    // 4. Recommendation & Economic Justification
    let action: "ALLOW_COD" | "VERIFY" | "PREPAID_ONLY" | "BLOCK_COD" = "ALLOW_COD";
    let actionLabel = "Allow COD";
    let tone: "success" | "attention" | "warning" | "critical" = "success";
    let explanation = "";
    let economicJustification = "";

    const rejectCodOver =
      (settings as any)?.rulesRejectCodOver ??
      (settings as any)?.blockCodAboveValue ??
      (storeSettings as any)?.rulesRejectCodOver ??
      10000;
    const requirePrepaidAbove =
      (settings as any)?.rulesRequirePrepaidAbove ??
      (settings as any)?.requirePrepaidAboveValue ??
      (storeSettings as any)?.rulesRequirePrepaidAbove ??
      5000;

    if (!order.isCOD) {
      action = "ALLOW_COD";
      actionLabel = "Fulfill Prepaid Normally";
      tone = "success";
      explanation = "Prepaid payment confirmed with zero Cash on Delivery collection risk.";
      economicJustification = `Positive delivered profit of ₹${Math.round(economics.deliveredContribution)} with 0 reverse remittance exposure.`;
    } else if (isPincodeBlocked) {
      action = "BLOCK_COD";
      actionLabel = "Block COD";
      tone = "critical";
      explanation = `Destination pincode ${zip} is on store's blocked delivery zone list.`;
      economicJustification = `Avoids certain reverse freight exposure (-₹${Math.round(economics.rtoLossExposure)}) on an unserviceable pincode.`;
    } else if (order.totalPrice > rejectCodOver) {
      action = "BLOCK_COD";
      actionLabel = "Block COD";
      tone = "critical";
      explanation = `Cart value (₹${Math.round(order.totalPrice)}) exceeds store rejection threshold (₹${rejectCodOver}).`;
      economicJustification = `Cart value exceeds maximum allowable COD risk threshold. Potential RTO exposure of ₹${Math.round(economics.rtoLossExposure)}.`;
    } else if (customerRtos >= 2) {
      action = "BLOCK_COD";
      actionLabel = "Block COD";
      tone = "critical";
      explanation = `Customer has ${customerRtos} confirmed past RTOs. Repeat offender protection triggered.`;
      economicJustification = `High repeat-offender risk creates an expected loss of ₹${Math.round(economics.rtoLossExposure * rtoProb)}.`;
    } else if (hasDeliveryTrackRecord) {
      action = "ALLOW_COD";
      actionLabel = "Allow COD";
      tone = "success";
      explanation = `Repeat customer with verified delivery track record (${customerDeliveries} successful deliveries).`;
      economicJustification = `Verified buyer intent yields positive expected contribution of +₹${Math.round(economics.expectedContribution)}.`;
    } else if (economics.expectedContribution < 0) {
      action = order.totalPrice >= requirePrepaidAbove ? "PREPAID_ONLY" : "BLOCK_COD";
      actionLabel = action === "PREPAID_ONLY" ? "Require Prepaid" : "Block COD";
      tone = action === "PREPAID_ONLY" ? "warning" : "critical";
      explanation = "Negative expected contribution due to high reverse-shipping exposure relative to margin.";
      economicJustification = `Expected payoff is negative (-₹${Math.abs(Math.round(economics.expectedContribution))}). Estimated RTO freight and damage exposure is ₹${Math.round(economics.rtoLossExposure)}.`;
    } else if (riskBand === "HIGH" || riskBand === "CRITICAL" || order.totalPrice >= requirePrepaidAbove) {
      action = "VERIFY";
      actionLabel = "Verify Order (Confirm Intent)";
      tone = "attention";
      explanation = "Elevated delivery risk detected for destination area or cart value; customer intent verification recommended.";
      economicJustification = `Elevated RTO risk (${Math.round(rtoProb * 100)}%) creates ₹${Math.round(economics.rtoLossExposure * rtoProb)} expected loss. Low-cost OTP verification (~₹10 estimated cost) is economically justified to confirm buyer intent.`;
    } else {
      action = "ALLOW_COD";
      actionLabel = "Allow COD";
      tone = "success";
      explanation = "Acceptable delivery risk with positive expected payoff.";
      economicJustification = `Positive expected payoff of +₹${Math.round(economics.expectedContribution)}. Estimated delivered profit (₹${Math.round(economics.deliveredContribution)}) comfortably exceeds expected RTO exposure (₹${Math.round(economics.rtoLossExposure * rtoProb)}).`;
    }

    const recommendation: OrderDecisionCardDTO["recommendation"] = {
      action,
      actionLabel,
      tone,
      explanation,
      economicJustification,
    };

    const risk: OrderDecisionCardDTO["risk"] = {
      riskScore: Math.round(riskScore),
      riskBand,
      confidence: hasDeliveryTrackRecord ? 0.95 : pincodeOrderCount >= 10 ? 0.85 : 0.65,
      customerSignals: {
        totalOrders: customerOrders,
        successfulDeliveries: customerDeliveries,
        rtoCount: customerRtos,
        isRepeatCustomer,
        hasDeliveryTrackRecord,
      },
      pincodeHistory: {
        pincode: order.pincode || null,
        city: order.city || null,
        province: order.province || null,
        rtoRate: Math.round(pincodeRtoRate),
        totalOrders: pincodeOrderCount,
        isBlocked: isPincodeBlocked,
      },
      riskFactors,
      primaryReason: explanation,
      isFlagged: action !== "ALLOW_COD",
    };

    return { economics, risk, recommendation };
  }

  /**
   * Retrieves or builds the complete Order Decision Card for a specific order.
   * Persists the baseline decision snapshot idempotently.
   */
  static async getOrderDecisionCard(shop: string, orderId: string): Promise<OrderDecisionCardDTO | null> {
    if (!shop || !orderId) return null;

    const [order, settings] = await Promise.all([
      OrderRepository.findById(shop, orderId),
      SettingsRepository.getByShop(shop),
    ]);

    if (!order) return null;

    // Fetch customer and pincode risk data in parallel
    const [customerRisk, pincodeStats, executionLogs, existingSnapshot, outcomeSnapshot] = await Promise.all([
      order.customerId ? CustomerRepository.findRiskByCustomerId(shop, order.customerId) : null,
      order.pincode ? PincodeRepository.findByPincode(shop, order.pincode) : null,
      ExecutionLogRepository.findByOrderId(shop, order.id),
      DecisionRecordRepository.getDecisionSnapshot(shop, order.id),
      DecisionRecordRepository.getOutcomeSnapshot(shop, order.id),
    ]);

    // Evaluate current decision & economics
    const evaluation = this.evaluateOrderDecision({
      order,
      settings,
      customerRisk,
      pincodeStats,
    });

    // Check for existing baseline snapshot
    let initialRecommendation = evaluation.recommendation.action;
    let decisionDate = order.createdAt.toISOString();

    if (existingSnapshot) {
      initialRecommendation = existingSnapshot.recommendation;
      decisionDate = existingSnapshot.createdAt;
    } else {
      // Save initial baseline decision record snapshot idempotently
      const newSnapshot: DecisionRecordSnapshot = {
        orderId: order.id,
        shop,
        recommendation: evaluation.recommendation.action,
        reason: evaluation.recommendation.explanation,
        riskScore: evaluation.risk.riskScore,
        riskBand: evaluation.risk.riskBand,
        riskFactors: evaluation.risk.riskFactors,
        deliveredContribution: evaluation.economics.deliveredContribution,
        rtoLossExposure: evaluation.economics.rtoLossExposure,
        expectedContribution: evaluation.economics.expectedContribution,
        currency: evaluation.economics.currency,
        dataCompleteness: evaluation.economics.dataCompleteness,
        merchantAction: evaluation.recommendation.action,
        isOverridden: false,
        createdAt: new Date().toISOString(),
      };
      await DecisionRecordRepository.saveDecisionSnapshot(shop, order.id, newSnapshot);
    }

    // Determine latest execution and override state
    const overrideLog = [...executionLogs].reverse().find((l) => l.step === "MERCHANT_OVERRIDE");
    const executionLog = [...executionLogs].reverse().find((l) => l.step === "EXECUTION");

    const isOverridden = Boolean(overrideLog);
    const currentAction = overrideLog
      ? (overrideLog.data as any)?.action || order.merchantRecommendation || initialRecommendation
      : order.merchantRecommendation || initialRecommendation;

    let executionStatus = "UNPROCESSED";
    let executionMessage: string | undefined = undefined;

    if (executionLog) {
      executionStatus = executionLog.status;
      executionMessage = executionLog.message || undefined;
    } else if (order.merchantRecommendation) {
      executionStatus = "RECORDED";
    }

    // Build outcome payload if available
    let outcome: OrderDecisionCardDTO["outcome"] = undefined;
    if (outcomeSnapshot) {
      const estimatedEV = existingSnapshot?.expectedContribution ?? evaluation.economics.expectedContribution;
      outcome = {
        outcomeState: outcomeSnapshot.outcomeState,
        realizedProfit: outcomeSnapshot.realizedProfit,
        rtoLoss: outcomeSnapshot.rtoLoss,
        verifiedSavings: outcomeSnapshot.verifiedSavings,
        explanation: outcomeSnapshot.explanation,
        resolvedAt: outcomeSnapshot.resolvedAt,
        comparison: {
          estimatedExpectedValue: roundMoney(estimatedEV),
          actualRealized: roundMoney(outcomeSnapshot.realizedProfit),
          variance: roundMoney(outcomeSnapshot.realizedProfit - estimatedEV),
        },
      };
    }

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalPrice: order.totalPrice,
        subtotalPrice: order.subtotalPrice,
        totalTax: order.totalTax,
        shippingPrice: order.shippingPrice,
        isCOD: order.isCOD,
        gateway: order.gateway,
        fulfillmentStatus: order.fulfillmentStatus,
        financialStatus: order.financialStatus,
        customerName: order.customerName,
        city: order.city,
        province: order.province,
        pincode: order.pincode,
        createdAt: order.createdAt.toISOString(),
        currency: evaluation.economics.currency,
      },
      economics: evaluation.economics,
      risk: evaluation.risk,
      recommendation: evaluation.recommendation,
      decisionState: {
        initialRecommendation,
        currentAction,
        isOverridden,
        overrideReason: overrideLog ? (overrideLog.data as any)?.reason : undefined,
        executionStatus,
        executionMessage,
        decisionDate,
      },
      outcome,
    };
  }

  /**
   * Applies a merchant override to an order decision with Shopify execution wiring.
   */
  static async overrideDecision(params: {
    shop: string;
    orderId: string;
    action: "ALLOW_COD" | "VERIFY" | "PREPAID_ONLY" | "BLOCK_COD" | "PARTIAL_PAYMENT";
    reason: string;
    actor?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { shop, orderId, action, reason, actor = "MERCHANT" } = params;

    const order = await OrderRepository.findById(shop, orderId);
    if (!order) {
      return { success: false, message: "Order not found" };
    }

    // 1. Update merchantRecommendation in Order record
    await OrderRepository.updateDecision(shop, orderId, {
      merchantRecommendation: action,
    });

    let executionSuccess = true;
    let executionMessage = `Order decision updated to ${action}.`;

    // 2. Real Shopify Mutation Execution
    if (action === "ALLOW_COD") {
      const untagResult = await ShopifyService.untagOrder(shop, orderId, [
        "ProfitRx-COD-Blocked",
        "ProfitRx-Prepaid-Required",
      ]);
      executionSuccess = untagResult.success;
      executionMessage = untagResult.success
        ? `Lifted COD restriction on Shopify Admin for Order #${order.orderNumber}.`
        : `Failed to remove block tags on Shopify Admin.`;
    } else if (action === "BLOCK_COD") {
      const tagResult = await ShopifyService.tagOrder(shop, orderId, "ProfitRx-COD-Blocked");
      executionSuccess = tagResult.success;
      executionMessage = tagResult.success
        ? `Tagged order #${order.orderNumber} as ProfitRx-COD-Blocked for fulfillment hold/cancellation (Shopify order payment method is immutable after placement).`
        : `Failed to tag order as blocked on Shopify Admin.`;
    } else if (action === "PREPAID_ONLY") {
      const tagResult = await ShopifyService.tagOrder(shop, orderId, "ProfitRx-Prepaid-Required");
      executionSuccess = tagResult.success;
      executionMessage = tagResult.success
        ? `Tagged order #${order.orderNumber} as ProfitRx-Prepaid-Required for fulfillment hold until advance payment is collected (Shopify order payment method is immutable after placement).`
        : `Failed to tag order on Shopify Admin.`;
    } else if (action === "VERIFY") {
      const cleanOrderId = orderId.replace("gid://shopify/Order/", "");
      let phone: string | null = null;

      if (order.customerId) {
        const cust = await CustomerRepository.findRiskByCustomerId(shop, order.customerId);
        if (cust?.phone) phone = cust.phone;
      }
      if (!phone) {
        const storeSettings = await SettingsRepository.getByShop(shop);
        if (storeSettings?.whatsappPhone) phone = storeSettings.whatsappPhone;
      }

      if (phone) {
        const otpResult = await CODManagementService.createCODOrderVerification(shop, cleanOrderId, phone);
        executionSuccess = otpResult.success;
        executionMessage = otpResult.success
          ? `Dispatched verification OTP challenge to ${phone}.`
          : `OTP verification warning: ${otpResult.message}`;
      } else {
        executionMessage = "Order marked for verification; awaiting customer phone contact.";
      }
    }

    // 3. Persist Execution Log and Decision Override Record
    await ExecutionLogRepository.createLog({
      shop,
      orderId,
      step: "EXECUTION",
      status: executionSuccess ? "SUCCESS" : "FAILED",
      message: executionMessage,
      data: { action, reason, actor },
    });

    const previousDecision = order.merchantRecommendation || "ALLOW_COD";

    await DecisionRecordRepository.recordOverride(shop, orderId, {
      previousDecision,
      newDecision: action,
      action,
      reason,
      actor: actor === "MERCHANT_OPERATIONS" ? "MERCHANT" : actor,
      timestamp: new Date().toISOString(),
      executionResult: {
        status: executionSuccess ? "SUCCESS" : "FAILED",
        message: executionMessage,
      },
    });

    return {
      success: executionSuccess,
      message: executionMessage,
    };
  }

  /**
   * Tracks and resolves an order outcome from webhook payload data.
   * Completely idempotent: repeated webhooks for the same outcome will not create duplicate records.
   */
  static async processOrderOutcome(
    shop: string,
    orderPayload: any
  ): Promise<{ processed: boolean; outcomeState: string; realizedProfit: number }> {
    const rawId = String(orderPayload.id || "");
    if (!rawId) return { processed: false, outcomeState: "UNRESOLVED", realizedProfit: 0 };

    const order = await OrderRepository.findById(shop, rawId);
    if (!order) return { processed: false, outcomeState: "UNRESOLVED", realizedProfit: 0 };

    const settings = await SettingsRepository.getByShop(shop);
    const storeSettings = ProfitService.getSettings(settings);

    // Determine Ground Truth Outcome State from Shopify signals
    let outcomeState: "DELIVERED" | "RTO" | "CANCELLED" | "UNRESOLVED" = "UNRESOLVED";
    let explanation = "";

    const fulfillmentStatus = (order.fulfillmentStatus || orderPayload.fulfillment_status || "").toLowerCase();
    const financialStatus = (order.financialStatus || orderPayload.financial_status || "").toLowerCase();
    const cancelledAt = orderPayload.cancelled_at || null;
    const tags = ((orderPayload.tags as string) || "").toLowerCase();

    const rtoKeywords = (storeSettings.rtoDetectionPattern || "rto,returned,undelivered,failed_delivery").split(",");
    const fulfillments = Array.isArray(orderPayload.fulfillments) ? orderPayload.fulfillments : [];

    const hasRtoFulfillment = fulfillments.some((f: any) => {
      const status = (f.status || "").toLowerCase();
      const shipmentStatus = (f.shipment_status || "").toLowerCase();
      return status === "failure" || shipmentStatus === "rto" || shipmentStatus === "returned" || shipmentStatus === "failure";
    });

    const isRto =
      fulfillmentStatus === "rto" ||
      hasRtoFulfillment ||
      rtoKeywords.some((kw: string) => tags.includes(kw.trim().toLowerCase()) && kw.trim().length > 0);

    // Verified Delivery Detection:
    // "Fulfilled" in Shopify only means dispatched/in-transit. In Indian COD, 100% of RTOs were once "fulfilled".
    // Do NOT treat "fulfilled" as "delivered" without verified delivery signals:
    // 1. Courier fulfillment shipment_status is "delivered"
    // 2. Order tag contains "delivered"
    // 3. For COD orders, financial_status became "paid" (courier remitted cash)
    // 4. Or explicit fulfillment status is "delivered"
    const hasDeliveredFulfillment = fulfillments.some((f: any) => (f.shipment_status || "").toLowerCase() === "delivered");
    const hasDeliveredTag = tags.includes("delivered");
    const isPaidCOD = order.isCOD && financialStatus === "paid";
    const isVerifiedDelivered =
      hasDeliveredFulfillment ||
      hasDeliveredTag ||
      isPaidCOD ||
      fulfillmentStatus === "delivered";

    if (cancelledAt || financialStatus === "voided") {
      outcomeState = "CANCELLED";
      explanation = "Order was cancelled or voided in Shopify.";
    } else if (isRto) {
      outcomeState = "RTO";
      explanation = "Order shipment was marked Return to Origin (RTO).";
    } else if (isVerifiedDelivered) {
      outcomeState = "DELIVERED";
      explanation = "Order delivery verified (carrier delivered or COD remittance collected).";
    } else if (fulfillmentStatus === "fulfilled" || fulfillments.length > 0) {
      outcomeState = "UNRESOLVED";
      explanation = "Order has been dispatched/fulfilled and is currently in transit. Awaiting carrier delivery confirmation or COD remittance.";
    } else {
      outcomeState = "UNRESOLVED";
      explanation = "Order fulfillment is pending or in progress.";
    }

    if (outcomeState === "UNRESOLVED") {
      return { processed: false, outcomeState, realizedProfit: 0 };
    }

    // Evaluate Authoritative Economics for the Ground Truth Outcome
    const econResult = CanonicalEconomicsCalculator.calculate({
      isCOD: order.isCOD,
      grossOrderValue: order.totalPrice,
      customerPaidShipping: order.shippingPrice,
      totalTax: order.totalTax,
      actualSkuCogs: order.cogsAtTimeOfOrder,
      defaultCogsPct: storeSettings.defaultCOGSPct,
      weightGrams: order.totalWeight,
      shippingSlabs: storeSettings.shippingSlabs,
      actualShippingCost: order.actualShippingCost,
      defaultForwardShipping: storeSettings.defaultForwardShipping,
      defaultReturnShipping: storeSettings.defaultReturnShipping,
      defaultPackagingCost: storeSettings.defaultPackaging,
      defaultCodHandlingFee: storeSettings.defaultCODHandling,
      defaultGatewayFeePct: storeSettings.defaultGatewayFeePct,
      gatewayFixedFee: storeSettings.gatewayFixedFee,
      shopifyPlanName: storeSettings.shopifyPlanName,
    });

    let realizedProfit = 0;
    let rtoLoss = 0;
    let verifiedSavings = 0;

    if (outcomeState === "DELIVERED") {
      realizedProfit = econResult.deliveredProfit.value;
      rtoLoss = 0;
      verifiedSavings = 0;
    } else if (outcomeState === "RTO") {
      rtoLoss = econResult.rtoLossExposure.value;
      realizedProfit = -rtoLoss;
      verifiedSavings = 0;
    } else if (outcomeState === "CANCELLED") {
      // Order cancelled before fulfillment
      // When cancelled before dispatch, forward and return freight are NOT incurred
      realizedProfit = 0;
      rtoLoss = 0;

      // Verified savings ONLY if order was blocked/restricted AND supported by high risk / repeat RTO evidence
      const decisionSnapshot = await DecisionRecordRepository.getDecisionSnapshot(shop, order.id);
      const wasRestricted =
        decisionSnapshot?.recommendation === "BLOCK_COD" ||
        decisionSnapshot?.recommendation === "PREPAID_ONLY" ||
        order.merchantRecommendation === "BLOCK_COD" ||
        order.merchantRecommendation === "PREPAID_ONLY";

      const hasRiskEvidence =
        (decisionSnapshot?.riskScore ?? 0) >= 70 ||
        (order.riskScore ?? 0) >= 70 ||
        (decisionSnapshot?.riskBand === "CRITICAL" || decisionSnapshot?.riskBand === "HIGH");

      if (wasRestricted && hasRiskEvidence) {
        verifiedSavings = econResult.rtoLossExposure.value;
        explanation += ` Verified RTO loss avoidance of ₹${Math.round(verifiedSavings)} confirmed by risk history.`;
      } else {
        verifiedSavings = 0;
      }
    }

    const outcomeSnapshot: OrderOutcomeSnapshot = {
      orderId: order.id,
      shop,
      outcomeState,
      realizedProfit: roundMoney(realizedProfit),
      rtoLoss: roundMoney(rtoLoss),
      verifiedSavings: roundMoney(verifiedSavings),
      explanation,
      resolvedAt: new Date().toISOString(),
    };

    const saved = await DecisionRecordRepository.saveOutcomeSnapshot(shop, order.id, outcomeSnapshot);

    return {
      processed: saved,
      outcomeState,
      realizedProfit: roundMoney(realizedProfit),
    };
  }

  /**
   * Retrieves high-level decision summary metrics across all reviewed orders.
   */
  static async getDecisionSummary(shop: string): Promise<DecisionPerformanceSummary> {
    return DecisionRecordRepository.getDecisionSummary(shop);
  }
}
