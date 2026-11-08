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

  // --- Boundary Semantics Verification: rejectCodOver (cart > threshold) ---
  it("5a. rejectCodOver boundary: below threshold (4999.99 vs 5000.00) -> COD Allowed", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: { cost: { totalAmount: { amount: "4999.99" } }, deliveryGroups: [] },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: { metafield: { value: JSON.stringify({ rejectCodOver: 5000 }) } },
    };
    const result = run(input);
    expect(result.operations.length).toBe(0);
  });

  it("5b. rejectCodOver boundary: equal to threshold (5000.00 vs 5000.00) -> COD Allowed (strict > operator)", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: { cost: { totalAmount: { amount: "5000.00" } }, deliveryGroups: [] },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: { metafield: { value: JSON.stringify({ rejectCodOver: 5000 }) } },
    };
    const result = run(input);
    expect(result.operations.length).toBe(0);
  });

  it("5c. rejectCodOver boundary: above threshold (5000.01 vs 5000.00) -> COD Blocked", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: { cost: { totalAmount: { amount: "5000.01" } }, deliveryGroups: [] },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: { metafield: { value: JSON.stringify({ rejectCodOver: 5000 }) } },
    };
    const result = run(input);
    expect(result.operations.length).toBe(1);
    expect(result.operations[0].paymentMethodHide?.paymentMethodId).toBe(
      "gid://shopify/PaymentCustomizationPaymentMethod/2"
    );
  });

  // --- Boundary Semantics Verification: requirePrepaidAbove (cart >= threshold) ---
  it("6a. requirePrepaidAbove boundary: below threshold (9999.99 vs 10000.00) -> COD Allowed", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: { cost: { totalAmount: { amount: "9999.99" } }, deliveryGroups: [] },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: { metafield: { value: JSON.stringify({ requirePrepaidAbove: 10000 }) } },
    };
    const result = run(input);
    expect(result.operations.length).toBe(0);
  });

  it("6b. requirePrepaidAbove boundary: equal to threshold (10000.00 vs 10000.00) -> COD Blocked (>= operator)", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: { cost: { totalAmount: { amount: "10000.00" } }, deliveryGroups: [] },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: { metafield: { value: JSON.stringify({ requirePrepaidAbove: 10000 }) } },
    };
    const result = run(input);
    expect(result.operations.length).toBe(1);
    expect(result.operations[0].paymentMethodHide?.paymentMethodId).toBe(
      "gid://shopify/PaymentCustomizationPaymentMethod/2"
    );
  });

  it("6c. requirePrepaidAbove boundary: above threshold (10000.01 vs 10000.00) -> COD Blocked", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: { cost: { totalAmount: { amount: "10000.01" } }, deliveryGroups: [] },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: { metafield: { value: JSON.stringify({ requirePrepaidAbove: 10000 }) } },
    };
    const result = run(input);
    expect(result.operations.length).toBe(1);
    expect(result.operations[0].paymentMethodHide?.paymentMethodId).toBe(
      "gid://shopify/PaymentCustomizationPaymentMethod/2"
    );
  });

  it("7. Keeps COD available when cart amount is below threshold and pincode is clean", () => {
    const input: CartPaymentMethodsTransformRunInput = {
      cart: {
        cost: {
          totalAmount: {
            amount: "3200.00",
          },
        },
        deliveryGroups: [
          {
            deliveryAddress: {
              zip: "700001",
            },
          },
        ],
      },
      paymentMethods: samplePaymentMethods,
      paymentCustomization: {
        metafield: {
          value: JSON.stringify({ blockedPincodes: ["110001"], rejectCodOver: 5000, requirePrepaidAbove: 10000 }),
        },
      },
    };

    const result = run(input);
    expect(result.operations.length).toBe(0);
  });

  // --- Explicit Currency Contract Verification ---
  describe("Explicit Currency Contract Tests", () => {
    it("8a. Matches INR cart against INR threshold: blocks when cart exceeds threshold", () => {
      const input = {
        cart: {
          cost: {
            totalAmount: {
              amount: "5500.00",
              currencyCode: "INR",
            },
          },
          deliveryGroups: [],
        },
        paymentMethods: samplePaymentMethods,
        paymentCustomization: {
          metafield: {
            value: JSON.stringify({ rejectCodOver: 5000, currency: "INR" }),
          },
        },
      } as any;

      const result = run(input);
      expect(result.operations.length).toBe(1);
      expect(result.operations[0].paymentMethodHide?.paymentMethodId).toBe(
        "gid://shopify/PaymentCustomizationPaymentMethod/2"
      );
    });

    it("8b. Matches USD cart against USD threshold: blocks when cart exceeds threshold", () => {
      const input = {
        cart: {
          cost: {
            totalAmount: {
              amount: "250.00",
              currencyCode: "USD",
            },
          },
          deliveryGroups: [],
        },
        paymentMethods: samplePaymentMethods,
        paymentCustomization: {
          metafield: {
            value: JSON.stringify({ rejectCodOver: 200, currency: "USD" }),
          },
        },
      } as any;

      const result = run(input);
      expect(result.operations.length).toBe(1);
    });

    it("8c. Prevents comparison between different currencies (USD cart vs INR threshold): COD Allowed", () => {
      const input = {
        cart: {
          cost: {
            totalAmount: {
              amount: "5500.00", // $5500 USD (or $50 USD)
              currencyCode: "USD",
            },
          },
          deliveryGroups: [],
        },
        paymentMethods: samplePaymentMethods,
        paymentCustomization: {
          metafield: {
            value: JSON.stringify({ rejectCodOver: 5000, currency: "INR" }),
          },
        },
      } as any;

      // Currency contract prevents raw numeric comparison between USD and INR
      const result = run(input);
      expect(result.operations.length).toBe(0);
    });

    it("8d. Prevents comparison for international presentment currency (EUR cart vs INR threshold): COD Allowed", () => {
      const input = {
        cart: {
          cost: {
            totalAmount: {
              amount: "6000.00",
              currencyCode: "EUR",
            },
          },
          deliveryGroups: [],
        },
        paymentMethods: samplePaymentMethods,
        paymentCustomization: {
          metafield: {
            value: JSON.stringify({ rejectCodOver: 5000, currency: "INR" }),
          },
        },
      } as any;

      const result = run(input);
      expect(result.operations.length).toBe(0);
    });

    it("8e. Legacy/unspecified configuration maintains backward compatibility", () => {
      const input = {
        cart: {
          cost: {
            totalAmount: {
              amount: "6000.00",
              currencyCode: "INR",
            },
          },
          deliveryGroups: [],
        },
        paymentMethods: samplePaymentMethods,
        paymentCustomization: {
          metafield: {
            value: JSON.stringify({ rejectCodOver: 5000 }), // No currency field
          },
        },
      } as any;

      const result = run(input);
      expect(result.operations.length).toBe(1);
    });
  });
});
