import { TimelineEvent } from "../types";
import { ActionType } from "../../decision-engine/types";

export class InterventionEvaluator {
  /**
   * Determines if a specific intervention was actually successful based on the timeline.
   */
  static evaluate(
    action: ActionType,
    timeline: TimelineEvent[]
  ): boolean | "NOT_APPLICABLE" | "UNKNOWN" {
    
    if (action === "ALLOW_COD") return "NOT_APPLICABLE";

    if (action === "OTP_VERIFY") {
      const hasOtpVerified = timeline.some(e => e.source === "MERCHANT" && e.type === "OTP_VERIFIED");
      const hasOtpSent = timeline.some(e => e.source === "EXECUTION" && e.type === "OTP_SENT");
      if (hasOtpVerified) return true;
      if (hasOtpSent) return false; // Sent but never verified
      return "UNKNOWN";
    }

    if (action === "WHATSAPP_VERIFY") {
      const hasWaVerified = timeline.some(e => e.source === "MERCHANT" && e.type === "WHATSAPP_VERIFIED");
      const hasWaSent = timeline.some(e => e.source === "EXECUTION" && e.type === "WHATSAPP_SENT");
      if (hasWaVerified) return true;
      if (hasWaSent) return false;
      return "UNKNOWN";
    }

    if (action === "BLOCK_COD") {
      // If blocked, we usually don't have a "verified" event, but we can check if it converted to prepaid
      const hasPayment = timeline.some(e => e.source === "PAYMENT" && e.type === "PAYMENT_SUCCESS");
      return hasPayment ? true : false;
    }

    if (action === "PARTIAL_PAYMENT") {
      const hasPayment = timeline.some(e => e.source === "PAYMENT" && e.type === "PAYMENT_SUCCESS");
      return hasPayment ? true : false;
    }

    if (action === "PREPAID_ONLY") {
      const hasPayment = timeline.some(e => e.source === "PAYMENT" && e.type === "PAYMENT_SUCCESS");
      return hasPayment ? true : false;
    }

    return "UNKNOWN";
  }
}
