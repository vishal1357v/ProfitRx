import { ExecutionContextFactory } from "../../infrastructure/context/execution.context";
import { OrderApplicationService } from "../order/order.application";

export class WebhookApplicationService {
  /**
   * Receives incoming Shopify webhooks.
   * Processes the order synchronously for serverless environments (Vercel).
   */
  static async handleOrderCreated(shopId: string, orderPayload: any): Promise<void> {
    console.log(`[Webhook] Processing Order ${orderPayload.id} synchronously.`);
    
    // Create execution context
    const context = ExecutionContextFactory.create(shopId, orderPayload.id, `trace_sync_${Date.now()}`);
    
    try {
      await OrderApplicationService.processOrder(context, orderPayload);
      console.log(`[Webhook] Order ${orderPayload.id} processed successfully.`);
    } catch (error: any) {
      console.error(`[Webhook] Error processing Order ${orderPayload.id}:`, error.message);
      throw error; // Rethrow so Shopify receives a 500 and retries
    }
  }
}
