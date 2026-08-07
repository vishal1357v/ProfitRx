import { ResolvedOutcome, OutcomeResult, TimelineEvent, DecisionEvaluation } from "../types";

export class OutcomeFinalizer {
  /**
   * Finalizes the OutcomeResult.
   * In a real system, this takes the previous version (if any) and increments it,
   * while also injecting the evaluation and realized profit calculations (Milestone 6B).
   */
  static finalize(
    shop: string,
    orderId: string,
    resolved: ResolvedOutcome,
    timeline: TimelineEvent[],
    realizedProfit: number,
    evaluation: DecisionEvaluation,
    previousVersion: number = 0
  ): OutcomeResult {
    
    // In scenarios where we are PENDING but we have a firm manual override,
    // we trust the ResolvedOutcome's confidence.
    
    return {
      outcomeId: `${shop}_${orderId}`,
      version: previousVersion + 1,
      shop,
      orderId,
      outcome: resolved.state,
      timeline,
      realizedProfit,
      evaluation,
      confidence: resolved.confidence,
      createdAt: new Date()
    };
  }
}
