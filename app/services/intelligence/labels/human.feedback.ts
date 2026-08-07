export type FeedbackTag = "CORRECT" | "WRONG" | "CARRIER_ISSUE" | "FRAUD" | "CUSTOMER_ISSUE";

export interface HumanFeedback {
  orderId: string;
  tag: FeedbackTag;
  notes?: string;
  annotatedBy: string;
  annotatedAt: Date;
}

export class FeedbackStore {
  private static feedback: Map<string, HumanFeedback[]> = new Map();

  static addFeedback(orderId: string, feedback: HumanFeedback) {
    if (!this.feedback.has(orderId)) {
      this.feedback.set(orderId, []);
    }
    this.feedback.get(orderId)!.push(feedback);
  }

  static getForOrder(orderId: string): HumanFeedback[] {
    return this.feedback.get(orderId) || [];
  }
}
