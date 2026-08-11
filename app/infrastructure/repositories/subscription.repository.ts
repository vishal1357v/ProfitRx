import prisma from "../../db.server";

export interface SubscriptionRecord {
  id: string;
  shop: string;
  plan: string;
  status: string;
  shopifyChargeId: string | null;
  trialEndsAt: Date | null;
  expiresAt: Date | null;
  orderLimit: number | null;
  ordersUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export class SubscriptionRepository {
  /**
   * Find subscription for a shop with tenant isolation.
   */
  static async findByShop(shop: string): Promise<SubscriptionRecord | null> {
    return prisma.subscription.findUnique({
      where: { shop },
    });
  }

  /**
   * Map human plan string to standardized tier & limits.
   */
  static mapPlanDetails(planName: string): { plan: string; orderLimit: number | null } {
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

  /**
   * Upsert subscription record with shop isolation.
   */
  static async upsertSubscription(
    shop: string,
    data: {
      plan: string;
      status?: string;
      shopifyChargeId?: string | null;
      trialEndsAt?: Date | null;
      expiresAt?: Date | null;
      ordersUsed?: number;
    }
  ): Promise<SubscriptionRecord> {
    const details = this.mapPlanDetails(data.plan);

    return prisma.subscription.upsert({
      where: { shop },
      update: {
        plan: details.plan,
        status: data.status || "ACTIVE",
        ...(data.shopifyChargeId !== undefined ? { shopifyChargeId: data.shopifyChargeId } : {}),
        ...(data.trialEndsAt !== undefined ? { trialEndsAt: data.trialEndsAt } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
        ...(data.ordersUsed !== undefined ? { ordersUsed: data.ordersUsed } : {}),
        orderLimit: details.orderLimit,
      },
      create: {
        shop,
        plan: details.plan,
        status: data.status || "ACTIVE",
        shopifyChargeId: data.shopifyChargeId || null,
        trialEndsAt: data.trialEndsAt || null,
        expiresAt: data.expiresAt || null,
        orderLimit: details.orderLimit,
        ordersUsed: data.ordersUsed || 0,
      },
    });
  }

  /**
   * Increment orders used counter for billing quotas.
   */
  static async incrementOrdersUsed(shop: string, count = 1): Promise<SubscriptionRecord | null> {
    const existing = await prisma.subscription.findUnique({ where: { shop } });
    if (!existing) return null;

    return prisma.subscription.update({
      where: { shop },
      data: { ordersUsed: { increment: count } },
    });
  }
}
