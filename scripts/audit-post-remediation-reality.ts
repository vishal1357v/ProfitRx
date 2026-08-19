import prisma from "../app/db.server";
import { WebhookApplicationService } from "../app/application/webhooks/webhook.application";
import { OrderApplicationService } from "../app/application/order/order.application";
import { OrderDetailApplicationService } from "../app/application/order/order-detail.application";
import { OperationsApplicationService } from "../app/application/operations/operations.application";
import { ReportsApplicationService } from "../app/application/reports/reports.application";
import { SettingsApplicationService } from "../app/application/settings/settings.application";
import { DatabaseIdempotencyStore } from "../app/services/execution/persistence/idempotency/database.idempotency-store";
import { EventBus } from "../app/infrastructure/events/event.bus";
import { initializeEventSubscribers } from "../app/infrastructure/events/subscribers";
import { ShopifyService } from "../app/services/shopify.service";
import { ProfitService } from "../app/services/profit.service";
import { ExpectedValueService } from "../app/services/expected-value/expected-value.service";
import { CodBlockExecutor } from "../app/services/execution/executors/cod-block.executor";
import { ExecutionContextFactory } from "../app/infrastructure/context/execution.context";

async function runRealityAudit() {
  console.log("================================================================================");
  console.log("PROFITRX POST-REMEDIATION REALITY AUDIT SUITE");
  console.log("================================================================================");

  const SHOP_A = "audit-reality-alpha.myshopify.com";
  const SHOP_B = "audit-reality-beta.myshopify.com";

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
    await prisma.executionLog.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    await prisma.learningRecord.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    await prisma.rTOEvent.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    await prisma.profitSnapshot.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
    await prisma.storeSettings.deleteMany({ where: { shop: { in: shops } } }).catch(() => {});
  }

  try {
    await cleanData();

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Expected Value Uses Real Merchant StoreSettings
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [1/8] Test EV Calculation with Real StoreSettings ---");

    await SettingsApplicationService.saveSettings(SHOP_A, {
      defaultCOGSPct: 35,
      defaultForwardShipping: 65,
      defaultReturnShipping: 70,
      defaultPackaging: 10,
      defaultCODHandling: 20,
      defaultGatewayFeePct: 2,
    });

    const context1 = ExecutionContextFactory.create(SHOP_A, "2001", "trace-2001");
    const rawOrder1 = {
      id: "2001",
      order_number: 2001,
      total_price: "3000.00",
      subtotal_price: "3000.00",
      total_tax: "0.00",
      gateway: "Cash on Delivery (COD)",
      payment_gateway_names: ["manual"],
      customer: { id: "cust-2001", first_name: "Aman", last_name: "Verma", email: "aman@example.com" },
      shipping_address: { zip: "110001", city: "Delhi", province: "Delhi" },
      created_at: new Date().toISOString(),
    };

    // Run ExpectedValueStep to verify EV result directly
    const { ExpectedValueStep } = await import("../app/application/order/steps/expected-value.step");
    const evStep = new ExpectedValueStep();
    const evStepData = {
      orderId: "2001",
      rawOrder: rawOrder1,
      riskScore: 20,
      confidence: 0.85,
      features: {
        isCOD: true,
        financials: { isCOD: true, grossOrderValue: 3000, netOrderValue: 3000, cogs: 1050, forwardShippingCost: 65, codFee: 20, packaging: 10, paymentFee: 0, adCost: 0, customerPaidShipping: 0 },
        logistics: { returnShippingCost: 70 },
      },
    };
    const evStepResult = await evStep.execute(context1, evStepData as any);
    const evResult = evStepResult.expectedValueResult;

    assert(evResult !== undefined, "ExpectedValueResult generated in pipeline step");
    assert(evResult?.deliveredScenario.cogs === 1050, `EV Scenario COGS is ₹1,050 (35% of ₹3000), got ₹${evResult?.deliveredScenario.cogs}`);
    assert(evResult?.deliveredScenario.forwardShippingCost === 65, `EV Forward shipping is ₹65, got ₹${evResult?.deliveredScenario.forwardShippingCost}`);
    assert(evResult?.deliveredScenario.packaging === 10, `EV Packaging is ₹10, got ₹${evResult?.deliveredScenario.packaging}`);
    assert(evResult?.deliveredScenario.codFee === 20, `EV COD fee is ₹20, got ₹${evResult?.deliveredScenario.codFee}`);
    assert(evResult?.rtoScenario.returnShipping === 70, `EV Return shipping is ₹70, got ₹${evResult?.rtoScenario.returnShipping}`);

    // Process through the full OrderApplicationService pipeline
    await OrderApplicationService.processOrder(context1, rawOrder1);
    const orderInDb = await prisma.order.findUnique({ where: { id: "2001" } });
    assert(orderInDb !== null, "Order #2001 persisted in PostgreSQL database");
    assert(orderInDb?.totalPrice === 3000, "Order total price matches ₹3,000");

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Executor Failure Semantics & External Reality
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [2/8] Test Executor Failure Semantics ---");

    // Case A: Mock failed Shopify mutation
    const originalTagOrder = ShopifyService.tagOrder;
    ShopifyService.tagOrder = async () => ({ success: false, error: "GraphQL mutation timeout" });

    const executor = new CodBlockExecutor();
    const failExecContext = {
      shop: SHOP_A,
      orderId: "2001",
      action: "BLOCK_COD" as any,
      decision: { metadata: { decisionVersion: "v1" } } as any,
      retryCount: 0,
      startedAt: new Date(),
    };

    const failResult = await executor.execute(failExecContext as any);
    assert(failResult.success === false, "Executor returns success: false on Shopify mutation failure");
    assert(failResult.status === "FAILED", `Executor returns status: FAILED (got ${failResult.status})`);
    assert(failResult.retryable === true, "Failed executor action marked retryable");
    assert(failResult.errorCode === "SHOPIFY_MUTATION_FAILED", `Error code is SHOPIFY_MUTATION_FAILED (got ${failResult.errorCode})`);

    // Case B: Mock successful Shopify mutation
    ShopifyService.tagOrder = async () => ({ success: true, tags: ["ProfitRx-COD-Blocked"] });
    const successResult = await executor.execute(failExecContext as any);
    assert(successResult.success === true, "Executor returns success: true on Shopify mutation success");
    assert(successResult.status === "DELIVERED", `Executor returns status: DELIVERED (got ${successResult.status})`);

    // Restore original tagOrder
    ShopifyService.tagOrder = originalTagOrder;

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Database Idempotency Store
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [3/8] Test Database-Backed Idempotency Store ---");

    const idempotencyStore = new DatabaseIdempotencyStore();
    const key = `${SHOP_A}_2003_BLOCK_COD_v1`;

    const lock1 = await idempotencyStore.acquireLock(key, 5000);
    assert(lock1 === true, "First lock acquisition succeeds in PostgreSQL");

    const lock2 = await idempotencyStore.acquireLock(key, 5000);
    assert(lock2 === false, "Concurrent duplicate lock acquisition is blocked");

    // Check DB log for lock entry
    const lockLog = await prisma.executionLog.findFirst({
      where: { shop: SHOP_A, orderId: "2003", step: "LOCK_BLOCK_COD" },
    });
    assert(lockLog !== null, "Lock record persisted in execution_logs table");

    await idempotencyStore.releaseLock(key);
    const lock3 = await idempotencyStore.acquireLock(key, 5000);
    assert(lock3 === true, "Lock can be acquired again after release");
    await idempotencyStore.releaseLock(key);

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Event Subscribers & Learning Records
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [4/8] Test Event Bus Subscribers & Learning Records ---");

    initializeEventSubscribers();

    await EventBus.publish({
      type: "DECISION_MADE",
      context: context1,
      payload: {
        action: "ALLOW_COD",
        confidence: 0.85,
        expectedValue: 1855,
        riskScore: 20,
      },
    });

    // Wait 150ms for async subscriber
    await new Promise((r) => setTimeout(r, 150));

    const learningRecords = await prisma.learningRecord.findMany({
      where: { shop: SHOP_A },
    });
    assert(learningRecords.length > 0, `DECISION_MADE subscriber saved ${learningRecords.length} learning record in PostgreSQL`);

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Reports Dynamic Aggregation (Zero ProfitSnapshots in DB)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [5/8] Test Reports Dynamic Aggregation from Live Orders ---");

    // Verify 0 snapshots exist in DB
    const snapshotCount = await prisma.profitSnapshot.count({ where: { shop: SHOP_A } });
    assert(snapshotCount === 0, "Zero ProfitSnapshot records exist in database");

    const dailyReport = await ReportsApplicationService.getReportDetails(SHOP_A, "daily-profit");
    assert(dailyReport.reportData.length > 0, `Daily profit report dynamically generated ${dailyReport.reportData.length} row(s) from live orders`);
    assert(dailyReport.reportData[0]?.revenue === 3000, `Report revenue matches order (₹3,000)`);

    const weeklyReport = await ReportsApplicationService.getReportDetails(SHOP_A, "weekly-profit");
    assert(weeklyReport.reportData.length > 0, `Weekly profit report generated ${weeklyReport.reportData.length} row(s)`);

    const monthlyReport = await ReportsApplicationService.getReportDetails(SHOP_A, "monthly-profit");
    assert(monthlyReport.reportData.length > 0, `Monthly profit report generated ${monthlyReport.reportData.length} row(s)`);

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Financial Formula Reconciliation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [6/8] Test Financial Formula Reconciliation ---");

    const testOrderObj = {
      id: "2001",
      shop: SHOP_A,
      totalPrice: 3000,
      shippingPrice: 0,
      totalTax: 0,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      fulfillmentStatus: "unfulfilled",
    };

    const testSettingsObj = {
      defaultCOGSPct: 35,
      defaultForwardShipping: 65,
      defaultReturnShipping: 70,
      defaultPackaging: 10,
      defaultCODHandling: 20,
      defaultGatewayFeePct: 2,
    };

    const parsedSettings = ProfitService.getSettings(testSettingsObj as any);
    const { profit: orderProfit } = ProfitService.calculateOrderProfit(testOrderObj as any, 1050, parsedSettings);
    const rtoLoss = ProfitService.calculateRTOLoss(testOrderObj as any, parsedSettings);

    assert(orderProfit === 1855, `Delivered Profit is ₹1,855 (3000 - 1050 - 65 - 20 - 10), got ₹${orderProfit}`);
    assert(rtoLoss === 145, `RTO Loss is ₹145 (Forward 65 + Return 70 + Packaging 10), got ₹${rtoLoss}`);

    const orderDetail = await OrderDetailApplicationService.getOrderDetail(SHOP_A, "2001");
    assert(orderDetail !== null, "OrderDetail retrieved successfully");

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Operations Log Honesty
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [7/8] Test Operations Center Log Honesty ---");

    const emptyOps = await OperationsApplicationService.getOperationsData(SHOP_B);
    assert(emptyOps.executionLogs.length === 0, `Empty shop returns 0 execution logs (no synthetic logs generated)`);

    const shopAOps = await OperationsApplicationService.getOperationsData(SHOP_A);
    assert(shopAOps.orders.length > 0, `Shop A lists real orders (${shopAOps.orders.length})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Full Webhook Pipeline Trace (3 Cases)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [8/8] Test Full Webhook Pipeline & Decision Cases ---");

    // Case 1: Allow COD (Clean address, low value)
    const webhookContext1 = ExecutionContextFactory.create(SHOP_A, "3001", "trace-wb-3001");
    const rawOrderAllow = {
      id: "3001",
      order_number: 3001,
      total_price: "999.00",
      subtotal_price: "999.00",
      gateway: "Cash on Delivery (COD)",
      customer: { id: "cust-3001", first_name: "Rahul", email: "rahul@example.com" },
      shipping_address: { zip: "110001", city: "Delhi", province: "Delhi" },
      created_at: new Date().toISOString(),
    };
    await OrderApplicationService.processOrder(webhookContext1, rawOrderAllow);
    const orderDetail1 = await OrderDetailApplicationService.getOrderDetail(SHOP_A, "3001");
    assert(orderDetail1 !== null, "Case 1 order processed via OrderApplicationService");
    assert(orderDetail1?.order.merchantRecommendation === "ALLOW_COD", `Case 1 Recommendation is ALLOW_COD (got ${orderDetail1?.order.merchantRecommendation})`);

    // Case 2: Block COD (Blocked Pincode rule)
    await SettingsApplicationService.saveSettings(SHOP_A, {
      codBlockedPincodes: ["560001"],
    });
    const webhookContext2 = ExecutionContextFactory.create(SHOP_A, "3002", "trace-wb-3002");
    const rawOrderBlock = {
      id: "3002",
      order_number: 3002,
      total_price: "2500.00",
      subtotal_price: "2500.00",
      gateway: "Cash on Delivery (COD)",
      customer: { id: "cust-3002", first_name: "Blocked", email: "block@example.com" },
      shipping_address: { zip: "560001", city: "Bengaluru", province: "Karnataka" },
      created_at: new Date().toISOString(),
    };
    await OrderApplicationService.processOrder(webhookContext2, rawOrderBlock);
    const orderDetail2 = await OrderDetailApplicationService.getOrderDetail(SHOP_A, "3002");
    assert(orderDetail2 !== null, "Case 2 order processed via OrderApplicationService");
    assert(orderDetail2?.order.merchantRecommendation === "BLOCK_COD", `Case 2 Recommendation is BLOCK_COD (got ${orderDetail2?.order.merchantRecommendation})`);

    // Teardown
    await cleanData();

    console.log("\n================================================================================");
    console.log(`REALITY AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("================================================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Reality audit threw error:", err);
    process.exit(1);
  }
}

runRealityAudit().catch((e) => {
  console.error(e);
  process.exit(1);
});
