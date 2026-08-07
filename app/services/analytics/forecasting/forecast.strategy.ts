import { LearningRecord } from "../../outcomes/types";

export interface ForecastResult {
  metric: string;
  projectedValue: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface ForecastStrategy {
  generate(records: LearningRecord[], currentDate: Date): ForecastResult[];
}
