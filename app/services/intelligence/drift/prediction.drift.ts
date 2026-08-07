import { DriftAlert } from "./data.drift";

export class PredictionDriftDetector {
  /**
   * Detects if the model's output distribution is shifting.
   * e.g., the model used to predict high risk 10% of the time, now it predicts it 30% of the time.
   */
  static detect(baselineHighRiskRatio: number, currentHighRiskRatio: number): DriftAlert | null {
    const drift = (currentHighRiskRatio - baselineHighRiskRatio) / (baselineHighRiskRatio || 1);
    
    // 20% shift in prediction distribution is a warning
    if (Math.abs(drift) > 0.2) { 
      return {
        metricId: "prediction.high_risk_ratio",
        baseline: baselineHighRiskRatio,
        current: currentHighRiskRatio,
        driftPercentage: drift * 100,
        severity: "WARNING"
      };
    }
    return null;
  }
}
