import { LearningRecord, DriftReport } from "../types";

export class DriftDetector {
  /**
   * Scans an array of LearningRecords to detect macroscopic drift 
   * (e.g. if predicted risk strongly diverges from actual RTO rates).
   */
  static detect(records: LearningRecord[]): DriftReport[] {
    const reports: DriftReport[] = [];
    
    // Filter to only highly confident, completed outcomes
    const resolvedRecords = records.filter(r => 
      r.datasetQuality === "HIGH" && 
      (r.outcome.outcome === "DELIVERED" || r.outcome.outcome === "RTO" || r.outcome.outcome === "RETURNED" || r.outcome.outcome === "CANCELLED")
    );

    if (resolvedRecords.length < 5) {
      // Need minimum sample size to detect drift meaningfully
      return reports;
    }

    // 1. Overall Prediction Drift
    let totalPredictedRisk = 0;
    let totalActualRto = 0;

    for (const record of resolvedRecords) {
      totalPredictedRisk += record.outcome.evaluation.predictedRisk;
      if (record.outcome.outcome === "RTO" || record.outcome.outcome === "RETURNED" || record.outcome.outcome === "CANCELLED") {
        totalActualRto += 1;
      }
    }

    const averagePredicted = totalPredictedRisk / resolvedRecords.length;
    const averageActual = totalActualRto / resolvedRecords.length;

    const predictionDelta = Math.abs(averagePredicted - averageActual);

    if (predictionDelta > 0.05) { // 5% drift threshold
      reports.push({
        metric: "RiskPrediction",
        expected: averagePredicted,
        observed: averageActual,
        delta: predictionDelta,
        severity: predictionDelta > 0.15 ? "CRITICAL" : "WARNING"
      });
    }

    // More dimensions (Conversion, Margin, Intervention Efficacy) would be checked here

    return reports;
  }
}
