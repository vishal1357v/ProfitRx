import { TimelineEvent } from "../types";

export class TimelineBuilder {
  /**
   * Reconstructs a chronological timeline from raw events.
   * Sorts by timestamp and attempts to link causality.
   */
  static build(events: TimelineEvent[]): TimelineEvent[] {
    // 1. Sort strictly by timestamp ascending
    const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // 2. Resolve Causality where obvious
    // Example: An OTP_VERIFIED event is caused by an OTP_SENT event.
    // Example: A MANUAL_OVERRIDE might be caused by an outcome we didn't expect.
    
    // We maintain a map of the last significant event of certain types to link causality
    let lastExecutionEvent: TimelineEvent | null = null;
    let lastOtpSentEvent: TimelineEvent | null = null;
    let lastPaymentSentEvent: TimelineEvent | null = null;

    for (const event of sorted) {
      if (event.source === "EXECUTION") {
        lastExecutionEvent = event;
        if (event.type === "OTP_SENT") lastOtpSentEvent = event;
        if (event.type === "PAYMENT_LINK_SENT") lastPaymentSentEvent = event;
      }

      if (event.source === "SHOPIFY") {
        // Shopify fulfillments/updates are often the consequence of our execution allowing it
        if (!event.causedByEventId && lastExecutionEvent && lastExecutionEvent.type === "ALLOW_COD_APPLIED") {
          // Weak causality, but useful
          // event.causedByEventId = lastExecutionEvent.eventId;
        }
      }

      if (event.source === "MERCHANT") {
        if (!event.causedByEventId && event.type === "OTP_VERIFIED" && lastOtpSentEvent) {
           event.causedByEventId = lastOtpSentEvent.eventId;
        }
      }
      
      if (event.source === "PAYMENT") {
        if (!event.causedByEventId && event.type === "PAYMENT_SUCCESS" && lastPaymentSentEvent) {
          event.causedByEventId = lastPaymentSentEvent.eventId;
        }
      }
    }

    return sorted;
  }
}
