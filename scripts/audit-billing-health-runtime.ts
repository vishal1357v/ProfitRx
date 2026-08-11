import { SubscriptionRepository } from "../app/infrastructure/repositories/subscription.repository";
import { AlertRepository } from "../app/infrastructure/repositories/alert.repository";
import { AlertsApplicationService } from "../app/application/health/alerts.application";
import { BillingApplicationService } from "../app/application/billing/billing.application";
import { HealthApplicationService } from "../app/application/health/health.application";
import prisma from "../app/db.server";

async function runBillingHealthAudit() {
  console.log("=================================================");
  console.log("PROFITRX BLOCK 3 RUNTIME INTEGRATION AUDIT: BILLING, HEALTH & ALERTS");
  console.log("=================================================");

  const SHOP_A = "audit-billing-alpha.myshopify.com";
  const SHOP_B = "audit-billing-beta.myshopify.com";
  const EMPTY_SHOP = "audit-billing-empty.myshopify.com";

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
      await prisma.alert.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.subscription.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    const now = new Date();

    // ─────────────────────────────────────────────────────────────
    // PART 1: SubscriptionRepository & Quota Logic
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing SubscriptionRepository Quota Engine ---");

    // Plan mappings
    assert(SubscriptionRepository.mapPlanDetails("FREE").orderLimit === 50, "FREE plan limit is 50 orders");
    assert(SubscriptionRepository.mapPlanDetails("STARTER").orderLimit === 500, "STARTER plan limit is 500 orders");
    assert(SubscriptionRepository.mapPlanDetails("GROWTH").orderLimit === 2000, "GROWTH plan limit is 2000 orders");
    assert(SubscriptionRepository.mapPlanDetails("PRO").orderLimit === null, "PRO plan has unlimited orders (null)");

    // Upsert subscription
    const createdSub = await SubscriptionRepository.upsertSubscription(SHOP_A, {
      plan: "GROWTH",
      status: "ACTIVE",
      shopifyChargeId: "gid://shopify/AppSubscription/991",
    });
    assert(createdSub.plan === "GROWTH", "Subscription plan persisted as GROWTH");
    assert(createdSub.orderLimit === 2000, "Order limit set to 2000");
    assert(createdSub.ordersUsed === 0, "Initial orders used is 0");

    // Increment usage
    const updatedSub = await SubscriptionRepository.incrementOrdersUsed(SHOP_A, 15);
    assert(updatedSub !== null && updatedSub.ordersUsed === 15, "Incremented orders used to 15");

    // ─────────────────────────────────────────────────────────────
    // PART 2: AlertRepository & AlertsApplicationService
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing AlertsApplicationService & Alert Lifecycle ---");

    // Create alerts
    const alert1 = await AlertRepository.createAlert(SHOP_A, {
      type: "HIGH_RTO",
      severity: "WARNING",
      message: "Pincode 110001 has 35% RTO rate in the last 7 days",
    });
    assert(alert1.isRead === false, "Created alert is unread");

    const alert2 = await AlertRepository.createAlert(SHOP_A, {
      type: "PROFIT_DROP",
      severity: "CRITICAL",
      message: "COD Profit margin dropped below 15%",
    });
    assert(alert2.id !== alert1.id, "Second alert created with distinct ID");

    // Fetch active alerts via application service
    const alertsData = await AlertsApplicationService.getAlertsData(SHOP_A, "alerts@store.com");
    assert(alertsData.activeAlerts.length >= 2, "Application service retrieves active unread alerts");

    // Resolve alert
    await AlertsApplicationService.resolveAlert(SHOP_A, alert1.id);
    const resolvedCheck = await AlertRepository.findResolvedByShop(SHOP_A);
    assert(resolvedCheck.some((a) => a.id === alert1.id && a.isRead === true), "Alert marked as read with timestamp");

    // Test Alert Settings Validation
    const invalidAlertThresh = await AlertsApplicationService.updateAlertSettings(SHOP_A, {
      alertEmail: "admin@store.com",
      rtoThreshold: 150, // Invalid >100%
      marginThreshold: 15,
    });
    assert(invalidAlertThresh.success === false, "Rejects RTO alert threshold > 100%");

    const validAlertSettings = await AlertsApplicationService.updateAlertSettings(SHOP_A, {
      alertEmail: "alerts@alphastore.com",
      rtoThreshold: 12,
      marginThreshold: 18,
    });
    assert(validAlertSettings.success === true, "Valid alert thresholds saved successfully");

    // ─────────────────────────────────────────────────────────────
    // PART 3: HealthApplicationService & Profit Health Assessment
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Testing HealthApplicationService Assessment ---");

    const healthData = await HealthApplicationService.getHealthData(SHOP_A);
    assert(healthData.healthStatus !== null, "Health assessment returns status");
    assert(
      ["HEALTHY", "WARNING", "CRITICAL"].includes(healthData.healthStatus.status),
      "Health status is one of HEALTHY | WARNING | CRITICAL"
    );
    assert(Array.isArray(healthData.qualityScores), "Channel quality scores returned as array");

    // ─────────────────────────────────────────────────────────────
    // PART 4: Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 4. Testing Multi-Tenant Isolation ---");

    const shopBAlerts = await AlertRepository.findActiveByShop(SHOP_B);
    assert(shopBAlerts.length === 0, "Tenant isolation: Shop B has 0 alerts (unaffected by Shop A)");

    const shopBSub = await SubscriptionRepository.findByShop(SHOP_B);
    assert(shopBSub === null, "Tenant isolation: Shop B has no subscription yet");

    // ─────────────────────────────────────────────────────────────
    // Clean test data
    // ─────────────────────────────────────────────────────────────
    await withRetry(async () => {
      await prisma.alert.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.subscription.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    console.log("\n=================================================");
    console.log(`BLOCK 3 AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runBillingHealthAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
