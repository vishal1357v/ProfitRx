import { ExpectedValueResult } from "../../expected-value/types";
import { ResolvedOutcome } from "../types";

export class RealizedProfitEvaluator {
  /**
   * Calculates the exact realized profit based on the ground truth outcome.
   */
  static evaluate(
    expectedValueResult: ExpectedValueResult,
    resolved: ResolvedOutcome
  ): number {
    
    // If pending, we can't calculate realized profit yet
    if (resolved.state === "PENDING" || resolved.state === "UNKNOWN") {
      return 0; // or null/undefined in a stricter system
    }

    // If Delivered, they earned the Delivered Scenario contribution profit
    if (resolved.state === "DELIVERED") {
      return expectedValueResult.deliveredScenario.contributionProfit;
    }

    // If RTO or Cancelled/Returned, they suffered the RTO Scenario total loss (as a negative)
    if (resolved.state === "RTO" || resolved.state === "RETURNED" || resolved.state === "CANCELLED" || resolved.state === "LOST") {
      // expectedValueResult.rtoScenario.totalLoss is typically a positive magnitude of loss.
      // So realized profit is negative of that loss.
      return -expectedValueResult.rtoScenario.totalLoss;
    }

    return 0;
  }
}
