import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const connectionString = process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/neondb?sslmode=require";
process.env.DATABASE_URL = connectionString;

async function testPrismaWs() {
  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log("Testing PrismaNeon with Pool and transactions...");
  const count = await prisma.order.count();
  console.log("Order count via PrismaNeon:", count);

  // Test transaction / upsert
  const testUpsert = await prisma.order.upsert({
    where: { id: "test_tx_order_1" },
    update: { totalPrice: 1000 },
    create: {
      id: "test_tx_order_1",
      shop: "greek-god-wvwt8ptt.myshopify.com",
      orderNumber: 9999,
      totalPrice: 1000,
      subtotalPrice: 1000,
      totalTax: 0,
      shippingPrice: 0,
      createdAt: new Date(),
      processedAt: new Date(),
      financialStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
    }
  });
  console.log("Upsert succeeded via PrismaNeon:", testUpsert.id);

  // Clean up
  await prisma.order.delete({ where: { id: "test_tx_order_1" } });
  console.log("Delete succeeded!");
  await prisma.$disconnect();
}

testPrismaWs().catch(console.error);
