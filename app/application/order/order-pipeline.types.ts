import { ActionType } from "../../services/decision-engine/types";

export interface OrderPipelineData {
  rawOrder: any;
  features?: any;
  riskScore?: number;
  expectedValue?: number;
  finalDecision?: ActionType;
  executionStatus?: "PENDING" | "SUCCESS" | "FAILED";
}
