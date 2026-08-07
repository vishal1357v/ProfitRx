import { MetricResult, Insight } from "../types";

export interface InsightRule {
  id: string;
  evaluate(metrics: Map<string, MetricResult>): Insight | null;
}

export class InsightEngine {
  private static rules: InsightRule[] = [];

  static register(rule: InsightRule) {
    this.rules.push(rule);
  }

  static run(metrics: Map<string, MetricResult>): Insight[] {
    const insights: Insight[] = [];

    for (const rule of this.rules) {
      const insight = rule.evaluate(metrics);
      if (insight) {
        insights.push(insight);
      }
    }

    return insights.sort((a, b) => b.priority - a.priority);
  }
}
