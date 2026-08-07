import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskResult } from "../../rto-risk/types";
import { ExpectedValueService } from "../../expected-value/expected-value.service";
import { FinancialAssumptions } from "../../expected-value/types";
import { InterventionEffect, ScenarioResult } from "../types";

export class ScenarioEvaluator {
  static evaluate(
    featureResult: OrderFeatureResult,
    riskResult: RTORiskResult,
    effect: InterventionEffect,
    financialAssumptions: FinancialAssumptions
  ): ScenarioResult {
    
    const simulatedRiskProbability = Math.min(1.0, Math.max(0, riskResult.probability * effect.riskMultiplier));
    const simulatedConfidence = Math.min(1.0, Math.max(0, riskResult.confidence * effect.confidenceMultiplier));
    const simulatedConversionRate = Math.min(1.0, Math.max(0, effect.conversionMultiplier));

    // To use ExpectedValueService, we create a simulated risk result 
    const simulatedRiskResult: RTORiskResult = {
      ...riskResult,
      probability: simulatedRiskProbability,
      confidence: simulatedConfidence
    };

    // To simulate the extra cost, we pass it into features.allocatedAdCost (or we can just append it to the assumptions if we want, but since ExpectedValueService is pure, we can mutate the copy of features to inject the extra cost as an adCost)
    // A cleaner way without changing Phase 3 types is to just add it to the adCost.
    const simulatedFeatures: OrderFeatureResult = {
      ...featureResult,
      features: {
        ...featureResult.features,
        allocatedAdCost: (featureResult.features.allocatedAdCost || 0) + effect.extraCost
      }
    };

    // Ensure adCost is included so our injected cost is calculated
    const simulatedAssumptions: FinancialAssumptions = {
      ...financialAssumptions,
      includesAdCost: true 
    };

    const expectedValueResultRaw = ExpectedValueService.calculate(
      simulatedFeatures,
      simulatedRiskResult,
      simulatedAssumptions
    );

    // Apply conversion loss to the final expected value
    // If we only have a 98% chance of converting, the expected value of the session drops by 2%
    // Note: If conversion drops, the entire expected value simply scales down because 
    // expected value = (profit * delivery - loss * rto) * conversion
    const expectedValueResult = {
      ...expectedValueResultRaw,
      expectedValue: expectedValueResultRaw.expectedValue * simulatedConversionRate
    };

    return {
      simulatedRiskProbability,
      simulatedConfidence,
      simulatedConversionRate,
      interventionCost: effect.extraCost,
      estimatedRiskReduction: Math.max(0, riskResult.probability - simulatedRiskProbability),
      estimatedConversionLoss: Math.max(0, 1.0 - simulatedConversionRate),
      expectedValueResult
    };
  }
}
