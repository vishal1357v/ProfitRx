import { EventBus } from "./event.bus";
import { LearningRecordRepository } from "../repositories/learning-record.repository";

export function initializeEventSubscribers() {
  
  EventBus.subscribe("DECISION_MADE", async (event) => {
    if (event.type !== "DECISION_MADE") return;
    
    // In real life, create a Learning Record draft in DB
    await LearningRecordRepository.saveRecord(
      event.context.shopId, 
      event.context.orderId || "unknown", 
      {
        action: event.payload.action,
        expectedValue: event.payload.expectedValue,
        status: "DECISION_MADE"
      }
    );
  });

  EventBus.subscribe("EXECUTION_COMPLETED", async (event) => {
    if (event.type !== "EXECUTION_COMPLETED") return;
    
    // In real life, update Learning Record status and Analytics Tables
    console.log(`[EventBus Subscriber] Analytics updated for ${event.payload.action}`);
  });
}
