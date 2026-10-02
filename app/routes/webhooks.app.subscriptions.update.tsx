import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { upsertSubscriptionRecord } from "../services/subscription-sync.service";

/**
 * NOTE ON SHOPIFY APP PRICING MIGRATION:
 * Shopify App Pricing no longer sends APP_SUBSCRIPTIONS_UPDATE webhooks after April 28, 2026.
 * The canonical source of truth for merchant subscription status is the Partner API
 * `activeSubscription` query and redirect plan_handle parameters.
 *
 * This handler is retained for backwards compatibility with existing legacy Billing API
 * contracts during the migration window.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[Webhook APP_SUBSCRIPTIONS_UPDATE] (Legacy webhook received for ${shop}, topic: ${topic})`);

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
