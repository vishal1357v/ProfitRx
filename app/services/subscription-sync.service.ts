import prisma from "../db.server";
import {
  PartnerBillingService,
  mapPlanHandle,
  type AppPricingPlan,
} from "./partner-billing.service";

export function mapPlanDetails(planName: string) {
  return mapPlanHandle(planName);
}

export async function upsertSubscriptionRecord({
  shop,
  plan,
  status = "ACTIVE",
  shopifyChargeId,
  trialEndsAt,
}: {
  shop: string;
  plan: string;
  status?: string;
  shopifyChargeId?: string | null;
  trialEndsAt?: Date | null;
}) {
  const details = mapPlanHandle(plan);

  return await prisma.subscription.upsert({
    where: { shop },
    update: {
      plan: details.plan,
      status: status.toUpperCase(),
      ...(shopifyChargeId !== undefined ? { shopifyChargeId } : {}),
      ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
      orderLimit: details.orderLimit,
    },
    create: {
      shop,
      plan: details.plan,
      status: status.toUpperCase(),
      shopifyChargeId: shopifyChargeId || null,
      trialEndsAt: trialEndsAt || null,
      orderLimit: details.orderLimit,
      ordersUsed: 0,
    },
  });
}

/**
 * Synchronizes merchant subscription state with Shopify App Pricing.
 * Uses Partner API activeSubscription query as canonical source of truth.
 * Supports plan_handle URL parameter from Shopify App Pricing welcome/redirect links.
 */
export async function syncSubscriptionWithShopify(
  shop: string,
  billing?: any,
  force: boolean = false,
  planHandle?: string | null
) {
  // ── 1. If plan_handle is supplied (Welcome/Redirect link), establish plan immediately ──
  if (planHandle) {
    const details = mapPlanHandle(planHandle);
    console.log(`[SubscriptionSync] Redirect received with plan_handle="${planHandle}" -> establishing ${details.plan} for ${shop}`);

    // Try to verify via Partner API if credentials exist
    try {
      const partnerSub = await PartnerBillingService.fetchPartnerActiveSubscription(shop);
      if (partnerSub.hasSubscription && partnerSub.plan) {
        return await upsertSubscriptionRecord({
          shop,
          plan: partnerSub.plan,
          status: partnerSub.status,
          shopifyChargeId: partnerSub.shopifyChargeId,
          trialEndsAt: partnerSub.trialEndsAt,
        });
      }
    } catch (partnerErr) {
      console.warn(`[SubscriptionSync] Partner API verification during redirect skipped for ${shop}:`, partnerErr);
    }

    // Set plan directly from verified plan_handle
    return await upsertSubscriptionRecord({
      shop,
      plan: details.plan,
      status: "ACTIVE",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Default 14-day trial
    });
  }

  // ── 2. TTFB Cache Check: Return recent record if checked within 5 minutes ──
  if (!force) {
    try {
      const existing = await prisma.subscription.findUnique({ where: { shop } });
      if (existing && existing.status !== "CANCELED" && existing.status !== "PENDING") {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (existing.updatedAt > fiveMinAgo) {
          return existing;
        }
      }
    } catch (dbErr) {
      console.error(`[SubscriptionSync] Error checking local cache for ${shop}:`, dbErr);
    }
  }

  // ── 3. Query Partner API activeSubscription ──
  try {
    const partnerSub = await PartnerBillingService.fetchPartnerActiveSubscription(shop);

    if (partnerSub.hasSubscription) {
      console.log(`[SubscriptionSync] Partner API active sub confirmed for ${shop}: plan=${partnerSub.plan}, status=${partnerSub.status}`);
      return await upsertSubscriptionRecord({
        shop,
        plan: partnerSub.plan,
        status: partnerSub.status,
        shopifyChargeId: partnerSub.shopifyChargeId,
        trialEndsAt: partnerSub.trialEndsAt,
      });
    }

    // If Partner API returned a confirmed NO-SUBSCRIPTION (source === "PARTNER_API")
    if (partnerSub.source === "PARTNER_API" && !partnerSub.hasSubscription) {
      console.log(`[SubscriptionSync] Partner API confirmed NO active subscription for ${shop}. Defaulting to FREE.`);
      return await upsertSubscriptionRecord({
        shop,
        plan: "FREE",
        status: "ACTIVE",
        shopifyChargeId: null,
        trialEndsAt: null,
      });
    }

    // Partner API credentials were not configured or failed -> check local DB
    const existing = await prisma.subscription.findUnique({ where: { shop } });
    if (existing) {
      console.log(`[SubscriptionSync] Preserving local subscription for ${shop}: plan=${existing.plan}, status=${existing.status}`);
      return existing;
    }

    // No local record -> default to FREE tier
    return await upsertSubscriptionRecord({ shop, plan: "FREE", status: "ACTIVE" });
  } catch (err: any) {
    console.error(`[SubscriptionSync] Error syncing subscription for ${shop}:`, err);
    let localSub = await prisma.subscription.findUnique({ where: { shop } });
    if (!localSub) {
      localSub = await upsertSubscriptionRecord({ shop, plan: "FREE", status: "ACTIVE" });
    }
    return localSub;
  }
}

/**
 * Handles post-installation and reinstallation hook.
 * Reinstalls must discover any existing active App Pricing subscription rather than
 * creating duplicates or resetting to FREE unnecessarily.
 */
export async function handleAfterAuth(shop: string, adminClient?: any) {
  try {
    const shopId = await PartnerBillingService.resolveShopGid(shop, adminClient);
    const partnerSub = await PartnerBillingService.fetchPartnerActiveSubscription(shop, {
      shopId: shopId || undefined,
    });

    // 1. Partner API confirmed active paid subscription
    if (partnerSub.source === "PARTNER_API" && partnerSub.hasSubscription && partnerSub.plan !== "FREE") {
      console.log(`[SubscriptionSync] Reinstall discovered active App Pricing subscription for ${shop}: plan=${partnerSub.plan}`);
      return await upsertSubscriptionRecord({
        shop,
        plan: partnerSub.plan,
        status: partnerSub.status,
        shopifyChargeId: partnerSub.shopifyChargeId,
        trialEndsAt: partnerSub.trialEndsAt,
      });
    }

    // 2. Partner API confirmed NO subscription exists (null return, zero errors)
    if (partnerSub.source === "PARTNER_API" && !partnerSub.hasSubscription && !partnerSub.isError) {
      console.log(`[SubscriptionSync] Partner API confirmed NO active subscription for ${shop}. Initializing FREE.`);
      return await upsertSubscriptionRecord({
        shop,
        plan: "FREE",
        status: "ACTIVE",
        shopifyChargeId: null,
        trialEndsAt: null,
      });
    }

    // 3. Partner API errored or credentials unconfigured -> DO NOT force FREE!
    if (partnerSub.isError) {
      console.warn(`[SubscriptionSync] Partner API lookup returned error during reinstall for ${shop}: ${partnerSub.error}. Preserving prior subscription without resetting to FREE.`);
    }
  } catch (partnerErr) {
    console.warn(`[SubscriptionSync] Reinstall Partner API check failed for ${shop}:`, partnerErr);
  }

  // Preserve existing local subscription if one exists (do NOT reset paid tier to FREE on errors)
  const existingSub = await prisma.subscription.findUnique({ where: { shop } });
  if (existingSub) {
    // If it was marked CANCELED upon uninstall, reactivate existing tier so merchant is not locked out
    if (existingSub.status === "CANCELED") {
      return await prisma.subscription.update({
        where: { shop },
        data: { status: "ACTIVE" },
      });
    }
    return existingSub;
  }

  // Brand new store with no history -> initialize FREE
  return await upsertSubscriptionRecord({
    shop,
    plan: "FREE",
    status: "ACTIVE",
    shopifyChargeId: null,
    trialEndsAt: null,
  });
}

/**
 * Cancels a subscription and downgrades merchant to the FREE tier.
 * Under Shopify App Pricing, recurring charges are managed in the Partner Dashboard / Shopify Admin.
 */
export async function cancelSubscription(shop: string, billing?: any) {
  console.log(`[SubscriptionSync] Canceling subscription for shop: ${shop}`);

  return await prisma.subscription.update({
    where: { shop },
    data: {
      plan: "FREE",
      status: "CANCELED",
      orderLimit: 50,
      shopifyChargeId: null,
      trialEndsAt: null,
    },
  });
}

export const SubscriptionSyncService = {
  mapPlanDetails,
  upsertSubscriptionRecord,
  syncSubscriptionWithShopify,
  handleAfterAuth,
  cancelSubscription,
};
