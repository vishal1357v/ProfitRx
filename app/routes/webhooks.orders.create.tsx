import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ShopifyService } from "../services/shopify.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (payload) {
    try {
      await ShopifyService.syncOrderPayload(shop, payload);
    } catch (err) {
      console.error(`Error syncing order payload from webhook:`, err);
      return Response.json({ error: "Sync failed" }, { status: 500 });
    }
  }

  return new Response();
};
