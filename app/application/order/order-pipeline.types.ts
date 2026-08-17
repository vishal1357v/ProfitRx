import { ActionType, DecisionResult } from "../../services/decision-engine/types";
import { RTORiskResult } from "../../services/rto-risk/types";
import { ExpectedValueResult } from "../../services/expected-value/types";

export interface OrderPipelineData {
  rawOrder: any;
  features?: any;
  metadata?: any;
  riskScore?: number;
  confidence?: number;
  riskResult?: RTORiskResult;
  expectedValue?: number;
  expectedValueResult?: ExpectedValueResult;
  finalDecision?: ActionType;
  decisionResult?: DecisionResult;
  executionStatus?: "PENDING" | "SUCCESS" | "FAILED";
}

