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
    const checkResult = await billing.check({
      plans: ["STARTER", "GROWTH", "PRO"],
      isTest: true,
    });
    console.log("[DEBUG-SYNC] checkResult:", JSON.stringify(checkResult, null, 2));

    const activeSub = checkResult.appSubscriptions?.find((sub: any) => {
      const s = (sub.status || "").toUpperCase();
      return s === "ACTIVE" || s === "TRIALING";
    });

    console.log("[DEBUG-SYNC] activeSub found:", activeSub);

    if (activeSub) {
      const trialEndsAt = activeSub.trialEndsAt ? new Date(activeSub.trialEndsAt) : null;
      const updated = await upsertSubscriptionRecord({
        shop,
        plan: activeSub.name,
        status: activeSub.status.toUpperCase(),
        shopifyChargeId: activeSub.id,
        trialEndsAt,
      });
      return updated;
    }

    // No active payment found on Shopify
    const existing = await prisma.subscription.findUnique({ where: { shop } });
    if (!existing || existing.status === "CANCELED") {
      return await upsertSubscriptionRecord({ shop, plan: "FREE", status: "ACTIVE" });
    }

    // Protect PENDING records: merchant selected a plan but Shopify hasn't confirmed yet.
    // If the PENDING record was created/updated less than 5 minutes ago, keep it as-is
    // so the merchant isn't downgraded during the Shopify approval window.
    if (existing.status === "PENDING") {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (existing.updatedAt > fiveMinAgo) {
        console.log(`[SubscriptionSync] Preserving PENDING record for ${shop} (created ${existing.updatedAt.toISOString()}, within 5-min window)`);
        return existing;
      }
      // PENDING record is stale (>5 min) — merchant likely abandoned checkout, revert to FREE
      console.log(`[SubscriptionSync] Stale PENDING record for ${shop}, reverting to FREE`);
      return await upsertSubscriptionRecord({ shop, plan: "FREE", status: "ACTIVE" });
    }

    if (
      existing.plan !== "FREE" && 
      (existing.status === "ACTIVE" || existing.status === "TRIALING") &&
      existing.updatedAt < new Date(Date.now() - 5 * 60 * 1000)
    ) {
      // Downgrade or expire if Shopify says inactive
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

