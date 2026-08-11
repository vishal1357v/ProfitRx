import { CogsRepository } from "../app/infrastructure/repositories/cogs.repository";
import { AlertRepository } from "../app/infrastructure/repositories/alert.repository";
import { CodOrderRepository } from "../app/infrastructure/repositories/cod-order.repository";
import { OrderRepository } from "../app/infrastructure/repositories/order.repository";
import { SettingsRepository } from "../app/infrastructure/repositories/settings.repository";
import prisma from "../app/db.server";

async function runBlock6ApiAudit() {
  console.log("=================================================");
  console.log("PROFITRX BLOCK 6 RUNTIME INTEGRATION AUDIT: API ENDPOINTS");
  console.log("=================================================");

  const SHOP_A = "audit-block6-alpha.myshopify.com";
  const SHOP_B = "audit-block6-beta.myshopify.com";

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      testPassed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      testFailed++;
    }
  }

  async function withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error("Retry limit reached");
  }

  try {
    // 0. Clean test data
    await withRetry(async () => {
      await prisma.cODOrder.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.alert.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.productCOGS.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
    });

    const now = new Date();

    // ─────────────────────────────────────────────────────────────
    // PART 1: CogsRepository & Save COGS
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing CogsRepository via api.save-cogs logic ---");

    const savedCogs = await CogsRepository.upsertManualOverride(SHOP_A, "prod-greek-01", 350);
    assert(savedCogs.cost === 350, "COGS successfully upserted to 350");
    assert(savedCogs.source === "manual_override", "Source marked as manual_override");

    const latestCogs = await CogsRepository.findLatestRecord(SHOP_A);
    assert(latestCogs !== null && latestCogs.productId === "prod-greek-01", "findLatestRecord returns most recent COGS");

    // ─────────────────────────────────────────────────────────────
    // PART 2: AlertRepository & Notifications
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing AlertRepository via api.notifications logic ---");

    const alert = await AlertRepository.createAlert(SHOP_A, {
      type: "RTO_SPIKE",
      severity: "CRITICAL",
      message: "RTO rate exceeded 20% in the last 24 hours.",
    });

    assert(alert.type === "RTO_SPIKE", "Created alert with type RTO_SPIKE");
    assert(!alert.isRead, "New alert is initially unread");

    const activeAlerts = await AlertRepository.findActiveByShop(SHOP_A);
    assert(activeAlerts.length === 1, "findActiveByShop returns 1 active alert");

    await AlertRepository.resolveAlert(SHOP_A, alert.id);
    const afterResolve = await AlertRepository.findActiveByShop(SHOP_A);
    assert(afterResolve.length === 0, "Resolved alert no longer returned in active alerts");

    // ─────────────────────────────────────────────────────────────
    // PART 3: CodOrderRepository & COD Rules API
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Testing CodOrderRepository via api.cod-rules logic ---");

    const codRecord = await CodOrderRepository.upsert(SHOP_A, {
      orderId: "801",
      phone: "+919876543210",
      status: "OTP_SENT",
      otp: "123456",
    });

    assert(codRecord.orderId === "801", "COD record created for order 801");
    assert(codRecord.status === "OTP_SENT", "Status is OTP_SENT");

    const fetchedCod = await CodOrderRepository.findByOrderId(SHOP_A, "801");
    assert(fetchedCod !== null && fetchedCod.shop === SHOP_A, "Fetched COD record matches Shop A");

    const verifiedCod = await CodOrderRepository.markVerified(SHOP_A, "801");
    assert(verifiedCod !== null && verifiedCod.otpVerified === true, "OTP marked verified");
    assert(verifiedCod !== null && verifiedCod.status === "VERIFIED", "Status transitioned to VERIFIED");

    // ─────────────────────────────────────────────────────────────
    // PART 4: Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 4. Testing Multi-Tenant Isolation ---");

    const shopBCogs = await CogsRepository.findManyByShop(SHOP_B);
    assert(shopBCogs.length === 0, "Shop B has 0 COGS records");

    const shopBAlerts = await AlertRepository.findActiveByShop(SHOP_B);
    assert(shopBAlerts.length === 0, "Shop B has 0 alerts");

    // ─────────────────────────────────────────────────────────────
    // Clean test data
    // ─────────────────────────────────────────────────────────────
    await withRetry(async () => {
      await prisma.cODOrder.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.alert.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.productCOGS.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
    });

    console.log("\n=================================================");
    console.log(`BLOCK 6 AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runBlock6ApiAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
