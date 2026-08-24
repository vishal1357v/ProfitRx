import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "../../db.server";
import { OrderApplicationService } from "./order.application";
import { ExecutionContextFactory } from "../../infrastructure/context/execution.context";

vi.mock("../../db.server", () => {
  return {
    default: {
      session: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      order: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _count: { id: 0 }, _avg: { totalPrice: 0 } }),
        create: vi.fn(),
        update: vi.fn(),
      },
      storeSettings: {
        findUnique: vi.fn(),
      },
      productCOGS: {
        findMany: vi.fn(),
      },
      customerRisk: {
        findUnique: vi.fn(),
      },
      pincodeStats: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      executionLog: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      learningRecord: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
    },
  };
});

describe("OrderApplicationService — E2E Production Pipeline Verification", () => {
  const shop = "merchant-demo.myshopify.com";
  const orderId = "gid://shopify/Order/99001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Webhook order in OBSERVE mode creates recommendation without Shopify mutation (ADVISORY_ONLY)", async () => {
    (prisma.order.findFirst as any).mockResolvedValue({
      id: orderId,
      shop,
      orderNumber: 99001,
      totalPrice: 2500,
      subtotalPrice: 2400,
      totalTax: 100,
      shippingPrice: 0,
      isCOD: true,
      createdAt: new Date(),
      processedAt: new Date(),
      pincode: "110001",
      province: "Delhi",
    });

    (prisma.storeSettings.findUnique as any).mockResolvedValue({
      shop,
      protectionMode: "OBSERVE",
      defaultCOGSPct: 40,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
      defaultCODHandling: 40,
      defaultPackaging: 10,
    });

    (prisma.productCOGS.findMany as any).mockResolvedValue([]);
    (prisma.executionLog.create as any).mockResolvedValue({ id: "exec-log-1" });
    (prisma.order.update as any).mockResolvedValue({ id: orderId });

    const context = ExecutionContextFactory.create(shop, orderId, "trace-test-observe");
    const rawOrder = {
      id: 99001,
      order_number: 99001,
      total_price: "2500.00",
      subtotal_price: "2400.00",
      total_tax: "100.00",
      shipping_price: "0.00",
      gateway: "Cash on Delivery (COD)",
      shipping_address: { zip: "110001", province: "Delhi" },
      customer: { id: "cust-99", first_name: "Rahul", last_name: "Sharma", email: "rahul@example.com" },
    };

    await OrderApplicationService.processOrder(context, rawOrder);

    // Verify order was updated in DB with decision
    expect(prisma.order.update).toHaveBeenCalled();
    const updateCall = (prisma.order.update as any).mock.calls[0][0];
    expect(updateCall.data.merchantRecommendation).toBeDefined();

    // Verify execution log recorded ADVISORY_ONLY (zero side effects on Shopify)
    expect(prisma.executionLog.create).toHaveBeenCalled();
    const calls = (prisma.executionLog.create as any).mock.calls.map((c: any) => c[0].data);
    const executionCall = calls.find((c: any) => c.step === "EXECUTION");
    expect(executionCall).toBeDefined();
    expect(executionCall.status).toBe("ADVISORY_ONLY");
    expect(executionCall.message).toContain("OBSERVE");
  });

  it("2. Webhook order in REVIEW mode queues risky decision for merchant review", async () => {
    (prisma.order.findFirst as any).mockResolvedValue({
      id: orderId,
      shop,
      orderNumber: 99002,
      totalPrice: 8500,
      subtotalPrice: 8400,
      totalTax: 100,
      shippingPrice: 0,
      isCOD: true,
      createdAt: new Date(),
      processedAt: new Date(),
      pincode: "700001",
      province: "West Bengal",
    });

    (prisma.storeSettings.findUnique as any).mockResolvedValue({
      shop,
      protectionMode: "REVIEW",
      defaultCOGSPct: 40,
      rulesRejectCodOver: 5000, // Hard rule: reject COD above 5000
    });

    (prisma.productCOGS.findMany as any).mockResolvedValue([]);
    (prisma.executionLog.create as any).mockResolvedValue({ id: "exec-log-2" });
    (prisma.order.update as any).mockResolvedValue({ id: orderId });

    const context = ExecutionContextFactory.create(shop, orderId, "trace-test-review");
    const rawOrder = {
      id: 99002,
      order_number: 99002,
      total_price: "8500.00",
      subtotal_price: "8400.00",
      total_tax: "100.00",
      shipping_price: "0.00",
      gateway: "Cash on Delivery (COD)",
      shipping_address: { zip: "700001", province: "West Bengal" },
      customer: { id: "cust-100", first_name: "Amit", last_name: "Verma", email: "amit@example.com" },
    };

    await OrderApplicationService.processOrder(context, rawOrder);

    // Verify execution log recorded PENDING_MERCHANT_REVIEW
    expect(prisma.executionLog.create).toHaveBeenCalled();
    const calls = (prisma.executionLog.create as any).mock.calls.map((c: any) => c[0].data);
    const executionCall = calls.find((c: any) => c.step === "EXECUTION");
    expect(executionCall).toBeDefined();
    expect(executionCall.status).toBe("PENDING_MERCHANT_REVIEW");
    expect(executionCall.message).toContain("REVIEW");
  });
});
