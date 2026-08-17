import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/neondb?sslmode=require";
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
