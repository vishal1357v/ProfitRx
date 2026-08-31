import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodRulesApplicationService } from "./cod-rules.application";
import { CODManagementService } from "../../services/cod-management.service";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { PincodeRepository } from "../../infrastructure/repositories/pincode.repository";
import prisma from "../../db.server";

describe("CodRulesApplicationService & Checkout Activation Toggle", () => {
  const shopA = "merchant-a.myshopify.com";
  const shopB = "merchant-b.myshopify.com";

  // Mock DB StoreSettings store
  const storeDb: Record<string, any> = {};

  const createMockAdmin = (overrides?: {
    functions?: any[];
    customizations?: any[];
    userErrors?: any[];
  }) => {
    const functions = overrides?.functions ?? [
      {
        node: {
          id: "gid://shopify/ShopifyFunction/fn-123",
          title: "cod-blocker",
          apiType: "cart_payment_methods_transform",
        },
      },
    ];

    const customizations = overrides?.customizations ?? [];
    const userErrors = overrides?.userErrors ?? [];

    const graphqlSpy = vi.fn(async (query: string, options?: any) => {
      if (query.includes("GetFunctions")) {
        return {
          json: async () => ({
            data: {
              shopifyFunctions: {
                edges: functions,
              },
            },
          }),
        } as any;
      }

      if (query.includes("GetCustomizations")) {
        return {
          json: async () => ({
            data: {
              paymentCustomizations: {
                edges: customizations,
              },
            },
          }),
        } as any;
      }

      if (query.includes("paymentCustomizationCreate")) {
        return {
          json: async () => ({
            data: {
              paymentCustomizationCreate: {
                paymentCustomization: userErrors.length === 0 ? { id: "gid://shopify/PaymentCustomization/new-1", enabled: true } : null,
                userErrors,
              },
            },
          }),
        } as any;
      }

      if (query.includes("paymentCustomizationUpdate")) {
        return {
          json: async () => ({
            data: {
              paymentCustomizationUpdate: {
                paymentCustomization: userErrors.length === 0 ? { id: options?.variables?.id || "gid://shopify/PaymentCustomization/1", enabled: options?.variables?.paymentCustomization?.enabled } : null,
                userErrors,
              },
            },
          }),
        } as any;
      }

      return {
        json: async () => ({ data: {} }),
      } as any;
    });

    return { graphql: graphqlSpy };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(storeDb).forEach((k) => delete storeDb[k]);

    // Setup Prisma mock storage
    vi.spyOn(prisma.storeSettings, "findUnique").mockImplementation(async ({ where }: any) => {
      return storeDb[where.shop] || null;
    });

    vi.spyOn(prisma.storeSettings, "create").mockImplementation(async ({ data }: any) => {
      storeDb[data.shop] = { ...data, id: `settings-${data.shop}` };
      return storeDb[data.shop];
    });

    vi.spyOn(prisma.storeSettings, "update").mockImplementation(async ({ where, data }: any) => {
      storeDb[where.shop] = { ...(storeDb[where.shop] || { shop: where.shop }), ...data };
      return storeDb[where.shop];
    });

    vi.spyOn(PincodeRepository, "findTopRiskPincodes").mockResolvedValue([]);
  });

  it("1. OFF + customization exists -> disables customization via paymentCustomizationUpdate(enabled: false)", async () => {
    storeDb[shopA] = {
      shop: shopA,
      codBlockingEnabled: false,
      codBlockedPincodes: ["110053"],
    };

    const mockAdmin = createMockAdmin({
      customizations: [
        {
          node: {
            id: "gid://shopify/PaymentCustomization/cust-99",
            title: "ProfitRx COD Pincode Blocker",
            enabled: true,
            functionId: "gid://shopify/ShopifyFunction/fn-123",
          },
        },
      ],
    });

    const result = await CodRulesApplicationService.toggleCodBlocking(shopA, false, mockAdmin as any);

    expect(result.success).toBe(true);
    expect(result.enabled).toBe(false);
    expect(result.syncResult?.status).toBe("DISABLED");

    // Verify paymentCustomizationUpdate was called with enabled: false
    const updateCall = mockAdmin.graphql.mock.calls.find((call) =>
      call[0].includes("paymentCustomizationUpdate")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1].variables.id).toBe("gid://shopify/PaymentCustomization/cust-99");
    expect(updateCall![1].variables.paymentCustomization.enabled).toBe(false);
  });

  it("2. OFF + customization does not exist -> no unnecessary create mutation executed", async () => {
    storeDb[shopA] = {
      shop: shopA,
      codBlockingEnabled: false,
      codBlockedPincodes: ["110053"],
    };

    const mockAdmin = createMockAdmin({
      customizations: [], // None exists
    });

    const result = await CodRulesApplicationService.toggleCodBlocking(shopA, false, mockAdmin as any);

    expect(result.success).toBe(true);
    expect(result.enabled).toBe(false);
    expect(result.syncResult?.status).toBe("DISABLED");

    // Verify neither create nor update was called
    const createCall = mockAdmin.graphql.mock.calls.find((call) =>
      call[0].includes("paymentCustomizationCreate")
    );
    const updateCall = mockAdmin.graphql.mock.calls.find((call) =>
      call[0].includes("paymentCustomizationUpdate")
    );
    expect(createCall).toBeUndefined();
    expect(updateCall).toBeUndefined();
  });

  it("3. ON + Function exists + no customization -> paymentCustomizationCreate called with enabled: true and blocked pincodes", async () => {
    storeDb[shopA] = {
      shop: shopA,
      codBlockingEnabled: false,
      codBlockedPincodes: ["110053", "110078"],
    };

    const mockAdmin = createMockAdmin({
      customizations: [],
    });

    const result = await CodRulesApplicationService.toggleCodBlocking(shopA, true, mockAdmin as any);

    expect(result.success).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.syncResult?.status).toBe("CREATED");

    const createCall = mockAdmin.graphql.mock.calls.find((call) =>
      call[0].includes("paymentCustomizationCreate")
    );
    expect(createCall).toBeDefined();
    expect(createCall![1].variables.paymentCustomization.enabled).toBe(true);
    expect(createCall![1].variables.paymentCustomization.functionId).toBe("gid://shopify/ShopifyFunction/fn-123");

    const metafieldVal = JSON.parse(createCall![1].variables.paymentCustomization.metafields[0].value);
    expect(metafieldVal.blockedPincodes).toEqual(["110053", "110078"]);
  });

  it("4. ON + existing customization -> paymentCustomizationUpdate called with enabled: true and updated pincodes", async () => {
    storeDb[shopA] = {
      shop: shopA,
      codBlockingEnabled: true,
      codBlockedPincodes: ["560001", "560002"],
    };

    const mockAdmin = createMockAdmin({
      customizations: [
        {
          node: {
            id: "gid://shopify/PaymentCustomization/existing-1",
            title: "ProfitRx COD Pincode Blocker",
            enabled: false,
            functionId: "gid://shopify/ShopifyFunction/fn-123",
          },
        },
      ],
    });

    const result = await CodRulesApplicationService.saveMerchantRules(
      shopA,
      {
        rulesRejectCodOver: 5000,
        rulesRequirePrepaidAbove: 10000,
        rulesAutoFlagRepeatOffenders: true,
        rulesAutoRequireOtp: false,
        codBlockingEnabled: true,
      },
      mockAdmin as any
    );

    expect(result.success).toBe(true);
    expect(result.syncResult?.status).toBe("UPDATED");

    const updateCall = mockAdmin.graphql.mock.calls.find((call) =>
      call[0].includes("paymentCustomizationUpdate")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1].variables.id).toBe("gid://shopify/PaymentCustomization/existing-1");
    expect(updateCall![1].variables.paymentCustomization.enabled).toBe(true);

    const metafieldVal = JSON.parse(updateCall![1].variables.paymentCustomization.metafields[0].value);
    expect(metafieldVal.blockedPincodes).toEqual(["560001", "560002"]);
  });

  it("5. Updating pincodes while ON -> latest pincodes array synced to Shopify configuration metafield", async () => {
    storeDb[shopA] = {
      shop: shopA,
      codBlockingEnabled: true,
      codBlockedPincodes: ["110001"],
    };

    const mockAdmin = createMockAdmin({
      customizations: [
        {
          node: {
            id: "gid://shopify/PaymentCustomization/existing-1",
            title: "ProfitRx COD Pincode Blocker",
            enabled: true,
            functionId: "gid://shopify/ShopifyFunction/fn-123",
          },
        },
      ],
    });

    const result = await CodRulesApplicationService.bulkImportPincodes(
      shopA,
      "400001, 400002, 400050",
      mockAdmin as any
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(result.syncResult?.status).toBe("UPDATED");

    const updateCall = mockAdmin.graphql.mock.calls.find((call) =>
      call[0].includes("paymentCustomizationUpdate")
    );
    expect(updateCall).toBeDefined();
    const metafieldVal = JSON.parse(updateCall![1].variables.paymentCustomization.metafields[0].value);
    expect(metafieldVal.blockedPincodes).toEqual(["400001", "400002", "400050"]);
  });

  it("6. Function missing -> returns FUNCTION_NOT_FOUND and does not claim active", async () => {
    storeDb[shopA] = {
      shop: shopA,
      codBlockingEnabled: false,
      codBlockedPincodes: ["110053"],
    };

    const mockAdmin = createMockAdmin({
      functions: [], // No functions deployed!
    });

    const result = await CodRulesApplicationService.toggleCodBlocking(shopA, true, mockAdmin as any);

    expect(result.success).toBe(false);
    expect(result.syncResult?.status).toBe("FUNCTION_NOT_FOUND");
    expect(result.syncResult?.synced).toBe(false);
    expect(result.message).toContain("Shopify Function 'cod-blocker' not found");
  });

  it("7. Shopify GraphQL userErrors -> returns ERROR and does not claim active", async () => {
    storeDb[shopA] = {
      shop: shopA,
      codBlockingEnabled: false,
      codBlockedPincodes: ["110053"],
    };

    const mockAdmin = createMockAdmin({
      customizations: [],
      userErrors: [{ field: ["title"], message: "Title has already been taken" }],
    });

    const result = await CodRulesApplicationService.toggleCodBlocking(shopA, true, mockAdmin as any);

    expect(result.success).toBe(false);
    expect(result.syncResult?.status).toBe("ERROR");
    expect(result.syncResult?.synced).toBe(false);
    expect(result.syncResult?.message).toContain("Title has already been taken");
  });

  it("8. Shop A vs Shop B -> strict multi-tenant isolation", async () => {
    storeDb[shopA] = {
      shop: shopA,
      codBlockingEnabled: true,
      codBlockedPincodes: ["110053"],
    };

    storeDb[shopB] = {
      shop: shopB,
      codBlockingEnabled: false,
      codBlockedPincodes: ["700001"],
    };

    const mockAdminA = createMockAdmin();
    const mockAdminB = createMockAdmin();

    // Toggle shop B to ON with new pincodes
    await CodRulesApplicationService.toggleCodBlocking(shopB, true, mockAdminB as any);
    await CodRulesApplicationService.bulkImportPincodes(shopB, "700001, 700002", mockAdminB as any);

    // Verify Shop A DB and settings were completely untouched
    const dataA = await CodRulesApplicationService.getCodRulesData(shopA);
    const dataB = await CodRulesApplicationService.getCodRulesData(shopB);

    expect(dataA.codSettings.codBlockedPincodes).toEqual(["110053"]);
    expect(dataA.codSettings.codBlockingEnabled).toBe(true);

    expect(dataB.codSettings.codBlockedPincodes).toEqual(["700001", "700002"]);
    expect(dataB.codSettings.codBlockingEnabled).toBe(true);
  });

  it("9. Existing COD high-value/repeat-offender rules remain intact when saving blocking state", async () => {
    storeDb[shopA] = {
      shop: shopA,
      rulesRejectCodOver: 7500,
      rulesRequirePrepaidAbove: 12000,
      rulesAutoFlagRepeatOffenders: true,
      rulesAutoRequireOtp: true,
      codBlockingEnabled: false,
      codBlockedPincodes: ["110053"],
    };

    const mockAdmin = createMockAdmin();

    await CodRulesApplicationService.saveMerchantRules(
      shopA,
      {
        rulesRejectCodOver: 7500,
        rulesRequirePrepaidAbove: 12000,
        rulesAutoFlagRepeatOffenders: true,
        rulesAutoRequireOtp: true,
        codBlockingEnabled: true,
      },
      mockAdmin as any
    );

    const updated = await CodRulesApplicationService.getCodRulesData(shopA);
    expect(updated.storeSettings.rulesRejectCodOver).toBe(7500);
    expect(updated.storeSettings.rulesRequirePrepaidAbove).toBe(12000);
    expect(updated.storeSettings.rulesAutoFlagRepeatOffenders).toBe(true);
    expect(updated.storeSettings.rulesAutoRequireOtp).toBe(true);
    expect(updated.codSettings.codBlockingEnabled).toBe(true);
  });

  it("10. Toggle persistence survives reload and is correctly reflected in getCodRulesData", async () => {
    storeDb[shopA] = {
      shop: shopA,
      codBlockingEnabled: false,
      codBlockedPincodes: ["110053"],
    };

    const mockAdmin = createMockAdmin();

    // Toggle ON
    await CodRulesApplicationService.toggleCodBlocking(shopA, true, mockAdmin as any);

    // Fetch fresh from loader
    const loaded = await CodRulesApplicationService.getCodRulesData(shopA);
    expect(loaded.codSettings.codBlockingEnabled).toBe(true);
    expect(loaded.codSettings.codBlockedPincodes).toEqual(["110053"]);
  });
});
