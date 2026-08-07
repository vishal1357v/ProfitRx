import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskProvider } from "./rto-risk-provider";
import { RTORiskResult, RiskFactor, RiskWarning, RTORiskLevel } from "../types";
import { CustomerScorer } from "../scoring/customer.scorer";
import { PincodeScorer } from "../scoring/pincode.scorer";
import { MerchantScorer } from "../scoring/merchant.scorer";
import { OrderScorer } from "../scoring/order.scorer";
import { ConfidenceScorer } from "../scoring/confidence.scorer";
import { 
  MODEL_VERSION, WEIGHTS_VERSION, CONFIDENCE_VERSION, 
  SCORER_WEIGHTS, PRIORS, RISK_THRESHOLDS, CONFIDENCE_THRESHOLDS 
} from "../weights";

export class RuleBasedRiskProvider implements RTORiskProvider {
  
  predict(featureResult: OrderFeatureResult): RTORiskResult {
    const { features, metadata } = featureResult;

    const customerResult = CustomerScorer.score(features);
    const merchantResult = MerchantScorer.score(features);
    const pincodeResult = PincodeScorer.score(features);
    const orderResult = OrderScorer.score(features);

    let totalWeight = 0;
    Object.values(SCORER_WEIGHTS).forEach(w => totalWeight += w);

    let combinedRisk = (
      customerResult.score * SCORER_WEIGHTS.customer +
      pincodeResult.score * SCORER_WEIGHTS.pincode +
      merchantResult.score * SCORER_WEIGHTS.merchant +
      orderResult.score * SCORER_WEIGHTS.order
    ) / totalWeight;

    // Apply prepaid discount
    let prepaidMultiplier = 1;
    if (!features.isCOD) {
      prepaidMultiplier = (1 - PRIORS.prepaidDiscount);
      combinedRisk *= prepaidMultiplier;
    }

    let probability = Math.max(0, Math.min(1, combinedRisk));
    probability = Math.round(probability * 100) / 100; // Round to 2 decimal places

    const finalConfidenceRaw = ConfidenceScorer.combine(
      customerResult.confidence,
      pincodeResult.confidence,
      merchantResult.confidence,
      orderResult.confidence,
      metadata.dataConfidence
    );
    const finalConfidence = Math.round(finalConfidenceRaw * 100) / 100;

    // Factors
    const factors: RiskFactor[] = [
      ...customerResult.factors,
      ...pincodeResult.factors,
      ...merchantResult.factors,
      ...orderResult.factors
    ];

    // If prepaid, adjust all contributions by multiplier so explanation matches final score impact
    // But actually, just sort them. Prepaid factor handles the explanation.
    if (!features.isCOD) {
      const prepaidFactor = factors.find(f => f.key === "PREPAID_ORDER");
      if (prepaidFactor) {
        prepaidFactor.explanation = `Prepaid order. Risk reduced by ${PRIORS.prepaidDiscount * 100}%.`;
        // Make the contribution highly negative
        prepaidFactor.contribution = -PRIORS.prepaidDiscount;
      }
    }

    // Sort by absolute contribution descending
    factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    // Ensure contributions are rounded
    factors.forEach(f => f.contribution = Math.round(f.contribution * 100) / 100);

    // Warnings
    const warnings = new Set<RiskWarning>([
      ...customerResult.warnings,
      ...pincodeResult.warnings,
      ...merchantResult.warnings,
      ...orderResult.warnings
    ]);

    if (finalConfidence < CONFIDENCE_THRESHOLDS.lowConfidence) {
      warnings.add("LOW_CONFIDENCE");
    }

    return {
      probability,
      riskLevel: this.mapToLevel(probability),
      confidence: finalConfidence,
      factors,
      warnings: Array.from(warnings),
      modelVersion: MODEL_VERSION,
      weightsVersion: WEIGHTS_VERSION,
      confidenceVersion: CONFIDENCE_VERSION
    };
  }

  private mapToLevel(probability: number): RTORiskLevel {
    if (probability < RISK_THRESHOLDS.LOW_MAX) return "LOW";
    if (probability < RISK_THRESHOLDS.MEDIUM_MAX) return "MEDIUM";
    if (probability < RISK_THRESHOLDS.HIGH_MAX) return "HIGH";
    return "CRITICAL";
  }
}
