import { describe, it, expect } from "vitest";
import { ShippingCalculator, FALLBACK_FORWARD_SHIPPING, FALLBACK_RETURN_SHIPPING } from "./shipping.calculator";
import { WeightSlab } from "./types";

describe("ShippingCalculator", () => {
  const sampleSlabs: WeightSlab[] = [
    { maxWeightGrams: 500, forwardCost: 45, returnCost: 55 },
    { maxWeightGrams: 1000, forwardCost: 75, returnCost: 85 },
    { maxWeightGrams: 2000, forwardCost: 120, returnCost: 140 },
  ];

  it("1. Uses actual shipping cost when explicitly provided", () => {
    const result = ShippingCalculator.calculate({
      actualShippingCost: 89.5,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
    });

    expect(result.forwardShippingCost).toBe(89.5);
    expect(result.returnShippingCost).toBe(70);
    expect(result.source).toBe("MERCHANT_CONFIGURED");
    expect(result.isWeightBased).toBe(false);
  });

  it("2. Matches the correct weight slab within boundary", () => {
    const result = ShippingCalculator.calculate({
      weightGrams: 450,
      shippingSlabs: sampleSlabs,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
    });

    expect(result.forwardShippingCost).toBe(45);
    expect(result.returnShippingCost).toBe(55);
    expect(result.source).toBe("WEIGHT_SLAB");
    expect(result.isWeightBased).toBe(true);
  });

  it("3. Matches higher weight slab when weight is at the exact threshold", () => {
    const result = ShippingCalculator.calculate({
      weightGrams: 1000,
      shippingSlabs: sampleSlabs,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
    });

    expect(result.forwardShippingCost).toBe(75);
    expect(result.returnShippingCost).toBe(85);
    expect(result.source).toBe("WEIGHT_SLAB");
  });

  it("4. Caps at heaviest slab when weight exceeds max configured slab", () => {
    const result = ShippingCalculator.calculate({
      weightGrams: 3500,
      shippingSlabs: sampleSlabs,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
    });

    expect(result.forwardShippingCost).toBe(120);
    expect(result.returnShippingCost).toBe(140);
    expect(result.source).toBe("WEIGHT_SLAB");
    expect(result.warnings).toContain("EXCEEDS_MAX_WEIGHT_SLAB");
  });

  it("5. Uses merchant defaults when weight is not available", () => {
    const result = ShippingCalculator.calculate({
      weightGrams: null,
      shippingSlabs: sampleSlabs,
      defaultForwardShipping: 65,
      defaultReturnShipping: 75,
    });

    expect(result.forwardShippingCost).toBe(65);
    expect(result.returnShippingCost).toBe(75);
    expect(result.source).toBe("ESTIMATED");
    expect(result.isWeightBased).toBe(false);
  });

  it("6. Uses fallback constants when all defaults are missing or invalid", () => {
    const result = ShippingCalculator.calculate({
      weightGrams: undefined,
      shippingSlabs: null,
      defaultForwardShipping: 0,
      defaultReturnShipping: null,
    });

    expect(result.forwardShippingCost).toBe(FALLBACK_FORWARD_SHIPPING);
    expect(result.returnShippingCost).toBe(FALLBACK_RETURN_SHIPPING);
    expect(result.source).toBe("FALLBACK");
    expect(result.warnings).toContain("USING_FALLBACK_FORWARD_SHIPPING");
    expect(result.warnings).toContain("USING_FALLBACK_RETURN_SHIPPING");
  });

  it("7. Never produces NaN on null or undefined inputs", () => {
    const result = ShippingCalculator.calculate({
      weightGrams: NaN,
      shippingSlabs: undefined,
      defaultForwardShipping: undefined,
      defaultReturnShipping: undefined,
    });

    expect(Number.isFinite(result.forwardShippingCost)).toBe(true);
    expect(Number.isFinite(result.returnShippingCost)).toBe(true);
    expect(result.forwardShippingCost).toBe(60);
    expect(result.returnShippingCost).toBe(70);
  });
});
