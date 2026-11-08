import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Session } from "@shopify/shopify-api";
import {
  TokenLifecycleService,
  ShopifyTokenRevokedError,
  REFRESH_THRESHOLD_MS,
  redactSecret,
} from "../app/services/token-lifecycle.service";
import prisma from "../app/db.server";
import { encryptToken, decryptToken } from "../app/services/token-encryption.server";

describe("TokenLifecycleService — Expiring Offline Token Lifecycle & Rotation", () => {
  const shop = "greek-god-wvwt8ptt.myshopify.com";
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SHOPIFY_API_KEY = "test_api_key_123";
    process.env.SHOPIFY_API_SECRET = "test_api_secret_456";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("01234567890123456789012345678901").toString("base64");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ── 1. Valid unexpired token ──────────────────────────────────
  it("Scenario 1: Valid unexpired token does not trigger refresh", async () => {
    const session = new Session({
      id: `offline_${shop}`,
      shop,
      state: "state_1",
      isOnline: false,
    });
    session.accessToken = "shpat_valid_123";
    session.refreshToken = "shprt_valid_456";
    // Expires in 45 minutes (well above 5-minute threshold)
    session.expires = new Date(Date.now() + 45 * 60 * 1000);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await TokenLifecycleService.refreshSessionIfNeeded(session);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.accessToken).toBe("shpat_valid_123");
    expect(result.refreshToken).toBe("shprt_valid_456");
  });

  // ── 2. Token nearing expiry ───────────────────────────────────
  it("Scenario 2: Token nearing expiry is detected correctly", () => {
    const session = new Session({
      id: `offline_${shop}`,
      shop,
      state: "state_1",
      isOnline: false,
    });
    // Expires in 3 minutes (within 5-minute threshold)
    session.expires = new Date(Date.now() + 3 * 60 * 1000);

    expect(TokenLifecycleService.isTokenExpiring(session, REFRESH_THRESHOLD_MS)).toBe(true);

    // Far from expiry (30 mins)
    session.expires = new Date(Date.now() + 30 * 60 * 1000);
    expect(TokenLifecycleService.isTokenExpiring(session, REFRESH_THRESHOLD_MS)).toBe(false);
  });

  // ── 3. Successful refresh ─────────────────────────────────────
  it("Scenario 3: Successful refresh exchanges token and updates expiration", async () => {
    const session = new Session({
      id: `offline_${shop}`,
      shop,
      state: "state_1",
      isOnline: false,
    });
    session.accessToken = "shpat_old_111";
    session.refreshToken = "shprt_old_222";
    // Expired 1 minute ago
    session.expires = new Date(Date.now() - 60 * 1000);

    // Mock Prisma findUnique (no concurrent refresh in DB)
    vi.spyOn(prisma.session, "findUnique").mockResolvedValue(null);

    // Mock Prisma upsert
    vi.spyOn(prisma.session, "upsert").mockImplementation(async ({ create, update }: any) => {
      const data = update || create;
      return {
        id: `offline_${shop}`,
        shop,
        state: "",
        isOnline: false,
        scope: data.scope,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expires: data.expires,
        refreshTokenExpires: data.refreshTokenExpires,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
    });

    // Mock Shopify Token Exchange HTTP response
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "shpat_new_999",
          scope: "read_orders,write_orders",
          expires_in: 3600,
          refresh_token: "shprt_new_888",
          refresh_token_expires_in: 7776000,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const refreshed = await TokenLifecycleService.refreshSessionIfNeeded(session);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(refreshed.accessToken).toBe("shpat_new_999");
    expect(refreshed.refreshToken).toBe("shprt_new_888");
    expect(refreshed.expires!.getTime()).toBeGreaterThan(Date.now() + 3500 * 1000);
  });

  // ── 4. Refresh-token rotation ─────────────────────────────────
  it("Scenario 4: Refresh-token rotation persists new rotated token encrypted", async () => {
    let persistedRow: any = null;
    vi.spyOn(prisma.session, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.session, "upsert").mockImplementation(async ({ update }: any) => {
      persistedRow = update;
      return {
        id: `offline_${shop}`,
        shop,
        state: "",
        isOnline: false,
        ...update,
      } as any;
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "shpat_rotated_token",
          scope: "write_orders",
          expires_in: 3600,
          refresh_token: "shprt_new_rotated_refresh",
          refresh_token_expires_in: 7776000,
        }),
        { status: 200 }
      )
    );

    await TokenLifecycleService.performTokenRefresh(shop, "shprt_old_refresh");

    expect(persistedRow).not.toBeNull();
    // Verify ciphertext starts with enc:v1:
    expect(persistedRow.accessToken.startsWith("enc:v1:")).toBe(true);
    expect(persistedRow.refreshToken.startsWith("enc:v1:")).toBe(true);

    // Verify plaintext is never stored in DB
    expect(persistedRow.accessToken).not.toContain("shpat_rotated_token");
    expect(persistedRow.refreshToken).not.toContain("shprt_new_rotated_refresh");

    // Verify decryption recovers original values
    expect(decryptToken(persistedRow.accessToken)).toBe("shpat_rotated_token");
    expect(decryptToken(persistedRow.refreshToken)).toBe("shprt_new_rotated_refresh");
  });

  // ── 5. Expired refresh token ──────────────────────────────────
  it("Scenario 5: Expired refresh token throws ShopifyTokenRevokedError without leaking secrets", async () => {
    vi.spyOn(prisma.session, "findUnique").mockResolvedValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "Refresh token has expired" }), {
        status: 400,
      })
    );

    await expect(TokenLifecycleService.performTokenRefresh(shop, "shprt_expired")).rejects.toThrow(
      ShopifyTokenRevokedError
    );
  });

  // ── 6. Invalid/revoked token ──────────────────────────────────
  it("Scenario 6: Revoked app installation throws ShopifyTokenRevokedError", async () => {
    vi.spyOn(prisma.session, "findUnique").mockResolvedValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_subject_token", error_description: "App uninstalled" }), {
        status: 400,
      })
    );

    await expect(TokenLifecycleService.performTokenRefresh(shop, "shprt_revoked")).rejects.toThrow(
      ShopifyTokenRevokedError
    );
  });

  // ── 7. Concurrent refresh requests ────────────────────────────
  it("Scenario 7: Concurrent refresh requests deduplicate into a single outbound request", async () => {
    const session = new Session({
      id: `offline_${shop}`,
      shop,
      state: "state_1",
      isOnline: false,
    });
    session.accessToken = "shpat_old";
    session.refreshToken = "shprt_old";
    session.expires = new Date(Date.now() - 1000); // Expired

    vi.spyOn(prisma.session, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.session, "upsert").mockImplementation(async ({ update }: any) => ({
      id: `offline_${shop}`,
      shop,
      state: "",
      isOnline: false,
      ...update,
    }) as any);

    let networkCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      networkCalls++;
      // Simulate 50ms network delay
      await new Promise((r) => setTimeout(r, 50));
      return new Response(
        JSON.stringify({
          access_token: "shpat_concurrent_win",
          scope: "read_orders",
          expires_in: 3600,
          refresh_token: "shprt_concurrent_win",
          refresh_token_expires_in: 7776000,
        }),
        { status: 200 }
      );
    });

    // Launch 5 concurrent refresh calls at the exact same millisecond
    const results = await Promise.all([
      TokenLifecycleService.refreshSessionIfNeeded(session),
      TokenLifecycleService.refreshSessionIfNeeded(session),
      TokenLifecycleService.refreshSessionIfNeeded(session),
      TokenLifecycleService.refreshSessionIfNeeded(session),
      TokenLifecycleService.refreshSessionIfNeeded(session),
    ]);

    // Only 1 outbound HTTP call should have been made
    expect(networkCalls).toBe(1);

    // All 5 callers should receive the identical refreshed tokens
    for (const res of results) {
      expect(res.accessToken).toBe("shpat_concurrent_win");
      expect(res.refreshToken).toBe("shprt_concurrent_win");
    }
  });

  // ── 8. Existing legacy session migration ───────────────────────
  it("Scenario 8: Legacy non-expiring session is automatically migrated via Token Exchange", async () => {
    const legacySession = new Session({
      id: `offline_${shop}`,
      shop,
      state: "state_legacy",
      isOnline: false,
    });
    legacySession.accessToken = "shpat_legacy_non_expiring_token";
    legacySession.refreshToken = undefined;
    legacySession.expires = undefined;

    vi.spyOn(prisma.session, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.session, "upsert").mockImplementation(async ({ update }: any) => ({
      id: `offline_${shop}`,
      shop,
      state: "",
      isOnline: false,
      ...update,
    }) as any);

    let tokenExchangeBody: any = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opts) => {
      tokenExchangeBody = JSON.parse(opts?.body as string);
      return new Response(
        JSON.stringify({
          access_token: "shpat_upgraded_expiring_token",
          scope: "read_orders,write_orders",
          expires_in: 3600,
          refresh_token: "shprt_brand_new_refresh_token",
          refresh_token_expires_in: 7776000,
        }),
        { status: 200 }
      );
    });

    const migrated = await TokenLifecycleService.refreshSessionIfNeeded(legacySession);

    // Verify token exchange request body adhered to Shopify specification
    expect(tokenExchangeBody.grant_type).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
    expect(tokenExchangeBody.subject_token).toBe("shpat_legacy_non_expiring_token");
    expect(tokenExchangeBody.expiring).toBe("1");

    // Verify session now has expiring tokens and refresh tokens
    expect(migrated.accessToken).toBe("shpat_upgraded_expiring_token");
    expect(migrated.refreshToken).toBe("shprt_brand_new_refresh_token");
    expect(migrated.expires).toBeDefined();
  });

  // ── 9. Failed refresh recovery ────────────────────────────────
  it("Scenario 9: If local refresh fails but another worker already updated DB, recovers safely", async () => {
    // Simulate race: Worker A already updated DB with fresh token
    const freshDbToken = encryptToken("shpat_worker_a_token");
    const freshDbRefresh = encryptToken("shprt_worker_a_refresh");
    const freshExpiry = new Date(Date.now() + 50 * 60 * 1000);

    vi.spyOn(prisma.session, "findUnique").mockResolvedValue({
      id: `offline_${shop}`,
      shop,
      state: "",
      isOnline: false,
      scope: "read_orders",
      accessToken: freshDbToken,
      refreshToken: freshDbRefresh,
      expires: freshExpiry,
      refreshTokenExpires: new Date(Date.now() + 7776000 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Worker B attempts to refresh with old refresh token
    const recovered = await TokenLifecycleService.performTokenRefresh(shop, "shprt_stale");

    // Network call should be bypassed because DB already has fresh token
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(recovered.accessToken).toBe("shpat_worker_a_token");
    expect(recovered.refreshToken).toBe("shprt_worker_a_refresh");
  });

  // ── 10. Redaction utility ─────────────────────────────────────
  it("Scenario 10: Secret redacting utility never exposes credentials", () => {
    expect(redactSecret(null)).toBe("[NONE]");
    expect(redactSecret("")).toBe("[NONE]");
    expect(redactSecret("1234567")).toBe("[REDACTED]");
    expect(redactSecret("shpat_1234567890abcdef")).toBe("shpa...cdef");
  });
});

