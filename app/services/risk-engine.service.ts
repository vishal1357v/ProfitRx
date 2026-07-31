import prisma from "../db.server";

export interface RiskReasons {
  code: string;
  description: string;
}

export interface RiskResult {
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasons: RiskReasons[];
  recommendation: string | null;
}

export interface InventoryRecoveryResult {
  recoverableInventory: number;
  lostInventory: number;
  packagingLoss: number;
  courierLoss: number;
  netRtoLoss: number;
}

export class RiskEngineService {
  /**
   * Calculates the risk score for a customer based on historical data.
   */
  static calculateCustomerRisk(customer: { rtoCount: number; codOrders: number; cancellationCount: number; aov: number }): RiskResult {
    let score = 0;
    const reasons: RiskReasons[] = [];

    const rtoRate = customer.codOrders > 0 ? (customer.rtoCount / customer.codOrders) * 100 : 0;

    if (rtoRate > 30) {
      score += 40;
      reasons.push({ code: "HIGH_RTO_CUSTOMER", description: `Customer has a high RTO rate of ${rtoRate.toFixed(1)}%.` });
    } else if (rtoRate > 15) {
      score += 20;
      reasons.push({ code: "MODERATE_RTO_CUSTOMER", description: `Customer has an RTO rate of ${rtoRate.toFixed(1)}%.` });
    }

    if (customer.cancellationCount > 3) {
      score += 30;
      reasons.push({ code: "FREQUENT_CANCELLATIONS", description: `Customer has cancelled ${customer.cancellationCount} previous orders.` });
    }

    return this.mapScoreToResult(score, reasons);
  }

  /**
   * Calculates the risk score for a pincode based on historical data.
   */
  static calculatePincodeRisk(pincodeStats: { rtoRate: number; codOrders: number }): RiskResult {
    let score = 0;
    const reasons: RiskReasons[] = [];

    if (pincodeStats.codOrders >= 5) {
      if (pincodeStats.rtoRate > 40) {
        score += 50;
        reasons.push({ code: "HIGH_RISK_PINCODE", description: `Pincode has a historically critical RTO rate of ${pincodeStats.rtoRate.toFixed(1)}%.` });
      } else if (pincodeStats.rtoRate > 25) {
        score += 25;
        reasons.push({ code: "MODERATE_RISK_PINCODE", description: `Pincode has a historically moderate RTO rate of ${pincodeStats.rtoRate.toFixed(1)}%.` });
      }
    }

    return this.mapScoreToResult(score, reasons);
  }

  /**
   * Evaluates order risk deterministically against historical data and merchant rules.
   */
  static evaluateOrderRisk(
    order: { totalPrice: number; isCOD: boolean; gateway?: string | null },
    customerRisk: RiskResult | null,
    pincodeRisk: RiskResult | null,
    rules: any
  ): RiskResult {
    let totalScore = 0;
    const combinedReasons: RiskReasons[] = [];

    // Accumulate customer risk
    if (customerRisk && customerRisk.score > 0) {
      totalScore += customerRisk.score;
      combinedReasons.push(...customerRisk.reasons);
    }

    // Accumulate pincode risk
    if (pincodeRisk && pincodeRisk.score > 0) {
      totalScore += pincodeRisk.score;
      combinedReasons.push(...pincodeRisk.reasons);
    }

    // Order value risk
    if (order.totalPrice > 10000) {
      totalScore += 20;
      combinedReasons.push({ code: "HIGH_ORDER_VALUE", description: `Order value (₹${order.totalPrice}) is very high.` });
    }

    // Evaluate Merchant Rules
    let ruleRecommendation = null;

    if (order.isCOD) {
      if (rules.rulesRejectCodOver && order.totalPrice > rules.rulesRejectCodOver) {
        totalScore += 50; // Force high risk
        combinedReasons.push({ code: "RULE_REJECT_COD_OVER", description: `Order exceeds maximum COD value of ₹${rules.rulesRejectCodOver}.` });
        ruleRecommendation = "Disable COD.";
      }
    }

    if (rules.rulesRequirePrepaidAbove && order.totalPrice > rules.rulesRequirePrepaidAbove) {
      totalScore += 30;
      combinedReasons.push({ code: "RULE_REQUIRE_PREPAID", description: `Order value requires prepaid payment above ₹${rules.rulesRequirePrepaidAbove}.` });
      if (!ruleRecommendation) ruleRecommendation = "Require prepaid payment.";
    }

    // Cap score at 100
    const finalScore = Math.min(100, totalScore);
    const result = this.mapScoreToResult(finalScore, combinedReasons);
    
    // Override recommendation if rule triggered a specific one
    if (ruleRecommendation) {
      result.recommendation = ruleRecommendation;
    }

    return result;
  }

  private static mapScoreToResult(score: number, reasons: RiskReasons[]): RiskResult {
    let level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    let recommendation: string | null = null;

    if (score >= 75) {
      level = "CRITICAL";
      recommendation = "Call customer before shipping or require prepaid payment.";
    } else if (score >= 50) {
      level = "HIGH";
      recommendation = "Review order and confirm intent via Whatsapp/Call.";
    } else if (score >= 25) {
      level = "MEDIUM";
      recommendation = "Monitor delivery closely.";
    } else {
      level = "LOW";
    }

    return { score, level, reasons, recommendation };
  }

  /**
   * Separates RTO inventory into Recoverable vs Lost based on item viability.
   */
  static calculateInventoryRecovery(
    rtoItems: Array<{ cogs: number; quantity: number; isPerishable: boolean }>,
    forwardShippingCost: number,
    returnShippingCost: number,
    packagingCost: number
  ): InventoryRecoveryResult {
    let recoverableInventory = 0;
    let lostInventory = 0;

    for (const item of rtoItems) {
      const totalItemCogs = item.cogs * item.quantity;
      if (item.isPerishable) {
        lostInventory += totalItemCogs;
      } else {
        recoverableInventory += totalItemCogs;
      }
    }

    const courierLoss = forwardShippingCost + returnShippingCost;
    const netRtoLoss = lostInventory + courierLoss + packagingCost;

    return {
      recoverableInventory,
      lostInventory,
      packagingLoss: packagingCost,
      courierLoss,
      netRtoLoss
    };
  }
}
