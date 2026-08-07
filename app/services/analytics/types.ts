export interface DashboardResponse<T> {
  apiVersion: string;
  generatedAt: Date;
  data: T;
  executiveSummary: ExecutiveSummary;
}

export interface ExecutiveSummary {
  topWins: string[];
  topProblems: string[];
  topOpportunity: string;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  unit: "CURRENCY" | "PERCENTAGE" | "COUNT" | "MULTIPLIER";
  owner: string;
}

export interface TrendData {
  value: number;
  trend: "UP" | "DOWN" | "FLAT";
  percentage: number;
  previous: number;
}

export interface MetricResult {
  definition: MetricDefinition;
  current: number;
  trend?: TrendData;
  benchmark?: number; // Future Phase
}

// Scorecard & Insights
export interface MerchantScorecard {
  profitSaved: MetricResult;
  profitLeakage: MetricResult;
  decisionAccuracy: MetricResult;
  predictionAccuracy: MetricResult;
  interventionROI: MetricResult;
  overallScore: number; // 0-100
}

export interface Insight {
  id: string;
  priority: number;
  type: "WIN" | "PROBLEM" | "INFO";
  title: string;
  description: string;
  metricIds: string[];
}

// Opportunities
export interface Opportunity {
  id: string;
  title: string;
  potentialSavings: number;
  projectedMonthlyProfitIncrease: number;
  recommendedAction: string;
}

// Alerts
export interface Alert {
  id: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  detectedAt: Date;
}
