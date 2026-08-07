import { OrderFeatureResult } from "../../order-features/types";
import { RTORiskResult } from "../types";

/** PUBLIC CONTRACT — do not rename or remove fields */
export interface RTORiskProvider {
  /**
   * Predicts RTO probability purely deterministically from Phase 1 features.
   * MUST NEVER query the database.
   */
  predict(featureResult: OrderFeatureResult): RTORiskResult;
}
