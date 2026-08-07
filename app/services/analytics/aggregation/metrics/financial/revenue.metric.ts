import { MetricProvider } from "../../../registry/metric.registry";
import { MetricDefinition } from "../../../types";
import { LearningRecord } from "../../../../outcomes/types";

export class RevenueMetric implements MetricProvider {
  definition: MetricDefinition = {
    id: "financial.revenue",
    name: "Total Revenue",
    description: "Total gross revenue from delivered orders.",
    unit: "CURRENCY",
    owner: "Finance",
  };

  calculate(records: LearningRecord[]): number {
    return records
      .filter(r => r.outcome.outcome === "DELIVERED")
      .reduce((sum, r) => sum + r.expectedValue.deliveredScenario.revenue, 0);
  }
}
