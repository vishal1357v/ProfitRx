import { LearningRecord } from "../../outcomes/types";
import { Opportunity } from "../types";

export class OpportunityEngine {
  /**
   * Scans historical records to identify missed savings.
   * Example: If an order RTO'd and we didn't intervene, but OTP could have reduced that risk.
   */
  static run(records: LearningRecord[]): Opportunity[] {
    const opportunities: Opportunity[] = [];
    
    let missedOtpCount = 0;

    for (const record of records) {
      if (record.outcome.outcome === "RTO" && record.execution.length === 0) {
        // An un-intervened order resulted in RTO where OTP could have tested buyer intent
        missedOtpCount++;
      }
    }

    if (missedOtpCount > 0) {
      opportunities.push({
        id: "opp.otp.enable",
        title: "Enable OTP Verification",
        potentialSavings: 0, // Monetary projection removed until merchant before/after outcome data exists
        projectedMonthlyProfitIncrease: 0,
        recommendedAction: "OTP_VERIFY"
      });
    }

    return opportunities;
  }
}
