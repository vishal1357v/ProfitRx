import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderDetailApplicationService } from "./order-detail.application";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { ExecutionLogRepository } from "../../infrastructure/repositories/execution-log.repository";
import { LearningRecordRepository } from "../../infrastructure/repositories/learning-record.repository";

describe("OrderDetailApplicationService", () => {
  const shop = "test-merchant.myshopify.com";
  const orderId = "gid://shopify/Order/5001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. getOrderDetail aggregates canonical economics, risk factors, and truthful timeline", async () => {
    vi.spyOn(OrderRepository, "findById").mockResolvedValue({
      id: orderId,
      orderNumber: 5001,
      totalPrice: 2000,
      subtotalPrice: 1900,
      totalTax: 100,
      shippingPrice: 0,
      discountAmount: 0,
      isCOD: true,
      gateway: "Cash on Delivery",
      financialStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      channelAttribution: "Instagram",
      customerName: "Rahul Sen",
      customerEmail: "rahul@example.com",
      city: "Kolkata",
      province: "West Bengal",
      pincode: "700001",
      createdAt: new Date(),
      cogsAtTimeOfOrder: 600, // Actual SKU COGS
      riskScore: 65,
      riskLevel: "HIGH",
      riskReasons: [{ reason: "High COD Return Region", impact: 0.3 }],
      merchantRecommendation: "OTP_VERIFY",
      lineItems: [
        {
          id: "li-1",
          shopifyLineItemId: "sli-1",
          productId: "p-1",
          title: "Leather Wallet",
          variantTitle: "Black",
          quantity: 1,
          unitPrice: 2000,
        },
      ],
    } as any);

    vi.spyOn(SettingsRepository, "getByShop").mockResolvedValue({
      shop,
      defaultCOGSPct: 35,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
      defaultPackaging: 10,
      defaultCODHandling: 40,
    } as any);

    vi.spyOn(SettingsRepository, "getMerchantPolicy").mockResolvedValue({
      shop,
      protectionMode: "OBSERVE",
    } as any);

    vi.spyOn(ExecutionLogRepository, "findByOrderId").mockResolvedValue([
      {
        id: "log-1",
        step: "FEATURE_EXTRACTION",
        status: "SUCCESS",
        message: "Features extracted",
        createdAt: new Date(),
      },
      {
        id: "log-2",
        step: "EXECUTION",
        status: "ADVISORY_ONLY",
        message: "Protection Mode: OBSERVE - Advisory only",
        createdAt: new Date(),
      },
    ] as any);

    vi.spyOn(LearningRecordRepository, "findByOrderId").mockResolvedValue([]);

    const result = await OrderDetailApplicationService.getOrderDetail(shop, orderId);

    expect(result).not.toBeNull();
    if (!result) return;

    // Check Order Data
    expect(result.order.orderNumber).toBe(5001);
    expect(result.order.protectionMode).toBe("OBSERVE");
    expect(result.order.executionStatus).toBe("ADVISORY_ONLY");

    // Check Canonical Economics
    expect(result.economics.revenue.value).toBe(2000);
    expect(result.economics.cogs.value).toBe(600);
    expect(result.economics.cogs.state).toBe("ACTUAL");
    expect(result.economics.deliveredProfit.value).toBe(1190); // 2000 - 100(tax) - 600 - 60 - 10 - 40
    expect(result.economics.rtoLossExposure.value).toBe(200); // 60(fwd) + 70(ret) + 10(pack) + 60(10% cogs damage)

    // Check Evidence & Timeline
    expect(result.evidence.hasRealCogs).toBe(true);
    expect(result.executionLogs.length).toBe(2);
    expect(result.executionLogs[1].status).toBe("ADVISORY_ONLY");
  });

  it("2. overrideDecision persists manual merchant override in audit trail", async () => {
    vi.spyOn(OrderRepository, "findById").mockResolvedValue({
      id: orderId,
      orderNumber: 5001,
      merchantRecommendation: "BLOCK_COD",
      riskScore: 65,
    } as any);

    vi.spyOn(OrderRepository, "updateDecision").mockResolvedValue(undefined);
    vi.spyOn(ExecutionLogRepository, "createLog").mockResolvedValue({ id: "log-ovr" } as any);

    const res = await OrderDetailApplicationService.overrideDecision(
      shop,
      orderId,
      "ALLOW_COD",
      "Customer requested COD explicitly"
    );

    expect(res.success).toBe(true);
    expect(OrderRepository.updateDecision).toHaveBeenCalledWith(
      shop,
      orderId,
      { merchantRecommendation: "ALLOW_COD" }
    );
    expect(ExecutionLogRepository.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "MERCHANT_OVERRIDE",
        status: "SUCCESS",
        message: expect.stringContaining("ALLOW_COD"),
      })
    );
  });
});
