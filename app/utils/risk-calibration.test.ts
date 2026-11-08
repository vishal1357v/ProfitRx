import { describe, it, expect } from "vitest";
import { calibrateRiskScoreToProbability } from "./risk-calibration";

describe("calibrateRiskScoreToProbability", () => {
  it("never treats a 70/100 risk score as 70% probability", () => {
    const prob70 = calibrateRiskScoreToProbability(70, true);
    expect(prob70).toBe(0.42); // 42%, not 70%!
    expect(prob70).toBeLessThan(0.50);
  });

  it("calibrates baseline low-risk COD (score 20) to ~14%", () => {
    const prob20 = calibrateRiskScoreToProbability(20, true);
    expect(prob20).toBe(0.14);
  });

  it("calibrates medium risk (score 50) to ~28%", () => {
    const prob50 = calibrateRiskScoreToProbability(50, true);
    expect(prob50).toBe(0.28);
  });

  it("calibrates critical risk (score 85) to ~58%", () => {
    const prob85 = calibrateRiskScoreToProbability(85, true);
    expect(prob85).toBe(0.58);
  });

  it("calibrates extreme score 100 to 75%", () => {
    const prob100 = calibrateRiskScoreToProbability(100, true);
    expect(prob100).toBe(0.75);
  });

  it("calibrates prepaid orders to 1% - 5%", () => {
    const prepaidLow = calibrateRiskScoreToProbability(0, false);
    const prepaidHigh = calibrateRiskScoreToProbability(100, false);
    expect(prepaidLow).toBe(0.01);
    expect(prepaidHigh).toBe(0.05);
  });

  it("handles null or undefined score with sensible default", () => {
    const defaultCOD = calibrateRiskScoreToProbability(null, true);
    expect(defaultCOD).toBeGreaterThanOrEqual(0.18);
    expect(defaultCOD).toBeLessThanOrEqual(0.25);
  });
});

