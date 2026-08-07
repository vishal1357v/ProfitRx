import { TimelineEvent, OutcomeState, ResolvedOutcome, OutcomeConfidence } from "../types";

export class OutcomeResolver {
  /**
   * Deterministically reduces a timeline into a ResolvedOutcome state.
   * Does NOT finalize financials or lock the version.
   */
  static resolve(timeline: TimelineEvent[]): ResolvedOutcome {
    if (!timeline || timeline.length === 0) {
      return { state: "PENDING", confidence: "LOW", lastEventTimestamp: new Date() };
    }

    const lastEventTimestamp = timeline[timeline.length - 1].timestamp;

    let state: OutcomeState = "PENDING";
    let confidence: OutcomeConfidence = "LOW";

    let hasDelivery = false;
    let hasRto = false;
    let hasReturn = false;
    let hasCancel = false;
    let hasManualOverride = false;
    let overrideState: OutcomeState | null = null;

    for (const event of timeline) {
      if (event.source === "MERCHANT" && event.type === "MANUAL_OVERRIDE") {
        hasManualOverride = true;
        // Merchant explicitly defined the state
        overrideState = event.payload.state as OutcomeState;
      }

      if (event.source === "SHOPIFY") {
        if (event.type === "ORDER_DELIVERED") hasDelivery = true;
        if (event.type === "ORDER_RTO" || event.type === "ORDER_RETURNED_TO_SENDER") hasRto = true;
        if (event.type === "ORDER_RETURNED" || event.type === "ORDER_REFUNDED") hasReturn = true;
        if (event.type === "ORDER_CANCELLED") hasCancel = true;
      }
    }

    // 1. Manual Overrides are Supreme (High Confidence)
    if (hasManualOverride && overrideState) {
      return { state: overrideState, confidence: "HIGH", lastEventTimestamp };
    }

    // 2. Cancellation overrides Delivery/RTO (e.g. cancelled before shipping)
    if (hasCancel) {
      return { state: "CANCELLED", confidence: "HIGH", lastEventTimestamp };
    }

    // 3. RTO takes precedence over Delivered (fake delivery scans)
    if (hasRto) {
      return { state: "RTO", confidence: "HIGH", lastEventTimestamp };
    }

    // 4. Returns take precedence over Delivery (delivered then returned by customer)
    if (hasReturn) {
      return { state: "RETURNED", confidence: "HIGH", lastEventTimestamp };
    }

    // 5. Standard Delivery
    if (hasDelivery) {
      return { state: "DELIVERED", confidence: "HIGH", lastEventTimestamp };
    }

    // If we have execution events but no Shopify outcome, it's PENDING with MEDIUM confidence
    // that we simply haven't heard back yet.
    if (timeline.some(e => e.source === "EXECUTION")) {
      return { state: "PENDING", confidence: "MEDIUM", lastEventTimestamp };
    }

    return { state, confidence, lastEventTimestamp };
  }
}
