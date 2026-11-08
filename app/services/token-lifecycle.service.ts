import prisma from "../db.server";
import { encryptToken, decryptToken } from "./token-encryption.server";
import { Session } from "@shopify/shopify-api";

export class ShopifyTokenRevokedError extends Error {
  constructor(
    public readonly shop: string,
    message: string = "Shopify access or refresh token has been revoked, expired, or is invalid. Merchant re-authorization is required.",
  ) {
    super(`[Shopify Auth Required] ${shop}: ${message}`);
    this.name = "ShopifyTokenRevokedError";
  }
}

export interface TokenExchangeResponse {
  access_token: string;
  scope: string;
  expires_in: number;
  associated_user_scope?: string;
  refresh_token: string;
  refresh_token_expires_in: number;
}

// 5 minutes before expiration threshold
export const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

export function redactSecret(secret?: string | null): string {
  if (!secret) return "[NONE]";
  if (secret.length <= 8) return "[REDACTED]";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

export class TokenLifecycleService {
  // In-memory mutex map to prevent concurrent refresh storms for the same shop
  private static pendingRefreshes = new Map<string, Promise<Session>>();

  /**
   * Checks if an offline session needs refresh, migration, or is still valid.
   */
  static isTokenExpiring(session: Session, thresholdMs: number = REFRESH_THRESHOLD_MS): boolean {
    if (!session.expires) return true; // Legacy or unknown expiration
    const expiryTime = session.expires instanceof Date ? session.expires.getTime() : new Date(session.expires).getTime();
    return Date.now() + thresholdMs >= expiryTime;
  }

  /**
   * Refreshes an offline session if needed, handling concurrency deduplication,
   * database re-checks, atomic persistence, and safe recovery.
   */
  static async refreshSessionIfNeeded(session: Session): Promise<Session> {
    if (session.isOnline) {
      return session; // Online user tokens are tied to browser session
    }

    const shop = session.shop;
    const hasRefreshToken = Boolean(session.refreshToken);
    const isExpiring = this.isTokenExpiring(session);

    // If session has no refresh token, attempt legacy migration
    if (!hasRefreshToken) {
      if (session.accessToken) {
        return this.migrateLegacySession(shop, session.accessToken);
      }
      throw new ShopifyTokenRevokedError(shop, "No access token or refresh token available in session.");
    }

    // If still far from expiry, session is valid
    if (!isExpiring) {
      return session;
    }

    // Token is nearing expiry or expired — deduplicate concurrent refresh requests
    return this.executeDeduplicatedRefresh(shop, session.refreshToken!);
  }

  /**
   * Deduplicates concurrent refresh requests for the same shop.
   */
  private static executeDeduplicatedRefresh(shop: string, refreshToken: string): Promise<Session> {
    const existingPromise = this.pendingRefreshes.get(shop);
    if (existingPromise) {
      return existingPromise;
    }

    const refreshPromise = (async () => {
      try {
        return await this.performTokenRefresh(shop, refreshToken);
      } finally {
        this.pendingRefreshes.delete(shop);
      }
    })();

    this.pendingRefreshes.set(shop, refreshPromise);
    return refreshPromise;
  }

  /**
   * Performs the actual token refresh call with database re-checks and error recovery.
   */
  static async performTokenRefresh(shop: string, currentRefreshToken: string): Promise<Session> {
    const sessionId = `offline_${shop}`;

    // 1. Optimistic database re-check: Did another worker or process already refresh this token?
    const dbSession = await prisma.session.findUnique({ where: { id: sessionId } });
    if (dbSession && dbSession.expires && dbSession.refreshToken) {
      const dbExpiry = dbSession.expires.getTime();
      // If DB token expires more than 10 minutes from now, another worker already rotated it!
      if (dbExpiry - Date.now() > 10 * 60 * 1000) {
        return this.dbRowToSession(dbSession);
      }
    }

    const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
    const apiSecret = (process.env.SHOPIFY_API_SECRET || "").trim().replace(/^<|>$/g, "");

    if (!apiKey || !apiSecret) {
      throw new Error("[TokenLifecycleService] SHOPIFY_API_KEY or SHOPIFY_API_SECRET missing in environment.");
    }

    // 2. Call Shopify's token endpoint to exchange refresh_token for a new pair
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const payload = {
      client_id: apiKey,
      client_secret: apiSecret,
      grant_type: "refresh_token",
      refresh_token: currentRefreshToken,
    };

    let response: globalThis.Response;
    try {
      response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (networkErr: any) {
      throw new Error(`[TokenLifecycleService] Network error refreshing token for ${shop}: ${networkErr.message}`);
    }

    // 3. Handle non-200 responses
    if (!response.ok) {
      const errBody = await response.text();

      // Check if another serverless worker rotated the token in the race window.
      // Poll DB with backoff (up to 3 attempts, 300ms interval) in case the winner is currently committing.
      for (let attempt = 1; attempt <= 3; attempt++) {
        const freshDbSession = await prisma.session.findUnique({ where: { id: sessionId } });
        if (freshDbSession && freshDbSession.expires && freshDbSession.refreshToken) {
          const freshExpiry = freshDbSession.expires.getTime();
          if (freshExpiry - Date.now() > 5 * 60 * 1000) {
            console.log(`[TokenLifecycleService] Concurrent refresh detected across serverless instances for ${shop}. Adopted fresh token from database (attempt ${attempt}).`);
            return this.dbRowToSession(freshDbSession);
          }
        }
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        }
      }

      // If genuinely rejected (e.g. invalid_grant, invalid_subject_token, app uninstalled)
      console.error(`[TokenLifecycleService] Token refresh rejected by Shopify for ${shop}. HTTP ${response.status}: ${errBody}`);
      throw new ShopifyTokenRevokedError(shop, `Shopify token refresh failed with HTTP ${response.status}. Re-authorization required.`);
    }

    const data = (await response.json()) as TokenExchangeResponse;
    return this.persistTokenPair(shop, data);
  }

  /**
   * Migrates an existing legacy non-expiring offline token using Shopify's Token Exchange endpoint.
   */
  static async migrateLegacySession(shop: string, legacyAccessToken: string): Promise<Session> {
    const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
    const apiSecret = (process.env.SHOPIFY_API_SECRET || "").trim().replace(/^<|>$/g, "");

    if (!apiKey || !apiSecret) {
      throw new Error("[TokenLifecycleService] SHOPIFY_API_KEY or SHOPIFY_API_SECRET missing in environment.");
    }

    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const payload = {
      client_id: apiKey,
      client_secret: apiSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: legacyAccessToken,
      subject_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      expiring: "1",
    };

    let response: globalThis.Response;
    try {
      response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw new Error(`[TokenLifecycleService] Network failure during legacy token migration for ${shop}: ${err.message}`);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TokenLifecycleService] Legacy token migration rejected by Shopify for ${shop}. HTTP ${response.status}: ${errText}`);
      throw new ShopifyTokenRevokedError(shop, `Legacy token migration failed with HTTP ${response.status}. Re-installation required.`);
    }

    const data = (await response.json()) as TokenExchangeResponse;
    return this.persistTokenPair(shop, data);
  }

  /**
   * Encrypts and persists the new token pair atomically into the database.
   */
  private static async persistTokenPair(shop: string, data: TokenExchangeResponse): Promise<Session> {
    const sessionId = `offline_${shop}`;
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    const refreshTokenExpiresAt = new Date(Date.now() + (data.refresh_token_expires_in || 7776000) * 1000);

    const encryptedAccessToken = encryptToken(data.access_token);
    const encryptedRefreshToken = encryptToken(data.refresh_token);

    // Concurrency guard against stale writes across separate serverless instances:
    // If database already contains a session with a newer expiration date, preserve the newer one.
    const existing = await prisma.session.findUnique({ where: { id: sessionId } });
    if (existing && existing.expires && existing.expires.getTime() > expiresAt.getTime()) {
      console.warn(`[TokenLifecycleService] Database already contains newer session for ${shop}. Preserving latest credentials.`);
      return this.dbRowToSession(existing);
    }

    const updated = await prisma.session.upsert({
      where: { id: sessionId },
      create: {
        id: sessionId,
        shop,
        state: "",
        isOnline: false,
        scope: data.scope,
        accessToken: encryptedAccessToken,
        expires: expiresAt,
        refreshToken: encryptedRefreshToken,
        refreshTokenExpires: refreshTokenExpiresAt,
        expiresAt,
      },
      update: {
        scope: data.scope,
        accessToken: encryptedAccessToken,
        expires: expiresAt,
        refreshToken: encryptedRefreshToken,
        refreshTokenExpires: refreshTokenExpiresAt,
        expiresAt,
        updatedAt: new Date(),
      },
    });

    const session = new Session({
      id: updated.id,
      shop: updated.shop,
      state: updated.state,
      isOnline: updated.isOnline,
    });
    session.scope = updated.scope || undefined;
    session.expires = updated.expires || undefined;
    session.accessToken = data.access_token; // in-memory decrypted
    session.refreshToken = data.refresh_token; // in-memory decrypted
    (session as any).refreshTokenExpires = updated.refreshTokenExpires || undefined;

    return session;
  }

  /**
   * Converts a database row to an in-memory decrypted Session object.
   */
  private static dbRowToSession(row: any): Session {
    const session = new Session({
      id: row.id,
      shop: row.shop,
      state: row.state,
      isOnline: row.isOnline,
    });
    session.scope = row.scope || undefined;
    session.expires = row.expires || undefined;
    session.accessToken = decryptToken(row.accessToken) || undefined;
    session.refreshToken = decryptToken(row.refreshToken) || undefined;
    (session as any).refreshTokenExpires = row.refreshTokenExpires || undefined;
    return session;
  }
}

