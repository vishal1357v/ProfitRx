import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const connectionString = process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/neondb?sslmode=require";

async function testWs() {
  console.log("Testing PrismaNeon with WebSocket Pool...");
  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const count = await prisma.order.count();
  console.log("Prisma count:", count);
  await prisma.storeSettings.updateMany({
    where: { shop: "greek-god-wvwt8ptt.myshopify.com" },
    data: { syncCapped: false }
  });
  console.log("updateMany succeeded!");
  await prisma.$disconnect();
}

testWs().catch(console.error);
