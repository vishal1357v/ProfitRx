import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { upsertSubscriptionRecord } from "../services/subscription-sync.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for shop: ${shop}`);

  const subData = (payload as any)?.app_subscription || payload;
  const planName = subData?.name || "FREE";
  const status = (subData?.status || "ACTIVE").toUpperCase();
  const chargeId = subData?.admin_graphql_api_id || subData?.id || null;
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
