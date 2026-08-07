import { OrderFeatures } from "../../order-features/types";
import { ScorerResult, RiskFactor, RiskWarning } from "../types";
import { PINCODE_WEIGHTS, PINCODE_THRESHOLDS, PRIORS, PRIOR_WEIGHT, SCORER_WEIGHTS } from "../weights";
import { calculateEffectiveRate, calculateContribution } from "./utils";

export class PincodeScorer {
  static score(
    features: OrderFeatures
  ): ScorerResult {
    const factors: RiskFactor[] = [];
    const warnings: RiskWarning[] = [];

    const merchantDefaultRto = features.merchantCodRtoRate ?? PRIORS.merchantDefaultRto;
    let score: number = 0;
    let confidence = 0;

    if (!features.pincode) {
      score = PRIORS.unknownPincodeRisk;
      confidence = 0.1;
      warnings.push("UNKNOWN_PINCODE");
      
      const unkContribution = calculateContribution(score, 1.0, SCORER_WEIGHTS.pincode, 1.0, true);
      factors.push({
        key: "UNKNOWN_PINCODE",
        label: "Unknown Pincode",
        contribution: unkContribution,
        value: null,
        explanation: `No delivery history for pincode null. Prior of ${(PRIORS.unknownPincodeRisk * 100).toFixed(1)}% applied.`
      });
      return { score, confidence, factors, warnings };
    }

    if (features.pincodeSampleSize >= PINCODE_THRESHOLDS.minSampleSize) {
      const rawRtoRate = features.pincodeRtoRate ?? 0;
      const pincodeRtoSignal = calculateEffectiveRate(rawRtoRate, features.pincodeCodOrderCount, merchantDefaultRto, PRIOR_WEIGHT);
      const deliverySignal = 1 - (features.pincodeDeliveryRate ?? 0);

      const rtoContribution = calculateContribution(pincodeRtoSignal, PINCODE_WEIGHTS.pincodeRtoRate, SCORER_WEIGHTS.pincode, 1.0, true);
      factors.push({
        key: rawRtoRate >= PINCODE_THRESHOLDS.highRtoRate ? "HIGH_RTO_PINCODE" : "LOW_RTO_PINCODE",
        label: "Pincode RTO Rate",
        contribution: rtoContribution,
        value: rawRtoRate,
        explanation: `Pincode ${features.pincode} has ${(rawRtoRate * 100).toFixed(1)}% RTO rate across ${features.pincodeCodOrderCount} COD orders.`
      });

      let totalWeight = PINCODE_WEIGHTS.pincodeRtoRate + PINCODE_WEIGHTS.deliveryRate;
      score = (
        pincodeRtoSignal * PINCODE_WEIGHTS.pincodeRtoRate +
        deliverySignal * PINCODE_WEIGHTS.deliveryRate
      ) / totalWeight;
      
      confidence = Math.min(features.pincodeSampleSize / 50, 1);
    } else {
      // Insufficient pincode data → use regional fallback
      warnings.push("REGIONAL_PRIOR_USED");
      
      const rawRegionalRto = features.regionalRtoRate ?? merchantDefaultRto;
      const regionalSignal = calculateEffectiveRate(rawRegionalRto, features.regionalCodOrderCount, merchantDefaultRto, PRIOR_WEIGHT);
      
      const regionalContribution = calculateContribution(regionalSignal, PINCODE_WEIGHTS.regionalFallback, SCORER_WEIGHTS.pincode, 1.0, true);
      const prefix = features.pincode.substring(0, 2);
      factors.push({
        key: "REGIONAL_PRIOR",
        label: "Regional Fallback",
        contribution: regionalContribution,
        value: rawRegionalRto,
        explanation: `Regional RTO rate of ${(rawRegionalRto * 100).toFixed(1)}% used (based on ${features.regionalCodOrderCount} orders in region ${prefix}xx).`
      });

      const unkContribution = calculateContribution(PRIORS.unknownPincodeRisk, (1 - PINCODE_WEIGHTS.regionalFallback), SCORER_WEIGHTS.pincode, 1.0, true);
      factors.push({
        key: "UNKNOWN_PINCODE",
        label: "Unknown Pincode",
        contribution: unkContribution,
        value: features.pincode,
        explanation: `No delivery history for pincode ${features.pincode}. Prior of ${(PRIORS.unknownPincodeRisk * 100).toFixed(1)}% applied.`
      });

      score = regionalSignal * PINCODE_WEIGHTS.regionalFallback +
              PRIORS.unknownPincodeRisk * (1 - PINCODE_WEIGHTS.regionalFallback);
      
      confidence = Math.min(features.regionalSampleSize / 50, 1) * 0.6; // regional is less precise
    }

    if (features.pincodeSampleSize < PINCODE_THRESHOLDS.minSampleSize) {
      warnings.push("SMALL_SAMPLE");
    }

    return {
      score,
      confidence,
      factors,
      warnings
    };
  }
}
