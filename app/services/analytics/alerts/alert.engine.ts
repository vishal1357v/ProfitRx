import { Alert, MetricResult } from "../types";

export interface AlertRule {
  id: string;
  evaluate(metrics: Map<string, MetricResult>): Alert | null;
}

export class AlertEngine {
  private static rules: AlertRule[] = [];

  static register(rule: AlertRule) {
    this.rules.push(rule);
  }

  static run(metrics: Map<string, MetricResult>): Alert[] {
    const alerts: Alert[] = [];

    for (const rule of this.rules) {
      const alert = rule.evaluate(metrics);
      if (alert) {
        alerts.push(alert);
      }
    }

    return alerts.sort((a, b) => {
      const order = { "CRITICAL": 3, "WARNING": 2, "INFO": 1 };
      return order[b.severity] - order[a.severity];
    });
  }
}
