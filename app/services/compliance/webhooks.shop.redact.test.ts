import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { action } from "../../routes/webhooks.shop.redact";
import { authenticate } from "../../shopify.server";
import { RetentionCleanupService } from "./retention-cleanup.service";
import prisma from "../../db.server";

vi.mock("../../shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

vi.mock("../../utils/dlp", () => ({
  safeGdprLogSummary: vi.fn().mockReturnValue('{"shop_domain":"test-shop.myshopify.com"}'),
}));

describe("Durable Asynchronous GDPR Shop Redact Architecture", () => {
  const targetShop = "target-store.myshopify.com";
  const controlShop = "control-isolated.myshopify.com";

  const modelNames = [
    "orderLineItem",
    "orderRefund",
    "executionLog",
    "order",
    "productCOGS",
    "variantCOGS",
    "rTOEvent",
    "alert",
    "subscription",
    "storeSettings",
    "pincodeStats",
    "customerProfile",
    "customerRisk",
    "cODOrder",
    "adSpend",
    "adSpendDaily",
    "profitSnapshot",
    "aISearchQuery",
    "healthScore",
    "learningRecord",
    "customerDataAccessLog",
    "session",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of modelNames) {
      if ((prisma as any)[model]) {
        vi.spyOn((prisma as any)[model], "deleteMany").mockResolvedValue({ count: 1 });
      }
    }
    vi.spyOn((prisma as any).session, "findFirst").mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Webhook Handler (webhooks.shop.redact.tsx)", () => {
    it("rejects unauthorized webhook requests with 401 when signature verification fails", async () => {
      vi.mocked(authenticate.webhook).mockRejectedValueOnce(
        new Error("Invalid HMAC signature")
      );

      const request = new Request("https://example.com/webhooks/shop/redact", {
        method: "POST",
        body: JSON.stringify({ shop_domain: targetShop }),
      });

      const response = await action({ request, params: {}, context: {} } as any);

      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).toContain("Unauthorized webhook signature");
    });

    it("valid shop/redact returns 200 quickly and persists durable REDACT_REQUESTED state", async () => {
      vi.mocked(authenticate.webhook).mockResolvedValueOnce({
        payload: { shop_domain: targetShop },
        shop: targetShop,
        topic: "shop/redact",
        session: undefined,
        admin: undefined,
      } as any);

      vi.spyOn((prisma as any).shopRedactionRequest, "findUnique").mockResolvedValueOnce(null);
      vi.spyOn((prisma as any).shopRedactionRequest, "findFirst").mockResolvedValueOnce(null);
      const createSpy = vi.spyOn((prisma as any).shopRedactionRequest, "create").mockResolvedValueOnce({
        id: "req_1",
        shop: targetShop,
        status: "PENDING",
      });

      const startTime = performance.now();
      const request = new Request("https://example.com/webhooks/shop/redact", {
        method: "POST",
        headers: { "x-shopify-webhook-id": "delivery-12345" },
        body: JSON.stringify({ shop_domain: targetShop }),
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const durationMs = performance.now() - startTime;

      expect(response.status).toBe(200);
      expect(createSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shop: targetShop,
          webhookId: "delivery-12345",
          status: "PENDING",
        }),
      });

      // Verifies fast acknowledgement (comfortably below 5 seconds, near zero execution time)
      expect(durationMs).toBeLessThan(1000);

      // Verifies NO synchronous table deletions were executed in the webhook handler
      expect((prisma as any).order.deleteMany).not.toHaveBeenCalled();
    });

    it("handles duplicate webhook delivery idempotently via x-shopify-webhook-id", async () => {
      vi.mocked(authenticate.webhook).mockResolvedValueOnce({
        payload: { shop_domain: targetShop },
        shop: targetShop,
        topic: "shop/redact",
        session: undefined,
        admin: undefined,
      } as any);

      vi.spyOn((prisma as any).shopRedactionRequest, "findUnique").mockResolvedValueOnce({
        id: "req_existing",
        webhookId: "delivery-12345",
        shop: targetShop,
        status: "PENDING",
      });
      const createSpy = vi.spyOn((prisma as any).shopRedactionRequest, "create");

      const request = new Request("https://example.com/webhooks/shop/redact", {
        method: "POST",
        headers: { "x-shopify-webhook-id": "delivery-12345" },
        body: JSON.stringify({ shop_domain: targetShop }),
      });

      const response = await action({ request, params: {}, context: {} } as any);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("idempotent duplicate");
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("handles repeated webhook delivery idempotently when a redaction is already active", async () => {
      vi.mocked(authenticate.webhook).mockResolvedValueOnce({
        payload: { shop_domain: targetShop },
        shop: targetShop,
        topic: "shop/redact",
        session: undefined,
        admin: undefined,
      } as any);

      vi.spyOn((prisma as any).shopRedactionRequest, "findUnique").mockResolvedValueOnce(null);
      vi.spyOn((prisma as any).shopRedactionRequest, "findFirst").mockResolvedValueOnce({
        id: "req_active",
        shop: targetShop,
        status: "PROCESSING",
      });
      const createSpy = vi.spyOn((prisma as any).shopRedactionRequest, "create");

      const request = new Request("https://example.com/webhooks/shop/redact", {
        method: "POST",
        headers: { "x-shopify-webhook-id": "delivery-retry-999" },
        body: JSON.stringify({ shop_domain: targetShop }),
      });

      const response = await action({ request, params: {}, context: {} } as any);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("already active");
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe("Persistent Background Cleanup Service (RetentionCleanupService)", () => {
    it("deletes all shop-scoped data across all 22 models and marks redaction COMPLETED", async () => {
      const requestedDate = new Date(Date.now() - 3600 * 1000);
      vi.spyOn((prisma as any).shopRedactionRequest, "findMany").mockResolvedValueOnce([
        {
          id: "req_to_clean",
          shop: targetShop,
          status: "PENDING",
          attempts: 0,
          requestedAt: requestedDate,
        },
      ]);

      const updateSpy = vi.spyOn((prisma as any).shopRedactionRequest, "update").mockResolvedValue({ id: "req_to_clean" });

      const result = await RetentionCleanupService.processPendingShopRedactions();

      expect(result.processed).toBe(1);
      expect(result.completed).toBe(1);
      expect(result.failed).toBe(0);

      // Verify every model deletion was triggered with strict tenant isolation
      for (const model of modelNames) {
        expect((prisma as any)[model].deleteMany).toHaveBeenCalledWith({
          where: { shop: targetShop },
        });
        expect((prisma as any)[model].deleteMany).not.toHaveBeenCalledWith({
          where: { shop: controlShop },
        });
      }

      // Verify request marked COMPLETED
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req_to_clean" },
          data: expect.objectContaining({
            status: "COMPLETED",
            completedAt: expect.any(Date),
            lastError: null,
          }),
        })
      );
    });

    it("partial failure: one failed model does not abort others and keeps request retryable as FAILED", async () => {
      vi.spyOn((prisma as any).shopRedactionRequest, "findMany").mockResolvedValueOnce([
        {
          id: "req_partial_fail",
          shop: targetShop,
          status: "PENDING",
          attempts: 1,
          requestedAt: new Date(),
        },
      ]);

      // Simulate failure on order table (e.g. database lock)
      vi.spyOn((prisma as any).order, "deleteMany").mockRejectedValueOnce(
        new Error("Deadlock or lock timeout")
      );

      const updateSpy = vi.spyOn((prisma as any).shopRedactionRequest, "update").mockResolvedValue({ id: "req_partial_fail" });

      const result = await RetentionCleanupService.processPendingShopRedactions();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.completed).toBe(0);

      // Other models must STILL have been attempted
      expect((prisma as any).session.deleteMany).toHaveBeenCalledWith({ where: { shop: targetShop } });
      expect((prisma as any).storeSettings.deleteMany).toHaveBeenCalledWith({ where: { shop: targetShop } });

      // Request must be marked FAILED with error diagnostic so it will be retried
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req_partial_fail" },
          data: expect.objectContaining({
            status: "FAILED",
            lastError: expect.stringContaining("Deadlock or lock timeout"),
          }),
        })
      );
    });

    it("prevents reinstall race: cancels redaction if shop reinstalled before cleanup executes", async () => {
      const requestedDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
      const reinstalledDate = new Date(Date.now() - 600 * 1000); // 10 minutes ago (after request)

      vi.spyOn((prisma as any).shopRedactionRequest, "findMany").mockResolvedValueOnce([
        {
          id: "req_reinstalled",
          shop: targetShop,
          status: "PENDING",
          attempts: 0,
          requestedAt: requestedDate,
        },
      ]);

      // Active session exists with updatedAt > requestedAt
      vi.spyOn((prisma as any).session, "findFirst").mockResolvedValueOnce({
        id: "sess_new",
        shop: targetShop,
        isOnline: false,
        accessToken: "shpat_new_token",
        updatedAt: reinstalledDate,
      });

      const updateSpy = vi.spyOn((prisma as any).shopRedactionRequest, "update").mockResolvedValue({ id: "req_reinstalled" });

      const result = await RetentionCleanupService.processPendingShopRedactions();

      expect(result.cancelledReinstalled).toBe(1);
      expect(result.completed).toBe(0);

      // Verify NO models were deleted (newly reinstalled shop data is preserved!)
      expect((prisma as any).order.deleteMany).not.toHaveBeenCalled();
      expect((prisma as any).storeSettings.deleteMany).not.toHaveBeenCalled();

      // Verify request transitioned to CANCELLED_REINSTALLED
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req_reinstalled" },
          data: expect.objectContaining({
            status: "CANCELLED_REINSTALLED",
            lastError: expect.stringContaining("Active session detected"),
          }),
        })
      );
    });

    it("enforces bounded batch size of 5 for pending redactions", async () => {
      const findManySpy = vi.spyOn((prisma as any).shopRedactionRequest, "findMany").mockResolvedValueOnce([]);
      vi.spyOn((prisma as any).shopRedactionRequest, "count").mockResolvedValueOnce(0);

      const result = await RetentionCleanupService.processPendingShopRedactions();

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { in: ["PENDING", "FAILED"] },
            attempts: { lt: 5 },
          },
          take: 5,
        })
      );
      expect(result.processed).toBe(0);
    });

    it("emits CRITICAL_COMPLIANCE_ALERT and preserves diagnostic state when request reaches 5 attempts", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn((prisma as any).shopRedactionRequest, "findMany").mockResolvedValueOnce([
        {
          id: "req_exhausted",
          shop: targetShop,
          webhookId: "del_exhaust_999",
          status: "FAILED",
          attempts: 4, // 5th attempt will fail now
          requestedAt: new Date(),
        },
      ]);
      vi.spyOn((prisma as any).shopRedactionRequest, "count").mockResolvedValueOnce(1);

      // Force failure on order deletion
      vi.spyOn((prisma as any).order, "deleteMany").mockRejectedValueOnce(
        new Error("Persistent database timeout")
      );
      const updateSpy = vi.spyOn((prisma as any).shopRedactionRequest, "update").mockResolvedValue({ id: "req_exhausted" });

      const result = await RetentionCleanupService.processPendingShopRedactions();

      expect(result.failed).toBe(1);
      expect(result.deadLetterCount).toBe(1);

      // Diagnostic info must be preserved
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req_exhausted" },
          data: expect.objectContaining({
            status: "FAILED",
            lastError: expect.stringContaining("Persistent database timeout"),
          }),
        })
      );

      // Critical compliance alert must be emitted
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[CRITICAL_COMPLIANCE_ALERT]")
      );
    });
  });
});
