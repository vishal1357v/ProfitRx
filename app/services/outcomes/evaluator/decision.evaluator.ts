import { DecisionResult } from "../../decision-engine/types";
import { ResolvedOutcome, DecisionEvaluation } from "../types";

export class DecisionEvaluator {
  /**
   * Evaluates the accuracy and calibration of the decision engine.
   */
  static evaluate(
    decision: DecisionResult,
    resolved: ResolvedOutcome,
    realizedProfit: number,
    interventionWorked: boolean | "NOT_APPLICABLE" | "UNKNOWN"
  ): DecisionEvaluation {
    
    // Predicted EV comes from the DecisionResult (the EV of the chosen timeline)
    const expectedValue = decision.recommendedExpectedValue;
    const predictedRisk = decision.riskAfter; // The risk probability AFTER the intervention

    const expectedValueError = Math.abs(expectedValue - realizedProfit);

    let actualOutcomeRto = 0;
    if (resolved.state === "RTO" || resolved.state === "RETURNED" || resolved.state === "CANCELLED") {
      actualOutcomeRto = 1;
    }

    const predictionError = Math.abs(predictedRisk - actualOutcomeRto);
    
    // Calibration Error: how far off was the probability from reality?
    // In a single sample, calibration error is essentially the Brier score component (predictionError^2)
    // Over a dataset, calibration is measured in bins, but per-record we store the raw delta.
    const calibrationError = Math.abs(predictedRisk - actualOutcomeRto); 

    // A decision is generally deemed "correct" if EV > 0 and we didn't block it, 
    // or if we blocked it and it was truly high risk.
    // For now, a simplified proxy: If realized profit >= expected value, it was a good outcome.
    const decisionCorrect = realizedProfit >= Math.min(0, expectedValue) && resolved.state !== "UNKNOWN" && resolved.state !== "PENDING";

    return {
      predictedRisk,
      actualOutcome: resolved.state,
      expectedValue,
      realizedProfit,
      predictionError,
      expectedValueError,
      calibrationError,
      decisionCorrect,
      interventionWorked
    };
  }
}
