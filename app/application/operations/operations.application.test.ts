import { describe, it, expect, vi, beforeEach } from "vitest";
import { OperationsApplicationService } from "./operations.application";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { ExecutionLogRepository } from "../../infrastructure/repositories/execution-log.repository";
import { CodOrderRepository } from "../../infrastructure/repositories/cod-order.repository";

describe("OperationsApplicationService", () => {
  const shop = "test-merchant.myshopify.com";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. getOperationsData computes canonical economics, protection mode, and action queue", async () => {
    vi.spyOn(SettingsRepository, "getByShop").mockResolvedValue({
      shop,
      defaultCOGSPct: 40,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
      defaultPackaging: 10,
      defaultCODHandling: 40,
    } as any);

    vi.spyOn(SettingsRepository, "getMerchantPolicy").mockResolvedValue({
      shop,
      protectionMode: "REVIEW",
    } as any);

    const mockOrders = [
      {
        id: "gid://shopify/Order/1001",
        orderNumber: 1001,
        totalPrice: 3500,
        shippingPrice: 0,
        totalTax: 150,
        cogsAtTimeOfOrder: null,
        isCOD: true,
        riskScore: 75,
        riskLevel: "CRITICAL",
        merchantRecommendation: "BLOCK_COD",
        customerName: "Vikas Sharma",
        city: "Mumbai",
        pincode: "400001",
        createdAt: new Date(),
      },
      {
        id: "gid://shopify/Order/1002",
        orderNumber: 1002,
        totalPrice: 1200,
        shippingPrice: 0,
        totalTax: 50,
        cogsAtTimeOfOrder: 400,
        isCOD: false,
        riskScore: 5,
        riskLevel: "LOW",
        merchantRecommendation: "ALLOW_COD",
        customerName: "Pooja Patel",
        city: "Ahmedabad",
        pincode: "380001",
        createdAt: new Date(),
      },
    ];

    vi.spyOn(OrderRepository, "findByShop").mockResolvedValue(mockOrders as any);
    vi.spyOn(CodOrderRepository, "findByShop").mockResolvedValue([]);
    vi.spyOn(ExecutionLogRepository, "findByShop").mockResolvedValue([
      {
        id: "log-1",
        orderId: "gid://shopify/Order/1001",
        step: "EXECUTION",
        status: "PENDING_MERCHANT_REVIEW",
        message: "Awaiting merchant approval in REVIEW mode",
        createdAt: new Date(),
      } as any,
    ]);

    const result = await OperationsApplicationService.getOperationsData(shop);

    expect(result.protectionMode).toBe("REVIEW");
    expect(result.orders.length).toBe(2);
    expect(result.summary.totalOrders).toBe(2);
    expect(result.summary.totalCodOrders).toBe(1);

    // Order 1001 should be in the action queue
    const codOrder = result.orders.find((o) => o.orderNumber === 1001);
    expect(codOrder).toBeDefined();
    expect(codOrder?.needsAttention).toBe(true);
    expect(codOrder?.executionStatus).toBe("PENDING_MERCHANT_REVIEW");
    expect(codOrder?.rtoExposure).toBeGreaterThan(0);
    expect(codOrder?.expectedProfitState).toBe("ESTIMATED"); // Default COGS fallback

    // Order 1002 (Prepaid, low risk) should have actual SKU COGS
    const prepaidOrder = result.orders.find((o) => o.orderNumber === 1002);
    expect(prepaidOrder).toBeDefined();
    expect(prepaidOrder?.needsAttention).toBe(false);
    expect(prepaidOrder?.hasRealCogs).toBe(true);
  });

  it("2. applyOrderAction persists override with actor, timestamp, and audit trail", async () => {
    vi.spyOn(OrderRepository, "findById").mockResolvedValue({
      id: "gid://shopify/Order/1001",
      orderNumber: 1001,
      merchantRecommendation: "BLOCK_COD",
    } as any);

    vi.spyOn(OrderRepository, "updateDecision").mockResolvedValue(undefined);
    vi.spyOn(ExecutionLogRepository, "createLog").mockResolvedValue({ id: "log-override" } as any);

    const res = await OperationsApplicationService.applyOrderAction(
      shop,
      "gid://shopify/Order/1001",
      "ALLOW_COD",
      "Customer confirmed address over phone"
    );

    expect(res.success).toBe(true);
    expect(OrderRepository.updateDecision).toHaveBeenCalledWith(
      shop,
      "gid://shopify/Order/1001",
      { merchantRecommendation: "ALLOW_COD" }
    );
    expect(ExecutionLogRepository.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "MERCHANT_OVERRIDE",
        status: "SUCCESS",
        message: expect.stringContaining("ALLOW_COD"),
        data: expect.objectContaining({
          previousDecision: "BLOCK_COD",
          newDecision: "ALLOW_COD",
          actor: "MERCHANT",
        }),
      })
    );
  });
});
