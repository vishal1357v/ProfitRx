import {
  checkRateLimit,
  validateCOGS,
  validateRTOEvent,
  validateEmail,
  getCorsHeaders,
} from "../app/utils/security.server";
import { OrderRepository } from "../app/infrastructure/repositories/order.repository";
import { CogsRepository } from "../app/infrastructure/repositories/cogs.repository";
import { AlertRepository } from "../app/infrastructure/repositories/alert.repository";
import { CodOrderRepository } from "../app/infrastructure/repositories/cod-order.repository";
import { RtoRepository } from "../app/infrastructure/repositories/rto.repository";
import { SettingsRepository } from "../app/infrastructure/repositories/settings.repository";
import prisma from "../app/db.server";

async function runSecurityAudit() {
  console.log("=================================================");
  console.log("PROFITRX BLOCK 7 RUNTIME INTEGRATION AUDIT: SECURITY & ISOLATION");
  console.log("=================================================");

  const SHOP_A = "audit-security-alpha.myshopify.com";
  const SHOP_B = "audit-security-beta.myshopify.com";

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
      await prisma.rTOEvent.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
    });

    // ─────────────────────────────────────────────────────────────
    // PART 1: Security Utility Validations
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing Input & Rate Limit Security Utilities ---");

    // Rate limiting
    const ip = "192.168.1.100";
    const r1 = checkRateLimit(ip, 3);
    assert(r1.allowed === true && r1.remaining === 2, "Rate limit: 1st request allowed");
    const r2 = checkRateLimit(ip, 3);
    const r3 = checkRateLimit(ip, 3);
    const r4 = checkRateLimit(ip, 3);
    assert(r4.allowed === false && r4.remaining === 0, "Rate limit: 4th request blocked (exceeds max 3)");

    // COGS Validations
    assert(validateCOGS(250, 1000) === true, "Valid COGS accepted (250 <= 1000)");
    assert(validateCOGS(-50, 1000) === false, "Negative COGS rejected (-50)");
    assert(validateCOGS(1500, 1000) === false, "COGS exceeding price rejected (1500 > 1000)");

    // RTO Loss Validations
    assert(validateRTOEvent(150, 2000) === true, "Valid RTO amount accepted");
    assert(validateRTOEvent(-10, 2000) === false, "Negative RTO amount rejected");
    assert(validateRTOEvent(3000, 2000) === false, "RTO loss exceeding order total rejected");

    // Email Validation
    assert(validateEmail("merchant@store.com") === true, "Valid email format accepted");
    assert(validateEmail("invalid-email-address") === false, "Invalid email format rejected");

    // CORS Headers
    const validShopifyReq = new Request("https://profitrx.app/api/cod-rules", {
      headers: { origin: "https://merchant-store.myshopify.com" },
    });
    const validCors = getCorsHeaders(validShopifyReq);
    assert(validCors["Access-Control-Allow-Origin"] === "https://merchant-store.myshopify.com", "CORS permits .myshopify.com origin");

    const evilReq = new Request("https://profitrx.app/api/cod-rules", {
      headers: { origin: "https://evil-attacker.com" },
    });
    const evilCors = getCorsHeaders(evilReq);
    assert(evilCors["Access-Control-Allow-Origin"] === "null", "CORS blocks unauthorized origin");

    // ─────────────────────────────────────────────────────────────
    // PART 2: Comprehensive Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing Strict Multi-Tenant Data Isolation ---");

    // Seed Shop A
    await prisma.order.create({
      data: {
        id: "gid://shopify/Order/901",
        shop: SHOP_A,
        orderNumber: 901,
        totalPrice: 2000,
        subtotalPrice: 1800,
        totalTax: 200,
        shippingPrice: 0,
        isCOD: true,
        gateway: "manual",
        financialStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        customerName: "Alice Tenant",
        createdAt: new Date(),
        processedAt: new Date(),
      },
    });

    await CogsRepository.upsertManualOverride(SHOP_A, "prod-901", 600);

    await AlertRepository.createAlert(SHOP_A, {
      type: "SECURITY_TEST",
      severity: "INFO",
      message: "Shop A isolation test alert",
    });

    await SettingsRepository.upsertStoreSettings(SHOP_A, {
      defaultCOGSPct: 35,
      defaultForwardShipping: 55,
      defaultReturnShipping: 65,
    });

    // Query Shop B - must return zero results
    const shopBOrders = await OrderRepository.findByShop(SHOP_B);
    assert(shopBOrders.length === 0, "Shop B cannot access Shop A orders");

    const shopBCogs = await CogsRepository.findByShop(SHOP_B);
    assert(shopBCogs.length === 0, "Shop B cannot access Shop A COGS");

    const shopBAlerts = await AlertRepository.findActiveByShop(SHOP_B);
    assert(shopBAlerts.length === 0, "Shop B cannot access Shop A alerts");

    const shopBOrderLookup = await OrderRepository.findById(SHOP_B, "901");
    assert(shopBOrderLookup === null, "Shop B cannot access Shop A order by ID (901)");

    // ─────────────────────────────────────────────────────────────
    // Clean test data
    // ─────────────────────────────────────────────────────────────
    await withRetry(async () => {
      await prisma.cODOrder.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.alert.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.productCOGS.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.rTOEvent.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
    });

    console.log("\n=================================================");
    console.log(`BLOCK 7 AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runSecurityAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
