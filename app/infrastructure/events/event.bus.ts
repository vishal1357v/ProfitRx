import { ExecutionContext } from "../context/execution.context";
import { ActionType } from "../../services/decision-engine/types";

export type EventType = 
  | "ORDER_RECEIVED"
  | "ORDER_ANALYZED"
  | "DECISION_MADE"
  | "EXECUTION_COMPLETED"
  | "LEARNING_RECORD_CREATED";

export interface BaseEvent {
  type: EventType;
  context: ExecutionContext;
  payload: any;
}

export interface DecisionMadeEvent extends BaseEvent {
  type: "DECISION_MADE";
  payload: {
    action: ActionType;
    confidence: number;
    expectedValue: number;
    riskScore: number;
  };
}

export interface ExecutionCompletedEvent extends BaseEvent {
  type: "EXECUTION_COMPLETED";
  payload: {
    action: ActionType;
    success: boolean;
    provider: string;
    error?: string;
  };
}

export type DomainEvent = BaseEvent | DecisionMadeEvent | ExecutionCompletedEvent;

export type EventHandler = (event: DomainEvent) => Promise<void> | void;

export class EventBus {
  private static subscribers: Map<EventType, EventHandler[]> = new Map();

  static subscribe(type: EventType, handler: EventHandler) {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, []);
    }
    this.subscribers.get(type)!.push(handler);
  }

  static async publish(event: DomainEvent) {
    const handlers = this.subscribers.get(event.type) || [];
    
    // Execute all handlers concurrently, catching errors so one failed subscriber 
    // doesn't crash the event bus
    await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          console.error(`[EventBus] Error in subscriber for ${event.type} (Trace: ${event.context.traceId})`, error);
        }
      })
    );
  }
}
