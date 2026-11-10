import { describe, it, expect, vi, beforeEach } from "vitest";
import { calibrateRiskScoreToProbability } from "../../utils/risk-calibration";
import { DecisionEngineApplicationService } from "../decision/decision-engine.application";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { ExecutionLogRepository } from "../../infrastructure/repositories/execution-log.repository";
import { DecisionRecordRepository, OrderOutcomeSnapshot } from "../../infrastructure/repositories/decision-record.repository";
import { SubscriptionRepository } from "../../infrastructure/repositories/subscription.repository";
import { OrderApplicationService } from "./order.application";
import { ExecutionContextFactory } from "../../infrastructure/context/execution.context";
import { Pipeline } from "../pipeline/pipeline.interface";
import prisma from "../../db.server";

describe("Production Correctness Verification (5 Critical Checks)", () => {
  const shop = "test-store.myshopify.com";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Risk Calculation Check ────────────────────────────────────────────────
  describe("1. Risk calculation calibration", () => {
    it("never treats an uncalibrated 70/100 risk score as a 70% RTO probability", () => {
      const prob70 = calibrateRiskScoreToProbability(70, true);
      expect(prob70).toBe(0.42); // 42% probability, realistic for high-risk Indian COD
      expect(prob70).not.toBe(0.70);
    });

    it("calibrates baseline, medium, and high scores monotonically according to Indian eCommerce priors", () => {
      const low = calibrateRiskScoreToProbability(20, true);
      const med = calibrateRiskScoreToProbability(50, true);
      const high = calibrateRiskScoreToProbability(70, true);
      const critical = calibrateRiskScoreToProbability(85, true);

      expect(low).toBe(0.14);
      expect(med).toBe(0.28);
      expect(high).toBe(0.42);
      expect(critical).toBe(0.58);

      expect(low).toBeLessThan(med);
      expect(med).toBeLessThan(high);
      expect(high).toBeLessThan(critical);
    });
  });

  // ── 2. Order Outcomes Check ──────────────────────────────────────────────────
  describe("2. Order outcomes (Fulfilled != Delivered)", () => {
    it("keeps 'fulfilled' order as UNRESOLVED in transit until delivery is verified", async () => {
      vi.spyOn(OrderRepository, "findById").mockResolvedValue({
        id: "1001",
        shop,
        orderNumber: 1001,
        totalPrice: 1500,
        shippingPrice: 0,
        totalTax: 100,
        isCOD: true,
        fulfillmentStatus: "fulfilled",
        financialStatus: "pending",
      } as any);

      vi.spyOn(SettingsRepository, "getByShop").mockResolvedValue({
        shop,
        defaultCOGSPct: 40,
        defaultForwardShipping: 60,
        defaultReturnShipping: 70,
        defaultPackaging: 10,
        defaultCODHandling: 40,
        rtoDetectionPattern: "rto,returned,undelivered",
      } as any);

      // Shopify payload where order is merely fulfilled/shipped (in transit), NOT delivered
      const payload = {
        id: "1001",
        fulfillment_status: "fulfilled",
        financial_status: "pending",
        fulfillments: [
          { status: "success", shipment_status: "in_transit" },
        ],
        tags: "",
      };

      const result = await DecisionEngineApplicationService.processOrderOutcome(shop, payload);

      expect(result.processed).toBe(false);
      expect(result.outcomeState).toBe("UNRESOLVED");
      expect(result.realizedProfit).toBe(0);
    });

    it("marks DELIVERED only when shipment_status is delivered or COD cash is paid", async () => {
      vi.spyOn(OrderRepository, "findById").mockResolvedValue({
        id: "1002",
        shop,
        orderNumber: 1002,
        totalPrice: 2000,
        shippingPrice: 0,
        totalTax: 100,
        isCOD: true,
        fulfillmentStatus: "fulfilled",
        financialStatus: "paid", // Cash collected!
      } as any);

      vi.spyOn(SettingsRepository, "getByShop").mockResolvedValue({
        shop,
        defaultCOGSPct: 40,
        defaultForwardShipping: 60,
        defaultReturnShipping: 70,
        defaultPackaging: 10,
        defaultCODHandling: 40,
      } as any);

      vi.spyOn(DecisionRecordRepository, "saveOutcomeSnapshot").mockResolvedValue(true);

      const payload = {
        id: "1002",
        fulfillment_status: "fulfilled",
        financial_status: "paid",
        fulfillments: [
          { status: "success", shipment_status: "delivered" },
        ],
        tags: "delivered",
      };

      const result = await DecisionEngineApplicationService.processOrderOutcome(shop, payload);

      expect(result.processed).toBe(true);
      expect(result.outcomeState).toBe("DELIVERED");
      expect(result.realizedProfit).toBeGreaterThan(0);
    });

    it("correctly detects RTO when shipment status indicates courier failure or return", async () => {
      vi.spyOn(OrderRepository, "findById").mockResolvedValue({
        id: "1003",
        shop,
        orderNumber: 1003,
        totalPrice: 2000,
        shippingPrice: 0,
        totalTax: 100,
        isCOD: true,
        fulfillmentStatus: "fulfilled",
        financialStatus: "pending",
      } as any);

      vi.spyOn(SettingsRepository, "getByShop").mockResolvedValue({
        shop,
        defaultCOGSPct: 40,
        defaultForwardShipping: 60,
        defaultReturnShipping: 70,
        defaultPackaging: 10,
        defaultCODHandling: 40,
      } as any);

      vi.spyOn(DecisionRecordRepository, "saveOutcomeSnapshot").mockResolvedValue(true);

      const payload = {
        id: "1003",
        fulfillment_status: "fulfilled",
        financial_status: "pending",
        fulfillments: [
          { status: "failure", shipment_status: "rto" },
        ],
        tags: "delhivery_rto",
      };

      const result = await DecisionEngineApplicationService.processOrderOutcome(shop, payload);

      expect(result.processed).toBe(true);
      expect(result.outcomeState).toBe("RTO");
      expect(result.realizedProfit).toBeLessThan(0); // Realized loss
    });
  });

  // ── 3. COD Actions Check ─────────────────────────────────────────────────────
  describe("3. COD actions semantics", () => {
    it("clearly identifies operational hold tags without claiming gateway mutation on placed orders", async () => {
      vi.spyOn(OrderRepository, "findById").mockResolvedValue({
        id: "2001",
        orderNumber: 2001,
        totalPrice: 2500,
        isCOD: true,
      } as any);

      vi.spyOn(OrderRepository, "updateDecision").mockResolvedValue(undefined);
      const logSpy = vi.spyOn(ExecutionLogRepository, "createLog").mockResolvedValue({ id: "log-1" } as any);
      vi.spyOn(DecisionRecordRepository, "recordOverride").mockResolvedValue(undefined);

      const res = await DecisionEngineApplicationService.overrideDecision({
        shop,
        orderId: "2001",
        action: "BLOCK_COD",
        reason: "High risk pincode",
        actor: "MERCHANT",
      });

      expect(res.success).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          step: "EXECUTION",
          message: expect.stringContaining("fulfillment hold"),
        })
      );
    });
  });

  // ── 4. Financial Assumptions Check ───────────────────────────────────────────
  describe("4. Financial assumptions clarity & configurability", () => {
    it("supports configurable inventory damage rate and clearly identifies OTP cost estimate", async () => {
      vi.spyOn(prisma.storeSettings, "findUnique").mockResolvedValue({
        shop,
        protectionMode: "OBSERVE",
        rulesRejectCodOver: null,
        rulesRequirePrepaidAbove: null,
        shippingSlabs: {
          _financialAssumptions: {
            inventoryDamagePct: 15,
            otpCost: 12,
          },
        },
      } as any);

      const policy = await SettingsRepository.getMerchantPolicy(shop);
      expect(policy.inventoryDamagePct).toBe(15);
      expect(policy.otpCost).toBe(12);
    });
  });

  // ── 5. Idempotency Check ─────────────────────────────────────────────────────
  describe("5. Idempotency under concurrent webhook deliveries", () => {
    it("prevents duplicate DECISION_RECORD snapshots during simultaneous calls", async () => {
      const orderId = "gid://shopify/Order/99999";
      let executionLogCount = 0;

      vi.spyOn(ExecutionLogRepository, "findByOrderId").mockImplementation(async () => {
        if (executionLogCount > 0) {
          return [{ step: "DECISION_RECORD", data: { recommendation: "ALLOW_COD" } } as any];
        }
        return [];
      });

      vi.spyOn(ExecutionLogRepository, "createLog").mockImplementation(async () => {
        executionLogCount++;
        return { id: "log-1" } as any;
      });

      const snapshot = {
        orderId,
        shop,
        recommendation: "ALLOW_COD" as const,
        reason: "Low risk",
        riskScore: 20,
        riskBand: "LOW" as const,
        riskFactors: [],
        deliveredContribution: 500,
        rtoLossExposure: 200,
        expectedContribution: 400,
        currency: "INR",
        dataCompleteness: { hasActualCogs: true, hasActualShipping: true, hasWeight: false, currencyMatch: true, warnings: [] },
        merchantAction: "ALLOW_COD",
        isOverridden: false,
        createdAt: new Date().toISOString(),
      };

      // Simulate 5 concurrent webhook threads attempting to save decision snapshot simultaneously
      await Promise.all([
        DecisionRecordRepository.saveDecisionSnapshot(shop, orderId, snapshot),
        DecisionRecordRepository.saveDecisionSnapshot(shop, orderId, snapshot),
        DecisionRecordRepository.saveDecisionSnapshot(shop, orderId, snapshot),
        DecisionRecordRepository.saveDecisionSnapshot(shop, orderId, snapshot),
        DecisionRecordRepository.saveDecisionSnapshot(shop, orderId, snapshot),
      ]);

      // Strictly exactly 1 log record created despite 5 concurrent calls!
      expect(executionLogCount).toBe(1);
    });

    it("prevents duplicate OUTCOME_RECORD snapshots during simultaneous webhook calls", async () => {
      const orderId = "gid://shopify/Order/88888";
      let outcomeLogCount = 0;

      vi.spyOn(ExecutionLogRepository, "findByOrderId").mockImplementation(async () => {
        if (outcomeLogCount > 0) {
          return [{ step: "OUTCOME_RECORD", data: { outcomeState: "DELIVERED" } } as any];
        }
        return [];
      });

      vi.spyOn(ExecutionLogRepository, "createLog").mockImplementation(async () => {
        outcomeLogCount++;
        return { id: "log-2" } as any;
      });

      const outcome: OrderOutcomeSnapshot = {
        orderId,
        shop,
        outcomeState: "DELIVERED",
        realizedProfit: 650,
        rtoLoss: 0,
        verifiedSavings: 0,
        explanation: "Verified delivered",
        resolvedAt: new Date().toISOString(),
      };

      // Simulate 5 concurrent webhook calls for same outcome
      const results = await Promise.all([
        DecisionRecordRepository.saveOutcomeSnapshot(shop, orderId, outcome),
        DecisionRecordRepository.saveOutcomeSnapshot(shop, orderId, outcome),
        DecisionRecordRepository.saveOutcomeSnapshot(shop, orderId, outcome),
        DecisionRecordRepository.saveOutcomeSnapshot(shop, orderId, outcome),
        DecisionRecordRepository.saveOutcomeSnapshot(shop, orderId, outcome),
      ]);

      // Exactly 1 log recorded
      expect(outcomeLogCount).toBe(1);
      // Exactly 1 returned true (processed), others returned false (skipped)
      expect(results.filter(Boolean).length).toBe(1);
    });

    it("OrderApplicationService skips duplicate concurrent pipeline execution for same order", async () => {
      const orderId = "99009";
      let pipelineExecutionCount = 0;

      vi.spyOn(OrderRepository, "findById").mockResolvedValue(null);
      vi.spyOn(OrderRepository, "updateDecision").mockImplementation(async () => {});
      vi.spyOn(SubscriptionRepository, "checkOrderQuota").mockResolvedValue({
        allowed: true,
        quotaExceeded: false,
        plan: "GROWTH",
        orderLimit: 2000,
        ordersUsed: 50,
        remaining: 1950,
      });
      vi.spyOn(SubscriptionRepository, "recordOrderUsage").mockResolvedValue({} as any);

      // Mock pipeline execute to simulate synchronous work
      vi.spyOn(Pipeline.prototype, "execute").mockImplementation(async () => {
        pipelineExecutionCount++;
        await new Promise((r) => setTimeout(r, 20));
        return { finalDecision: "ALLOW_COD", riskScore: 20 } as any;
      });

      const context = ExecutionContextFactory.create(shop, orderId, "trace-1");
      const rawOrder = {
        id: orderId,
        total_price: "1500",
        financial_status: "pending",
        isCOD: true,
        payment_gateway_names: ["Cash on Delivery"],
      };

      // Fire 3 simultaneous order processing calls
      await Promise.all([
        OrderApplicationService.processOrder(context, rawOrder),
        OrderApplicationService.processOrder(context, rawOrder),
        OrderApplicationService.processOrder(context, rawOrder),
      ]);

      // Only 1 execution was permitted by the concurrent lock
      expect(pipelineExecutionCount).toBe(1);
    });
  });
});
