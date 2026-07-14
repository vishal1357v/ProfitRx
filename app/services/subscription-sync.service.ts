import prisma from "../db.server";

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
}: {
  shop: string;
  plan: string;
  status?: string;
  shopifyChargeId?: string | null;
}) {
  const details = mapPlanDetails(plan);

  return await prisma.subscription.upsert({
    where: { shop },
    update: {
      plan: details.plan,
      status,
      ...(shopifyChargeId !== undefined ? { shopifyChargeId } : {}),
      orderLimit: details.orderLimit,
    },
    create: {
      shop,
      plan: details.plan,
      status,
      shopifyChargeId: shopifyChargeId || null,
      orderLimit: details.orderLimit,
      ordersUsed: 0,
    },
  });
}

export async function syncSubscriptionWithShopify(shop: string, billing: any) {
  if (process.env.BYPASS_BILLING === "true") {
    let sub = await prisma.subscription.findUnique({ where: { shop } });
    if (!sub) {
      sub = await upsertSubscriptionRecord({ shop, plan: "GROWTH", status: "ACTIVE" });
    }
    return sub;
  }

  // ⚡ TTFB Cache Check: Query our database first to see if subscription status was checked recently (within 1 hour)
  try {
    const existing = await prisma.subscription.findUnique({ where: { shop } });
    if (existing) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (existing.updatedAt > oneHourAgo) {
        return existing;
      }
    }
  } catch (dbErr) {
    console.error(`[SubscriptionSync] Error checking local cache for ${shop}:`, dbErr);
  }

  try {
    const checkResult = await billing.check({
      plans: ["STARTER", "GROWTH", "PRO"],
      isTest: true,
    });

    const activeSub = checkResult.appSubscriptions?.find(
      (sub: any) => sub.status === "ACTIVE" || sub.status === "active"
    );

    if (activeSub) {
      return await upsertSubscriptionRecord({
        shop,
        plan: activeSub.name,
        status: "ACTIVE",
        shopifyChargeId: activeSub.id,
      });
    }

    // No active payment found on Shopify
    const existing = await prisma.subscription.findUnique({ where: { shop } });
    if (!existing) {
      return await upsertSubscriptionRecord({ shop, plan: "FREE", status: "ACTIVE" });
    }

    if (existing.plan !== "FREE" && existing.status === "ACTIVE") {
      // Downgrade or expire if Shopify says inactive
      return await prisma.subscription.update({
        where: { shop },
        data: {
          plan: "FREE",
          status: "EXPIRED",
          orderLimit: 50,
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
