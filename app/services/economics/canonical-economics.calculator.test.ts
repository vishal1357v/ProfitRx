import { describe, it, expect } from "vitest";
import { CanonicalEconomicsCalculator } from "./canonical-economics.calculator";

describe("CanonicalEconomicsCalculator", () => {
  it("1. Accurately calculates economics for standard Indian COD order with known COGS", () => {
    const result = CanonicalEconomicsCalculator.calculate({
      isCOD: true,
      grossOrderValue: 2000,
      totalTax: 100,
      actualSkuCogs: 600,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
      defaultPackagingCost: 15,
      defaultCodHandlingFee: 40,
      rtoProbability: 0.2, // 20% RTO risk
    });

    // Delivered Profit = (2000 - 100) - 600(cogs) - 60(fwd) - 15(pkg) - 40(cod) = 1900 - 715 = 1185
    expect(result.deliveredProfit.value).toBe(1185);
    expect(result.cogs.state).toBe("ACTUAL");
    expect(result.cogs.value).toBe(600);
    expect(result.gatewayFee.value).toBe(0);
    expect(result.codFee.value).toBe(40);

    // RTO Loss Exposure = 60(fwd) + 70(return) + 15(pkg) + 60(10% dmg of 600) + 0(cod) = 205
    expect(result.rtoLossExposure.value).toBe(205);

    // EV = (1185 * 0.8) - (205 * 0.2) = 948 - 41 = 907
    expect(result.expectedValue.value).toBe(907);
    expect(result.expectedValue.state).toBe("EXPECTED");
    expect(result.deliveryProbability).toBe(0.8);
    expect(result.rtoProbability).toBe(0.2);
  });

  it("2. Correctly applies gateway fees and 18% GST for prepaid orders", () => {
    const result = CanonicalEconomicsCalculator.calculate({
      isCOD: false,
      grossOrderValue: 1000,
      totalTax: 50,
      actualSkuCogs: 300,
      defaultForwardShipping: 50,
      defaultPackagingCost: 10,
      defaultGatewayFeePct: 2.0, // 2% Razorpay
      shopifyPlanName: "Shopify", // 1% surcharge
      gatewayFixedFee: 0,
      rtoProbability: 0.05,
    });

    // Raw Gateway = (1000 * 0.02) + (1000 * 0.01) = 30
    // Gateway Fee with 18% GST = 30 * 1.18 = 35.4
    expect(result.gatewayFee.value).toBe(35.4);
    expect(result.codFee.value).toBe(0);

    // Delivered Profit = (1000 - 50) - 300 - 50 - 10 - 35.4 = 950 - 395.4 = 554.6
    expect(result.deliveredProfit.value).toBe(554.6);
  });

  it("3. Distinguishes estimated default COGS when actual SKU COGS is missing", () => {
    const result = CanonicalEconomicsCalculator.calculate({
      isCOD: true,
      grossOrderValue: 1500,
      actualSkuCogs: null,
      defaultCogsPct: 35,
      rtoProbability: 0.3,
    });

    expect(result.cogs.state).toBe("ESTIMATED");
    expect(result.cogs.value).toBe(525); // 35% of 1500
    expect(result.dataCompleteness.hasActualCogs).toBe(false);
    expect(result.dataCompleteness.warnings).toContain("DEFAULT_COGS_USED");
  });

  it("4. Prevents double-counting RTO loss and correctly calculates inventory damage", () => {
    const result = CanonicalEconomicsCalculator.calculate({
      isCOD: true,
      grossOrderValue: 3000,
      actualSkuCogs: 1000,
      defaultForwardShipping: 80,
      defaultReturnShipping: 90,
      defaultPackagingCost: 20,
      inventoryRecoveryRate: 0.85, // 15% damage loss
      chargesCodFeeOnRTO: false,
      rtoProbability: 0.4,
    });

    // Inventory damage = 1000 * 0.15 = 150
    // RTO Loss Exposure = 80(fwd) + 90(ret) + 20(pkg) + 150(dmg) = 340
    expect(result.rtoLossExposure.value).toBe(340);
  });
});
