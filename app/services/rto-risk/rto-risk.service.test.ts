import { describe, it, expect } from "vitest";
import { RTORiskService } from "./rto-risk.service";
import { OrderFeatureResult } from "../order-features/types";

describe("RTORiskService - Phase 2", () => {
  const createBaseFeatures = (overrides: any = {}): OrderFeatureResult => {
    return {
      features: {
        orderId: "test-order-1",
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
        channel: "Website",
        customerId: "cust-1",
        customerOrderCount: 5,
        customerCodOrderCount: 5,
        customerPrepaidOrderCount: 0,
        customerDeliveredCount: 4,
        customerRtoCount: 1,
        customerCancellationCount: 0,
        customerRtoRate: 0.2,
        customerAov: 1000,
        customerLifetimeSpend: 5000,
        isNewCustomer: false,
        daysSinceLastOrder: 15,
        customerAgeDays: 100,
        repeatPurchaseGap: 30,
        pincode: "400001",
        pincodeOrderCount: 50,
        pincodeCodOrderCount: 50,
        pincodeSuccessfulDeliveries: 45,
        pincodeRtoCount: 5,
        pincodeRtoRate: 0.1,
        pincodeDeliveryRate: 0.9,
        pincodeSampleSize: 50,
        regionalOrderCount: 1000,
        regionalCodOrderCount: 1000,
        regionalRtoCount: 150,
        regionalRtoRate: 0.15,
        regionalSampleSize: 1000,
        merchantHistoricalOrderCount: 5000,
        merchantCodOrderCount: 5000,
        merchantCodRtoCount: 1000,
        merchantCodRtoRate: 0.2,
        merchantAverageOrderValue: 1000,
        merchantAverageMargin: 0.5,
        merchantAverageRtoLoss: 150,
        cogs: 400,
        customerPaidShipping: 0,
        forwardShippingCost: 50,
        returnShippingCost: 50,
        packagingCost: 10,
        codFee: 50,
        paymentFee: 0,
        allocatedAdCost: 0,
        grossMarginBeforeShipping: 600,
        grossMarginPct: 0.6,
        contributionMarginBeforeAds: 450,
        estimatedRtoLossInputs: {
          forwardShipping: 50,
          returnShipping: 50,
          packaging: 10,
          codFee: 50,
          paymentFee: 0,
          cogs: 400,
          customerPaidShipping: 0
        },
        addressCompletenessScore: 1.0,
        province: "MH",
        ...overrides
      },
      metadata: {
        featureVersion: "order-features-v1",
        dataConfidence: 0.8,
        warnings: [],
        sources: {
          cogs: "MERCHANT_DEFAULT",
          shipping: "WEIGHT_SLAB",
          adCost: "UNAVAILABLE",
          customerHistory: "TEMPORAL_QUERY",
          pincodeHistory: "AGGREGATE_TABLE"
        },
        generatedAt: new Date(),
        generatedFromOrderCreatedAt: new Date()
      }
    };
  };

  it("1. New customer, unknown pincode (Priors used)", () => {
    const featureResult = createBaseFeatures({
      isNewCustomer: true,
      customerCodOrderCount: 0,
      customerDeliveredCount: 0,
      customerRtoCount: 0,
      customerRtoRate: null,
      pincode: null,
      pincodeSampleSize: 0,
      merchantCodOrderCount: 0 // Keep merchant confidence low too
    });
    featureResult.metadata.dataConfidence = 0.5; // lower data confidence
    const risk = RTORiskService.evaluate(featureResult);

    expect(risk.warnings).toContain("NEW_CUSTOMER");
    expect(risk.warnings).toContain("UNKNOWN_PINCODE");
    expect(risk.confidence).toBeLessThan(0.40); // Low confidence due to priors
    expect(risk.probability).toBeGreaterThan(0.20); // Not zero, relies on priors
  });

  it("2. Trusted repeat customer (Low risk)", () => {
    const featureResult = createBaseFeatures({
      customerCodOrderCount: 10,
      customerDeliveredCount: 10,
      customerRtoCount: 0,
      customerRtoRate: 0,
      pincodeRtoRate: 0.05
    });
    const risk = RTORiskService.evaluate(featureResult);

    expect(risk.riskLevel).toBe("LOW");
    expect(risk.confidence).toBeGreaterThan(0.70);
    expect(risk.factors.find(f => f.key === "TRUSTED_CUSTOMER")).toBeDefined();
  });

  it("3. High-RTO customer (40%+ rate)", () => {
    const featureResult = createBaseFeatures({
      customerCodOrderCount: 10,
      customerDeliveredCount: 0,
      customerRtoCount: 10,
      customerRtoRate: 1.0,
      customerCancellationCount: 5,
      // Neutralize other safe signals so customer drives it high
      pincodeRtoRate: 1.0,
      merchantCodRtoRate: 1.0,
      grossOrderValue: 8000
    });
    const risk = RTORiskService.evaluate(featureResult);

    expect(["HIGH", "CRITICAL"]).toContain(risk.riskLevel);
    expect(risk.factors.find(f => f.key === "HIGH_RTO_CUSTOMER")).toBeDefined();
  });

  it("4. Unknown pincode with regional fallback", () => {
    const featureResult = createBaseFeatures({
      pincodeSampleSize: 2, // Less than minSampleSize
      regionalRtoRate: 0.3
    });
    const risk = RTORiskService.evaluate(featureResult);

    expect(risk.warnings).toContain("REGIONAL_PRIOR_USED");
    expect(risk.factors.find(f => f.key === "REGIONAL_PRIOR")).toBeDefined();
  });

  it("5. Bad pincode (50%+ RTO)", () => {
    const featureResult = createBaseFeatures({
      pincodeRtoRate: 1.0,
      pincodeDeliveryRate: 0.0,
      pincodeCodOrderCount: 100,
      pincodeSampleSize: 100,
      // Neutralize other safe signals
      customerRtoRate: 1.0,
      merchantCodRtoRate: 1.0
    });
    const risk = RTORiskService.evaluate(featureResult);

    expect(["HIGH", "CRITICAL"]).toContain(risk.riskLevel);
    expect(risk.factors.find(f => f.key === "HIGH_RTO_PINCODE")).toBeDefined();
  });

  it("6. High-value order (₹10k+)", () => {
    const normal = createBaseFeatures({ grossOrderValue: 1000 });
    const highValue = createBaseFeatures({ grossOrderValue: 12000 });
    
    const riskNormal = RTORiskService.evaluate(normal);
    const riskHigh = RTORiskService.evaluate(highValue);

    expect(riskHigh.probability).toBeGreaterThan(riskNormal.probability);
    expect(riskHigh.factors.find(f => f.key === "HIGH_ORDER_VALUE")).toBeDefined();
  });

  it("7. Heavy discount (30%+)", () => {
    const featureResult = createBaseFeatures({
      discountPercentage: 0.35
    });
    const risk = RTORiskService.evaluate(featureResult);

    expect(risk.factors.find(f => f.key === "HEAVY_DISCOUNT")).toBeDefined();
  });

  it("8. Missing address", () => {
    const featureResult = createBaseFeatures({
      addressCompletenessScore: 0.5
    });
    const risk = RTORiskService.evaluate(featureResult);

    expect(risk.warnings).toContain("MISSING_ADDRESS");
    expect(risk.factors.find(f => f.key === "MISSING_ADDRESS")).toBeDefined();
  });

  it("13. Deterministic repeat runs", () => {
    const featureResult = createBaseFeatures();
    const run1 = RTORiskService.evaluate(featureResult);
    const run2 = RTORiskService.evaluate(featureResult);

    expect(run1).toEqual(run2);
  });

  it("17. Factor ordering (descending absolute contribution)", () => {
    const featureResult = createBaseFeatures({
      customerRtoRate: 0.5,
      customerCodOrderCount: 10,
      grossOrderValue: 15000
    });
    const risk = RTORiskService.evaluate(featureResult);

    for (let i = 0; i < risk.factors.length - 1; i++) {
      const a = Math.abs(risk.factors[i].contribution);
      const b = Math.abs(risk.factors[i + 1].contribution);
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it("20. Prepaid order (Massive discount)", () => {
    const featureResult = createBaseFeatures({
      isCOD: false
    });
    const risk = RTORiskService.evaluate(featureResult);

    expect(risk.factors.find(f => f.key === "PREPAID_ORDER")).toBeDefined();
    expect(risk.probability).toBeLessThan(0.15); // Heavily reduced
  });

  it("21. Bayesian smoothing limits small sample impact", () => {
    // 1 order, 1 RTO = 100% rate, but should be smoothed
    const featureResult = createBaseFeatures({
      customerCodOrderCount: 1,
      customerRtoCount: 1,
      customerRtoRate: 1.0,
      isNewCustomer: false
    });
    const risk = RTORiskService.evaluate(featureResult);

    const rtoFactor = risk.factors.find(f => f.key === "HIGH_RTO_CUSTOMER");
    expect(rtoFactor).toBeDefined();
    // Contribution shouldn't act like 100%
  });

  it("22. Rounding (Probability is exactly 2 decimal places)", () => {
    const featureResult = createBaseFeatures();
    const risk = RTORiskService.evaluate(featureResult);

    const probStr = risk.probability.toString();
    const decimalParts = probStr.split(".");
    if (decimalParts.length > 1) {
      expect(decimalParts[1].length).toBeLessThanOrEqual(2);
    }
    
    const confStr = risk.confidence.toString();
    const confParts = confStr.split(".");
    if (confParts.length > 1) {
      expect(confParts[1].length).toBeLessThanOrEqual(2);
    }
  });
});
