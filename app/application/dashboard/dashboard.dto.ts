export interface DashboardMetricDTO {
  label: string;
  value: string;
  trend: string;
  isPositive: boolean;
}

export interface DashboardDTO {
  revenue: DashboardMetricDTO;
  profit: DashboardMetricDTO;
  rtoRate: DashboardMetricDTO;
  otpRoi: DashboardMetricDTO;
  alerts: Array<{ id: string, title: string, severity: "CRITICAL" | "WARNING" | "INFO" }>;
  opportunities: Array<{ title: string, potentialSavings: string }>;
}
