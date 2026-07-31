import prisma from "../app/db.server";
import { encryptToken, isEncryptedToken } from "../app/services/token-encryption.server";

async function migrateTokens() {
  const [sessions, adConnections] = await Promise.all([
    prisma.session.findMany({ select: { id: true, accessToken: true, refreshToken: true } }),
    prisma.adSpend.findMany({ select: { id: true, accessToken: true, refreshToken: true } }),
  ]);

  let migratedSessions = 0;
  let migratedAdConnections = 0;

  for (const session of sessions) {
    const accessToken = session.accessToken && !isEncryptedToken(session.accessToken)
      ? encryptToken(session.accessToken)
      : undefined;
    const refreshToken = session.refreshToken && !isEncryptedToken(session.refreshToken)
      ? encryptToken(session.refreshToken)
      : undefined;

    if (accessToken || refreshToken) {
      await prisma.session.update({
        where: { id: session.id },
        data: { ...(accessToken ? { accessToken } : {}), ...(refreshToken ? { refreshToken } : {}) },
      });
      migratedSessions += 1;
    }
  }

  for (const connection of adConnections) {
    const accessToken = connection.accessToken && !isEncryptedToken(connection.accessToken)
      ? encryptToken(connection.accessToken)
      : undefined;
    const refreshToken = connection.refreshToken && !isEncryptedToken(connection.refreshToken)
      ? encryptToken(connection.refreshToken)
      : undefined;

    if (accessToken || refreshToken) {
      await prisma.adSpend.update({
        where: { id: connection.id },
        data: { ...(accessToken ? { accessToken } : {}), ...(refreshToken ? { refreshToken } : {}) },
      });
      migratedAdConnections += 1;
    }
  }

  console.log(`Encrypted token records: ${migratedSessions} Shopify session(s), ${migratedAdConnections} ad connection(s).`);
}

migrateTokens()
  .catch((error) => {
    console.error("Token encryption migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
