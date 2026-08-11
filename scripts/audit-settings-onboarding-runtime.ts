import { SettingsApplicationService } from "../app/application/settings/settings.application";
import { OnboardingApplicationService } from "../app/application/onboarding/onboarding.application";
import { SettingsRepository } from "../app/infrastructure/repositories/settings.repository";
import prisma from "../app/db.server";

async function runSettingsOnboardingAudit() {
  console.log("=================================================");
  console.log("PROFITRX BLOCK 2 RUNTIME INTEGRATION AUDIT: SETTINGS & ONBOARDING");
  console.log("=================================================");

  const SHOP_A = "audit-settings-alpha.myshopify.com";
  const SHOP_B = "audit-settings-beta.myshopify.com";
  const EMPTY_SHOP = "audit-settings-empty.myshopify.com";

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

  async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1500): Promise<T> {
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
      await prisma.productCOGS.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    const now = new Date();

    // ─────────────────────────────────────────────────────────────
    // PART 1: SettingsApplicationService Validation & Persistence
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing SettingsApplicationService Validation & Boundaries ---");

    const initialSettings = await SettingsApplicationService.getSettingsData(SHOP_A, "merchant@example.com");
    assert(initialSettings.settings !== null, "Fresh shop receives default StoreSettings");
    assert(initialSettings.settings.defaultCOGSPct === 40, "Default COGS percent initialized to 40%");

    // Test Validation - Negative Shipping
    const invalidShipping = await SettingsApplicationService.saveSettings(SHOP_A, {
      defaultForwardShipping: -50,
      defaultReturnShipping: 70,
      defaultCODHandling: 40,
      defaultPackaging: 10,
      defaultGatewayFeePct: 2,
      gatewayFixedFee: 0,
      rtoDetectionPattern: "rto",
      alertEmail: "admin@store.com",
      rtoThreshold: 10,
      marginThreshold: 15,
    });
    assert(invalidShipping.success === false, "Rejects negative shipping costs");

    // Test Validation - Invalid Percentages (>100%)
    const invalidPercent = await SettingsApplicationService.saveSettings(SHOP_A, {
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
      defaultCODHandling: 40,
      defaultPackaging: 10,
      defaultGatewayFeePct: 150,
      gatewayFixedFee: 0,
      rtoDetectionPattern: "rto",
      alertEmail: "admin@store.com",
      rtoThreshold: 10,
      marginThreshold: 15,
    });
    assert(invalidPercent.success === false, "Rejects gateway fee percentage > 100%");

    // Test Validation - Invalid WhatsApp Phone
    const invalidPhone = await SettingsApplicationService.saveSettings(SHOP_A, {
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
      defaultCODHandling: 40,
      defaultPackaging: 10,
      defaultGatewayFeePct: 2,
      gatewayFixedFee: 0,
      rtoDetectionPattern: "rto",
      alertEmail: "admin@store.com",
      rtoThreshold: 10,
      marginThreshold: 15,
      whatsappEnabled: true,
      whatsappPhone: "not-a-valid-phone",
    });
    assert(invalidPhone.success === false, "Rejects invalid WhatsApp phone number format");

    // Save Valid Settings
    const validSave = await SettingsApplicationService.saveSettings(SHOP_A, {
      defaultForwardShipping: 65,
      defaultReturnShipping: 75,
      defaultCODHandling: 45,
      defaultPackaging: 12,
      defaultGatewayFeePct: 2.5,
      gatewayFixedFee: 5,
      rtoDetectionPattern: "rto,failed_delivery",
      alertEmail: "ops@alphastore.com",
      rtoThreshold: 12,
      marginThreshold: 18,
      gstin: "27AABCU9603R1ZM",
      isGstRegistered: true,
      gstRate: 18,
      whatsappEnabled: true,
      whatsappPhone: "+919876543210",
    });
    assert(validSave.success === true, "Valid store settings saved successfully");

    const updatedSettings = await SettingsApplicationService.getSettingsData(SHOP_A);
    assert(updatedSettings.settings.defaultForwardShipping === 65, "Persisted defaultForwardShipping = 65");
    assert(updatedSettings.settings.gstin === "27AABCU9603R1ZM", "Persisted GSTIN = 27AABCU9603R1ZM");
    assert(updatedSettings.settings.whatsappPhone === "+919876543210", "Persisted WhatsApp phone number");

    // ─────────────────────────────────────────────────────────────
    // PART 2: Onboarding Progress & State Engine
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing OnboardingApplicationService Progress Tracking ---");

    const emptyOnboarding = await OnboardingApplicationService.getOnboardingState(EMPTY_SHOP, "host-empty");
    assert(emptyOnboarding.progress.storeConnected === true, "Store connected is true");
    assert(emptyOnboarding.progress.ordersSynced === false, "Orders synced is false for fresh store");
    assert(emptyOnboarding.progress.cogsConfigured === false, "COGS configured is false for fresh store");
    assert(emptyOnboarding.onboardingCompleted === false, "Onboarding completed is false initially");

    // Seed Orders and COGS for Shop A
    await prisma.order.create({
      data: {
        id: "gid://shopify/Order/501",
        shop: SHOP_A,
        orderNumber: 501,
        totalPrice: 3000,
        subtotalPrice: 2700,
        totalTax: 300,
        shippingPrice: 0,
        isCOD: true,
        gateway: "manual",
        financialStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        createdAt: now,
        processedAt: now,
      },
    });

    await prisma.productCOGS.create({
      data: {
        shop: SHOP_A,
        productId: "prod-1",
        cost: 800,
        source: "manual_override",
      },
    });

    const populatedOnboarding = await OnboardingApplicationService.getOnboardingState(SHOP_A, "host-a");
    assert(populatedOnboarding.progress.ordersSynced === true, "Orders synced detected as true");
    assert(populatedOnboarding.progress.cogsConfigured === true, "COGS configured detected as true");
    assert(populatedOnboarding.previewRevenue === 3000, "Preview revenue matches order total (3,000)");

    // Save Step & Complete Onboarding
    await OnboardingApplicationService.saveStep(SHOP_A, 4);
    const stepState = await OnboardingApplicationService.getOnboardingState(SHOP_A, "host-a");
    assert(stepState.currentStep === 4, "Onboarding step saved as 4");

    await OnboardingApplicationService.completeOnboarding(SHOP_A);
    const completeState = await OnboardingApplicationService.getOnboardingState(SHOP_A, "host-a");
    assert(completeState.onboardingCompleted === true, "Onboarding marked as completed");

    // ─────────────────────────────────────────────────────────────
    // PART 3: Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Testing Tenant Isolation ---");

    const shopBSettings = await SettingsApplicationService.getSettingsData(SHOP_B);
    assert(shopBSettings.settings.gstin !== "27AABCU9603R1ZM", "Tenant isolation: Shop B has distinct settings from Shop A");

    const shopBOnboarding = await OnboardingApplicationService.getOnboardingState(SHOP_B, "host-b");
    assert(shopBOnboarding.onboardingCompleted === false, "Tenant isolation: Shop B onboarding not completed by Shop A");

    // ─────────────────────────────────────────────────────────────
    // Clean test data
    // ─────────────────────────────────────────────────────────────
    await withRetry(async () => {
      await prisma.productCOGS.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    console.log("\n=================================================");
    console.log(`BLOCK 2 AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runSettingsOnboardingAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
