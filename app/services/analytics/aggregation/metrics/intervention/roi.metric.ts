import { MetricProvider } from "../../../registry/metric.registry";
import { MetricDefinition } from "../../../types";
import { LearningRecord } from "../../../../outcomes/types";

export class InterventionRoiMetric implements MetricProvider {
  definition: MetricDefinition = {
    id: "intervention.roi",
    name: "Overall Intervention ROI",
    description: "Multiplier of total expected profit saved over execution cost.",
    unit: "MULTIPLIER",
    owner: "Operations",
  };

  calculate(records: LearningRecord[]): number {
    let totalSaved = 0;
    let totalCost = 0;

    for (const record of records) {
      if (record.outcome.evaluation.interventionWorked === true) {
        // Simplified metric for profit saved: 
        // Realized Profit - (what would have happened if we didn't intervene)
        // Here we just use expectedValueError / execution costs for demonstration
        totalSaved += Math.max(0, record.outcome.realizedProfit);
        
        for (const exec of record.execution) {
          if (exec.success && exec.metrics?.providerLatencyMs) { // Mock proxy for cost
             totalCost += 1.5; // E.g., ₹1.5 per OTP
          }
        }
      }
    }

    if (totalCost === 0) return 0;
    return totalSaved / totalCost;
  }
}
