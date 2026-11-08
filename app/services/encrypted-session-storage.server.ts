import type { PrismaClient } from "@prisma/client";
import { Session } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { decryptToken, encryptToken } from "./token-encryption.server";
import { TokenLifecycleService, ShopifyTokenRevokedError } from "./token-lifecycle.service";

function withTransformedTokens(
  session: Session,
  transform: (token: string | undefined) => string | undefined,
): Session {
  const copy = Session.fromPropertyArray(session.toPropertyArray(true), true);
  copy.accessToken = transform(session.accessToken);
  copy.refreshToken = transform(session.refreshToken);
  return copy;
}

/**
 * Keeps token handling compatible with Shopify's session storage while
 * persisting encrypted OAuth credentials in PostgreSQL with resilient connection retries.
 */
export class EncryptedPrismaSessionStorage<T extends PrismaClient> extends PrismaSessionStorage<T> {
  constructor(
    prisma: T,
    options?: {
      tableName?: string;
      connectionRetries?: number;
      connectionRetryIntervalMs?: number;
    }
  ) {
    super(prisma, {
      connectionRetries: options?.connectionRetries ?? 8,
      connectionRetryIntervalMs: options?.connectionRetryIntervalMs ?? 2500,
      ...options,
    });
  }

  override async storeSession(session: Session): Promise<boolean> {
    return super.storeSession(
      withTransformedTokens(session, (token) => (token ? encryptToken(token) : undefined)),
    );
  }

  override async loadSession(id: string): Promise<Session | undefined> {
    const session = await super.loadSession(id);
    if (!session) return undefined;

    const decryptedSession = withTransformedTokens(session, (token) => decryptToken(token) ?? undefined);

    // For offline sessions, check if token needs rotation or legacy migration
    if (!decryptedSession.isOnline) {
      try {
        return await TokenLifecycleService.refreshSessionIfNeeded(decryptedSession);
      } catch (refreshErr) {
        if (refreshErr instanceof ShopifyTokenRevokedError) {
          console.warn(`[EncryptedPrismaSessionStorage] Session for ${decryptedSession.shop} requires re-auth: ${refreshErr.message}`);
          return decryptedSession;
        }
        console.error(`[EncryptedPrismaSessionStorage] Error verifying token freshness for ${decryptedSession.shop}:`, refreshErr);
        return decryptedSession;
      }
    }

    return decryptedSession;
  }

  override async findSessionsByShop(shop: string): Promise<Session[]> {
    const sessions = await super.findSessionsByShop(shop);
    return sessions.map((session) =>
      withTransformedTokens(session, (token) => decryptToken(token) ?? undefined),
    );
  }
}
