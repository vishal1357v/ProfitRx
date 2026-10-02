import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { loader, maxDuration } from "../../routes/api.auto-sync";
import { RetentionCleanupService } from "./retention-cleanup.service";
import { ShopifyService } from "../shopify.service";
import prisma from "../../db.server";

vi.mock("../shopify.service", () => ({
  ShopifyService: {
    syncOrdersForShop: vi.fn(),
    syncNativeCOGS: vi.fn(),
  },
}));

vi.mock("../ad-spend.service", () => ({
  AdSpendService: {
    syncAdSpend: vi.fn().mockResolvedValue({ connectedCount: 1, totalSyncedSpend: 500 }),
  },
}));

vi.mock("../whatsapp.service", () => ({
  WhatsAppService: {
    sendWeeklyDigest: vi.fn().mockResolvedValue({ success: true, sent: true }),
  },
}));

describe("API Auto-Sync Cron Route (api.auto-sync.ts)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "test-cron-secret-123" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("exports maxDuration = 60 to prevent Vercel Serverless Function timeout", () => {
    expect(maxDuration).toBe(60);
  });

  it("rejects unauthorized cron requests with 401 when CRON_SECRET header is missing or invalid", async () => {
    const req = new Request("https://example.com/api/auto-sync", {
      headers: { Authorization: "Bearer wrong-secret" },
    });

    const res = await loader({ request: req, params: {}, context: {} } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("executes GDPR Retention Cleanup FIRST before any merchant sync work starts", async () => {
    const executionOrder: string[] = [];

    // Spy on RetentionCleanupService.runScheduledCleanup
    vi.spyOn(RetentionCleanupService, "runScheduledCleanup").mockImplementation(async () => {
      executionOrder.push("GDPR_CLEANUP");
      return {
        otpsPurged: 0,
        executionLogsPurged: 0,
        accessLogsPurged: 0,
        shopRedactions: { processed: 1, completed: 1, cancelledReinstalled: 0, failed: 0, details: [] },
        timestamp: new Date().toISOString(),
      };
    });

    // Spy on offline session lookup
    vi.spyOn(prisma.session, "findMany").mockImplementation((async () => {
      executionOrder.push("SESSION_LOOKUP");
      return [{ shop: "merchant-1.myshopify.com" }] as any;
    }) as any);

    vi.mocked(ShopifyService.syncOrdersForShop).mockImplementation(async () => {
      executionOrder.push("ORDER_SYNC");
      return { count: 10 } as any;
    });
    vi.mocked(ShopifyService.syncNativeCOGS).mockResolvedValue({ synced: 5 } as any);

    const req = new Request("https://example.com/api/auto-sync", {
      headers: { Authorization: "Bearer test-cron-secret-123" },
    });

    const res = await loader({ request: req, params: {}, context: {} } as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.retentionCleanup).toBeDefined();
    expect(body.retentionCleanup.shopRedactions.completed).toBe(1);

    // CRITICAL: GDPR cleanup must have executed BEFORE session lookup and order sync
    expect(executionOrder[0]).toBe("GDPR_CLEANUP");
    expect(executionOrder[1]).toBe("SESSION_LOOKUP");
    expect(executionOrder[2]).toBe("ORDER_SYNC");
  });

  it("GDPR cleanup completes successfully even if merchant sync throws a critical error", async () => {
    // Retention cleanup succeeds
    vi.spyOn(RetentionCleanupService, "runScheduledCleanup").mockResolvedValueOnce({
      otpsPurged: 2,
      executionLogsPurged: 5,
      accessLogsPurged: 1,
      shopRedactions: { processed: 2, completed: 2, cancelledReinstalled: 0, failed: 0, details: [] },
      timestamp: new Date().toISOString(),
    });

    // Merchant session query fails (e.g. database network error during session fetch)
    vi.spyOn(prisma.session, "findMany").mockRejectedValueOnce(
      new Error("Database connection dropped during merchant session query")
    );

    const req = new Request("https://example.com/api/auto-sync", {
      headers: { Authorization: "Bearer test-cron-secret-123" },
    });

    const res = await loader({ request: req, params: {}, context: {} } as any);

    // Status 500 for merchant sync failure
    expect(res.status).toBe(500);
    const body = await res.json();

    // But GDPR retention cleanup results are STILL captured and were not starved
    expect(body.retentionCleanup).toBeDefined();
    expect(body.retentionCleanup.shopRedactions.completed).toBe(2);
    expect(body.error).toContain("Database connection dropped");
  });
});
