import { describe, it, expect } from "vitest";
import { ExpectedValueService } from "./expected-value.service";
import { OrderFeatureResult } from "../order-features/types";
import { RTORiskResult } from "../rto-risk/types";
import { FinancialAssumptions } from "./types";

describe("ExpectedValueService", () => {
  const defaultFeatures: OrderFeatureResult = {
    features: {
      orderId: "test-1",
      shop: "test.myshopify.com",
      orderDate: new Date(),
      grossOrderValue: 1000,
      netOrderValue: 1000,
      subtotal: 1000,
      shippingCharged: 0,
      tax: 0,
      discountAmount: 0,
      discountPercentage: 0,
      itemCount: 1,
      totalQuantity: 1,
      totalWeight: 500,
      isCOD: true,
      channel: "Web",
      customerId: "cust-1",
      customerOrderCount: 1,
      customerCodOrderCount: 1,
      customerPrepaidOrderCount: 0,
      customerDeliveredCount: 1,
      customerRtoCount: 0,
      customerCancellationCount: 0,
      customerRtoRate: 0,
      customerAov: 1000,
      customerLifetimeSpend: 1000,
      isNewCustomer: false,
      daysSinceLastOrder: 10,
      customerAgeDays: 10,
      repeatPurchaseGap: 0,
      pincode: "110001",
      pincodeOrderCount: 10,
      pincodeCodOrderCount: 10,
      pincodeSuccessfulDeliveries: 10,
      pincodeRtoCount: 0,
      pincodeRtoRate: 0,
      pincodeDeliveryRate: 1,
      pincodeSampleSize: 10,
      regionalOrderCount: 100,
      regionalCodOrderCount: 100,
      regionalRtoCount: 10,
      regionalRtoRate: 0.1,
      regionalSampleSize: 100,
      merchantHistoricalOrderCount: 1000,
      merchantCodOrderCount: 1000,
      merchantCodRtoCount: 100,
      merchantCodRtoRate: 0.1,
      merchantAverageOrderValue: 1000,
      merchantAverageMargin: 0.5,
      merchantAverageRtoLoss: 100,
      cogs: 400,
      customerPaidShipping: 50,
      forwardShippingCost: 60,
      returnShippingCost: 60,
      packagingCost: 10,
      codFee: 50,
      paymentFee: 0,
      allocatedAdCost: 100,
      grossMarginBeforeShipping: 600,
      grossMarginPct: 0.6,
      contributionMarginBeforeAds: 420,
      estimatedRtoLossInputs: {
        forwardShipping: 60,
        returnShipping: 60,
        packaging: 10,
        codFee: 50,
        paymentFee: 0,
        cogs: 400,
        customerPaidShipping: 50
      },
      addressCompletenessScore: 1,
      province: "DL"
    },
    metadata: {
      featureVersion: "v1",
      dataConfidence: 1,
      warnings: [],
      sources: {
        cogs: "MERCHANT_DEFAULT",
        shipping: "WEIGHT_SLAB",
        customerHistory: "NONE",
        pincodeHistory: "NONE",
        adCost: "UNAVAILABLE"
      },
      generatedAt: new Date(),
      generatedFromOrderCreatedAt: new Date()
    }
  };

  const defaultRisk: RTORiskResult = {
    probability: 0.20,
    riskLevel: "LOW",
    confidence: 0.9,
    factors: [],
    warnings: [],
    modelVersion: "v1",
    weightsVersion: "v1",
    confidenceVersion: "v1"
  };

  const defaultAssumptions: FinancialAssumptions = {
    inventoryRecoveryRate: 1.0,
    refundsShippingOnRTO: false,
    chargesCodFeeOnRTO: false,
    includesAdCost: true
  };

  const buildFeatures = (overrides: Partial<OrderFeatureResult["features"]>): OrderFeatureResult => {
    return { ...defaultFeatures, features: { ...defaultFeatures.features, ...overrides } };
  };

  it("1. Standard profitable order (Baseline)", () => {
    // revenue(1000) + shipRev(50) - cogs(400) - fwShip(60) - payFee(0) - codFee(50) - pkg(10) - ad(100) = 430
    // Loss: fwShip(60) + retShip(60) + pkg(10) + dmg(0) = 130
    // Expected: 430 * 0.8 - 130 * 0.2 = 344 - 26 = 318
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, defaultAssumptions);
    
    expect(result.deliveredScenario.contributionProfit).toBe(430);
    expect(result.rtoScenario.totalLoss).toBe(130);
    expect(result.expectedValue).toBe(318);
  });

  it("2. Zero-margin order (Delivered profit = 0)", () => {
    // Make ad cost eat up the remaining 430 profit
    const features = buildFeatures({ allocatedAdCost: 530 });
    const result = ExpectedValueService.calculate(features, defaultRisk, defaultAssumptions);
    
    expect(result.deliveredScenario.contributionProfit).toBe(0);
    // Loss is 130
    // Expected: 0 * 0.8 - 130 * 0.2 = -26
    expect(result.expectedValue).toBe(-26);
  });

  it("3. Negative-margin order", () => {
    const features = buildFeatures({ allocatedAdCost: 800 });
    const result = ExpectedValueService.calculate(features, defaultRisk, defaultAssumptions);
    
    expect(result.deliveredScenario.contributionProfit).toBe(-270);
    // Expected: -270 * 0.8 - 130 * 0.2 = -216 - 26 = -242
    expect(result.expectedValue).toBe(-242);
  });

  it("4. 100% RTO probability", () => {
    const risk: RTORiskResult = { ...defaultRisk, probability: 1.0 };
    const result = ExpectedValueService.calculate(defaultFeatures, risk, defaultAssumptions);
    
    expect(result.expectedValue).toBe(-130);
  });

  it("5. 0% RTO probability", () => {
    const risk: RTORiskResult = { ...defaultRisk, probability: 0.0 };
    const result = ExpectedValueService.calculate(defaultFeatures, risk, defaultAssumptions);
    
    expect(result.expectedValue).toBe(430);
  });

  it("6. Inventory recovery 0% (Food/Perishables)", () => {
    const assumptions = { ...defaultAssumptions, inventoryRecoveryRate: 0.0 };
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, assumptions);
    
    // Loss: 130 + 400 (cogs) = 530
    expect(result.rtoScenario.inventoryDamage).toBe(400);
    expect(result.rtoScenario.totalLoss).toBe(530);
    // Expected: 430 * 0.8 - 530 * 0.2 = 344 - 106 = 238
    expect(result.expectedValue).toBe(238);
  });

  it("7. Inventory recovery 100%", () => {
    const assumptions = { ...defaultAssumptions, inventoryRecoveryRate: 1.0 };
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, assumptions);
    expect(result.rtoScenario.inventoryDamage).toBe(0);
  });

  it("8. Partial inventory recovery (90%)", () => {
    const assumptions = { ...defaultAssumptions, inventoryRecoveryRate: 0.9 };
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, assumptions);
    
    // Damage = 10% of 400 = 40
    expect(result.rtoScenario.inventoryDamage).toBe(40);
    expect(result.rtoScenario.totalLoss).toBe(170); // 130 + 40
  });

  it("9. Shipping refunded on RTO (True)", () => {
    const assumptions = { ...defaultAssumptions, refundsShippingOnRTO: true };
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, assumptions);
    
    // shipping charged was 50. Refund means loss increases by 50.
    expect(result.rtoScenario.customerShippingRefund).toBe(50);
    expect(result.rtoScenario.totalLoss).toBe(180); // 130 + 50
  });

  it("10. Shipping retained on RTO (False)", () => {
    const assumptions = { ...defaultAssumptions, refundsShippingOnRTO: false };
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, assumptions);
    expect(result.rtoScenario.customerShippingRefund).toBe(0);
    expect(result.rtoScenario.totalLoss).toBe(130);
  });

  it("11. COD fee charged on RTO (True)", () => {
    const assumptions = { ...defaultAssumptions, chargesCodFeeOnRTO: true };
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, assumptions);
    
    // COD fee is 50
    expect(result.rtoScenario.codFee).toBe(50);
    expect(result.rtoScenario.totalLoss).toBe(180); // 130 + 50
  });

  it("12. COD fee waived on RTO (False)", () => {
    const assumptions = { ...defaultAssumptions, chargesCodFeeOnRTO: false };
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, assumptions);
    expect(result.rtoScenario.codFee).toBe(0);
  });

  it("13. Ad cost missing (Fallback to 0)", () => {
    const assumptions = { ...defaultAssumptions, includesAdCost: false };
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, assumptions);
    
    expect(result.deliveredScenario.adCost).toBe(0);
    // profit: 430 + 100 = 530
    expect(result.deliveredScenario.contributionProfit).toBe(530);
  });

  it("14. Extreme ad cost", () => {
    const features = buildFeatures({ allocatedAdCost: 1000 });
    const result = ExpectedValueService.calculate(features, defaultRisk, defaultAssumptions);
    
    // 430 (base) - 900 (extra ad cost) = -470
    expect(result.deliveredScenario.contributionProfit).toBe(-470);
  });

  it("15. Prepaid order (COD fee = 0)", () => {
    const features = buildFeatures({ isCOD: false });
    const result = ExpectedValueService.calculate(features, defaultRisk, defaultAssumptions);
    
    expect(result.deliveredScenario.codFee).toBe(0);
    // Profit = 430 + 50 = 480
    expect(result.deliveredScenario.contributionProfit).toBe(480);
  });

  it("16. Floating-point rounding checks", () => {
    const features = buildFeatures({ cogs: 33.333333 });
    const result = ExpectedValueService.calculate(features, defaultRisk, defaultAssumptions);
    
    // Just verify nothing has wild decimals (ignoring date strings)
    // @ts-ignore
    delete result.metadata.calculationDate;
    const str = JSON.stringify(result);
    expect(str).not.toMatch(/\.\d{3,}/);
  });

  it("17. Expected ROI calculation correctness", () => {
    // EV = 318, grossOrderValue = 1000
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, defaultAssumptions);
    expect(result.expectedROI).toBe(0.32); // 318 / 1000 = 0.318 -> 0.32
  });

  it("18. Expected Loss calculation correctness", () => {
    // Loss = 130, prob = 0.20 => 26
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, defaultAssumptions);
    expect(result.expectedLoss).toBe(26);
  });

  it("19. High risk + high margin", () => {
    const features = buildFeatures({ netOrderValue: 5000 }); // High margin
    const risk = { ...defaultRisk, probability: 0.6 }; // High risk
    const result = ExpectedValueService.calculate(features, risk, defaultAssumptions);
    
    // Profit: 4430
    // Loss: 130
    // Expected: 4430*0.4 - 130*0.6 = 1772 - 78 = 1694
    expect(result.expectedValue).toBeGreaterThan(0);
  });

  it("20. Low risk + low margin", () => {
    const features = buildFeatures({ netOrderValue: 400 }); // Unprofitable due to costs (cogs=400, ad=100, etc)
    const risk = { ...defaultRisk, probability: 0.05 }; 
    const result = ExpectedValueService.calculate(features, risk, defaultAssumptions);
    
    expect(result.expectedValue).toBeLessThan(0);
  });

  it("21. Free shipping order", () => {
    const features = buildFeatures({ customerPaidShipping: 0 });
    const result = ExpectedValueService.calculate(features, defaultRisk, defaultAssumptions);
    
    expect(result.deliveredScenario.shippingRevenue).toBe(0);
    expect(result.deliveredScenario.contributionProfit).toBe(380); // 430 - 50
  });

  it("22. Boundary: 0 order value", () => {
    const features = buildFeatures({ grossOrderValue: 0, netOrderValue: 0 });
    const result = ExpectedValueService.calculate(features, defaultRisk, defaultAssumptions);
    
    expect(result.expectedROI).toBe(0);
  });

  it("23. Missing COGS fallback to 0", () => {
    // @ts-ignore - simulating bad data
    const features = buildFeatures({ cogs: null });
    const result = ExpectedValueService.calculate(features, defaultRisk, defaultAssumptions);
    
    expect(result.deliveredScenario.cogs).toBe(0);
  });

  it("24. Versioning correctly populated", () => {
    const result = ExpectedValueService.calculate(defaultFeatures, defaultRisk, defaultAssumptions);
    expect(result.metadata.serviceVersion).toBeDefined();
    expect(result.metadata.formulaVersion).toBeDefined();
    expect(result.metadata.assumptionsVersion).toBeDefined();
  });

  it("25. Deterministic repeat runs", () => {
    const result1 = ExpectedValueService.calculate(defaultFeatures, defaultRisk, defaultAssumptions);
    const result2 = ExpectedValueService.calculate(defaultFeatures, defaultRisk, defaultAssumptions);
    // calculationDate will differ, so omit it for strict equality
    result1.metadata.calculationDate = new Date(0);
    result2.metadata.calculationDate = new Date(0);
    
    expect(result1).toEqual(result2);
  });
});
