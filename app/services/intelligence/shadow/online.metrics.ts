import { ShadowComparisonMetrics } from "../types";
import { ShadowResult } from "./shadow.engine";

export class OnlineMetrics {
  /**
   * Aggregates live shadow mode performance metrics for the dashboard.
   */
  static calculate(results: ShadowResult[]): ShadowComparisonMetrics {
    if (results.length === 0) {
      return { agreementPercentage: 0, averageEvDelta: 0, averageRiskDelta: 0, falseBlockRate: 0 };
    }

    let agreements = 0;
    let falseBlocks = 0; // Where ML blocked, but Rule allowed (and maybe the rule was right?)

    for (const r of results) {
      if (r.agreement) agreements++;
      if (r.mlAction === "BLOCK" && r.ruleAction !== "BLOCK") falseBlocks++;
    }

    return {
      agreementPercentage: (agreements / results.length) * 100,
      averageEvDelta: 0, // Would require full EV injection from Phase 3 
      averageRiskDelta: 0,
      falseBlockRate: (falseBlocks / results.length) * 100
    };
  }
}
