import { describe, it, expect } from "vitest";
import { run } from "./run";
import type { CartPaymentMethodsTransformRunInput } from "../generated/api";

describe("COD Blocker Function Logic", () => {
  const samplePaymentMethods = [
    { id: "gid://shopify/PaymentCustomizationPaymentMethod/1", name: "Credit Card (Stripe)" },
    { id: "gid://shopify/PaymentCustomizationPaymentMethod/2", name: "Cash on Delivery (COD)" },
    { id: "gid://shopify/PaymentCustomizationPaymentMethod/3", name: "UPI / Net Banking" },
  ];

  it("1. Blocks COD when delivery address zip matches a blocked pincode", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: {
        deliveryGroups: [
          {
            deliveryAddress: {
              zip: "110001",
            },
          },
        ],
      },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: {
        metafield: {
          value: JSON.stringify({ blockedPincodes: ["110001", "400001", "560001"] }),
        },
      },
    };

    const result = run(input);
    expect(result.operations.length).toBe(1);
    expect(result.operations[0].paymentMethodHide?.paymentMethodId).toBe(
      "gid://shopify/PaymentCustomizationPaymentMethod/2"
    );
  });

  it("2. Keeps COD available when delivery address zip is NOT in blocked list", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: {
        deliveryGroups: [
          {
            deliveryAddress: {
              zip: "700001", // Clean pincode
            },
          },
        ],
      },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: {
        metafield: {
          value: JSON.stringify({ blockedPincodes: ["110001", "400001", "560001"] }),
        },
      },
    };

    const result = run(input);
    expect(result.operations.length).toBe(0);
  });

  it("3. Returns no operations when no pincodes are configured", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: {
        deliveryGroups: [
          {
            deliveryAddress: {
              zip: "110001",
            },
          },
        ],
      },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: {
        metafield: {
          value: JSON.stringify({ blockedPincodes: [] }),
        },
      },
    };

    const result = run(input);
    expect(result.operations.length).toBe(0);
  });

  it("4. Returns no operations when metafield is null/missing", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: {
        deliveryGroups: [
          {
            deliveryAddress: {
              zip: "110001",
            },
          },
        ],
      },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: {
        metafield: null,
      },
    };

    const result = run(input);
    expect(result.operations.length).toBe(0);
  });
});
