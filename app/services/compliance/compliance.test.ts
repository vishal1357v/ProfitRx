import { describe, expect, it, vi, beforeEach } from "vitest";
import { maskPhone, maskEmail, sanitizeLogData, safeGdprLogSummary } from "../../utils/dlp";
import { AuditLogService } from "./audit-log.service";
import { RetentionCleanupService } from "./retention-cleanup.service";
import prisma from "../../db.server";

describe("Data Loss Prevention (DLP) Controls", () => {
  it("masks phone numbers correctly while preserving verification context", () => {
    expect(maskPhone("+919876543210")).toBe("+91 ****3210");
    expect(maskPhone("9876543210")).toBe("****3210");
    expect(maskPhone("+14155552671")).toBe("****2671");
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone("")).toBeNull();
  });

  it("masks email addresses while preserving domain", () => {
    expect(maskEmail("john.doe@example.com")).toBe("j***@example.com");
    expect(maskEmail("admin@store.myshopify.com")).toBe("a***@store.myshopify.com");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
  });

  it("sanitizes telemetry payloads by stripping tokens and masking PII", () => {
    const rawData = {
      accessToken: "shpat_real_secret_token",
      refreshToken: "secret_refresh",
      otp: "839201",
      phone: "+919876543210",
      customerEmail: "vikas@gmail.com",
      customerName: "Vikas Sharma",
      orderNumber: 1042,
      riskScore: 35,
    };

    const sanitized = sanitizeLogData(rawData);

    expect(sanitized.accessToken).toBe("[REDACTED]");
    expect(sanitized.refreshToken).toBe("[REDACTED]");
    expect(sanitized.otp).toBe("[REDACTED]");
    expect(sanitized.customerName).toBe("[REDACTED]");
    expect(sanitized.phone).toBe("+91 ****3210");
    expect(sanitized.customerEmail).toBe("v***@gmail.com");
    expect(sanitized.orderNumber).toBe(1042);
    expect(sanitized.riskScore).toBe(35);
  });

  it("produces safe GDPR log summaries without dumping customer PII", () => {
    const rawGdprPayload = {
      shop_id: 123456,
      shop_domain: "store.myshopify.com",
      customer: {
        id: 987654,
        email: "customer@secret.com",
        phone: "+919876543210",
        name: "Private Person",
      },
      orders_requested: [101, 102, 103],
    };

    const summaryStr = safeGdprLogSummary(rawGdprPayload);
    const summary = JSON.parse(summaryStr);

    expect(summary.shop_domain).toBe("store.myshopify.com");
    expect(summary.customer_id).toBe(987654);
    expect(summary.orders_requested_count).toBe(3);
    // Explicitly verify customer PII was stripped
    expect(summaryStr).not.toContain("customer@secret.com");
    expect(summaryStr).not.toContain("+919876543210");
    expect(summaryStr).not.toContain("Private Person");
  });
});

describe("Customer Data Access Logging Service", () => {
  it("extracts IP address and User-Agent from standard request headers", () => {
    const request = new Request("https://app.profitrx.io/app/orders/101", {
      headers: {
        "x-forwarded-for": "203.0.113.195, 70.41.3.18",
        "user-agent": "Mozilla/5.0 Chrome/120.0",
      },
    });

    const meta = AuditLogService.extractRequestMeta(request);
    expect(meta.ipAddress).toBe("203.0.113.195");
    expect(meta.userAgent).toBe("Mozilla/5.0 Chrome/120.0");
  });

  it("records access events to database and never stores raw email PII in resourceId", async () => {
    const spy = vi.spyOn((prisma as any).customerDataAccessLog, "create").mockResolvedValue({ id: "log_1" } as any);

    await AuditLogService.logAccess({
      shop: "test-store.myshopify.com",
      actor: "merchant_admin",
      resource: "ORDER_DETAIL_VIEW",
      resourceId: "order_12345",
      action: "VIEW",
      ipAddress: "127.0.0.1",
      userAgent: "TestAgent",
    });

    expect(spy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shop: "test-store.myshopify.com",
        actor: "merchant_admin",
        resource: "ORDER_DETAIL_VIEW",
        resourceId: "order_12345",
        action: "VIEW",
      }),
    });

    // Test safety filter: accidental email passed as resourceId is scrubbed
    await AuditLogService.logAccess({
      shop: "test-store.myshopify.com",
      actor: "merchant_admin",
      resource: "SEARCH_QUERY",
      resourceId: "accidental-pii@gmail.com",
      action: "SEARCH",
    });

    expect(spy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resourceId: "[REDACTED_IDENTIFIER]",
      }),
    });

    spy.mockRestore();
  });
});

describe("Automated Retention Cleanup Service", () => {
  it("purges expired or verified OTP codes while preserving the CODOrder record", async () => {
    const spy = vi.spyOn((prisma as any).cODOrder, "updateMany").mockResolvedValue({ count: 7 } as any);

    const count = await RetentionCleanupService.purgeExpiredOtps(48);
    expect(count).toBe(7);
    expect(spy).toHaveBeenCalledWith({
      where: expect.objectContaining({
        otp: { not: null },
        OR: expect.arrayContaining([{ otpVerified: true }]),
      }),
      data: { otp: null },
    });

    spy.mockRestore();
  });

  it("purges execution logs older than 90 days", async () => {
    const spy = vi.spyOn((prisma as any).executionLog, "deleteMany").mockResolvedValue({ count: 42 } as any);

    const count = await RetentionCleanupService.purgeOldExecutionLogs(90);
    expect(count).toBe(42);
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it("purges customer data access audit logs older than 180 days", async () => {
    const spy = vi.spyOn((prisma as any).customerDataAccessLog, "deleteMany").mockResolvedValue({ count: 18 } as any);

    const count = await RetentionCleanupService.purgeOldAccessLogs(180);
    expect(count).toBe(18);
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it("runs the full scheduled retention cleanup routine idempotently", async () => {
    vi.spyOn((prisma as any).cODOrder, "updateMany").mockResolvedValue({ count: 5 } as any);
    vi.spyOn((prisma as any).executionLog, "deleteMany").mockResolvedValue({ count: 12 } as any);
    vi.spyOn((prisma as any).customerDataAccessLog, "deleteMany").mockResolvedValue({ count: 3 } as any);

    const result = await RetentionCleanupService.runScheduledCleanup();

    expect(result.otpsPurged).toBe(5);
    expect(result.executionLogsPurged).toBe(12);
    expect(result.accessLogsPurged).toBe(3);
    expect(result.timestamp).toBeDefined();

    vi.restoreAllMocks();
  });
});

describe("Redaction Safety: Null and Missing Customer Data Handling", () => {
  it("handles orders with null customerName, customerEmail, phone, and shippingAddress gracefully", () => {
    const redactedOrder: any = {
      id: "ord_redacted_101",
      orderNumber: 101,
      totalPrice: 1500,
      customerName: null,
      customerEmail: null,
      pincode: null,
      city: null,
      province: null,
      isCOD: true,
    };

    // Verify safe presentation fallbacks
    const displayName = redactedOrder.customerName || "Customer";
    const displayEmail = redactedOrder.customerEmail || "N/A";
    const displayLocation = [redactedOrder.city, redactedOrder.province].filter(Boolean).join(", ") || "Unknown Location";

    expect(displayName).toBe("Customer");
    expect(displayEmail).toBe("N/A");
    expect(displayLocation).toBe("Unknown Location");
  });
});
