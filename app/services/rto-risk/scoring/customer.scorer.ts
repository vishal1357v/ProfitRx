import { OrderFeatures } from "../../order-features/types";
import { ScorerResult, RiskFactor, RiskWarning } from "../types";
import { CUSTOMER_WEIGHTS, CUSTOMER_THRESHOLDS, PRIORS, PRIOR_WEIGHT, SCORER_WEIGHTS } from "../weights";
import { calculateEffectiveRate, calculateContribution } from "./utils";

export class CustomerScorer {
  static score(features: OrderFeatures): ScorerResult {
    const factors: RiskFactor[] = [];
    const warnings: RiskWarning[] = [];

    // Signals
    let rtoSignal = 0;
    let deliverySignal = 0;
    let cancellationSignal = 0;
    let newCustomerSignal = 0;
    let recencySignal = 0;
    let ageSignal = 0;

    // RTO Rate Signal (Smoothed)
    if (features.customerCodOrderCount > 0) {
      const rawRtoRate = features.customerRtoRate ?? 0;
      rtoSignal = calculateEffectiveRate(rawRtoRate, features.customerCodOrderCount, PRIORS.newCustomerRisk, PRIOR_WEIGHT);
      
      const rtoContribution = calculateContribution(rtoSignal, CUSTOMER_WEIGHTS.rtoRate, SCORER_WEIGHTS.customer, 1.0, true);
      factors.push({
        key: rawRtoRate >= CUSTOMER_THRESHOLDS.highRtoRate ? "HIGH_RTO_CUSTOMER" : "MODERATE_RTO_CUSTOMER",
        label: "Customer RTO Rate",
        contribution: rtoContribution,
        value: rawRtoRate,
        explanation: `Customer has ${(rawRtoRate * 100).toFixed(1)}% COD RTO rate across ${features.customerCodOrderCount} COD orders.`
      });
    } else {
      rtoSignal = PRIORS.newCustomerRisk;
    }

    // New Customer Signal
    if (features.isNewCustomer) {
      newCustomerSignal = PRIORS.newCustomerRisk;
      const newCustContribution = calculateContribution(newCustomerSignal, CUSTOMER_WEIGHTS.isNewCustomer, SCORER_WEIGHTS.customer, 1.0, true);
      factors.push({
        key: "NEW_CUSTOMER",
        label: "New Customer",
        contribution: newCustContribution,
        value: true,
        explanation: `No order history. Prior risk of ${(PRIORS.newCustomerRisk * 100).toFixed(1)}% applied.`
      });
      warnings.push("NEW_CUSTOMER");
      warnings.push("NO_CUSTOMER_HISTORY");
    }

    // Delivery Success Signal
    if (features.customerCodOrderCount > 0) {
      const deliverySuccessRate = features.customerDeliveredCount / features.customerCodOrderCount;
      deliverySignal = 1 - deliverySuccessRate; // Lower delivery rate = higher risk signal
      
      if (features.customerDeliveredCount > 0) {
        // Decrease risk
        const deliveryContribution = calculateContribution(deliverySuccessRate, CUSTOMER_WEIGHTS.deliverySuccess, SCORER_WEIGHTS.customer, 1.0, false);
        factors.push({
          key: "TRUSTED_CUSTOMER",
          label: "Trusted Customer",
          contribution: deliveryContribution,
          value: features.customerDeliveredCount,
          explanation: `Customer has ${features.customerDeliveredCount} successful deliveries out of ${features.customerCodOrderCount} COD orders.`
        });
      }
    }

    // Cancellation Signal
    if (features.customerCancellationCount > 0) {
      cancellationSignal = Math.min(features.customerCancellationCount / CUSTOMER_THRESHOLDS.highCancellations, 1);
      const cancelContribution = calculateContribution(cancellationSignal, CUSTOMER_WEIGHTS.cancellationRate, SCORER_WEIGHTS.customer, 1.0, true);
      factors.push({
        key: "FREQUENT_CANCELLATIONS",
        label: "Frequent Cancellations",
        contribution: cancelContribution,
        value: features.customerCancellationCount,
        explanation: `Customer has cancelled ${features.customerCancellationCount} previous orders.`
      });
    }

    // Purchase Recency Signal
    if (features.daysSinceLastOrder !== null) {
      if (features.daysSinceLastOrder <= CUSTOMER_THRESHOLDS.recentPurchaseDays) {
        recencySignal = 0; // Positive signal
        const recencyContribution = calculateContribution(1, CUSTOMER_WEIGHTS.purchaseRecency, SCORER_WEIGHTS.customer, 1.0, false);
        factors.push({
          key: "RECENT_CUSTOMER",
          label: "Recent Purchase",
          contribution: recencyContribution,
          value: features.daysSinceLastOrder,
          explanation: `Last order was ${Math.round(features.daysSinceLastOrder)} days ago. Recent activity is a positive signal.`
        });
      } else {
        recencySignal = Math.min(features.daysSinceLastOrder / CUSTOMER_THRESHOLDS.stalePurchaseDays, 1);
        const recencyContribution = calculateContribution(recencySignal, CUSTOMER_WEIGHTS.purchaseRecency, SCORER_WEIGHTS.customer, 1.0, true);
        factors.push({
          key: "STALE_CUSTOMER",
          label: "Stale Customer",
          contribution: recencyContribution,
          value: features.daysSinceLastOrder,
          explanation: `Last order was ${Math.round(features.daysSinceLastOrder)} days ago.`
        });
      }
    }

    // Customer Age Signal
    if (features.customerAgeDays !== null && features.customerAgeDays > 0) {
      const ageRatio = Math.min(features.customerAgeDays / CUSTOMER_THRESHOLDS.matureCustomerDays, 1);
      ageSignal = 1 - ageRatio; // Older = lower signal
      if (features.customerAgeDays >= CUSTOMER_THRESHOLDS.matureCustomerDays) {
        const ageContribution = calculateContribution(1, CUSTOMER_WEIGHTS.customerAge, SCORER_WEIGHTS.customer, 1.0, false);
        factors.push({
          key: "MATURE_CUSTOMER",
          label: "Mature Account",
          contribution: ageContribution,
          value: features.customerAgeDays,
          explanation: `Customer account is ${Math.round(features.customerAgeDays)} days old.`
        });
      }
    }

    // Calculate overall score (weighted average)
    let totalWeight = 0;
    Object.values(CUSTOMER_WEIGHTS).forEach(w => totalWeight += w);

    const score = (
      rtoSignal * CUSTOMER_WEIGHTS.rtoRate +
      deliverySignal * CUSTOMER_WEIGHTS.deliverySuccess +
      cancellationSignal * CUSTOMER_WEIGHTS.cancellationRate +
      newCustomerSignal * CUSTOMER_WEIGHTS.isNewCustomer +
      recencySignal * CUSTOMER_WEIGHTS.purchaseRecency +
      ageSignal * CUSTOMER_WEIGHTS.customerAge
    ) / totalWeight;

    // Confidence
    const confidence = Math.min(features.customerCodOrderCount / 10, 1) * (features.isNewCustomer ? 0.2 : 1.0);

    return {
      score,
      confidence,
      factors,
      warnings
    };
  }
}
