import prisma from "../../db.server";

export interface RetentionCleanupResult {
  otpsPurged: number;
  executionLogsPurged: number;
  accessLogsPurged: number;
  timestamp: string;
}

export class RetentionCleanupService {
  /**
   * Purges one-time OTP codes that have already been verified OR are older than 48 hours.
   * Clears the plain text OTP code while preserving verification status and audit metadata.
   */
  static async purgeExpiredOtps(maxAgeHours: number = 48): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

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
   * Executes the full automated retention maintenance routine.
   * Safe and idempotent. Can be executed on a scheduled basis.
   */
  static async runScheduledCleanup(): Promise<RetentionCleanupResult> {
    const [otpsPurged, executionLogsPurged, accessLogsPurged] = await Promise.all([
      this.purgeExpiredOtps(48),
      this.purgeOldExecutionLogs(90),
      this.purgeOldAccessLogs(180),
    ]);

    return {
      otpsPurged,
      executionLogsPurged,
      accessLogsPurged,
      timestamp: new Date().toISOString(),
    };
  }
}
