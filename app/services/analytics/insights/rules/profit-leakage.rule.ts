import { InsightRule } from "../insight.engine";
import { MetricResult, Insight } from "../../types";

export class ProfitLeakageRule implements InsightRule {
  id = "rule.profit-leakage";

  evaluate(metrics: Map<string, MetricResult>): Insight | null {
    const profit = metrics.get("financial.profit");
    
    // In a real system, profit leakage would be a dedicated metric comparing 
    // ideal profit against actual. Using a proxy condition here.
    if (profit && profit.current < 0) {
      return {
        id: "insight.profit-leakage",
        priority: 100,
        type: "PROBLEM",
        title: "Severe Profit Leakage Detected",
        description: `Your realized net profit is currently negative (${profit.current}). Immediate intervention adjustments recommended.`,
        metricIds: ["financial.profit"]
      };
    }
    return null;
  }
}
