import { describe, it, expect, vi } from "vitest";
import { ExpectedValueStep } from "./expected-value.step";
import { ExecutionContextFactory } from "../../../infrastructure/context/execution.context";
import { SettingsRepository } from "../../../infrastructure/repositories/settings.repository";

describe("ExpectedValueStep", () => {
  it("calculates expected value using real store settings from repository", async () => {
    vi.spyOn(SettingsRepository, "getByShop").mockResolvedValueOnce({
      shop: "test-shop.myshopify.com",
      defaultForwardShipping: 80,
      defaultReturnShipping: 90,
      defaultPackaging: 15,
      defaultCOGSPct: 40,
    } as any);

    const step = new ExpectedValueStep();
    const context = ExecutionContextFactory.create("test-shop.myshopify.com", "order-123", "trace-123");

    const inputData = {
      orderId: "order-123",
      rawOrder: { id: "123", total_price: "2000.00" },
      riskScore: 35,
      confidence: 0.85,
      features: {
        financials: { grossOrderValue: 2000, netOrderValue: 2000, cogs: 800, forwardShippingCost: 80, codFee: 0, packaging: 15, paymentFee: 40, adCost: 0, customerPaidShipping: 0 },
        logistics: { returnShippingCost: 90 },
      },
    };

    const result = await step.execute(context, inputData as any);

    expect(result.expectedValue).toBeDefined();
    expect(typeof result.expectedValue).toBe("number");
    expect(result.expectedValueResult).toBeDefined();
    expect(result.expectedValueResult?.rtoProbability).toBe(0.35);
  });
});
