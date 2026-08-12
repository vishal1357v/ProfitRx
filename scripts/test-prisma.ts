import prisma from "../app/db.server";

async function test() {
  try {
    console.log("Testing prisma query...");
    const res = await prisma.$queryRaw`SELECT 1 as test`;
    console.log("Prisma query result:", res);
    const sessionCount = await prisma.session.count();
    console.log("Prisma session count:", sessionCount);
  } catch (e) {
    console.error("Prisma error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

test();
