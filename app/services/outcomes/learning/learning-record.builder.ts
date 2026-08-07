import { 
  LearningRecord, 
  DatasetQuality, 
  OutcomeResult 
} from "../types";
import { OrderFeatures } from "../../order-features/types";
import { RTORiskResult } from "../../rto-risk/types";
import { ExpectedValueResult } from "../../expected-value/types";
import { DecisionResult } from "../../decision-engine/types";
import { ExecutionResult } from "../../execution/types";

export class LearningRecordBuilder {
  /**
   * Builds an immutable, versioned LearningRecord suitable for ML training.
   */
  static build(
    shop: string,
    orderId: string,
    features: OrderFeatures,
    risk: RTORiskResult,
    expectedValue: ExpectedValueResult,
    decision: DecisionResult,
    execution: ExecutionResult[],
    outcome: OutcomeResult
  ): LearningRecord {
    
    // Evaluate Data Quality
    let quality: DatasetQuality = "HIGH";

    if (outcome.outcome === "PENDING" || outcome.outcome === "UNKNOWN") {
      quality = "LOW";
    } else if (outcome.confidence === "LOW") {
      quality = "LOW";
    } else if (outcome.confidence === "MEDIUM") {
      quality = "MEDIUM";
    } else if (outcome.timeline.length < 2 && outcome.outcome !== "CANCELLED") {
      // Very sparse timeline (e.g. only execution, no shopify webhooks)
      quality = "MEDIUM";
    }

    return {
      recordId: `${shop}_${orderId}`,
      version: outcome.version,
      shop,
      orderId,
      datasetQuality: quality,
      features,
      risk,
      expectedValue,
      decision,
      execution,
      outcome,
      createdAt: new Date()
    };
  }
}
