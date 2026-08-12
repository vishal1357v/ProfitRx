import { PrismaClient } from "@prisma/client";

async function testStandard() {
  console.log("Testing standard PrismaClient...");
  const prisma = new PrismaClient();
  try {
    const res = await prisma.$queryRaw`SELECT 1 as test`;
    console.log("Standard Prisma query result:", res);
    const sessionCount = await prisma.session.count();
    console.log("Standard Prisma session count:", sessionCount);
  } catch (e) {
    console.error("Standard Prisma error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

testStandard();
