import { OrderFeatures } from "../../order-features/types";
import { ScorerResult, RiskFactor, RiskWarning } from "../types";
import { ORDER_WEIGHTS, ORDER_THRESHOLDS, SCORER_WEIGHTS } from "../weights";
import { calculateContribution } from "./utils";

export class OrderScorer {
  static score(features: OrderFeatures): ScorerResult {
    const factors: RiskFactor[] = [];
    const warnings: RiskWarning[] = [];

    // Order Value Signal
    let valueSignal = 0;
    if (features.grossOrderValue > ORDER_THRESHOLDS.veryHighValueOrder) {
      valueSignal = 0.8;
    } else if (features.grossOrderValue > ORDER_THRESHOLDS.highValueOrder) {
      valueSignal = 0.5;
    } else {
      valueSignal = (features.grossOrderValue / ORDER_THRESHOLDS.highValueOrder) * 0.3;
    }

    if (features.grossOrderValue > ORDER_THRESHOLDS.highValueOrder) {
      const valueContribution = calculateContribution(valueSignal, ORDER_WEIGHTS.orderValue, SCORER_WEIGHTS.order, 1.0, true);
      factors.push({
        key: "HIGH_ORDER_VALUE",
        label: "High Order Value",
        contribution: valueContribution,
        value: features.grossOrderValue,
        explanation: `Order value ₹${features.grossOrderValue} exceeds ₹${ORDER_THRESHOLDS.highValueOrder} threshold.`
      });
    }

    // Discount Signal
    let discountSignal = 0;
    const discountPct = features.discountPercentage ?? 0;
    if (discountPct > ORDER_THRESHOLDS.heavyDiscount) {
      discountSignal = 0.7;
    } else if (discountPct > ORDER_THRESHOLDS.moderateDiscount) {
      discountSignal = 0.4;
    }

    if (discountPct > ORDER_THRESHOLDS.moderateDiscount) {
      const discountContribution = calculateContribution(discountSignal, ORDER_WEIGHTS.discountPercent, SCORER_WEIGHTS.order, 1.0, true);
      factors.push({
        key: "HEAVY_DISCOUNT",
        label: "Heavy Discount",
        contribution: discountContribution,
        value: discountPct,
        explanation: `Discount of ${(discountPct * 100).toFixed(1)}% may indicate impulse purchase.`
      });
    }

    // COD Signal
    const codSignal = features.isCOD ? 0.5 : 0;
    if (features.isCOD) {
      const codContribution = calculateContribution(codSignal, ORDER_WEIGHTS.isCOD, SCORER_WEIGHTS.order, 1.0, true);
      factors.push({
        key: "COD_ORDER",
        label: "Cash on Delivery",
        contribution: codContribution,
        value: true,
        explanation: "Cash on Delivery order. COD orders have inherently higher RTO risk."
      });
    } else {
      warnings.push("PREPAID_ORDER");
      factors.push({
        key: "PREPAID_ORDER",
        label: "Prepaid Order",
        contribution: 0, // Contribution handled by the multiplier at the end, but listed for explanation
        value: false,
        explanation: "Prepaid order. Risk significantly reduced."
      });
    }

    // Address Signal
    const addressCompleteness = features.addressCompletenessScore ?? 0;
    const addressSignal = 1 - addressCompleteness;
    
    if (addressCompleteness < 0.8) {
      warnings.push("MISSING_ADDRESS");
      const addressContribution = calculateContribution(addressSignal, ORDER_WEIGHTS.addressCompleteness, SCORER_WEIGHTS.order, 1.0, true);
      factors.push({
        key: "MISSING_ADDRESS",
        label: "Incomplete Address",
        contribution: addressContribution,
        value: addressCompleteness,
        explanation: `Address completeness score is ${addressCompleteness}. Incomplete addresses correlate with higher RTO.`
      });
    }

    let totalWeight = 0;
    Object.values(ORDER_WEIGHTS).forEach(w => totalWeight += w);

    const score = (
      valueSignal * ORDER_WEIGHTS.orderValue +
      discountSignal * ORDER_WEIGHTS.discountPercent +
      codSignal * ORDER_WEIGHTS.isCOD +
      addressSignal * ORDER_WEIGHTS.addressCompleteness
    ) / totalWeight;

    const confidence = 0.9; // Order-level data is always fully available

    return {
      score,
      confidence,
      factors,
      warnings
    };
  }
}
