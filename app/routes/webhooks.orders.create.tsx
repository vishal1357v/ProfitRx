import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { WebhookApplicationService } from "../application/webhooks/webhook.application";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[Route] Received ${topic} webhook for ${shop}`);

  if (payload) {
    try {
      // Hand off entirely to Application Layer. Returns instantly.
      // E2E Pipeline processes in the background queue.
      await WebhookApplicationService.handleOrderCreated(shop, payload);
    } catch (err) {
      console.error(`Error queuing webhook payload:`, err);
      // We return 500 so Shopify retries the webhook delivery later
      return Response.json({ error: "Queuing failed" }, { status: 500 });
    }
  }

  // Acknowledge to Shopify instantly within 500ms
  return new Response();
};
