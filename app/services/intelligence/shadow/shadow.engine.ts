import { InferenceGateway } from "../gateway/inference.gateway";
import { ActionType } from "../types";

export interface ShadowResult {
  ruleAction: ActionType;
  mlAction: ActionType | null;
  agreement: boolean;
}

export class ShadowEngine {
  /**
   * Silently runs the ML model alongside the deterministic Rule Engine.
   * If the model crashes or takes too long, it fails silently to protect the primary flow.
   */
  static runSilently(features: any, ruleAction: ActionType): ShadowResult {
    try {
      const mlResult = InferenceGateway.predict(features);
      if (!mlResult) {
        return { ruleAction, mlAction: null, agreement: false };
      }

      return {
        ruleAction,
        mlAction: mlResult.action,
        agreement: ruleAction === mlResult.action
      };
    } catch (error) {
      // Complete isolation. ML failures never impact production rules.
      console.error("[SHADOW ML FAILURE]", error);
      return { ruleAction, mlAction: null, agreement: false };
    }
  }
}
