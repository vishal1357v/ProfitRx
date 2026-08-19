import prisma from "../app/db.server";
import { WebhookApplicationService } from "../app/application/webhooks/webhook.application";
import { OrderApplicationService } from "../app/application/order/order.application";
import { OrderDetailApplicationService } from "../app/application/order/order-detail.application";
import { OperationsApplicationService } from "../app/application/operations/operations.application";
import { CodRulesApplicationService } from "../app/application/protection/cod-rules.application";
import { PincodeApplicationService } from "../app/application/protection/pincode.application";
import { OnboardingApplicationService } from "../app/application/onboarding/onboarding.application";
import { SettingsApplicationService } from "../app/application/settings/settings.application";
import { CogsApplicationService } from "../app/application/cogs/cogs.application";
import { ProfitLeaksApplicationService } from "../app/application/analytics/profit-leaks.application";
import { CodVerificationApplicationService } from "../app/application/operations/cod-verification.application";
import { ExecutionContextFactory } from "../app/infrastructure/context/execution.context";
import { EventBus } from "../app/infrastructure/events/event.bus";
import { initializeEventSubscribers } from "../app/infrastructure/events/subscribers";
import { ProfitService } from "../app/services/profit.service";

async function runBetaReadinessMasterAudit() {
  console.log("================================================================================");
  console.log("PROFITRX BETA READINESS MASTER VERIFICATION SUITE");
  console.log("Testing Complete Vertical Slice Architecture & Production Honesty");
  console.log("================================================================================");

  const SHOP_A = "beta-store-alpha.myshopify.com";
  const SHOP_B = "beta-store-beta.myshopify.com";

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, desc: string, extra?: any) {
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      testPassed++;
    } else {
      console.error(`❌ FAIL: ${desc}`, extra !== undefined ? extra : "");
      testFailed++;
    }
  }

  async function cleanData() {
    const shops = [SHOP_A, SHOP_B];
    if ((prisma as any).executionLog) await (prisma as any).executionLog.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    if ((prisma as any).learningRecord) await (prisma as any).learningRecord.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    if ((prisma as any).rTOEvent) await (prisma as any).rTOEvent.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    if ((prisma as any).profitSnapshot) await (prisma as any).profitSnapshot.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    if ((prisma as any).cODOrder) await (prisma as any).cODOrder.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    if ((prisma as any).productCOGS) await (prisma as any).productCOGS.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    if ((prisma as any).pincodeStats) await (prisma as any).pincodeStats.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    if ((prisma as any).order) await (prisma as any).order.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    if ((prisma as any).storeSettings) await (prisma as any).storeSettings.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
  }


  try {
    await cleanData();
    initializeEventSubscribers();

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Onboarding 8-Step State & Progression
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [1/8] Test Onboarding State & Setup Wizard ---");

    const initialOnboarding = await OnboardingApplicationService.getOnboardingState(SHOP_A, "host-123");
    assert(initialOnboarding.onboardingCompleted === false, "Fresh store starts with onboardingCompleted: false");
    assert(initialOnboarding.currentStep === 0, "Fresh store starts at Step 0");

    await OnboardingApplicationService.saveExpenses(SHOP_A, {
      defaultForwardShipping: 65,
      defaultReturnShipping: 75,
      defaultCODHandling: 30,
      defaultPackaging: 12,
      defaultGatewayFeePct: 2,
    });

    await OnboardingApplicationService.saveTaxes(SHOP_A, {
      gstin: "27AAPFU0939F1ZV",
      gstRate: 18,
      isGstRegistered: true,
    });

    await OnboardingApplicationService.completeOnboarding(SHOP_A);
    const completedOnboarding = await OnboardingApplicationService.getOnboardingState(SHOP_A, "host-123");
    assert(completedOnboarding.onboardingCompleted === true, "Onboarding marks completed successfully");
    assert(completedOnboarding.settings.defaultForwardShipping === 65, "Forward shipping ₹65 persisted in store settings");
    assert(completedOnboarding.settings.gstin === "27AAPFU0939F1ZV", "GSTIN persisted in store settings");

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Product COGS Catalog & Truth Labeling
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [2/8] Test Product COGS Catalog & Resolution ---");

    await CogsApplicationService.saveCogs(SHOP_A, {
      "prod_shirt_101": 350,
      "prod_jeans_102": 650,
    });

    const cogsRecords = await prisma.productCOGS.findMany({ where: { shop: SHOP_A } });
    assert(cogsRecords.length === 2, "2 product COGS records created in PostgreSQL");
    assert(cogsRecords.find((c) => c.productId === "prod_shirt_101")?.manualOverride === 350, "Shirt COGS override ₹350");

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Webhook Pipeline Ingestion & Real Order Processing
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [3/8] Test Webhook Ingestion Pipeline ---");

    const orderPayloadAllow = {
      id: "9001",
      order_number: 9001,
      total_price: "1500.00",
      subtotal_price: "1500.00",
      total_tax: "0.00",
      gateway: "Cash on Delivery (COD)",
      payment_gateway_names: ["manual"],
      customer: { id: "cust-9001", first_name: "Vikram", email: "vikram@example.com" },
      shipping_address: { zip: "110001", city: "New Delhi", province: "Delhi" },
      line_items: [
        { id: "li-1", product_id: "prod_shirt_101", title: "Linen Shirt", price: "1500.00", quantity: 1 },
      ],
      created_at: new Date().toISOString(),
    };

    await WebhookApplicationService.handleOrderCreated(SHOP_A, orderPayloadAllow);

    const persistedOrder = await prisma.order.findUnique({ where: { id: "9001" } });
    assert(persistedOrder !== null, "Order #9001 persisted in database via webhook pipeline");
    assert(persistedOrder?.totalPrice === 1500, "Order total price matches ₹1,500");
    assert(persistedOrder?.isCOD === true, "Order recognized as COD");

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Signature Order Intelligence Detail View & Financial Math
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [4/8] Test Signature Order Intelligence & Economics Math ---");

    const orderDetail = await OrderDetailApplicationService.getOrderDetail(SHOP_A, "9001");
    assert(orderDetail !== null, "OrderDetail retrieved successfully");
    assert(Boolean(orderDetail?.intelligence?.hasRealCogs || (orderDetail?.intelligence?.cogsUsed ?? 0) > 0), "COGS resolved for order");
    assert(Boolean(orderDetail?.intelligence?.economicJustification && orderDetail.intelligence.economicJustification.length > 0), "Economic justification summary generated");
    assert(Boolean(orderDetail?.executionLogs && orderDetail.executionLogs.length > 0), `Execution audit trail contains ${orderDetail?.executionLogs?.length ?? 0} events`);

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Manual Override & Audit Logging
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [5/8] Test Manual Merchant Override ---");

    const overrideResult = await OrderDetailApplicationService.overrideDecision(
      SHOP_A,
      "9001",
      "BLOCK_COD",
      "High fraud suspicion on WhatsApp follow-up"
    );
    assert(overrideResult.success === true, "Override executed successfully");

    const updatedDetail = await OrderDetailApplicationService.getOrderDetail(SHOP_A, "9001");
    assert(updatedDetail?.order.merchantRecommendation === "BLOCK_COD", "Order recommendation updated to BLOCK_COD");

    const overrideLog = await prisma.executionLog.findFirst({
      where: { shop: SHOP_A, orderId: "9001", step: "MERCHANT_OVERRIDE" },
    });
    assert(overrideLog !== null, "MERCHANT_OVERRIDE recorded in execution_logs table");
    assert(Boolean(overrideLog?.message?.includes("High fraud suspicion")), "Override reason captured in audit trail");


    // ─────────────────────────────────────────────────────────────
    // TEST 6: Operations Center Decision Queue
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [6/8] Test Operations Center & Action Queue ---");

    const opsData = await OperationsApplicationService.getOperationsData(SHOP_A);
    assert(opsData.orders.length > 0, `Operations lists ${opsData.orders.length} orders`);
    assert(opsData.summary.totalCodOrders === 1, "Summary reports 1 COD order");
    assert(opsData.summary.atRiskCodCount >= 0, "At-risk COD count calculated");

    // Test quick action from Operations
    const quickActionResult = await OperationsApplicationService.applyOrderAction(
      SHOP_A,
      "9001",
      "OTP_VERIFY",
      "Requested verification from Operations center"
    );
    assert(quickActionResult.success === true, "Operations quick action applied");

    // ─────────────────────────────────────────────────────────────
    // TEST 7: COD Rules & Pincode Protection
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [7/8] Test COD Rules & Pincode Protection ---");

    const ruleResult = await CodRulesApplicationService.saveMerchantRules(SHOP_A, {
      rulesRejectCodOver: 5000,
      rulesRequirePrepaidAbove: 3000,
      rulesAutoFlagRepeatOffenders: true,
      rulesAutoRequireOtp: true,
    });
    assert(ruleResult.success === true, "Merchant rules saved");

    const togglePincodeResult = await CodRulesApplicationService.togglePincode(SHOP_A, "560001");
    assert(togglePincodeResult.success === true, "Pincode 560001 toggled");

    const heatmapData = await PincodeApplicationService.getPincodeHeatmapData(SHOP_A, "host-123");
    assert(heatmapData.hasAccess === true, "Pincode heatmap data accessible");
    assert(heatmapData.codStats.orders > 0, "COD statistics computed");

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Multi-Tenant Shop Isolation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [8/8] Test Multi-Tenant Shop Isolation ---");

    const shopBOps = await OperationsApplicationService.getOperationsData(SHOP_B);
    assert(shopBOps.orders.length === 0, "Shop B has 0 orders (strict tenant isolation)");
    assert(shopBOps.executionLogs.length === 0, "Shop B has 0 execution logs");

    const shopBDetail = await OrderDetailApplicationService.getOrderDetail(SHOP_B, "9001");
    assert(shopBDetail === null, "Shop B cannot access Shop A's order #9001");

    // Teardown
    await cleanData();

    console.log("\n================================================================================");
    console.log(`BETA READINESS MASTER AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("================================================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Master audit threw unexpected error:", err);
    process.exit(1);
  }
}

runBetaReadinessMasterAudit().catch((e) => {
  console.error(e);
  process.exit(1);
});
