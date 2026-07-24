import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

export function mapPlanDetails(planName: string) {
  const upper = (planName || "").toUpperCase().trim();
  if (upper === "PRO" || upper === "ADVANCE" || upper === "PRO_ENTERPRISE") {
    return { plan: "PRO", orderLimit: null };
  }
  if (upper === "GROWTH") {
    return { plan: "GROWTH", orderLimit: 2000 };
  }
  if (upper === "STARTER" || upper === "BASIC") {
    return { plan: "STARTER", orderLimit: 500 };
  }
  return { plan: "FREE", orderLimit: 50 };
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
  const details = mapPlanDetails(plan);

  return await prisma.subscription.upsert({
    where: { shop },
    update: {
      plan: details.plan,
      status,
      ...(shopifyChargeId !== undefined ? { shopifyChargeId } : {}),
      ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
      orderLimit: details.orderLimit,
    },
    create: {
      shop,
      plan: details.plan,
      status,
      shopifyChargeId: shopifyChargeId || null,
      trialEndsAt: trialEndsAt || null,
      orderLimit: details.orderLimit,
      ordersUsed: 0,
    },
  });
}

export async function syncSubscriptionWithShopify(shop: string, billing: any, force: boolean = false) {
  // ⚡ TTFB Cache Check: Query our database first to see if subscription was checked recently (within 5 min)
  if (!force) {
    try {
      const existing = await prisma.subscription.findUnique({ where: { shop } });
      // Always re-check PENDING records (merchant just selected a plan, awaiting Shopify confirmation)
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

  try {
    // First attempt
    let checkResult = await billing.check({
      plans: ["STARTER", "GROWTH", "PRO"],
      isTest: true,
    });

    console.log(`[Billing Check] shop=${shop} attempt=1 appSubscriptions=${JSON.stringify(checkResult.appSubscriptions, null, 2)}`);

    // Retry once after 1.5s if Shopify returned no subscriptions — covers propagation delay
    if (!checkResult.appSubscriptions?.length) {
      console.log(`[Billing Check] shop=${shop} No subscriptions on first check, retrying in 1.5s...`);
      await new Promise(r => setTimeout(r, 1500));
      checkResult = await billing.check({
        plans: ["STARTER", "GROWTH", "PRO"],
        isTest: true,
      });
      console.log(`[Billing Check] shop=${shop} attempt=2 appSubscriptions=${JSON.stringify(checkResult.appSubscriptions, null, 2)}`);
    }

    const activeSub = checkResult.appSubscriptions?.find((sub: any) => {
      const s = (sub.status || "").toUpperCase();
      return s === "ACTIVE" || s === "TRIALING";
    });

    console.log(`[Billing Check] shop=${shop} activeSub=${activeSub ? JSON.stringify({ name: activeSub.name, status: activeSub.status, id: activeSub.id }) : "NONE"}`);

    if (activeSub) {
      const trialEndsAt = activeSub.trialEndsAt ? new Date(activeSub.trialEndsAt) : null;
      const dbBefore = await prisma.subscription.findUnique({ where: { shop } });
      console.log(`[Billing Check] shop=${shop} DB BEFORE update: plan=${dbBefore?.plan} status=${dbBefore?.status}`);
      const updated = await upsertSubscriptionRecord({
        shop,
        plan: activeSub.name,
        status: activeSub.status.toUpperCase(),
        shopifyChargeId: activeSub.id,
        trialEndsAt,
      });
      console.log(`[Billing Check] shop=${shop} DB AFTER update: plan=${updated.plan} status=${updated.status}`);
      return updated;
    }

    // No active payment found on Shopify after retry
    const existing = await prisma.subscription.findUnique({ where: { shop } });
    console.log(`[Billing Check] shop=${shop} No active sub from Shopify. Local DB: plan=${existing?.plan} status=${existing?.status} updatedAt=${existing?.updatedAt?.toISOString()}`);

    if (!existing || existing.status === "CANCELED") {
      console.log(`[Billing Check] shop=${shop} No local record or CANCELED — defaulting to FREE`);
      return await upsertSubscriptionRecord({ shop, plan: "FREE", status: "ACTIVE" });
    }

    // Protect PENDING records: merchant selected a plan but Shopify hasn't confirmed yet.
    // Never downgrade a PENDING record — only Shopify confirmation or stale timeout should clear it.
    if (existing.status === "PENDING") {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (existing.updatedAt > fiveMinAgo) {
        console.log(`[Billing Check] shop=${shop} PENDING record preserved (plan=${existing.plan}, age=${Math.round((Date.now() - existing.updatedAt.getTime()) / 1000)}s)`);
        return existing;
      }
      // PENDING record is stale (>5 min) — merchant likely abandoned checkout, revert to FREE
      console.log(`[Billing Check] shop=${shop} PENDING record STALE (plan=${existing.plan}, age=${Math.round((Date.now() - existing.updatedAt.getTime()) / 1000)}s) — reverting to FREE`);
      return await upsertSubscriptionRecord({ shop, plan: "FREE", status: "ACTIVE" });
    }

    // Only downgrade ACTIVE/TRIALING subscriptions after Shopify confirms they're gone.
    // The billing.check() above (with retry) already ran — if we're here, Shopify genuinely
    // has no active subscription for this shop.
    if (
      existing.plan !== "FREE" && 
      (existing.status === "ACTIVE" || existing.status === "TRIALING") &&
      existing.updatedAt < new Date(Date.now() - 5 * 60 * 1000)
    ) {
      console.log(`[Billing Check] shop=${shop} DOWNGRADING: Shopify confirmed no active sub. Local was plan=${existing.plan} status=${existing.status} (age=${Math.round((Date.now() - existing.updatedAt.getTime()) / 1000)}s)`);
      return await prisma.subscription.update({
        where: { shop },
        data: {
          plan: "FREE",
          status: "EXPIRED",
          orderLimit: 50,
          trialEndsAt: null,
        },
      });
    }

    console.log(`[Billing Check] shop=${shop} Keeping existing record as-is: plan=${existing.plan} status=${existing.status}`);
    return existing;
  } catch (err) {
    console.error(`[SubscriptionSync] Error checking billing for ${shop}:`, err);
    let localSub = await prisma.subscription.findUnique({ where: { shop } });
    if (!localSub) {
      localSub = await upsertSubscriptionRecord({ shop, plan: "FREE", status: "ACTIVE" });
    }
    return localSub;
  }
}

export async function handleAfterAuth(shop: string) {
  const existingSub = await prisma.subscription.findUnique({ where: { shop } });
  if (!existingSub || existingSub.status === "CANCELED") {
    return await upsertSubscriptionRecord({
      shop,
      plan: "FREE",
      status: "ACTIVE",
      shopifyChargeId: null,
      trialEndsAt: null,
    });
  }
  return existingSub;
}

export async function cancelSubscription(shop: string, billing: any) {
  const subscription = await prisma.subscription.findUnique({
    where: { shop },
  });

  if (subscription?.shopifyChargeId) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const res = await admin.graphql(`
        mutation appSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            appSubscription {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: { id: subscription.shopifyChargeId }
      });
      
      const data = await res.json();
      if (data?.data?.appSubscriptionCancel?.userErrors?.length > 0) {
        console.error("[SubscriptionSync] GraphQL UserErrors canceling subscription:", data.data.appSubscriptionCancel.userErrors);
      } else {
        console.log("[SubscriptionSync] Successfully canceled Shopify charge:", subscription.shopifyChargeId);
      }
    } catch (err) {
      console.error("Failed to cancel Shopify subscription:", err);
    }
  }

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

