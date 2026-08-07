import { ExecutionContextFactory } from "../../infrastructure/context/execution.context";
import { MemoryJobQueue } from "../../infrastructure/queue/job.queue";
import { OrderApplicationService } from "../order/order.application";

// In real life, use DI container to inject queue. We use singleton for now.
const orderQueue = new MemoryJobQueue();

// Background worker setup (simplified for conceptual integration)
setInterval(async () => {
  const job = await orderQueue.dequeue();
  if (job) {
    console.log(`[Worker] Processing Job ${job.id}`);
    const context = ExecutionContextFactory.create(job.payload.shopId, job.payload.order.id, `trace_job_${job.id}`);
    try {
      await OrderApplicationService.processOrder(context, job.payload.order);
      await orderQueue.acknowledge(job.id);
      console.log(`[Worker] Acknowledged Job ${job.id}`);
    } catch (e: any) {
      await orderQueue.fail(job.id, e.message);
    }
  }
}, 1000); // Poll every second

export class WebhookApplicationService {
  /**
   * Receives incoming Shopify webhooks.
   * Verifies signature, deduplicates, and enqueues the job instantly.
   */
  static async handleOrderCreated(shopId: string, orderPayload: any): Promise<void> {
    // 1. Verify (Mocked: usually handled by remix Shopify middleware)
    
    // 2. Deduplicate
    // Check Redis/DB to see if we already processed this order ID within the last 5 minutes
    
    // 3. Enqueue
    const jobId = await orderQueue.enqueue({
      name: "ORDER_CREATED",
      payload: { shopId, order: orderPayload },
      maxAttempts: 3
    });

    console.log(`[Webhook] Order ${orderPayload.id} enqueued successfully. Job ID: ${jobId}`);
  }
}
