import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/neondb?sslmode=require";

async function testHttp() {
  console.log("Testing PrismaNeonHttp adapter...");
  const adapter = new PrismaNeonHttp(connectionString, {});
  const prisma = new PrismaClient({ adapter });

  const t0 = Date.now();
  const sessionCount = await prisma.session.count();
  console.log(`PrismaNeonHttp session count: ${sessionCount} in ${Date.now() - t0}ms!`);
  const orders = await prisma.order.count();
  console.log(`PrismaNeonHttp order count: ${orders} in ${Date.now() - t0}ms!`);
}

testHttp().catch(console.error);
