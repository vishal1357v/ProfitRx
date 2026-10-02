import prisma from "../db.server";

export type AppPricingPlan = "FREE" | "STARTER" | "GROWTH" | "PRO";

export interface PlanDetails {
  plan: AppPricingPlan;
  orderLimit: number | null;
  priceUSD: number;
}

export const APP_PRICING_PLANS: Record<AppPricingPlan, PlanDetails> = {
  FREE: { plan: "FREE", orderLimit: 50, priceUSD: 0 },
  STARTER: { plan: "STARTER", orderLimit: 500, priceUSD: 19 },
  GROWTH: { plan: "GROWTH", orderLimit: 2000, priceUSD: 39 },
  PRO: { plan: "PRO", orderLimit: null, priceUSD: 79 },
};

/**
 * Maps a Shopify App Pricing plan_handle to ProfitRx internal plan details.
 * Case-insensitive and normalizes hyphens/underscores.
 * Defaults safely to FREE if handle is unknown or unprovided.
 */
export function mapPlanHandle(planHandle?: string | null): PlanDetails {
  if (!planHandle) return APP_PRICING_PLANS.FREE;
  const clean = planHandle.trim().toLowerCase().replace(/[-_]/g, "");

  if (clean === "pro" || clean === "enterprise" || clean === "advance" || clean === "proenterprise") {
    return APP_PRICING_PLANS.PRO;
  }
  if (clean === "growth") {
    return APP_PRICING_PLANS.GROWTH;
  }
  if (clean === "starter" || clean === "basic") {
    return APP_PRICING_PLANS.STARTER;
  }
  if (clean === "free" || clean === "trial") {
    return APP_PRICING_PLANS.FREE;
  }

  console.warn(`[PartnerBilling] Unknown plan_handle received: "${planHandle}". Defaulting to FREE.`);
  return APP_PRICING_PLANS.FREE;
}

export interface ActiveSubscriptionItem {
  id: string;
  handle: string;
  description?: string;
  price?: {
    __typename?: string;
    amount: number;
    currency: string;
  };
}

export interface ActiveSubscriptionPayload {
  id: string;
  status: string;
  createdAt?: string;
  billingPeriod?: string;
  cancelAtEndOfCycle?: boolean;
  trialEndsAt?: string | null;
  currentBillingCycle?: {
    startTime?: string;
    endTime?: string;
  } | null;
  items?: ActiveSubscriptionItem[];
}

export interface PartnerApiActiveSubResult {
  hasSubscription: boolean;
  plan: AppPricingPlan;
  orderLimit: number | null;
  status: string;
  trialEndsAt: Date | null;
  cancelAtEndOfCycle: boolean;
  billingPeriod: string | null;
  shopifyChargeId: string | null;
  source: "PARTNER_API" | "LOCAL_FALLBACK" | "REDIRECT_PARAM";
  rawSubscription?: ActiveSubscriptionPayload | null;
  error?: string;
}

export interface PartnerApiFetchOptions {
  appId?: string;
  shopId?: string;
  organizationId?: string;
  partnerToken?: string;
  apiVersion?: string;
  fetchFn?: typeof fetch;
}

/**
 * Normalizes an app ID into a Shopify GID: gid://shopify/App/{id}
 */
export function formatAppGid(rawAppId: string): string {
  if (rawAppId.startsWith("gid://shopify/App/")) return rawAppId;
  const digits = rawAppId.replace(/\D/g, "");
  return digits ? `gid://shopify/App/${digits}` : rawAppId;
}

/**
 * Normalizes a shop ID into a Shopify GID: gid://shopify/Shop/{id}
 */
export function formatShopGid(rawShopId: string): string {
  if (rawShopId.startsWith("gid://shopify/Shop/")) return rawShopId;
  const digits = rawShopId.replace(/\D/g, "");
  return digits ? `gid://shopify/Shop/${digits}` : rawShopId;
}

export const PARTNER_ACTIVE_SUBSCRIPTION_QUERY = `
  query ActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      id
      status
      createdAt
      billingPeriod
      cancelAtEndOfCycle
      trialEndsAt
      currentBillingCycle {
        startTime
        endTime
      }
      items {
        id
        handle
        description
        price {
          __typename
          ... on FlatRatePrice {
            amount
            currency
          }
        }
      }
    }
  }
`;

/**
 * Resolves the numeric or GID shop ID for a given shop domain.
 * Attempts to retrieve from StoreSettings or Admin GraphQL API.
 */
export async function resolveShopGid(shop: string, adminClient?: any): Promise<string | null> {
  // If shop is already formatted as a GID
  if (shop.startsWith("gid://shopify/Shop/")) return shop;

  try {
    if (adminClient && typeof adminClient.graphql === "function") {
      const resp = await adminClient.graphql(`query { shop { id } }`);
      const data = await resp.json();
      if (data?.data?.shop?.id) {
        return data.data.shop.id;
      }
    }
  } catch (err: any) {
    console.warn(`[PartnerBilling] Could not query shop GID from admin client for ${shop}:`, err.message);
  }

  // Fallback: check session or construct dummy/deterministic GID if needed
  return null;
}

/**
 * Fetches the merchant's active Shopify App Pricing subscription from the Partner API.
 * Returns normalized subscription details or safe fallback if unavailable.
 */
export async function fetchPartnerActiveSubscription(
  shop: string,
  options: PartnerApiFetchOptions = {}
): Promise<PartnerApiActiveSubResult> {
  const organizationId = options.organizationId || process.env.SHOPIFY_ORGANIZATION_ID || process.env.SHOPIFY_PARTNER_ORGANIZATION_ID;
  const partnerToken = options.partnerToken || process.env.SHOPIFY_PARTNER_API_TOKEN || process.env.SHOPIFY_PARTNER_TOKEN || process.env.PARTNER_API_ACCESS_TOKEN;
  const apiVersion = options.apiVersion || "2026-04";
  const fetchImpl = options.fetchFn || fetch;

  const rawAppId = options.appId || process.env.SHOPIFY_APP_ID || process.env.SHOPIFY_API_KEY || "08f8a7442c2182a3a390f753591c06f3";
  const rawShopId = options.shopId;

  // If partner credentials are not configured (e.g. before Partner Dashboard App Pricing is enabled)
  if (!organizationId || !partnerToken) {
    return {
      hasSubscription: false,
      plan: "FREE",
      orderLimit: 50,
      status: "ACTIVE",
      trialEndsAt: null,
      cancelAtEndOfCycle: false,
      billingPeriod: null,
      shopifyChargeId: null,
      source: "LOCAL_FALLBACK",
      error: "PARTNER_API_NOT_CONFIGURED",
    };
  }

  // Need a shopId to query Partner API activeSubscription
  if (!rawShopId) {
    return {
      hasSubscription: false,
      plan: "FREE",
      orderLimit: 50,
      status: "ACTIVE",
      trialEndsAt: null,
      cancelAtEndOfCycle: false,
      billingPeriod: null,
      shopifyChargeId: null,
      source: "LOCAL_FALLBACK",
      error: "SHOP_ID_MISSING",
    };
  }

  const appId = formatAppGid(rawAppId);
  const shopId = formatShopGid(rawShopId);

  const endpoint = `https://partners.shopify.com/${organizationId}/api/${apiVersion}/graphql.json`;

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": partnerToken,
      },
      body: JSON.stringify({
        query: PARTNER_ACTIVE_SUBSCRIPTION_QUERY,
        variables: { appId, shopId },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[PartnerBilling] Partner API HTTP error ${res.status}: ${errText}`);
      return {
        hasSubscription: false,
        plan: "FREE",
        orderLimit: 50,
        status: "ACTIVE",
        trialEndsAt: null,
        cancelAtEndOfCycle: false,
        billingPeriod: null,
        shopifyChargeId: null,
        source: "LOCAL_FALLBACK",
        error: `PARTNER_API_HTTP_${res.status}`,
      };
    }

    const json = await res.json();

    if (json.errors && json.errors.length > 0) {
      console.warn("[PartnerBilling] Partner API GraphQL errors:", json.errors);
      return {
        hasSubscription: false,
        plan: "FREE",
        orderLimit: 50,
        status: "ACTIVE",
        trialEndsAt: null,
        cancelAtEndOfCycle: false,
        billingPeriod: null,
        shopifyChargeId: null,
        source: "LOCAL_FALLBACK",
        error: json.errors[0]?.message || "GRAPHQL_ERROR",
      };
    }

    const sub: ActiveSubscriptionPayload | null = json.data?.activeSubscription || null;

    if (!sub) {
      // Merchant has no active subscription under App Pricing -> FREE tier
      return {
        hasSubscription: false,
        plan: "FREE",
        orderLimit: 50,
        status: "ACTIVE",
        trialEndsAt: null,
        cancelAtEndOfCycle: false,
        billingPeriod: null,
        shopifyChargeId: null,
        source: "PARTNER_API",
        rawSubscription: null,
      };
    }

    // Determine primary item handle from items array
    const primaryItem = sub.items?.[0];
    const planHandle = primaryItem?.handle || "";
    const planDetails = mapPlanHandle(planHandle);

    const status = (sub.status || "ACTIVE").toUpperCase();
    const trialEndsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    const cancelAtEndOfCycle = Boolean(sub.cancelAtEndOfCycle);
    const billingPeriod = sub.billingPeriod || "EVERY_30_DAYS";
    const shopifyChargeId = sub.id || null;

    return {
      hasSubscription: status === "ACTIVE" || status === "TRIALING",
      plan: planDetails.plan,
      orderLimit: planDetails.orderLimit,
      status,
      trialEndsAt,
      cancelAtEndOfCycle,
      billingPeriod,
      shopifyChargeId,
      source: "PARTNER_API",
      rawSubscription: sub,
    };
  } catch (err: any) {
    console.error(`[PartnerBilling] Partner API fetch failed for shop ${shop}:`, err.message);
    return {
      hasSubscription: false,
      plan: "FREE",
      orderLimit: 50,
      status: "ACTIVE",
      trialEndsAt: null,
      cancelAtEndOfCycle: false,
      billingPeriod: null,
      shopifyChargeId: null,
      source: "LOCAL_FALLBACK",
      error: err.message || "FETCH_FAILED",
    };
  }
}

/**
 * Returns the Shopify-hosted App Pricing plans selection page URL for the merchant.
 * Pattern: https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
 */
export function getPricingPlansUrl(shop: string): string {
  const storeHandle = (shop || "").replace(/\.myshopify\.com$/, "").trim();
  const appHandle = (process.env.SHOPIFY_APP_HANDLE || "profitrx-rto-profit").trim();
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

export const PartnerBillingService = {
  APP_PRICING_PLANS,
  mapPlanHandle,
  formatAppGid,
  formatShopGid,
  resolveShopGid,
  fetchPartnerActiveSubscription,
  getPricingPlansUrl,
};
