import { ActionType } from "../../services/decision-engine/types";

export interface OrderPipelineData {
  rawOrder: any;
  features?: any;
  metadata?: any;
  riskScore?: number;
  confidence?: number;
  expectedValue?: number;
  finalDecision?: ActionType;
  executionStatus?: "PENDING" | "SUCCESS" | "FAILED";
}
