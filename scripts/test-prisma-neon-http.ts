import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const connectionString = "postgresql://neondb_owner:npg_8sDJ7nqpfmYI@ep-weathered-tree-at8vwwnb-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require";

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
