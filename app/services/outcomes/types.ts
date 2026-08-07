import { OrderFeatures } from "../order-features/types";
import { RTORiskResult } from "../rto-risk/types";
import { ExpectedValueResult } from "../expected-value/types";
import { DecisionResult } from "../decision-engine/types";
import { ExecutionResult } from "../execution/types";

// ==========================================
// Milestone 6A: Timeline & Resolution
// ==========================================

export interface TimelineEvent {
  eventId: string;
  timestamp: Date;
  source: "EXECUTION" | "SHOPIFY" | "PAYMENT" | "MERCHANT";
  type: string;
  causedByEventId?: string; // Causality tracking
  payload: Record<string, unknown>;
}

export type OutcomeState = 
  | "PENDING"
  | "DELIVERED"
  | "RTO"
  | "RETURNED"
  | "CANCELLED"
  | "LOST"
  | "FAILED_PAYMENT"
  | "UNKNOWN";

export type OutcomeConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ResolvedOutcome {
  state: OutcomeState;
  confidence: OutcomeConfidence;
  lastEventTimestamp: Date;
}

export interface OutcomeResult {
  outcomeId: string;
  version: number;
  shop: string;
  orderId: string;
  outcome: OutcomeState;
  timeline: TimelineEvent[];
  realizedProfit: number;
  evaluation: DecisionEvaluation;
  confidence: OutcomeConfidence;
  createdAt: Date;
}

// ==========================================
// Milestone 6B: Evaluation
// ==========================================

export interface DecisionEvaluation {
  predictedRisk: number;
  actualOutcome: string;
  expectedValue: number;
  realizedProfit: number;
  predictionError: number;
  expectedValueError: number;
  calibrationError: number; // Used for ML
  decisionCorrect: boolean;
  interventionWorked: boolean | "NOT_APPLICABLE" | "UNKNOWN";
}

// ==========================================
// Milestone 6C: Learning Records
// ==========================================

export type DatasetQuality = "HIGH" | "MEDIUM" | "LOW";

export interface LearningRecord {
  recordId: string;
  version: number;
  shop: string;
  orderId: string;
  datasetQuality: DatasetQuality;
  features: OrderFeatures;
  risk: RTORiskResult;
  expectedValue: ExpectedValueResult;
  decision: DecisionResult;
  execution: ExecutionResult[];
  outcome: OutcomeResult;
  createdAt: Date;
}

// ==========================================
// Milestone 6D: Analytics & Drift
// ==========================================

export interface DriftReport {
  metric: string;
  expected: number;
  observed: number;
  delta: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
}
