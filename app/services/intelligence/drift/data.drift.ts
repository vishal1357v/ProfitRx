export interface DriftAlert {
  metricId: string;
  baseline: number;
  current: number;
  driftPercentage: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
}

export class DataDriftDetector {
  /**
   * Detects if raw incoming data properties are drifting from expected schemas.
   * e.g., missing values spiking from 1% to 15%.
   */
  static detect(baselineMissingRate: number, currentMissingRate: number): DriftAlert | null {
    const drift = (currentMissingRate - baselineMissingRate) / (baselineMissingRate || 1);
    if (drift > 0.5) { // 50% increase in missing data
      return {
        metricId: "data.missing_values",
        baseline: baselineMissingRate,
        current: currentMissingRate,
        driftPercentage: drift * 100,
        severity: "CRITICAL"
      };
    }
    return null;
  }
}
