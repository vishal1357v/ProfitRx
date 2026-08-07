import { MetricProvider } from "../../../registry/metric.registry";
import { MetricDefinition } from "../../../types";
import { LearningRecord } from "../../../../outcomes/types";

export class ProfitMetric implements MetricProvider {
  definition: MetricDefinition = {
    id: "financial.profit",
    name: "Realized Net Profit",
    description: "Total exact realized profit verified from ground truth outcomes.",
    unit: "CURRENCY",
    owner: "Finance",
  };

  calculate(records: LearningRecord[]): number {
    return records.reduce((sum, r) => sum + r.outcome.realizedProfit, 0);
  }
}
