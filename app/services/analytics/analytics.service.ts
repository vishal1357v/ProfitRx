import { LearningRecord } from "../outcomes/types";
import { DashboardResponse, ExecutiveSummary, MerchantScorecard } from "./types";
import { AggregationEngine } from "./aggregation/aggregation.engine";
import { InsightEngine } from "./insights/insight.engine";
import { OpportunityEngine } from "./opportunities/opportunity.engine";
import { AlertEngine } from "./alerts/alert.engine";
import { DeterministicForecast } from "./forecasting/deterministic.forecast";

export class AnalyticsService {
  /**
   * Transforms raw learning records into a complete Merchant Intelligence dashboard DTO.
   */
  static getMerchantOverview(records: LearningRecord[]): DashboardResponse<MerchantScorecard> {
    
    // 1. Aggregation (Pure Math)
    const metrics = AggregationEngine.run(records);

    // 2. Insights & Alerts
    const insights = InsightEngine.run(metrics);
    const alerts = AlertEngine.run(metrics);
    
    // 3. Opportunities
    const opportunities = OpportunityEngine.run(records);

    // 4. Forecasts
    const forecaster = new DeterministicForecast();
    const forecasts = forecaster.generate(records, new Date());

    // 5. Construct Dashboard DTO
    const scorecard: MerchantScorecard = {
      profitSaved: metrics.get("financial.profit") || { definition: {} as any, current: 0 },
      profitLeakage: { definition: {} as any, current: 0 }, // Mock
      decisionAccuracy: { definition: {} as any, current: 0 }, // Mock
      predictionAccuracy: { definition: {} as any, current: 0 }, // Mock
      interventionROI: metrics.get("intervention.roi") || { definition: {} as any, current: 0 },
      overallScore: 85 // Mock computed score
    };

    const summary: ExecutiveSummary = {
      topWins: insights.filter(i => i.type === "WIN").map(i => i.title).slice(0, 5),
      topProblems: insights.filter(i => i.type === "PROBLEM").map(i => i.title).slice(0, 5),
      topOpportunity: opportunities.length > 0 ? opportunities[0].title : "None",
      urgency: alerts.some(a => a.severity === "CRITICAL") ? "HIGH" : "LOW",
      confidence: "HIGH"
    };

    return {
      apiVersion: "1.0",
      generatedAt: new Date(),
      data: scorecard,
      executiveSummary: summary
    };
  }
}
