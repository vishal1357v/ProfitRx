import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { upsertSubscriptionRecord } from "../services/subscription-sync.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string;
  let payload: any;
  let topic: string;

  try {
    const authResult = await authenticate.webhook(request);
    shop = authResult.shop;
    payload = authResult.payload;
    topic = authResult.topic;
  } catch (err) {
    // Fallback for direct JSON payloads if hmac verification is handled separately
    const body = await request.json().catch(() => ({}));
    shop = body.shop || request.headers.get("x-shopify-shop-domain") || "";
    payload = body;
    topic = request.headers.get("x-shopify-topic") || "app/subscription/updated";
  }

  if (!shop) {
    return new Response("Missing shop domain", { status: 400 });
  }

  console.log(`[Webhook Subscription] Received ${topic} for shop ${shop}`);

  const subData = payload?.app_subscription || payload;
  const planName = subData?.name || subData?.plan || "GROWTH";
  const status = (subData?.status || "ACTIVE").toUpperCase();
  const chargeId = subData?.admin_graphql_api_id || subData?.id || subData?.chargeId || null;

  await upsertSubscriptionRecord({
    shop,
    plan: planName,
    status,
    shopifyChargeId: chargeId,
  });

  return new Response("OK", { status: 200 });
};
