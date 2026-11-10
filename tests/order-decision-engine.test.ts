import { describe, it, expect, vi, beforeEach } from "vitest";
import { DecisionEngineApplicationService } from "../app/application/decision/decision-engine.application";
import {
  DecisionRecordRepository,
  DecisionRecordSnapshot,
  OrderOutcomeSnapshot,
} from "../app/infrastructure/repositories/decision-record.repository";
import { CanonicalEconomicsCalculator } from "../app/services/economics/canonical-economics.calculator";
import { ShopifyService } from "../app/services/shopify.service";
import { ExecutionLogRepository } from "../app/infrastructure/repositories/execution-log.repository";
import { OrderRepository } from "../app/infrastructure/repositories/order.repository";
import { SettingsRepository } from "../app/infrastructure/repositories/settings.repository";
import { CustomerRepository } from "../app/infrastructure/repositories/customer.repository";
import { PincodeRepository } from "../app/infrastructure/repositories/pincode.repository";

describe("ProfitRx — Order Decision Engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const defaultSettings = {
    currency: "INR",
    defaultCOGSPct: 40,
    defaultForwardShipping: 60,
    defaultReturnShipping: 70,
    defaultPackaging: 10,
    defaultCODHandling: 40,
    defaultGatewayFeePct: 2,
    gatewayFixedFee: 0,
    shopifyPlanName: "basic",
    rulesRejectCodOver: 10000,
    rulesRequirePrepaidAbove: 5000,
    codBlockedPincodes: ["110006", "700001"],
  };

  // ── 1. Profitable, low-risk COD order ─────────────────────────
  describe("1. Profitable, low-risk COD order", () => {
    it("evaluates healthy margin, positive EV, and recommends ALLOW_COD", () => {
      const order = {
        id: "gid://shopify/Order/1001",
        orderNumber: 1001,
        totalPrice: 2500,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 800,
        actualShippingCost: 60,
        totalWeight: 500,
        currency: "INR",
        pincode: "560001",
        city: "Bengaluru",
        province: "Karnataka",
      };

      const result = DecisionEngineApplicationService.evaluateOrderDecision({
        order,
        settings: defaultSettings,
        customerRisk: { totalOrders: 1, successfulDeliveries: 1, rtoCount: 0 },
        pincodeStats: { rtoRate: 10, totalOrders: 50 },
      });

      expect(result.recommendation.action).toBe("ALLOW_COD");
      expect(result.recommendation.tone).toBe("success");
      expect(result.economics.deliveredContribution).toBeGreaterThan(1000);
      expect(result.economics.expectedContribution).toBeGreaterThan(0);
      expect(result.risk.riskBand).toBe("LOW");
    });
  });

  // ── 2. Profitable but high-risk COD order ──────────────────────
  describe("2. Profitable but high-risk COD order", () => {
    it("identifies high margin with elevated RTO risk and recommends VERIFY (OTP)", () => {
      const order = {
        id: "gid://shopify/Order/1002",
        orderNumber: 1002,
        totalPrice: 6500, // Exceeds requirePrepaidAbove (5000)
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 1500,
        actualShippingCost: 80,
        totalWeight: 800,
        currency: "INR",
        pincode: "841301",
        city: "Siwan",
        province: "Bihar",
      };

      const result = DecisionEngineApplicationService.evaluateOrderDecision({
        order,
        settings: defaultSettings,
        customerRisk: { totalOrders: 0, successfulDeliveries: 0, rtoCount: 0 },
        pincodeStats: { rtoRate: 40, totalOrders: 20 },
      });

      expect(result.recommendation.action).toBe("VERIFY");
      expect(result.recommendation.tone).toBe("attention");
      expect(result.recommendation.economicJustification).toContain("is economically justified");
      expect(result.risk.riskBand).toMatch(/HIGH|CRITICAL/);
      expect(result.economics.deliveredContribution).toBeGreaterThan(4000);
    });
  });

  // ── 3. Low-margin order with high RTO exposure ─────────────────
  describe("3. Low-margin order with high RTO exposure", () => {
    it("calculates negative expected payoff and recommends PREPAID_ONLY or BLOCK_COD", () => {
      const order = {
        id: "gid://shopify/Order/1003",
        orderNumber: 1003,
        totalPrice: 800,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 650, // very low gross profit of ₹150
        actualShippingCost: 100,
        totalWeight: 1200,
        currency: "INR",
        pincode: "201301",
      };

      const result = DecisionEngineApplicationService.evaluateOrderDecision({
        order,
        settings: {
          ...defaultSettings,
          defaultForwardShipping: 100,
          defaultReturnShipping: 120,
        },
        customerRisk: { totalOrders: 0, successfulDeliveries: 0, rtoCount: 0 },
        pincodeStats: { rtoRate: 45, totalOrders: 15 },
      });

      // Forward freight ₹100 + packaging ₹10 + COD fee ₹40 = ₹150 costs.
      // Net delivered profit <= 0, and RTO loss exposure is ₹250+.
      expect(result.economics.expectedContribution).toBeLessThan(0);
      expect(["BLOCK_COD", "PREPAID_ONLY"]).toContain(result.recommendation.action);
      expect(result.recommendation.explanation).toContain("Negative expected contribution");
    });
  });

  // ── 4. Repeat customer with successful delivery history ────────
  describe("4. Repeat customer with successful delivery history", () => {
    it("recognizes customer delivery track record and recommends ALLOW_COD even in average pincode", () => {
      const order = {
        id: "gid://shopify/Order/1004",
        orderNumber: 1004,
        totalPrice: 3200,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 1000,
        actualShippingCost: 60,
        currency: "INR",
        pincode: "110025",
      };

      const result = DecisionEngineApplicationService.evaluateOrderDecision({
        order,
        settings: defaultSettings,
        customerRisk: {
          totalOrders: 4,
          successfulDeliveries: 4,
          rtoCount: 0,
        },
        pincodeStats: { rtoRate: 25, totalOrders: 30 },
      });

      expect(result.recommendation.action).toBe("ALLOW_COD");
      expect(result.risk.customerSignals.hasDeliveryTrackRecord).toBe(true);
      expect(result.risk.riskFactors.some((f) => f.key === "VERIFIED_REPEAT_BUYER")).toBe(true);
    });
  });

  // ── 5. Missing COGS ───────────────────────────────────────────
  describe("5. Missing COGS", () => {
    it("gracefully falls back to default store percentage and flags incomplete data precision", () => {
      const order = {
        id: "gid://shopify/Order/1005",
        orderNumber: 1005,
        totalPrice: 2000,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: null, // missing SKU cost
        actualShippingCost: 60,
        currency: "INR",
        pincode: "400001",
      };

      const result = DecisionEngineApplicationService.evaluateOrderDecision({
        order,
        settings: { ...defaultSettings, defaultCOGSPct: 35 },
      });

      // Default 35% of ₹2,000 = ₹700
      expect(result.economics.cogs).toBe(700);
      expect(result.economics.cogsState).toBe("ESTIMATED");
      expect(result.economics.dataCompleteness.hasActualCogs).toBe(false);
      expect(result.economics.dataCompleteness.warnings).toContain("DEFAULT_COGS_USED");
    });
  });

  // ── 6. Missing shipping cost ──────────────────────────────────
  describe("6. Missing shipping cost", () => {
    it("falls back to default freight rates and marks shipping precision as estimated", () => {
      const order = {
        id: "gid://shopify/Order/1006",
        orderNumber: 1006,
        totalPrice: 1800,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 600,
        actualShippingCost: null, // missing courier shipping cost
        totalWeight: null,
        currency: "INR",
        pincode: "600001",
      };

      const result = DecisionEngineApplicationService.evaluateOrderDecision({
        order,
        settings: defaultSettings,
      });

      expect(result.economics.forwardShipping).toBe(60);
      expect(result.economics.dataCompleteness.hasActualShipping).toBe(false);
      expect(result.economics.dataCompleteness.warnings).toContain("DEFAULT_SHIPPING_USED");
    });
  });

  // ── 7. Insufficient historical risk data ───────────────────────
  describe("7. Insufficient historical risk data", () => {
    it("reports lower confidence and advisory rationale without claiming false certainty", () => {
      const order = {
        id: "gid://shopify/Order/1007",
        orderNumber: 1007,
        totalPrice: 1500,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 500,
        actualShippingCost: 60,
        currency: "INR",
        pincode: "799001", // Tripura newly encountered pincode
      };

      const result = DecisionEngineApplicationService.evaluateOrderDecision({
        order,
        settings: defaultSettings,
        customerRisk: null,
        pincodeStats: { totalOrders: 0, rtoRate: 0 },
      });

      expect(result.risk.confidence).toBeLessThan(0.75);
      expect(result.risk.customerSignals.isRepeatCustomer).toBe(false);
      expect(result.risk.pincodeHistory.totalOrders).toBe(0);
    });
  });

  // ── 8. Currency mismatch ──────────────────────────────────────
  describe("8. Currency mismatch", () => {
    it("detects store currency vs order currency difference and flags calculation completeness", () => {
      const order = {
        id: "gid://shopify/Order/1008",
        orderNumber: 1008,
        totalPrice: 45.0, // USD amount
        shippingPrice: 0,
        totalTax: 0,
        isCOD: false,
        cogsAtTimeOfOrder: 15.0,
        actualShippingCost: 5.0,
        currency: "USD", // Mismatched with INR store settings
        pincode: "90210",
      };

      const result = DecisionEngineApplicationService.evaluateOrderDecision({
        order,
        settings: { ...defaultSettings, currency: "INR" },
      });

      expect(result.economics.currencyMatch).toBe(false);
      expect(result.economics.expectedContributionState).toBe("INCOMPLETE");
      expect(result.economics.dataCompleteness.warnings.some((w) => w.includes("CURRENCY_MISMATCH"))).toBe(true);
    });
  });

  // ── 9. Merchant overriding a recommendation ───────────────────
  describe("9. Merchant overriding a recommendation", () => {
    it("records the override and preserves the original baseline recommendation in snapshot", async () => {
      const shop = "test-store.myshopify.com";
      const orderId = "gid://shopify/Order/1009";

      vi.spyOn(OrderRepository, "findById").mockResolvedValue({
        id: orderId,
        orderNumber: 1009,
        shop,
        merchantRecommendation: "VERIFY",
      } as any);

      vi.spyOn(OrderRepository, "updateDecision").mockResolvedValue();
      vi.spyOn(ExecutionLogRepository, "createLog").mockResolvedValue({} as any);
      vi.spyOn(DecisionRecordRepository, "recordOverride").mockResolvedValue();
      vi.spyOn(ShopifyService, "untagOrder").mockResolvedValue({ success: true, tags: [] } as any);

      const overrideResult = await DecisionEngineApplicationService.overrideDecision({
        shop,
        orderId,
        action: "ALLOW_COD",
        reason: "Customer verified via phone call",
        actor: "MERCHANT",
      });

      expect(overrideResult.success).toBe(true);
      expect(DecisionRecordRepository.recordOverride).toHaveBeenCalledWith(
        shop,
        orderId,
        expect.objectContaining({
          action: "ALLOW_COD",
          reason: "Customer verified via phone call",
          actor: "MERCHANT",
        })
      );
    });
  });

  // ── 10. Failed Shopify mutation ───────────────────────────────
  describe("10. Failed Shopify mutation", () => {
    it("truthfully reports failure status and logs execution error without claiming success", async () => {
      const shop = "test-store.myshopify.com";
      const orderId = "gid://shopify/Order/1010";

      vi.spyOn(OrderRepository, "findById").mockResolvedValue({
        id: orderId,
        orderNumber: 1010,
        shop,
      } as any);

      vi.spyOn(OrderRepository, "updateDecision").mockResolvedValue();
      vi.spyOn(ExecutionLogRepository, "createLog").mockResolvedValue({} as any);
      vi.spyOn(DecisionRecordRepository, "recordOverride").mockResolvedValue();
      // Simulate Shopify API failure
      vi.spyOn(ShopifyService, "tagOrder").mockResolvedValue({
        success: false,
        error: "GraphQL throttling rate limit exceeded",
      } as any);

      const result = await DecisionEngineApplicationService.overrideDecision({
        shop,
        orderId,
        action: "BLOCK_COD",
        reason: "Blocked due to risk",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed to tag order as blocked");
      expect(ExecutionLogRepository.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          step: "EXECUTION",
          status: "FAILED",
        })
      );
    });
  });

  // ── 11. Duplicate webhook delivery ────────────────────────────
  describe("11. Duplicate webhook delivery", () => {
    it("is completely idempotent and ignores duplicate deliveries for the same outcome", async () => {
      const shop = "test-store.myshopify.com";
      const orderId = "gid://shopify/Order/1011";

      const orderData = {
        id: orderId,
        shop,
        orderNumber: 1011,
        totalPrice: 2000,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 700,
        actualShippingCost: 60,
        fulfillmentStatus: "fulfilled",
      };

      vi.spyOn(OrderRepository, "findById").mockResolvedValue(orderData as any);
      vi.spyOn(SettingsRepository, "getByShop").mockResolvedValue(defaultSettings as any);

      // Call 1 (First delivery: outcome saved successfully)
      vi.spyOn(DecisionRecordRepository, "saveOutcomeSnapshot").mockResolvedValue(true);
      const call1 = await DecisionEngineApplicationService.processOrderOutcome(shop, {
        id: orderId,
        fulfillment_status: "fulfilled",
        financial_status: "paid",
        fulfillments: [{ shipment_status: "delivered" }],
      });
      expect(call1.outcomeState).toBe("DELIVERED");
      expect(call1.processed).toBe(true);

      // Call 2 (Duplicate Webhook Delivery: saveOutcomeSnapshot detects existing record and returns false)
      vi.spyOn(DecisionRecordRepository, "saveOutcomeSnapshot").mockResolvedValue(false);
      const call2 = await DecisionEngineApplicationService.processOrderOutcome(shop, {
        id: orderId,
        fulfillment_status: "fulfilled",
        financial_status: "paid",
        fulfillments: [{ shipment_status: "delivered" }],
      });
      expect(call2.processed).toBe(false); // Idempotently skipped
    });
  });

  // ── 12. Delivered order outcome ───────────────────────────────
  describe("12. Delivered order outcome", () => {
    it("calculates positive realized contribution profit upon delivery", async () => {
      const shop = "test-store.myshopify.com";
      const orderId = "gid://shopify/Order/1012";

      vi.spyOn(OrderRepository, "findById").mockResolvedValue({
        id: orderId,
        shop,
        orderNumber: 1012,
        totalPrice: 3000,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 1000,
        actualShippingCost: 60,
        fulfillmentStatus: "fulfilled",
      } as any);

      vi.spyOn(SettingsRepository, "getByShop").mockResolvedValue(defaultSettings as any);
      vi.spyOn(DecisionRecordRepository, "saveOutcomeSnapshot").mockResolvedValue(true);

      const result = await DecisionEngineApplicationService.processOrderOutcome(shop, {
        id: orderId,
        fulfillment_status: "fulfilled",
        financial_status: "paid",
        fulfillments: [{ shipment_status: "delivered" }],
      });

      expect(result.outcomeState).toBe("DELIVERED");
      // Revenue 3000 - COGS 1000 - Forward shipping 60 - Packaging 10 - COD fee 40 = +1890
      expect(result.realizedProfit).toBe(1890);
    });
  });

  // ── 13. RTO order outcome ─────────────────────────────────────
  describe("13. RTO order outcome", () => {
    it("calculates exact realized RTO loss without double-counting", async () => {
      const shop = "test-store.myshopify.com";
      const orderId = "gid://shopify/Order/1013";

      vi.spyOn(OrderRepository, "findById").mockResolvedValue({
        id: orderId,
        shop,
        orderNumber: 1013,
        totalPrice: 2000,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 800,
        actualShippingCost: 60,
        fulfillmentStatus: "rto",
      } as any);

      vi.spyOn(SettingsRepository, "getByShop").mockResolvedValue(defaultSettings as any);
      vi.spyOn(DecisionRecordRepository, "saveOutcomeSnapshot").mockResolvedValue(true);

      const result = await DecisionEngineApplicationService.processOrderOutcome(shop, {
        id: orderId,
        fulfillment_status: "rto",
      });

      expect(result.outcomeState).toBe("RTO");
      // Forward shipping 60 + Return shipping 70 + Packaging 10 + 10% inventory damage (80) = ₹220 loss
      expect(result.realizedProfit).toBe(-220);
    });
  });

  // ── 14. Historical recommendation snapshot remains unchanged ──
  describe("14. Historical recommendation snapshot remains unchanged after outcome updates", () => {
    it("preserves initial recommendation baseline even when order later RTOs", async () => {
      const shop = "test-store.myshopify.com";
      const orderId = "gid://shopify/Order/1014";

      const existingBaselineSnapshot: DecisionRecordSnapshot = {
        orderId,
        shop,
        recommendation: "VERIFY",
        reason: "Elevated risk requiring intent verification",
        riskScore: 65,
        riskBand: "HIGH",
        riskFactors: [],
        deliveredContribution: 1200,
        rtoLossExposure: 250,
        expectedContribution: 700,
        currency: "INR",
        dataCompleteness: {
          hasActualCogs: true,
          hasActualShipping: true,
          hasWeight: true,
          currencyMatch: true,
          warnings: [],
        },
        merchantAction: "VERIFY",
        isOverridden: false,
        createdAt: "2026-11-01T10:00:00.000Z",
      };

      vi.spyOn(DecisionRecordRepository, "getDecisionSnapshot").mockResolvedValue(existingBaselineSnapshot);
      vi.spyOn(DecisionRecordRepository, "getOutcomeSnapshot").mockResolvedValue({
        orderId,
        shop,
        outcomeState: "RTO",
        realizedProfit: -250,
        rtoLoss: 250,
        verifiedSavings: 0,
        explanation: "Returned to Origin",
        resolvedAt: "2026-11-05T14:30:00.000Z",
      });

      vi.spyOn(OrderRepository, "findById").mockResolvedValue({
        id: orderId,
        orderNumber: 1014,
        totalPrice: 2000,
        shippingPrice: 0,
        totalTax: 0,
        isCOD: true,
        cogsAtTimeOfOrder: 700,
        actualShippingCost: 60,
        createdAt: new Date("2026-11-01T10:00:00.000Z"),
      } as any);

      vi.spyOn(SettingsRepository, "getByShop").mockResolvedValue(defaultSettings as any);
      vi.spyOn(CustomerRepository, "findByCustomerId").mockResolvedValue(null);
      vi.spyOn(PincodeRepository, "findByPincode").mockResolvedValue(null);
      vi.spyOn(ExecutionLogRepository, "findByOrderId").mockResolvedValue([]);

      const card = await DecisionEngineApplicationService.getOrderDecisionCard(shop, orderId);

      // Verify baseline snapshot is intact
      expect(card?.decisionState.initialRecommendation).toBe("VERIFY");
      expect(card?.decisionState.decisionDate).toBe("2026-11-01T10:00:00.000Z");
      // Verify outcome comparison exists
      expect(card?.outcome?.outcomeState).toBe("RTO");
      expect(card?.outcome?.realizedProfit).toBe(-250);
      expect(card?.outcome?.comparison.estimatedExpectedValue).toBe(700);
      expect(card?.outcome?.comparison.actualRealized).toBe(-250);
      expect(card?.outcome?.comparison.variance).toBe(-950);
    });
  });
});
