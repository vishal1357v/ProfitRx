import { TimelineEvent, OutcomeResult, LearningRecord, ResolvedOutcome, DecisionEvaluation } from "./types";
import { TimelineBuilder } from "./timeline/timeline.builder";
import { OutcomeResolver } from "./resolver/outcome.resolver";
import { OutcomeFinalizer } from "./resolver/outcome.finalizer";
import { RealizedProfitEvaluator } from "./evaluator/realized-profit.evaluator";
import { DecisionEvaluator } from "./evaluator/decision.evaluator";
import { InterventionEvaluator } from "./evaluator/intervention.evaluator";
import { LearningRecordBuilder } from "./learning/learning-record.builder";
import { DecisionResult } from "../decision-engine/types";
import { ExpectedValueResult } from "../expected-value/types";
import { OrderFeatures } from "../order-features/types";
import { RTORiskResult } from "../rto-risk/types";
import { ExecutionResult } from "../execution/types";

export class OutcomeService {
  /**
   * Processes all inputs to derive a final OutcomeResult and LearningRecord.
   */
  static process(
    shop: string,
    orderId: string,
    rawTimeline: TimelineEvent[],
    features: OrderFeatures,
    risk: RTORiskResult,
    expectedValue: ExpectedValueResult,
    decision: DecisionResult,
    executions: ExecutionResult[],
    previousVersion: number = 0
  ): { outcome: OutcomeResult; record: LearningRecord } {
    
    // 6A: Timeline & Resolution
    const timeline = TimelineBuilder.build(rawTimeline);
    const resolved: ResolvedOutcome = OutcomeResolver.resolve(timeline);

    // 6B: Evaluation
    const realizedProfit = RealizedProfitEvaluator.evaluate(expectedValue, resolved);
    const interventionWorked = InterventionEvaluator.evaluate(decision.recommendedAction, timeline);
    const evaluation: DecisionEvaluation = DecisionEvaluator.evaluate(decision, resolved, realizedProfit, interventionWorked);

    // Finalize Outcome
    const outcome: OutcomeResult = OutcomeFinalizer.finalize(
      shop,
      orderId,
      resolved,
      timeline,
      realizedProfit,
      evaluation,
      previousVersion
    );

    // 6C: Learning Record
    const record: LearningRecord = LearningRecordBuilder.build(
      shop,
      orderId,
      features,
      risk,
      expectedValue,
      decision,
      executions,
      outcome
    );

    return { outcome, record };
  }
}
