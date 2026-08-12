import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const connectionString = "postgresql://neondb_owner:npg_8sDJ7nqpfmYI@ep-weathered-tree-at8vwwnb-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require";
process.env.DATABASE_URL = connectionString;

async function test() {
  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log("Connecting with PrismaNeon adapter...");
  const t0 = Date.now();
  const sessionCount = await prisma.session.count();
  console.log(`PrismaNeon session count: ${sessionCount} in ${Date.now() - t0}ms!`);
  await prisma.$disconnect();
}

test().catch(console.error);
