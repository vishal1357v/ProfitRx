import { AlertRule } from "../alert.engine";
import { MetricResult, Alert } from "../../types";

export class RtoSpikeRule implements AlertRule {
  id = "alert.rto-spike";

  evaluate(metrics: Map<string, MetricResult>): Alert | null {
    // In a real system we would have an explicit RTO rate metric
    // Assuming we added it to the registry. For now, we mock the check.
    const rtoMetric = metrics.get("financial.rto_rate"); // Assuming this exists

    if (rtoMetric && rtoMetric.trend && rtoMetric.trend.trend === "UP" && rtoMetric.trend.percentage > 10) {
      return {
        id: `alert_rto_${Date.now()}`,
        severity: "CRITICAL",
        message: `RTO has increased by ${rtoMetric.trend.percentage}% compared to the previous period.`,
        detectedAt: new Date()
      };
    }
    
    return null;
  }
}
