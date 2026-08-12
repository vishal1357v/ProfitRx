// Polyfill BigInt serialization so JSON.stringify doesn't crash on Prisma models with BigInt fields (e.g. Session.userId)
if (typeof BigInt !== "undefined" && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    try {
      if (connectionString.includes("neon.tech")) {
        const adapter = new PrismaNeonHttp(connectionString);
        return new PrismaClient({ adapter });
      }
      const pool = new pg.Pool({ connectionString });
      const adapter = new PrismaPg(pool);
      return new PrismaClient({ adapter });
    } catch (err) {
      console.error("[db.server.ts] Error initializing Prisma adapter, falling back to standard PrismaClient:", err);
    }
  }
  return new PrismaClient();
}

if (!global.prismaGlobal) {
  global.prismaGlobal = createPrismaClient();
}

const prisma = global.prismaGlobal;

export default prisma;
