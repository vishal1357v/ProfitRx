import { OrderFeatures } from "../../order-features/types";
import { ScorerResult, RiskFactor, RiskWarning } from "../types";
import { MERCHANT_THRESHOLDS, PRIORS, PRIOR_WEIGHT, SCORER_WEIGHTS } from "../weights";
import { calculateEffectiveRate, calculateContribution } from "./utils";

export class MerchantScorer {
  static score(features: OrderFeatures): ScorerResult {
    const factors: RiskFactor[] = [];
    const warnings: RiskWarning[] = [];

    let score: number = PRIORS.merchantDefaultRto;
    let confidence = 0.2;

    if (features.merchantCodOrderCount >= MERCHANT_THRESHOLDS.minHistoricalOrders) {
      const rawRtoRate = features.merchantCodRtoRate ?? PRIORS.merchantDefaultRto;
      const merchantBaseline = calculateEffectiveRate(rawRtoRate, features.merchantCodOrderCount, PRIORS.merchantDefaultRto, PRIOR_WEIGHT);
      
      score = merchantBaseline;
      confidence = Math.min(features.merchantCodOrderCount / 100, 1);

      const contribution = calculateContribution(merchantBaseline, 1.0, SCORER_WEIGHTS.merchant, 1.0, true);
      factors.push({
        key: merchantBaseline >= MERCHANT_THRESHOLDS.highBaselineRto ? "HIGH_MERCHANT_BASELINE" : "LOW_MERCHANT_BASELINE",
        label: "Store Baseline RTO",
        contribution,
        value: merchantBaseline,
        explanation: `Store baseline COD RTO rate is ${(merchantBaseline * 100).toFixed(1)}% across ${features.merchantCodOrderCount} orders.`
      });
    } else {
      warnings.push("SMALL_SAMPLE");
      // Use prior but no factor added to keep explanations clean
    }

    return {
      score,
      confidence,
      factors,
      warnings
    };
  }
}
