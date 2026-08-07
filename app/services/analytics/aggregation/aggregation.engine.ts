import { LearningRecord } from "../../outcomes/types";
import { MetricRegistry } from "../registry/metric.registry";
import { MetricResult } from "../types";

export class AggregationEngine {
  /**
   * Evaluates all registered metrics against a dataset.
   * In a real implementation, this handles time-period comparison (current vs previous).
   */
  static run(records: LearningRecord[]): Map<string, MetricResult> {
    const results = new Map<string, MetricResult>();

    for (const provider of MetricRegistry.getAll()) {
      const value = provider.calculate(records);
      
      results.set(provider.definition.id, {
        definition: provider.definition,
        current: value,
        // Trend math would compare against a "previousRecords" slice
        trend: { value: value * 0.1, trend: "UP", percentage: 10, previous: value * 0.9 }
      });
    }

    return results;
  }
}
