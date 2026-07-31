import type { PrismaClient } from "@prisma/client";
import { Session } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { decryptToken, encryptToken } from "./token-encryption.server";

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
 * persisting encrypted OAuth credentials in PostgreSQL.
 */
export class EncryptedPrismaSessionStorage<T extends PrismaClient> extends PrismaSessionStorage<T> {
  override async storeSession(session: Session): Promise<boolean> {
    return super.storeSession(
      withTransformedTokens(session, (token) => (token ? encryptToken(token) : undefined)),
    );
  }

  override async loadSession(id: string): Promise<Session | undefined> {
    const session = await super.loadSession(id);
    return session
      ? withTransformedTokens(session, (token) => decryptToken(token) ?? undefined)
      : undefined;
  }

  override async findSessionsByShop(shop: string): Promise<Session[]> {
    const sessions = await super.findSessionsByShop(shop);
    return sessions.map((session) =>
      withTransformedTokens(session, (token) => decryptToken(token) ?? undefined),
    );
  }
}
