import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderFeatureService } from "./order-feature.service";
import prisma from "../../db.server";
import { ProfitService } from "../profit.service";

// Mock prisma and ProfitService
vi.mock("../../db.server", () => ({
  default: {
    order: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    storeSettings: {
      findUnique: vi.fn(),
    },
    customerRisk: {
      findUnique: vi.fn(),
    },
    customerProfile: {
      findUnique: vi.fn(),
    },
    pincodeStats: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    }
  }
}));

vi.mock("../profit.service", () => ({
  ProfitService: {
    getSettings: vi.fn((raw) => ({
      defaultGatewayFeePct: raw?.defaultGatewayFeePct ?? 2,
      defaultCODHandling: raw?.defaultCODHandling ?? 50,
      defaultForwardShipping: raw?.defaultForwardShipping ?? 60,
      defaultReturnShipping: raw?.defaultReturnShipping ?? 70,
      gatewayFixedFee: raw?.gatewayFixedFee ?? 0,
      defaultPackaging: raw?.defaultPackaging ?? 10,
      shopifyPlanName: raw?.shopifyPlanName ?? "Basic",
      defaultCOGSPct: raw?.defaultCOGSPct ?? 40,
    })),
    getCOGS: vi.fn().mockResolvedValue({}),
    getSlabShippingCosts: vi.fn().mockReturnValue({ forward: 60, returnShip: 70 }),
    getShopifySurchargeRate: vi.fn().mockReturnValue(0.01),
    calculateOrderProfit: vi.fn().mockReturnValue({ profit: 100, margin: 10, fees: 50 }),
    calculateRTOLoss: vi.fn().mockReturnValue(130),
  }
}));

describe("OrderFeatureService - Phase 1", () => {
  const shop = "test-shop.myshopify.com";
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    (prisma.storeSettings.findUnique as any).mockResolvedValue({});
    (prisma.order.aggregate as any).mockResolvedValue({ _count: { id: 0 }, _avg: { totalPrice: 0 } });
    (prisma.order.findMany as any).mockResolvedValue([]);
    (prisma.pincodeStats.findMany as any).mockResolvedValue([]);
  });

  const createBaseOrder = (overrides: any = {}) => ({
    id: "gid://shopify/Order/123",
    shop,
    createdAt: new Date("2024-01-10T12:00:00Z"),
    totalPrice: 1000,
    subtotalPrice: 900,
    totalTax: 100,
    shippingPrice: 50,
    discountAmount: 0,
    isCOD: true,
    channelAttribution: "Website",
    customerId: "cust-1",
    pincode: "400001",
    province: "MH",
    cogsAtTimeOfOrder: null,
    actualShippingCost: null,
    totalWeight: 500,
    ...overrides
  });

  it("1) Normal COD order, known COGS", async () => {
    const order = createBaseOrder({ cogsAtTimeOfOrder: 400 });
    (prisma.order.findUnique as any).mockResolvedValue(order);

    const result = await OrderFeatureService.extractFeatures({ shop, orderId: order.id });
    
    const { features, metadata } = result;

    expect(features.isCOD).toBe(true);
    expect(features.cogs).toBe(400);
    expect(features.codFee).toBe(50); // Default from mock
    expect(features.paymentFee).toBe(0);
    expect(features.forwardShippingCost).toBe(60); // Default from mock slab
    expect(features.grossOrderValue).toBe(1000);
    expect(features.netOrderValue).toBe(900);
    expect(features.grossMarginBeforeShipping).toBe(500); // 900 - 400
    
    expect(metadata.sources.cogs).toBe("ORDER_SNAPSHOT");
    expect(metadata.sources.shipping).toBe("WEIGHT_SLAB");
    expect(metadata.warnings).toContain("ESTIMATED_SHIPPING");
  });

  it("2) Prepaid order", async () => {
    const order = createBaseOrder({ isCOD: false, totalPrice: 1000 });
    (prisma.order.findUnique as any).mockResolvedValue(order);

    const result = await OrderFeatureService.extractFeatures({ shop, orderId: order.id });
    
    expect(result.features.isCOD).toBe(false);
    expect(result.features.codFee).toBe(0);
    // ((1000 * 0.02) + (1000 * 0.01)) * 1.18 = 30 * 1.18 = 35.4
    expect(result.features.paymentFee).toBeCloseTo(35.4, 1);
  });

  it("8) Actual shipping cost exists", async () => {
    const order = createBaseOrder({ actualShippingCost: 75 });
    (prisma.order.findUnique as any).mockResolvedValue(order);

    const result = await OrderFeatureService.extractFeatures({ shop, orderId: order.id });
    
    expect(result.features.forwardShippingCost).toBe(75);
    expect(result.metadata.sources.shipping).toBe("ACTUAL");
    expect(result.metadata.warnings).not.toContain("ESTIMATED_SHIPPING");
  });

  it("14) Tenant isolation & 15) No future leakage (Temporal Mode)", async () => {
    const order = createBaseOrder({ id: "order-1", createdAt: new Date("2024-01-15T00:00:00Z") });
    (prisma.order.findUnique as any).mockResolvedValue(order);
    
    // asOf provided, differs from order.createdAt
    const asOf = new Date("2024-01-16T00:00:00Z");

    await OrderFeatureService.extractFeatures({ shop, orderId: order.id, asOf });

    // Customer extractor should query with shop and lt: asOf
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        shop,
        customerId: "cust-1",
        createdAt: { lt: asOf }
      })
    }));

    // Pincode extractor should query with shop and lt: asOf
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        shop,
        pincode: "400001",
        createdAt: { lt: asOf }
      })
    }));
  });

  it("4) Brand-new customer (Temporal Mode)", async () => {
    const order = createBaseOrder();
    (prisma.order.findUnique as any).mockResolvedValue(order);
    (prisma.order.findMany as any).mockResolvedValue([]); // No past orders

    const asOf = new Date("2024-01-11T00:00:00Z");
    const result = await OrderFeatureService.extractFeatures({ shop, orderId: order.id, asOf });

    expect(result.features.isNewCustomer).toBe(true);
    expect(result.features.customerOrderCount).toBe(0);
    expect(result.features.customerRtoRate).toBeNull();
    expect(result.metadata.warnings).toContain("NEW_CUSTOMER");
    expect(result.metadata.warnings).toContain("NO_CUSTOMER_HISTORY");
  });

  it("3) Known repeat customer (Temporal Mode)", async () => {
    const order = createBaseOrder();
    (prisma.order.findUnique as any).mockResolvedValue(order);
    
    const pastOrder1 = createBaseOrder({ createdAt: new Date("2023-12-01T00:00:00Z"), isCOD: true, fulfillmentStatus: "fulfilled" });
    const pastOrder2 = createBaseOrder({ createdAt: new Date("2023-12-15T00:00:00Z"), isCOD: true, fulfillmentStatus: "rto" });
    
    // First call to findMany is customer history
    (prisma.order.findMany as any).mockImplementation((args: any) => {
      if (args.where?.customerId === "cust-1") return Promise.resolve([pastOrder1, pastOrder2]);
      return Promise.resolve([]);
    });

    const asOf = new Date("2024-01-10T12:00:00Z");
    const result = await OrderFeatureService.extractFeatures({ shop, orderId: order.id, asOf });

    expect(result.features.isNewCustomer).toBe(false);
    expect(result.features.customerOrderCount).toBe(2);
    expect(result.features.customerRtoCount).toBe(1);
    expect(result.features.customerRtoRate).toBe(0.5); // 1 / 2 COD orders
    expect(result.features.daysSinceLastOrder).toBeCloseTo(26.5, 0); // Dec 15 to Jan 10
  });

  it("6) Unknown pincode (Live mode fallback)", async () => {
    const order = createBaseOrder();
    (prisma.order.findUnique as any).mockResolvedValue(order);
    
    (prisma.pincodeStats.findUnique as any).mockResolvedValue(null);
    (prisma.pincodeStats.findMany as any).mockResolvedValue([]);

    const result = await OrderFeatureService.extractFeatures({ shop, orderId: order.id });

    expect(result.features.pincodeRtoRate).toBeNull();
    expect(result.features.pincodeSampleSize).toBe(0);
    expect(result.features.regionalSampleSize).toBe(0);
    expect(result.metadata.warnings).toContain("NO_PINCODE_HISTORY");
    expect(result.metadata.warnings).toContain("NO_REGIONAL_HISTORY");
  });

  it("13) No ad attribution", async () => {
    const order = createBaseOrder();
    (prisma.order.findUnique as any).mockResolvedValue(order);

    const result = await OrderFeatureService.extractFeatures({ shop, orderId: order.id });
    
    expect(result.features.allocatedAdCost).toBeNull();
    expect(result.metadata.sources.adCost).toBe("UNAVAILABLE");
    expect(result.metadata.warnings).toContain("NO_AD_ATTRIBUTION");
  });

  it("24) RTO loss inputs", async () => {
    const order = createBaseOrder({ cogsAtTimeOfOrder: 400 });
    (prisma.order.findUnique as any).mockResolvedValue(order);

    const result = await OrderFeatureService.extractFeatures({ shop, orderId: order.id });
    
    const inputs = result.features.estimatedRtoLossInputs;
    expect(inputs.cogs).toBe(400);
    expect(inputs.forwardShipping).toBe(60);
    expect(inputs.returnShipping).toBe(70);
    expect(inputs.packaging).toBe(10);
    expect(inputs.codFee).toBe(50);
    expect(inputs.paymentFee).toBe(0);
    expect(inputs.customerPaidShipping).toBe(50); // shippingCharged
  });
});
