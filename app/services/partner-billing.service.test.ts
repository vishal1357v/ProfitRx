import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  PartnerBillingService,
  mapPlanHandle,
  fetchPartnerActiveSubscription,
  formatAppGid,
  formatShopGid,
  getPricingPlansUrl,
} from "./partner-billing.service";
import {
  syncSubscriptionWithShopify,
  handleAfterAuth,
  upsertSubscriptionRecord,
} from "./subscription-sync.service";
import prisma from "../db.server";

// Mock prisma for isolated, reproducible testing
vi.mock("../db.server", () => {
  const store = new Map<string, any>();
  return {
    default: {
      subscription: {
        findUnique: vi.fn(async ({ where }: { where: { shop: string } }) => {
          return store.get(where.shop) || null;
        }),
        upsert: vi.fn(async ({ where, update, create }: any) => {
          const existing = store.get(where.shop);
          if (existing) {
            const updated = { ...existing, ...update, updatedAt: new Date() };
            store.set(where.shop, updated);
            return updated;
          }
          const created = {
            id: `sub_${Date.now()}`,
            ordersUsed: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
          store.set(where.shop, created);
          return created;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const existing = store.get(where.shop) || { shop: where.shop };
          const updated = { ...existing, ...data, updatedAt: new Date() };
          store.set(where.shop, updated);
          return updated;
        }),
        create: vi.fn(async ({ data }: any) => {
          const created = {
            id: `sub_${Date.now()}`,
            ordersUsed: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          store.set(data.shop, created);
          return created;
        }),
        deleteMany: vi.fn(async () => {
          store.clear();
          return { count: 0 };
        }),
      },
    },
  };
});

describe("Shopify App Pricing & Partner API Migration", () => {
  const SHOP = "merchant-store.myshopify.com";
  const APP_ID = "gid://shopify/App/123456";
  const SHOP_ID = "gid://shopify/Shop/987654";
  const ORG_ID = "org_99999";
  const PARTNER_TOKEN = "shpat_test_partner_token_xyz";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. active Starter ──────────────────────────────────────────
  it("1. correctly parses and applies active Starter plan ($19/mo, 500 order limit)", async () => {
    const mockPartnerResponse = {
      data: {
        activeSubscription: {
          legacySubscriptionId: "gid://shopify/AppSubscription/starter-sub-001",
          billingPeriod: "EVERY_30_DAYS",
          cancelAtEndOfCycle: false,
          trialEndsAt: "2026-05-15T00:00:00Z",
          currentBillingCycle: null,
          items: [
            {
              handle: "starter",
              description: "Starter Plan",
              price: { __typename: "FlatRatePrice", amount: 19.0 },
            },
          ],
        },
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPartnerResponse,
    });

    const result = await fetchPartnerActiveSubscription(SHOP, {
      appId: APP_ID,
      shopId: SHOP_ID,
      organizationId: ORG_ID,
      partnerToken: PARTNER_TOKEN,
      fetchFn: mockFetch as any,
    });

    expect(result.hasSubscription).toBe(true);
    expect(result.plan).toBe("STARTER");
    expect(result.orderLimit).toBe(500);
    expect(result.shopifyChargeId).toBe("gid://shopify/AppSubscription/starter-sub-001");
    expect(result.cancelAtEndOfCycle).toBe(false);
    expect(result.billingPeriod).toBe("EVERY_30_DAYS");
    expect(result.trialEndsAt).toBeInstanceOf(Date);
  });

  // ── 2. active Growth ───────────────────────────────────────────
  it("2. correctly parses and applies active Growth plan ($39/mo, 2000 order limit)", async () => {
    const mockPartnerResponse = {
      data: {
        activeSubscription: {
          legacySubscriptionId: "gid://shopify/AppSubscription/growth-sub-002",
          billingPeriod: "EVERY_30_DAYS",
          cancelAtEndOfCycle: false,
          trialEndsAt: null,
          currentBillingCycle: {
            startTime: "2026-05-01T00:00:00Z",
            endTime: "2026-05-31T00:00:00Z",
          },
          items: [
            {
              handle: "growth",
              description: "Growth Plan",
              price: { __typename: "FlatRatePrice", amount: 39.0 },
            },
          ],
        },
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPartnerResponse,
    });

    const result = await fetchPartnerActiveSubscription(SHOP, {
      appId: APP_ID,
      shopId: SHOP_ID,
      organizationId: ORG_ID,
      partnerToken: PARTNER_TOKEN,
      fetchFn: mockFetch as any,
    });

    expect(result.hasSubscription).toBe(true);
    expect(result.plan).toBe("GROWTH");
    expect(result.orderLimit).toBe(2000);
    expect(result.status).toBe("ACTIVE");
    expect(result.shopifyChargeId).toBe("gid://shopify/AppSubscription/growth-sub-002");
  });

  // ── 3. active Pro ──────────────────────────────────────────────
  it("3. correctly parses and applies active Pro plan ($79/mo, unlimited orders)", async () => {
    const mockPartnerResponse = {
      data: {
        activeSubscription: {
          legacySubscriptionId: "gid://shopify/AppSubscription/pro-sub-003",
          billingPeriod: "EVERY_30_DAYS",
          cancelAtEndOfCycle: false,
          trialEndsAt: null,
          currentBillingCycle: {
            startTime: "2026-05-01T00:00:00Z",
            endTime: "2026-05-31T00:00:00Z",
          },
          items: [
            {
              handle: "pro",
              description: "Pro Plan",
              price: { __typename: "FlatRatePrice", amount: 79.0 },
            },
          ],
        },
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPartnerResponse,
    });

    const result = await fetchPartnerActiveSubscription(SHOP, {
      appId: APP_ID,
      shopId: SHOP_ID,
      organizationId: ORG_ID,
      partnerToken: PARTNER_TOKEN,
      fetchFn: mockFetch as any,
    });

    expect(result.hasSubscription).toBe(true);
    expect(result.plan).toBe("PRO");
    expect(result.orderLimit).toBeNull(); // Unlimited
    expect(result.status).toBe("ACTIVE");
    expect(result.shopifyChargeId).toBe("gid://shopify/AppSubscription/pro-sub-003");
  });

  // ── 4. no subscription / free state ────────────────────────────
  it("4. handles no active subscription gracefully by defaulting to FREE tier (50 orders)", async () => {
    const mockPartnerResponse = {
      data: {
        activeSubscription: null,
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPartnerResponse,
    });

    const result = await fetchPartnerActiveSubscription(SHOP, {
      appId: APP_ID,
      shopId: SHOP_ID,
      organizationId: ORG_ID,
      partnerToken: PARTNER_TOKEN,
      fetchFn: mockFetch as any,
    });

    expect(result.hasSubscription).toBe(false);
    expect(result.plan).toBe("FREE");
    expect(result.orderLimit).toBe(50);
    expect(result.status).toBe("ACTIVE");
    expect(result.shopifyChargeId).toBeNull();
  });

  // ── 5. redirect with plan_handle ───────────────────────────────
  it("5. establishes plan and updates DB when welcome link redirect provides plan_handle", async () => {
    const sub = await syncSubscriptionWithShopify(SHOP, undefined, true, "growth");

    expect(sub.plan).toBe("GROWTH");
    expect(sub.orderLimit).toBe(2000);
    expect(sub.status).toBe("ACTIVE");
    expect(sub.trialEndsAt).toBeInstanceOf(Date);
  });

  // ── 6. plan upgrade ────────────────────────────────────────────
  it("6. supports plan upgrade from Starter (500) to Pro (unlimited)", async () => {
    // Start with Starter
    await upsertSubscriptionRecord({
      shop: SHOP,
      plan: "STARTER",
      status: "ACTIVE",
    });

    const current = await prisma.subscription.findUnique({ where: { shop: SHOP } });
    expect(current?.plan).toBe("STARTER");
    expect(current?.orderLimit).toBe(500);

    // Merchant upgrades to Pro via redirect or partner sync
    const upgraded = await syncSubscriptionWithShopify(SHOP, undefined, true, "pro");
    expect(upgraded.plan).toBe("PRO");
    expect(upgraded.orderLimit).toBeNull(); // Unlimited
  });

  // ── 7. plan downgrade ──────────────────────────────────────────
  it("7. supports plan downgrade from Growth (2000) to Starter (500) or Free (50)", async () => {
    // Start with Growth
    await upsertSubscriptionRecord({
      shop: SHOP,
      plan: "GROWTH",
      status: "ACTIVE",
    });

    // Downgrade to Starter
    const downgradedToStarter = await syncSubscriptionWithShopify(SHOP, undefined, true, "starter");
    expect(downgradedToStarter.plan).toBe("STARTER");
    expect(downgradedToStarter.orderLimit).toBe(500);

    // Downgrade to Free
    const downgradedToFree = await syncSubscriptionWithShopify(SHOP, undefined, true, "free");
    expect(downgradedToFree.plan).toBe("FREE");
    expect(downgradedToFree.orderLimit).toBe(50);
  });

  // ── 8. reinstall with existing subscription ────────────────────
  it("8. reinstall hook discovers existing active App Pricing subscription", async () => {
    // Store had CANCELED locally upon uninstallation
    await upsertSubscriptionRecord({
      shop: SHOP,
      plan: "FREE",
      status: "CANCELED",
    });

    // Mock Partner API to simulate that merchant already has an active Growth subscription
    vi.spyOn(PartnerBillingService, "fetchPartnerActiveSubscription").mockResolvedValueOnce({
      hasSubscription: true,
      plan: "GROWTH",
      orderLimit: 2000,
      status: "ACTIVE",
      trialEndsAt: null,
      cancelAtEndOfCycle: false,
      billingPeriod: "EVERY_30_DAYS",
      shopifyChargeId: "gid://shopify/AppSubscription/reinstall-sub-101",
      source: "PARTNER_API",
    });

    const restoredSub = await handleAfterAuth(SHOP);

    expect(restoredSub.plan).toBe("GROWTH");
    expect(restoredSub.status).toBe("ACTIVE");
    expect(restoredSub.orderLimit).toBe(2000);
    expect(restoredSub.shopifyChargeId).toBe("gid://shopify/AppSubscription/reinstall-sub-101");
  });

  // ── 9. unknown plan_handle ─────────────────────────────────────
  it("9. unknown plan_handle safely falls back to FREE tier (50 order limit)", () => {
    const unknown1 = mapPlanHandle("mega_vip_unlimited_invalid");
    expect(unknown1.plan).toBe("FREE");
    expect(unknown1.orderLimit).toBe(50);
    expect(unknown1.priceUSD).toBe(0);

    const unknown2 = mapPlanHandle("");
    expect(unknown2.plan).toBe("FREE");

    const unknown3 = mapPlanHandle(null);
    expect(unknown3.plan).toBe("FREE");
  });

  // ── 10. Partner API failure ────────────────────────────────────
  it("10. handles Partner API network failure or 500 error gracefully without crashing", async () => {
    const mockFailingFetch = vi.fn().mockRejectedValue(new Error("ETIMEDOUT: Connection to partners.shopify.com failed"));

    const result = await fetchPartnerActiveSubscription(SHOP, {
      appId: APP_ID,
      shopId: SHOP_ID,
      organizationId: ORG_ID,
      partnerToken: PARTNER_TOKEN,
      fetchFn: mockFailingFetch as any,
    });

    // Must not throw, returns fallback with error flag
    expect(result.hasSubscription).toBe(false);
    expect(result.plan).toBe("FREE");
    expect(result.orderLimit).toBe(50);
    expect(result.source).toBe("LOCAL_FALLBACK");
    expect(result.error).toContain("ETIMEDOUT");
  });

  // ── 11. Hosted Plan Selection URL Helper ───────────────────────
  it("11. generates correct Shopify-hosted plan selection URL", () => {
    const url = getPricingPlansUrl("alpha-store.myshopify.com");
    expect(url).toBe("https://admin.shopify.com/store/alpha-store/charges/profitrx-rto-profit/pricing_plans");
  });

  // ── 12. GID Formatting Helpers ─────────────────────────────────
  it("12. formats GID strings correctly for App and Shop", () => {
    expect(formatAppGid("123456")).toBe("gid://shopify/App/123456");
    expect(formatAppGid("gid://shopify/App/123456")).toBe("gid://shopify/App/123456");

    expect(formatShopGid("987654")).toBe("gid://shopify/Shop/987654");
    expect(formatShopGid("gid://shopify/Shop/987654")).toBe("gid://shopify/Shop/987654");
  });
});
