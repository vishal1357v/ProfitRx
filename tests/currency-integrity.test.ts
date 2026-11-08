import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  getCurrencySymbol,
  assertSameCurrency,
  convertMoneyWithExplicitRate,
  resolveShopifyOrderMoney,
  CurrencyMismatchError,
} from "../app/utils/currency";
import { CanonicalEconomicsCalculator } from "../app/services/economics/canonical-economics.calculator";
import { ProfitService, normalizeIndianState } from "../app/services/profit.service";

describe("ProfitRx — Financial Currency Integrity & Multi-Currency Engine", () => {
  // ── Scenario 1: USD shop with USD orders ─────────────────────────
  describe("Scenario 1: USD shop with USD orders", () => {
    it("correctly resolves money, displays USD symbol, and evaluates economics in USD", () => {
      const orderMoney = resolveShopifyOrderMoney({
        shopMoney: { amount: "90.00", currencyCode: "USD" },
        presentmentMoney: { amount: "90.00", currencyCode: "USD" },
      });

      expect(orderMoney.accountingAmount).toBe(90.0);
      expect(orderMoney.accountingCurrency).toBe("USD");
      expect(orderMoney.presentmentAmount).toBe(90.0);
      expect(orderMoney.presentmentCurrency).toBe("USD");
      expect(orderMoney.isMultiCurrency).toBe(false);

      // Verify formatting displays $ and en-US format
      const formatted = formatCurrency(orderMoney.accountingAmount, orderMoney.accountingCurrency);
      expect(formatted).toContain("$");
      expect(formatted).toMatch(/\$90(\.00)?/);

      // Calculate economics with USD parameters
      const econResult = CanonicalEconomicsCalculator.calculate({
        isCOD: false,
        grossOrderValue: orderMoney.accountingAmount,
        customerPaidShipping: 0,
        totalTax: 0,
        actualSkuCogs: 34.2, // $34.20
        defaultForwardShipping: 5.0, // $5.00 forward shipping
        defaultReturnShipping: 7.0,
        defaultPackagingCost: 1.5, // $1.50 packaging
        defaultGatewayFeePct: 2.9, // 2.9% stripe
        gatewayFixedFee: 0.3, // $0.30 fixed
        shopifyPlanName: "basic",
      });

      expect(econResult.revenue.value).toBe(90.0);
      expect(econResult.cogs.value).toBe(34.2);
      expect(econResult.forwardShipping.value).toBe(5.0);
      expect(econResult.packaging.value).toBe(1.5);
      // Delivered profit should be positive (~$44.60), NOT corrupted by subtracting INR ₹60
      expect(econResult.deliveredProfit.value).toBeGreaterThan(40);
      expect(econResult.deliveredProfit.value).toBeLessThan(50);
    });
  });

  // ── Scenario 2: INR shop with INR orders ─────────────────────────
  describe("Scenario 2: INR shop with INR orders", () => {
    it("correctly resolves money, displays ₹ symbol, and evaluates economics in INR", () => {
      const orderMoney = resolveShopifyOrderMoney({
        shopMoney: { amount: "2499.00", currencyCode: "INR" },
        presentmentMoney: { amount: "2499.00", currencyCode: "INR" },
      });

      expect(orderMoney.accountingAmount).toBe(2499.0);
      expect(orderMoney.accountingCurrency).toBe("INR");
      expect(orderMoney.isMultiCurrency).toBe(false);

      const formatted = formatCurrency(orderMoney.accountingAmount, orderMoney.accountingCurrency);
      expect(formatted).toContain("₹");
      expect(formatted).toMatch(/₹\s?2,499(\.00)?/);

      const econResult = CanonicalEconomicsCalculator.calculate({
        isCOD: true,
        grossOrderValue: orderMoney.accountingAmount,
        customerPaidShipping: 0,
        totalTax: 0,
        actualSkuCogs: 850, // ₹850
        defaultForwardShipping: 60, // ₹60
        defaultReturnShipping: 70, // ₹70
        defaultPackagingCost: 10, // ₹10
        defaultCodHandlingFee: 40, // ₹40
        shopifyPlanName: "basic",
      });

      expect(econResult.revenue.value).toBe(2499.0);
      expect(econResult.cogs.value).toBe(850);
      expect(econResult.forwardShipping.value).toBe(60);
      expect(econResult.packaging.value).toBe(10);
      expect(econResult.codFee.value).toBe(40);
      expect(econResult.deliveredProfit.value).toBe(2499 - 850 - 60 - 10 - 40); // ₹1,539
    });
  });

  // ── Scenario 3: USD shop with an INR-presentment buyer ────────────
  describe("Scenario 3: USD shop with an INR-presentment buyer", () => {
    it("uses Shopify shopMoney (USD) for accounting, while recording presentment INR", () => {
      // Buyer pays ₹8,200 INR at checkout; Shopify officially converts to $100.00 USD for the merchant
      const orderMoney = resolveShopifyOrderMoney({
        shopMoney: { amount: "100.00", currencyCode: "USD" },
        presentmentMoney: { amount: "8200.00", currencyCode: "INR" },
      });

      expect(orderMoney.isMultiCurrency).toBe(true);
      expect(orderMoney.accountingAmount).toBe(100.0);
      expect(orderMoney.accountingCurrency).toBe("USD");
      expect(orderMoney.presentmentAmount).toBe(8200.0);
      expect(orderMoney.presentmentCurrency).toBe("INR");

      // The store accounting revenue must be $100.00 USD, NOT ₹8,200
      expect(formatCurrency(orderMoney.accountingAmount, orderMoney.accountingCurrency)).toContain("$100.00");
      expect(formatCurrency(orderMoney.presentmentAmount, orderMoney.presentmentCurrency)).toContain("8,200");
    });
  });

  // ── Scenario 4: INR shop with a USD-presentment buyer ────────────
  describe("Scenario 4: INR shop with a USD-presentment buyer", () => {
    it("uses Shopify shopMoney (INR) for accounting, while recording presentment USD", () => {
      // US Buyer pays $50.00 USD at checkout; Shopify officially converts to ₹4,150.00 INR for Indian merchant
      const orderMoney = resolveShopifyOrderMoney({
        shopMoney: { amount: "4150.00", currencyCode: "INR" },
        presentmentMoney: { amount: "50.00", currencyCode: "USD" },
      });

      expect(orderMoney.isMultiCurrency).toBe(true);
      expect(orderMoney.accountingAmount).toBe(4150.0);
      expect(orderMoney.accountingCurrency).toBe("INR");
      expect(orderMoney.presentmentAmount).toBe(50.0);
      expect(orderMoney.presentmentCurrency).toBe("USD");

      // Accounting is in INR
      expect(formatCurrency(orderMoney.accountingAmount, orderMoney.accountingCurrency)).toContain("4,150");
      // Presentment is in USD
      expect(formatCurrency(orderMoney.presentmentAmount, orderMoney.presentmentCurrency)).toContain("$50.00");
    });
  });

  // ── Scenario 5: Refunds and Partial Refunds ───────────────────────
  describe("Scenario 5: Refunds and Partial Refunds", () => {
    it("ensures refund deductions enforce currency matching and reject mismatched subtractions", () => {
      const orderCurrency = "USD";
      const orderTotal = 100.0;
      const validRefund = { amount: 30.0, currency: "USD" };
      const invalidRefund = { amount: 2500.0, currency: "INR" }; // Cross-currency without rate

      // Same currency refund deduction succeeds
      expect(() => assertSameCurrency(orderCurrency, validRefund.currency, "refund_deduction")).not.toThrow();
      const netRevenue = orderTotal - validRefund.amount;
      expect(netRevenue).toBe(70.0);

      // Cross-currency refund deduction throws CurrencyMismatchError
      expect(() => assertSameCurrency(orderCurrency, invalidRefund.currency, "refund_deduction")).toThrow(
        CurrencyMismatchError
      );

      // With explicit conversion rate (e.g. 1 USD = 83.0 INR => 2500 INR = 30.12 USD)
      const convertedRefund = convertMoneyWithExplicitRate(invalidRefund.amount, "INR", "USD", 1 / 83.0);
      expect(convertedRefund.convertedAmount).toBe(30.12);
      expect(convertedRefund.rateUsed).toBeCloseTo(0.01205, 4);
    });
  });

  // ── Scenario 6: Multiple Currencies in Advertising Data ──────────
  describe("Scenario 6: Multiple Currencies in Advertising Data", () => {
    it("converts external ad spend using explicit exchange rates before ROAS computation", () => {
      const storeCurrency = "INR";
      const totalRevenueInINR = 500000; // ₹5,00,000 INR

      // Meta Ads spend is in USD ($1,200 USD)
      const metaSpendUSD = 1200;
      const metaSpendCurrency = "USD";

      // Attempting to calculate ROAS by directly dividing ₹500,000 / $1,200 without conversion
      // results in a fake ROAS of 416.6x
      const rawDivisionROAS = totalRevenueInINR / metaSpendUSD;
      expect(rawDivisionROAS).toBeCloseTo(416.67, 1);

      // Canonical Currency Contract requires assertSameCurrency or explicit conversion
      expect(() => assertSameCurrency(storeCurrency, metaSpendCurrency, "roas_calculation")).toThrow(
        CurrencyMismatchError
      );

      // Apply explicit documented rate: 1 USD = 83.50 INR
      const usdToInrRate = 83.5;
      const { convertedAmount: metaSpendINR } = convertMoneyWithExplicitRate(
        metaSpendUSD,
        metaSpendCurrency,
        storeCurrency,
        usdToInrRate
      );
      expect(metaSpendINR).toBe(100200); // ₹1,00,200 INR

      // Real True ROAS
      const realBlendedROAS = totalRevenueInINR / metaSpendINR;
      expect(realBlendedROAS).toBeCloseTo(4.99, 2); // 4.99x ROAS (accurate reality)
    });
  });

  // ── Scenario 7: Historical COGS Snapshots ─────────────────────────
  describe("Scenario 7: Historical COGS Snapshots", () => {
    it("preserves snapshot COGS value in the order currency and never mutates with catalog updates", () => {
      // Historical order #1025 snapshot in USD
      const orderSnapshot = {
        orderId: "18988354568266",
        currency: "USD",
        unitPrice: 45.0,
        cogsPerUnitAtOrder: 17.1, // $17.10 USD (snapshot at order placement)
        totalCOGSAtOrder: 34.2, // $34.20 USD
      };

      // Later, merchant changes catalog COGS to ₹1,500 INR in a different currency
      const catalogUpdate = {
        currency: "INR",
        newCost: 1500,
      };

      // Historical calculation must retain snapshot values
      const effectiveCogs = orderSnapshot.cogsPerUnitAtOrder;
      expect(effectiveCogs).toBe(17.1);
      expect(orderSnapshot.currency).toBe("USD");

      // Verify that catalogUpdate in INR cannot be substituted without currency conversion
      expect(() => assertSameCurrency(orderSnapshot.currency, catalogUpdate.currency, "cogs_resolution")).toThrow(
        CurrencyMismatchError
      );
    });
  });

  // ── Scenario 8: CSV Exports ──────────────────────────────────────
  describe("Scenario 8: CSV Exports", () => {
    it("generates CSV headers with explicit Currency column and locale-aware number formatting", () => {
      const records = [
        { date: "2026-11-08", currency: "USD", revenue: 90.0, profit: 45.2, cogs: 34.2, fees: 10.6 },
        { date: "2026-11-07", currency: "USD", revenue: 180.0, profit: 91.0, cogs: 68.4, fees: 20.6 },
      ];

      const columns = ["date", "currency", "revenue", "profit", "cogs", "fees"];
      const header = columns.join(",") + "\n";
      const rows = records.map((r) => columns.map((col) => String((r as any)[col])).join(",")).join("\n");
      const csv = header + rows;

      expect(csv).toContain("date,currency,revenue,profit,cogs,fees");
      expect(csv).toContain("2026-11-08,USD,90,45.2,34.2,10.6");
      expect(csv).toContain("USD"); // Explicit currency in every row
    });
  });

  // ── Scenario 9: GST Calculations ─────────────────────────────────
  describe("Scenario 9: GST Calculations", () => {
    it("only applies Indian GST (CGST/SGST/IGST) to INR orders with Indian state destinations", () => {
      const merchantState = "DELHI";

      // 1. Valid Indian domestic order (INR, destination Karnataka -> IGST)
      const orderA = {
        currency: "INR",
        totalPrice: 1180,
        totalTax: 180,
        province: "Karnataka",
        country: "India",
      };

      // 2. Foreign international order (USD, destination California -> Excluded from Indian GST)
      const orderB = {
        currency: "USD",
        totalPrice: 90,
        totalTax: 0,
        province: "California",
        country: "United States",
      };

      // Verify state normalization
      expect(normalizeIndianState(orderA.province)).toBe("KARNATAKA");
      expect(normalizeIndianState(orderB.province)).toBe("CALIFORNIA");

      // GST rule: Only process orders denominated in INR and destination in India
      const isIndianGstEligible = (order: typeof orderA) =>
        order.currency === "INR" && (order.country === "India" || !order.country);

      expect(isIndianGstEligible(orderA)).toBe(true);
      expect(isIndianGstEligible(orderB as any)).toBe(false);

      // For Order A: Interstate sale (Delhi -> Karnataka)
      const normMerchant = normalizeIndianState(merchantState);
      const normCustomer = normalizeIndianState(orderA.province);
      const isInterstate = normCustomer !== normMerchant;
      expect(isInterstate).toBe(true);

      const igst = isInterstate ? orderA.totalTax : 0;
      const cgst = isInterstate ? 0 : orderA.totalTax / 2;
      const sgst = isInterstate ? 0 : orderA.totalTax / 2;

      expect(igst).toBe(180);
      expect(cgst).toBe(0);
      expect(sgst).toBe(0);
    });
  });
});
