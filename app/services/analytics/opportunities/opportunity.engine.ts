import { LearningRecord } from "../../outcomes/types";
import { Opportunity } from "../types";

export class OpportunityEngine {
  /**
   * Scans historical records to identify missed savings.
   * Example: If an order RTO'd and we didn't intervene, but OTP could have reduced that risk.
   */
  static run(records: LearningRecord[]): Opportunity[] {
    const opportunities: Opportunity[] = [];
    
    let missedOtpSavings = 0;
    let missedOtpCount = 0;

    for (const record of records) {
      if (record.outcome.outcome === "RTO" && record.execution.length === 0) {
        // We didn't intervene, and they RTO'd. 
        // If OTP reduces RTO by 15% on average, we could have saved a portion of this loss.
        // Simplified heuristic: 15% of the total RTO loss could have been recovered
        const loss = record.expectedValue.rtoScenario.totalLoss;
        missedOtpSavings += loss * 0.15; 
        missedOtpCount++;
      }
    }

    if (missedOtpCount > 0) {
      opportunities.push({
        id: "opp.otp.enable",
        title: "Enable OTP Verification",
        potentialSavings: missedOtpSavings,
        projectedMonthlyProfitIncrease: missedOtpSavings * 4, // simplistic projection
        recommendedAction: "OTP_VERIFY"
      });
    }

    return opportunities.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }
}
