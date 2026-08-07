import { ExecutionEvent } from "../types";

// In a real implementation, this would emit to Kafka, SQS, or a local EventEmitter
// For this Phase, we will build a simple in-memory bus that can be swapped out later.
export class ExecutionEventBus {
  private static listeners: Array<(event: ExecutionEvent) => void> = [];

  static subscribe(listener: (event: ExecutionEvent) => void) {
    this.listeners.push(listener);
  }

  static emit(event: ExecutionEvent) {
    // In production, this would be an async publish to a queue.
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("ExecutionEventBus listener failed:", err);
      }
    }
  }

  static clearListeners() {
    this.listeners = [];
  }
}
