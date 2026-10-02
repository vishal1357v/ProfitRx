import { redirect } from "react-router";
import { SubscriptionRepository } from "../../infrastructure/repositories/subscription.repository";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { SubscriptionSyncService } from "../../services/subscription-sync.service";
import { PartnerBillingService } from "../../services/partner-billing.service";

export interface BillingDataDTO {
  shop: string;
  host: string;
  plan: string;
  status: string;
  orderLimit: number | null;
  ordersUsed: number;
  trialEndsAt: string | null;
  lastSyncedAt: string | null;
  shopifyChargeId: string | null;
  billingProvider: string;
  isTestStore: boolean;
  totalRtoSavings: number;
  pricingPlansUrl: string;
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

    const isTestStore =
      (settings?.shopifyPlanName || "").toLowerCase().includes("develop") ||
      (settings?.shopifyPlanName || "").toLowerCase().includes("partner") ||
      (settings?.shopifyPlanName || "").toLowerCase().includes("test") ||
      shop.includes("test");

    return {
      shop,
      host,
      plan: subscription.plan,
      status: subscription.status,
      orderLimit: subscription.orderLimit,
      ordersUsed: subscription.ordersUsed,
      trialEndsAt: subscription.trialEndsAt ? subscription.trialEndsAt.toISOString() : null,
      lastSyncedAt: subscription.updatedAt ? subscription.updatedAt.toISOString() : new Date().toISOString(),
      shopifyChargeId: subscription.shopifyChargeId || null,
      billingProvider: "Shopify App Pricing",
      isTestStore,
      totalRtoSavings,
      pricingPlansUrl: PartnerBillingService.getPricingPlansUrl(shop),
    };
  }

  /**
   * Enforces plan gating for protected routes without legacy Billing API SDK calls.
   * Redirects to the pricing page if the merchant does not have an active matching tier.
   */
  static async requirePlan(shop: string, requiredPlans: string[], host: string): Promise<boolean> {
    if (process.env.BYPASS_BILLING === "true") {
      return true;
    }

    const sub = await SubscriptionRepository.findByShop(shop);
    const normalizedPlan = (sub?.plan || "FREE").toUpperCase();
    const status = (sub?.status || "ACTIVE").toUpperCase();

    const hasActiveStatus = status === "ACTIVE" || status === "TRIALING";
    const meetsPlan = requiredPlans.map((p) => p.toUpperCase()).includes(normalizedPlan);

    if (!hasActiveStatus || !meetsPlan) {
      throw redirect(`/app/pricing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
    }

    return true;
  }

  /**
   * Sync active subscription with Shopify App Pricing (Partner API).
   */
  static async syncSubscription(shop: string, billing?: any, force = false, planHandle?: string | null) {
    return SubscriptionSyncService.syncSubscriptionWithShopify(shop, billing, force, planHandle);
  }

  /**
   * Cancel merchant subscription.
   */
  static async cancelSubscription(shop: string, billing?: any) {
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
    urlParams: { forceSync?: boolean; isChangingPlan?: boolean; host?: string; planHandle?: string | null }
  ) {
    const sub = await SubscriptionSyncService.syncSubscriptionWithShopify(
      shop,
      billing,
      urlParams.forceSync || Boolean(urlParams.planHandle),
      urlParams.planHandle
    );

    const shouldRedirect =
      !urlParams.isChangingPlan &&
      !urlParams.planHandle &&
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
      pricingPlansUrl: PartnerBillingService.getPricingPlansUrl(shop),
    };
  }
}
