import { EvaluatedAction, MerchantDecisionSettings } from "../types";

export class RankingService {
  static rank(
    evaluatedActions: EvaluatedAction[],
    settings: MerchantDecisionSettings
  ): EvaluatedAction[] {
    // 1. Filter out unavailable actions
    let candidates = evaluatedActions.filter(a => a.isAvailable);

    // 2. Safety filter: enforce maxFriction and minConfidence
    candidates = candidates.filter(a => {
      // Allow COD (baseline) can't be filtered out by confidence or friction
      if (a.action === "ALLOW_COD") return true;
      
      if (a.frictionScore > settings.maxFriction) {
        return false;
      }

      const conf = a.scenarioResult?.simulatedConfidence ?? 1.0;
      if (conf < settings.minConfidence) {
        return false;
      }

      return true;
    });

    // 3. Sort logic
    return candidates.sort((a, b) => {
      const evA = a.scenarioResult?.expectedValueResult.expectedValue ?? -Infinity;
      const evB = b.scenarioResult?.expectedValueResult.expectedValue ?? -Infinity;

      // Primary: Highest Expected Value (using a ₹1 margin for ties)
      if (Math.abs(evA - evB) > 1.0) {
        return evB - evA; // Descending
      }

      // Tie-Breaker 1: Lowest Friction
      if (a.frictionScore !== b.frictionScore) {
        return a.frictionScore - b.frictionScore; // Ascending
      }

      // Tie-Breaker 2: Highest Confidence
      const confA = a.scenarioResult?.simulatedConfidence ?? 0;
      const confB = b.scenarioResult?.simulatedConfidence ?? 0;
      if (confA !== confB) {
        return confB - confA; // Descending
      }

      // Tie-Breaker 3: Baseline fallback
      if (a.action === "ALLOW_COD") return -1;
      if (b.action === "ALLOW_COD") return 1;

      return 0;
    });
  }
}
