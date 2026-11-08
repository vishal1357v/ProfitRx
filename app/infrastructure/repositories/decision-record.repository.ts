import prisma from "../../db.server";
import { ExecutionLogRepository } from "./execution-log.repository";

export interface DecisionRecordSnapshot {
  orderId: string;
  shop: string;
  recommendation: "ALLOW_COD" | "VERIFY" | "PREPAID_ONLY" | "BLOCK_COD";
  reason: string;
  riskScore: number;
  riskBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskFactors: Array<{ key: string; contribution: number; explanation: string }>;
  deliveredContribution: number;
  rtoLossExposure: number;
  expectedContribution: number;
  currency: string;
  dataCompleteness: {
    hasActualCogs: boolean;
    hasActualShipping: boolean;
    hasWeight: boolean;
    currencyMatch: boolean;
    warnings: string[];
  };
  merchantAction: string;
  isOverridden: boolean;
  overrideReason?: string;
  executionResult?: {
    status: string;
    message: string;
    timestamp: string;
  };
  createdAt: string;
}

export interface OrderOutcomeSnapshot {
  orderId: string;
  shop: string;
  outcomeState: "DELIVERED" | "RTO" | "CANCELLED" | "UNRESOLVED";
  realizedProfit: number;
  rtoLoss: number;
  verifiedSavings: number;
  explanation: string;
  resolvedAt: string;
}

export interface DecisionPerformanceSummary {
  totalReviewed: number;
  acceptedCount: number;
  overriddenCount: number;
  deliveredCount: number;
  rtoCount: number;
  cancelledCount: number;
  actualRtoLoss: number;
  totalDeliveredProfit: number;
  totalVerifiedSavings: number;
  estimatedEVTotal: number;
  realizedProfitTotal: number;
}

export class DecisionRecordRepository {
  private static inFlightLocks = new Map<string, number>();

  private static acquireLock(key: string, ttlMs = 5000): boolean {
    const now = Date.now();
    const expiry = this.inFlightLocks.get(key);
    if (expiry && expiry > now) {
      return false; // active lock exists
    }
    this.inFlightLocks.set(key, now + ttlMs);
    if (this.inFlightLocks.size > 1000) {
      for (const [k, exp] of this.inFlightLocks.entries()) {
        if (exp <= now) this.inFlightLocks.delete(k);
      }
    }
    return true;
  }

  private static releaseLock(key: string): void {
    this.inFlightLocks.delete(key);
  }

  /**
   * Retrieves the initial baseline decision record snapshot for an order.
   */
  static async getDecisionSnapshot(shop: string, orderId: string): Promise<DecisionRecordSnapshot | null> {
    const logs = await ExecutionLogRepository.findByOrderId(shop, orderId);
    const decisionLog = logs.find((l) => l.step === "DECISION_RECORD");
    if (!decisionLog || !decisionLog.data) return null;
    return decisionLog.data as DecisionRecordSnapshot;
  }

  /**
   * Persists a decision record snapshot idempotently.
   * Preserves original baseline creation timestamp if already exists.
   * Concurrency-safe against duplicate webhook arrivals.
   */
  static async saveDecisionSnapshot(
    shop: string,
    orderId: string,
    snapshot: DecisionRecordSnapshot
  ): Promise<void> {
    const lockKey = `${shop}:${orderId}:DECISION_LOCK`;
    if (!this.acquireLock(lockKey)) {
      return; // Concurrently being processed by another webhook delivery
    }
    try {
      const existing = await this.getDecisionSnapshot(shop, orderId);
      if (existing) {
        // If already recorded, preserve original baseline recommendation & timestamp
        return;
      }

      await ExecutionLogRepository.createLog({
        shop,
        orderId,
        step: "DECISION_RECORD",
        status: "SUCCESS",
        message: `ProfitRx decision: ${snapshot.recommendation}. Reason: ${snapshot.reason}`,
        data: snapshot,
      });
    } finally {
      this.releaseLock(lockKey);
    }
  }

  /**
   * Records a merchant override on a decision record.
   */
  static async recordOverride(
    shop: string,
    orderId: string,
    override: {
      previousDecision?: string;
      newDecision?: string;
      action: string;
      reason: string;
      actor: string;
      timestamp: string;
      executionResult?: { status: string; message: string };
    }
  ): Promise<void> {
    await ExecutionLogRepository.createLog({
      shop,
      orderId,
      step: "MERCHANT_OVERRIDE",
      status: override.executionResult?.status === "FAILED" ? "FAILED" : "SUCCESS",
      message: `Merchant changed decision to ${override.action}. Reason: ${override.reason}`,
      data: {
        previousDecision: override.previousDecision || override.action,
        newDecision: override.newDecision || override.action,
        action: override.action,
        reason: override.reason,
        actor: override.actor,
        timestamp: override.timestamp,
        executionResult: override.executionResult,
      },
    });
  }

  /**
   * Retrieves the outcome snapshot for an order.
   */
  static async getOutcomeSnapshot(shop: string, orderId: string): Promise<OrderOutcomeSnapshot | null> {
    const logs = await ExecutionLogRepository.findByOrderId(shop, orderId);
    const outcomeLog = [...logs].reverse().find((l) => l.step === "OUTCOME_RECORD");
    if (!outcomeLog || !outcomeLog.data) return null;
    return outcomeLog.data as OrderOutcomeSnapshot;
  }

  /**
   * Records an order outcome idempotently.
   * Avoids duplicate records if the outcome state has not changed.
   * Concurrency-safe against simultaneous webhook arrivals.
   */
  static async saveOutcomeSnapshot(
    shop: string,
    orderId: string,
    outcome: OrderOutcomeSnapshot
  ): Promise<boolean> {
    const lockKey = `${shop}:${orderId}:OUTCOME_LOCK`;
    if (!this.acquireLock(lockKey)) {
      return false; // Concurrently being processed by another webhook delivery
    }
    try {
      const existing = await this.getOutcomeSnapshot(shop, orderId);
      if (existing && existing.outcomeState === outcome.outcomeState) {
        // Idempotent: outcome already recorded with same state
        return false;
      }

      await ExecutionLogRepository.createLog({
        shop,
        orderId,
        step: "OUTCOME_RECORD",
        status: "SUCCESS",
        message: `Order outcome finalized as ${outcome.outcomeState}. Realized Profit: ₹${Math.round(outcome.realizedProfit)}`,
        data: outcome,
      });

      return true;
    } finally {
      this.releaseLock(lockKey);
    }
  }

  /**
   * Aggregates decision and outcome metrics across recent shop orders.
   */
  static async getDecisionSummary(shop: string, limit = 100): Promise<DecisionPerformanceSummary> {
    const logs = await ExecutionLogRepository.findByShop(shop, limit * 4);

    const decisionMap = new Map<string, DecisionRecordSnapshot>();
    const overrideSet = new Set<string>();
    const outcomeMap = new Map<string, OrderOutcomeSnapshot>();

    for (const log of logs) {
      const orderId = log.orderId;
      if (log.step === "DECISION_RECORD" && log.data) {
        if (!decisionMap.has(orderId)) {
          decisionMap.set(orderId, log.data as DecisionRecordSnapshot);
        }
      }
      if (log.step === "MERCHANT_OVERRIDE") {
        overrideSet.add(orderId);
      }
      if (log.step === "OUTCOME_RECORD" && log.data) {
        if (!outcomeMap.has(orderId)) {
          outcomeMap.set(orderId, log.data as OrderOutcomeSnapshot);
        }
      }
    }

    let totalReviewed = decisionMap.size;
    let overriddenCount = 0;
    for (const orderId of decisionMap.keys()) {
      if (overrideSet.has(orderId)) {
        overriddenCount++;
      }
    }
    const acceptedCount = Math.max(0, totalReviewed - overriddenCount);

    let deliveredCount = 0;
    let rtoCount = 0;
    let cancelledCount = 0;
    let actualRtoLoss = 0;
    let totalDeliveredProfit = 0;
    let totalVerifiedSavings = 0;
    let estimatedEVTotal = 0;
    let realizedProfitTotal = 0;

    for (const d of decisionMap.values()) {
      estimatedEVTotal += Number(d.expectedContribution) || 0;
    }

    for (const o of outcomeMap.values()) {
      if (o.outcomeState === "DELIVERED") {
        deliveredCount++;
        totalDeliveredProfit += Math.max(0, o.realizedProfit);
        realizedProfitTotal += o.realizedProfit;
      } else if (o.outcomeState === "RTO") {
        rtoCount++;
        actualRtoLoss += o.rtoLoss;
        realizedProfitTotal += o.realizedProfit;
      } else if (o.outcomeState === "CANCELLED") {
        cancelledCount++;
        totalVerifiedSavings += o.verifiedSavings;
        realizedProfitTotal += o.realizedProfit;
      }
    }

    return {
      totalReviewed,
      acceptedCount,
      overriddenCount,
      deliveredCount,
      rtoCount,
      cancelledCount,
      actualRtoLoss: Math.round(actualRtoLoss),
      totalDeliveredProfit: Math.round(totalDeliveredProfit),
      totalVerifiedSavings: Math.round(totalVerifiedSavings),
      estimatedEVTotal: Math.round(estimatedEVTotal),
      realizedProfitTotal: Math.round(realizedProfitTotal),
    };
  }
}
