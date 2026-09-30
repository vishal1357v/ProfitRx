import prisma from "../../db.server";

export interface RetentionCleanupResult {
  otpsPurged: number;
  executionLogsPurged: number;
  accessLogsPurged: number;
  shopRedactions?: {
    processed: number;
    completed: number;
    cancelledReinstalled: number;
    failed: number;
    deadLetterCount?: number;
    details: Array<{ shop: string; status: string; error?: string }>;
  };
  timestamp: string;
}

export class RetentionCleanupService {
  /**
   * Purges one-time OTP codes that have already been verified OR are older than 48 hours.
   * Clears the plain text OTP code while preserving verification status and audit metadata.
   */
  static async purgeExpiredOtps(maxAgeHours: number = 48): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    try {
      const result = await (prisma as any).cODOrder.updateMany({
        where: {
          otp: { not: null },
          OR: [
            { otpVerified: true },
            { createdAt: { lt: cutoffDate } },
          ],
        },
        data: {
          otp: null,
        },
      });

      return result.count;
    } catch (err: any) {
      // In Neon HTTP mode, Prisma wraps updateMany in an unsupported transaction.
      // Fall back to parameterized Prisma SQL which is fully supported over HTTP.
      if (err?.message?.includes("Transactions are not supported") || err?.message?.includes("HTTP mode")) {
        const count = await prisma.$executeRaw`
          UPDATE "cod_orders"
          SET otp = NULL
          WHERE otp IS NOT NULL
            AND ("otpVerified" = TRUE OR "createdAt" < ${cutoffDate})
        `;
        return Number(count);
      }
      throw err;
    }
  }

  /**
   * Purges operational execution logs older than retention period (default: 90 days).
   * Prevents unnecessary accumulation of pipeline diagnostics containing order references.
   */
  static async purgeOldExecutionLogs(maxAgeDays: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    const result = await (prisma as any).executionLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }

  /**
   * Purges customer data access audit logs older than retention period (default: 180 days).
   * Level 2 compliance requires active audit trails, but logs must not be held indefinitely.
   */
  static async purgeOldAccessLogs(maxAgeDays: number = 180): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    const result = await (prisma as any).customerDataAccessLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }

  /**
   * Processes all pending and failed GDPR shop redaction requests.
   * Purges all 22 shop-scoped models with tenant isolation, safe retry, and reinstall race protection.
   */
  static async processPendingShopRedactions(): Promise<{
    processed: number;
    completed: number;
    cancelledReinstalled: number;
    failed: number;
    details: Array<{ shop: string; status: string; error?: string }>;
  }> {
    const results = {
      processed: 0,
      completed: 0,
      cancelledReinstalled: 0,
      failed: 0,
      deadLetterCount: 0,
      details: [] as Array<{ shop: string; status: string; error?: string }>,
    };

    let pendingRequests: any[] = [];
    try {
      pendingRequests = await (prisma as any).shopRedactionRequest.findMany({
        where: {
          status: { in: ["PENDING", "FAILED"] },
          attempts: { lt: 5 },
        },
        orderBy: { requestedAt: "asc" },
        take: 5,
      });
    } catch (err: any) {
      console.warn("[RetentionCleanup] Could not query shopRedactionRequest (table may be syncing):", err?.message || err);
      return results;
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      return results;
    }

    for (const req of pendingRequests) {
      results.processed++;
      const targetShop = req.shop;

      // 1. Reinstall Race Guard: check if shop reinstalled (active offline session updated after redaction request)
      try {
        const activeSession = await (prisma as any).session.findFirst({
          where: {
            shop: targetShop,
            isOnline: false,
            accessToken: { not: null },
            updatedAt: { gt: req.requestedAt },
          },
        });

        if (activeSession) {
          console.log(`[RetentionCleanup] Shop ${targetShop} reinstalled after redaction request. Cancelling redaction.`);
          await (prisma as any).shopRedactionRequest.update({
            where: { id: req.id },
            data: {
              status: "CANCELLED_REINSTALLED",
              lastError: `Active session detected (reinstalled at ${activeSession.updatedAt.toISOString()})`,
              updatedAt: new Date(),
            },
          });
          results.cancelledReinstalled++;
          results.details.push({ shop: targetShop, status: "CANCELLED_REINSTALLED" });
          continue;
        }
      } catch (sessionErr: any) {
        console.warn(`[RetentionCleanup] Error checking session for ${targetShop}:`, sessionErr?.message || sessionErr);
      }

      // 2. Mark PROCESSING and increment attempts
      try {
        await (prisma as any).shopRedactionRequest.update({
          where: { id: req.id },
          data: {
            status: "PROCESSING",
            attempts: { increment: 1 },
            updatedAt: new Date(),
          },
        });
      } catch (updErr: any) {
        console.error(`[RetentionCleanup] Could not transition ${req.id} to PROCESSING:`, updErr?.message || updErr);
      }

      // 3. Purge all 22 shop-scoped models with strict tenant isolation
      console.log(`[RetentionCleanup] Executing full data purge across all models for shop: ${targetShop}`);
      const deletionOperations: Array<{ name: string; promise: Promise<any> }> = [
        { name: "orderLineItem", promise: (prisma as any).orderLineItem.deleteMany({ where: { shop: targetShop } }) },
        { name: "orderRefund", promise: (prisma as any).orderRefund.deleteMany({ where: { shop: targetShop } }) },
        { name: "executionLog", promise: (prisma as any).executionLog.deleteMany({ where: { shop: targetShop } }) },
        { name: "order", promise: (prisma as any).order.deleteMany({ where: { shop: targetShop } }) },
        { name: "productCOGS", promise: (prisma as any).productCOGS.deleteMany({ where: { shop: targetShop } }) },
        { name: "variantCOGS", promise: (prisma as any).variantCOGS.deleteMany({ where: { shop: targetShop } }) },
        { name: "rTOEvent", promise: (prisma as any).rTOEvent.deleteMany({ where: { shop: targetShop } }) },
        { name: "alert", promise: (prisma as any).alert.deleteMany({ where: { shop: targetShop } }) },
        { name: "subscription", promise: (prisma as any).subscription.deleteMany({ where: { shop: targetShop } }) },
        { name: "storeSettings", promise: (prisma as any).storeSettings.deleteMany({ where: { shop: targetShop } }) },
        { name: "pincodeStats", promise: (prisma as any).pincodeStats.deleteMany({ where: { shop: targetShop } }) },
        { name: "customerProfile", promise: (prisma as any).customerProfile.deleteMany({ where: { shop: targetShop } }) },
        { name: "customerRisk", promise: (prisma as any).customerRisk.deleteMany({ where: { shop: targetShop } }) },
        { name: "cODOrder", promise: (prisma as any).cODOrder.deleteMany({ where: { shop: targetShop } }) },
        { name: "adSpend", promise: (prisma as any).adSpend.deleteMany({ where: { shop: targetShop } }) },
        { name: "adSpendDaily", promise: (prisma as any).adSpendDaily.deleteMany({ where: { shop: targetShop } }) },
        { name: "profitSnapshot", promise: (prisma as any).profitSnapshot.deleteMany({ where: { shop: targetShop } }) },
        { name: "aISearchQuery", promise: (prisma as any).aISearchQuery.deleteMany({ where: { shop: targetShop } }) },
        { name: "healthScore", promise: (prisma as any).healthScore.deleteMany({ where: { shop: targetShop } }) },
        { name: "learningRecord", promise: (prisma as any).learningRecord.deleteMany({ where: { shop: targetShop } }) },
        { name: "customerDataAccessLog", promise: (prisma as any).customerDataAccessLog.deleteMany({ where: { shop: targetShop } }) },
        { name: "session", promise: (prisma as any).session.deleteMany({ where: { shop: targetShop } }) },
      ];

      const deleteResults = await Promise.allSettled(deletionOperations.map((op) => op.promise));
      const failures: string[] = [];

      deleteResults.forEach((res, index) => {
        if (res.status === "rejected") {
          const reasonStr = res.reason instanceof Error ? res.reason.message : String(res.reason);
          failures.push(`${deletionOperations[index].name}: ${reasonStr}`);
        }
      });

      // 4. Update request status based on result
      if (failures.length > 0) {
        const errorDetails = failures.join("; ");
        const currentAttempts = (req.attempts || 0) + 1;
        console.error(`[RetentionCleanup] Partial failure purging data for ${targetShop} (attempt ${currentAttempts}/5): ${errorDetails}`);
        
        await (prisma as any).shopRedactionRequest.update({
          where: { id: req.id },
          data: {
            status: "FAILED",
            lastError: errorDetails,
            updatedAt: new Date(),
          },
        });
        results.failed++;
        results.details.push({ shop: targetShop, status: "FAILED", error: errorDetails });

        // DEAD-LETTER ALERT: Emit critical alert when maximum retry limit is reached
        if (currentAttempts >= 5) {
          console.error(
            `[CRITICAL_COMPLIANCE_ALERT] ShopRedactionRequest ${req.id} for shop ${targetShop} reached maximum retry limit (${currentAttempts} attempts). Webhook ID: ${req.webhookId || "N/A"}. Request is now excluded from automatic retry processing and requires manual operational intervention to satisfy Shopify PCD within 30 days! Diagnostic: ${errorDetails}`
          );
        }
      } else {
        await (prisma as any).shopRedactionRequest.update({
          where: { id: req.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          },
        });
        console.log(`[RetentionCleanup] Successfully completed durable redaction for shop: ${targetShop}`);
        results.completed++;
        results.details.push({ shop: targetShop, status: "COMPLETED" });
      }
    }

    // Surface any existing or newly exhausted requests in dead-letter state
    try {
      const deadLetterCount = await (prisma as any).shopRedactionRequest.count({
        where: {
          status: "FAILED",
          attempts: { gte: 5 },
        },
      });
      results.deadLetterCount = deadLetterCount;
      if (deadLetterCount > 0) {
        console.error(
          `[CRITICAL_COMPLIANCE_ALERT] ${deadLetterCount} GDPR Shop Redaction request(s) are in DEAD_LETTER state (attempts >= 5). These requests are excluded from automatic cron retries and require manual operational intervention to satisfy Shopify PCD within 30 days.`
        );
      }
    } catch (countErr: any) {
      console.warn("[RetentionCleanup] Could not count dead-letter redaction requests:", countErr?.message || countErr);
    }

    return results;
  }

  /**
   * Executes the full automated retention maintenance routine.
   * Safe and idempotent. Can be executed on a scheduled basis.
   */
  static async runScheduledCleanup(): Promise<RetentionCleanupResult> {
    // Run sequentially to prevent connection multiplexing issues in Neon HTTP mode
    const otpsPurged = await this.purgeExpiredOtps(48);
    const executionLogsPurged = await this.purgeOldExecutionLogs(90);
    const accessLogsPurged = await this.purgeOldAccessLogs(180);
    const shopRedactions = await this.processPendingShopRedactions();

    return {
      otpsPurged,
      executionLogsPurged,
      accessLogsPurged,
      shopRedactions,
      timestamp: new Date().toISOString(),
    };
  }
}

