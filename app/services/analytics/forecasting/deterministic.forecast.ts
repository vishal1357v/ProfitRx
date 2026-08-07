import { ForecastStrategy, ForecastResult } from "./forecast.strategy";
import { LearningRecord } from "../../outcomes/types";

export class DeterministicForecast implements ForecastStrategy {
  generate(records: LearningRecord[], currentDate: Date): ForecastResult[] {
    const dayOfMonth = currentDate.getDate();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    
    // Confidence is LOW in the first 7 days, MEDIUM from 8-20, HIGH from 21+
    let confidence: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
    if (dayOfMonth <= 7) confidence = "LOW";
    else if (dayOfMonth <= 20) confidence = "MEDIUM";

    let currentProfit = 0;
    for (const record of records) {
      if (record.createdAt.getMonth() === currentDate.getMonth()) {
        currentProfit += record.outcome.realizedProfit;
      }
    }

    const multiplier = daysInMonth / dayOfMonth;
    const projectedProfit = currentProfit * multiplier;

    return [
      {
        metric: "financial.profit",
        projectedValue: projectedProfit,
        confidence
      }
    ];
  }
}
