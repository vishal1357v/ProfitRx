import { SubscriptionRepository } from "../../infrastructure/repositories/subscription.repository";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { SubscriptionSyncService } from "../../services/subscription-sync.service";

export interface BillingDataDTO {
  shop: string;
  host: string;
  plan: string;
  status: string;
  orderLimit: number | null;
  ordersUsed: number;
  trialEndsAt: string | null;
  totalRtoSavings: number;
}

export class BillingApplicationService {
  /**
   * Retrieves billing data and computes RTO savings from real blocked orders.
   */
  static async getBillingData(
    shop: string,
    billing: any,
    host: string
  ): Promise<BillingDataDTO> {
    const subscription = await SubscriptionSyncService.syncSubscriptionWithShopify(shop, billing);
    const [orders, settings] = await Promise.all([
      OrderRepository.findByShop(shop),
      SettingsRepository.getByShop(shop),
    ]);

    const blockedCodCount = orders.filter(
      (o: any) => o.isCOD && (o.fulfillmentStatus || "").toLowerCase().includes("block")
    ).length;

    const avgRtoLoss =
      (settings?.defaultForwardShipping || 60) + (settings?.defaultReturnShipping || 70);
    const totalRtoSavings = blockedCodCount * avgRtoLoss;

    return {
      shop,
      host,
      plan: subscription.plan,
      status: subscription.status,
      orderLimit: subscription.orderLimit,
      ordersUsed: subscription.ordersUsed,
      trialEndsAt: subscription.trialEndsAt ? subscription.trialEndsAt.toISOString() : null,
      totalRtoSavings,
    };
  }

  /**
   * Sync active subscription with Shopify Billing API.
   */
  static async syncSubscription(shop: string, billing: any, force = false) {
    return SubscriptionSyncService.syncSubscriptionWithShopify(shop, billing, force);
  }

  /**
   * Cancel merchant subscription.
   */
  static async cancelSubscription(shop: string, billing: any) {
    return SubscriptionSyncService.cancelSubscription(shop, billing);
  }

  /**
   * Upsert local subscription state.
   */
  static async upsertSubscriptionRecord(data: {
    shop: string;
    plan: string;
    status?: string;
    shopifyChargeId?: string | null;
    trialEndsAt?: Date | null;
  }) {
    return SubscriptionRepository.upsertSubscription(data.shop, {
      plan: data.plan,
      status: data.status,
      shopifyChargeId: data.shopifyChargeId,
      trialEndsAt: data.trialEndsAt,
    });
  }

  /**
   * Compute pricing page details.
   */
  static async getPricingData(
    shop: string,
    billing: any,
    urlParams: { forceSync?: boolean; isChangingPlan?: boolean; host?: string }
  ) {
    const sub = await SubscriptionSyncService.syncSubscriptionWithShopify(
      shop,
      billing,
      urlParams.forceSync || false
    );

    const shouldRedirect =
      !urlParams.isChangingPlan &&
      sub &&
      sub.plan !== "FREE" &&
      (sub.status === "ACTIVE" || sub.status === "TRIALING");

    const currentPlan =
      sub.plan === "PRO"
        ? "Pro"
        : sub.plan === "GROWTH"
        ? "Growth"
        : sub.plan === "STARTER"
        ? "Starter"
        : "Free";

    return {
      shouldRedirect,
      currentPlan,
      shop,
      host: urlParams.host || "",
      subscription: sub,
    };
  }
}
