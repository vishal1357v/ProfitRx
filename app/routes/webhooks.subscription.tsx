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
  } catch (err: any) {
    console.warn("Subscription webhook authentication failed:", err.message);
    return new Response("Unauthorized webhook signature", { status: 401 });
  }

  if (!shop) {
    return new Response("Missing shop domain", { status: 400 });
  }

  console.log(`[Webhook Subscription] Received ${topic} for shop ${shop}`);

  const subData = payload?.app_subscription || payload;
  const planName = subData?.name || subData?.plan || "GROWTH";
  const status = (subData?.status || "ACTIVE").toUpperCase();
  const chargeId = subData?.admin_graphql_api_id || subData?.id || subData?.chargeId || null;
  const rawTrialEndsAt = subData?.trial_ends_at || null;
  const trialEndsAt = rawTrialEndsAt ? new Date(rawTrialEndsAt) : null;

  await upsertSubscriptionRecord({
    shop,
    plan: planName,
    status,
    shopifyChargeId: chargeId,
    trialEndsAt,
  });

  return new Response("OK", { status: 200 });
};
