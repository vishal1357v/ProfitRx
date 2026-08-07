import { OrderFeatureResult } from "../order-features/types";

/** PUBLIC CONTRACT — do not rename or remove fields */
export interface RTORiskResult {
  probability: number;         // 0–1, rounded to 2 decimal places
  riskLevel: RTORiskLevel;
  confidence: number;          // 0–1, rounded to 2 decimal places
  modelVersion: string;        // "risk-engine-v1"
  weightsVersion: string;      // "weights-v1"
  confidenceVersion: string;   // "confidence-v1"
  factors: RiskFactor[];       // Sorted by |contribution| descending
  warnings: RiskWarning[];
}

export type RTORiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** PUBLIC CONTRACT — do not rename or remove fields */
export interface RiskFactor {
  key: string;                 // Machine-readable: "HIGH_RTO_CUSTOMER"
  label: string;               // Human-readable: "High Customer RTO Rate"
  contribution: number;        // -1 to +1, how much this moved the probability
  value: number | string | boolean | null;
  explanation: string;         // Template-based, no AI
}

/** PUBLIC CONTRACT — do not rename or remove fields */
export interface RTORiskProvider {
  predict(featureResult: OrderFeatureResult): RTORiskResult;
}

/** PUBLIC CONTRACT — do not rename or remove fields */
export interface ScorerResult {
  score: number;               // 0–1 risk score for this domain
  confidence: number;          // 0–1 evidence quality for this domain
  factors: RiskFactor[];
  warnings: RiskWarning[];
}

export type RiskWarning =
  | "LOW_CONFIDENCE"
  | "UNKNOWN_PINCODE"
  | "NO_CUSTOMER_HISTORY"
  | "SMALL_SAMPLE"
  | "REGIONAL_PRIOR_USED"
  | "NEW_CUSTOMER"
  | "MISSING_ADDRESS"
  | "PREPAID_ORDER";
