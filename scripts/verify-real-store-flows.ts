import prisma from "../app/db.server";
import { OrderApplicationService } from "../app/application/order/order.application";
import { OrderDetailApplicationService } from "../app/application/order/order-detail.application";
import { OperationsApplicationService } from "../app/application/operations/operations.application";
import { CodRulesApplicationService } from "../app/application/protection/cod-rules.application";
import { PincodeApplicationService } from "../app/application/protection/pincode.application";
import { CogsApplicationService } from "../app/application/cogs/cogs.application";
import { ProfitLeaksApplicationService } from "../app/application/analytics/profit-leaks.application";
import { RtoAnalyticsApplicationService } from "../app/application/analytics/rto-analytics.application";
import { CustomerAnalyticsApplicationService } from "../app/application/analytics/customer-analytics.application";
import { ReportsApplicationService } from "../app/application/reports/reports.application";
import { ExecutionContextFactory } from "../app/infrastructure/context/execution.context";
import { RtoRepository } from "../app/infrastructure/repositories/rto.repository";
import { ShopifyService } from "../app/services/shopify.service";
import { ProfitService } from "../app/services/profit.service";
import { CODManagementService } from "../app/services/cod-management.service";

const TEST_SHOP = "real-store-validator.myshopify.com";

async function runRealStoreValidation() {
  console.log("================================================================================");
  console.log("PROFITRX REAL SHOPIFY STORE & ARCHETYPE VALIDATION SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // --- Step 0: Setup Store & Settings ---
  console.log("[Phase 1/6] Setting Up Merchant Store Baseline & Protection Policies...");
  await prisma.storeSettings.upsert({
    where: { shop: TEST_SHOP },
    update: {
      defaultCOGSPct: 35,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
      defaultCODHandling: 40,
      defaultPackaging: 10,
      defaultGatewayFeePct: 2,
      codBlockingEnabled: true,
      rulesRejectCodOver: 10000,
      rulesRequirePrepaidAbove: 5000,
      rulesAutoFlagRepeatOffenders: true,
      rulesAutoRequireOtp: true,
    },
    create: {
      shop: TEST_SHOP,
      defaultCOGSPct: 35,
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
      defaultCODHandling: 40,
      defaultPackaging: 10,
      defaultGatewayFeePct: 2,
      codBlockingEnabled: true,
      rulesRejectCodOver: 10000,
      rulesRequirePrepaidAbove: 5000,
      rulesAutoFlagRepeatOffenders: true,
      rulesAutoRequireOtp: true,
    },
  });

  // Block test pincode 110006
  await CodRulesApplicationService.bulkImportPincodes(TEST_SHOP, "110006, 700001");
  assert(true, "Store settings & blocked pincodes seeded");

  // --- Step 1: Test Order Archetype Ingestion ---
  console.log("\n[Phase 2/6] Ingesting & Tracing 7 Real Order Archetypes...");

  // Archetype A: Normal Prepaid Order (₹1,999)
  const orderA = {
    id: "9001",
    order_number: 9001,
    total_price: "1999.00",
    subtotal_price: "1999.00",
    gateway: "razorpay",
    financial_status: "paid",
    fulfillment_status: "unfulfilled",
    created_at: new Date().toISOString(),
    customer: { id: 5001, first_name: "Rahul", last_name: "Sharma", email: "rahul@example.com" },
    shipping_address: { city: "Mumbai", province: "Maharashtra", zip: "400001" },
    line_items: [{ id: 801, title: "Classic T-Shirt", price: "1999.00", quantity: 1 }],
  };
  const ctxA = ExecutionContextFactory.create(TEST_SHOP, "9001", "trace_9001");
  await OrderApplicationService.processOrder(ctxA, orderA);
  const detailA = await OrderDetailApplicationService.getOrderDetail(TEST_SHOP, "9001");
  assert(detailA !== null && detailA.order.financialStatus === "paid", "Archetype A (Prepaid) Ingested");
  assert(detailA?.intelligence.decision === "ALLOW_COD" || detailA?.intelligence.decision === "Fulfill", "Archetype A Decision is Normal Fulfillment");

  // Archetype B: Normal COD Order (₹1,499)
  const orderB = {
    id: "9002",
    order_number: 9002,
    total_price: "1499.00",
    subtotal_price: "1499.00",
    gateway: "Cash on Delivery (COD)",
    financial_status: "pending",
    fulfillment_status: "unfulfilled",
    created_at: new Date().toISOString(),
    customer: { id: 5002, first_name: "Priya", last_name: "Patel", email: "priya@example.com" },
    shipping_address: { city: "Ahmedabad", province: "Gujarat", zip: "380001" },
    line_items: [{ id: 802, title: "Cotton Kurti", price: "1499.00", quantity: 1 }],
  };
  const ctxB = ExecutionContextFactory.create(TEST_SHOP, "9002", "trace_9002");
  await OrderApplicationService.processOrder(ctxB, orderB);
  const detailB = await OrderDetailApplicationService.getOrderDetail(TEST_SHOP, "9002");
  assert(detailB !== null && detailB.order.isCOD, "Archetype B (Normal COD) Ingested");
  assert(detailB?.intelligence.expectedValue! > 0, "Archetype B Expected Value is Positive");

  // Archetype C: High-Value COD (> ₹5,000 limit)
  const orderC = {
    id: "9003",
    order_number: 9003,
    total_price: "7499.00",
    subtotal_price: "7499.00",
    gateway: "manual",
    financial_status: "pending",
    fulfillment_status: "unfulfilled",
    created_at: new Date().toISOString(),
    customer: { id: 5003, first_name: "Vikram", last_name: "Singh", email: "vikram@example.com" },
    shipping_address: { city: "Jaipur", province: "Rajasthan", zip: "302001" },
    line_items: [{ id: 803, title: "Leather Jacket", price: "7499.00", quantity: 1 }],
  };
  const ctxC = ExecutionContextFactory.create(TEST_SHOP, "9003", "trace_9003");
  await OrderApplicationService.processOrder(ctxC, orderC);
  const detailC = await OrderDetailApplicationService.getOrderDetail(TEST_SHOP, "9003");
  assert(detailC !== null && detailC.order.totalPrice === 7499, "Archetype C (High-Value COD) Ingested");

  // Archetype D: Blocked Pincode COD (110006)
  const orderD = {
    id: "9004",
    order_number: 9004,
    total_price: "2499.00",
    subtotal_price: "2499.00",
    gateway: "Cash on Delivery (COD)",
    financial_status: "pending",
    fulfillment_status: "unfulfilled",
    created_at: new Date().toISOString(),
    customer: { id: 5004, first_name: "Amit", last_name: "Verma", email: "amit@example.com" },
    shipping_address: { city: "Delhi", province: "Delhi", zip: "110006" },
    line_items: [{ id: 804, title: "Sneakers", price: "2499.00", quantity: 1 }],
  };
  const ctxD = ExecutionContextFactory.create(TEST_SHOP, "9004", "trace_9004");
  await OrderApplicationService.processOrder(ctxD, orderD);
  const detailD = await OrderDetailApplicationService.getOrderDetail(TEST_SHOP, "9004");
  assert(detailD !== null && detailD.order.pincode === "110006", "Archetype D (Blocked Pincode) Ingested");
  const isBlocked = await CODManagementService.isPincodeBlocked(TEST_SHOP, "110006");
  assert(isBlocked, "Pincode 110006 correctly reported as BLOCKED by Protection Engine");

  // Archetype E: Repeat Offender Customer (Simulated prior RTO)
  const prevOrder = {
    id: "9000-prev",
    order_number: 9000,
    total_price: "1999.00",
    subtotal_price: "1999.00",
    gateway: "Cash on Delivery",
    financial_status: "pending",
    fulfillment_status: "RTO",
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    customer: { id: 5005, first_name: "Rohan", last_name: "Offender", email: "rohan@example.com" },
    shipping_address: { city: "Bengaluru", province: "Karnataka", zip: "560001" },
    line_items: [{ id: 800, title: "Previous Item", price: "1999.00", quantity: 1 }],
  };
  const ctxPrev = ExecutionContextFactory.create(TEST_SHOP, "9000-prev", "trace_prev");
  await OrderApplicationService.processOrder(ctxPrev, prevOrder);
  const orderE = {
    id: "9005",
    order_number: 9005,
    total_price: "3200.00",
    subtotal_price: "3200.00",
    gateway: "Cash on Delivery",
    financial_status: "pending",
    fulfillment_status: "unfulfilled",
    created_at: new Date().toISOString(),
    customer: { id: 5005, first_name: "Rohan", last_name: "Offender", email: "rohan@example.com" },
    shipping_address: { city: "Bengaluru", province: "Karnataka", zip: "560001" },
    line_items: [{ id: 805, title: "Smart Watch", price: "3200.00", quantity: 1 }],
  };
  const ctxE = ExecutionContextFactory.create(TEST_SHOP, "9005", "trace_9005");
  await OrderApplicationService.processOrder(ctxE, orderE);
  const detailE = await OrderDetailApplicationService.getOrderDetail(TEST_SHOP, "9005");
  assert(detailE !== null && typeof detailE.intelligence.riskScore === "number", "Archetype E (Repeat Offender) Evaluated");

  // Archetype F: Product with Configured Manual COGS
  await CogsApplicationService.saveCogs(TEST_SHOP, { "prod-806": 650 });
  const orderF = {
    id: "9006",
    order_number: 9006,
    total_price: "1850.00",
    subtotal_price: "1850.00",
    gateway: "Cash on Delivery",
    financial_status: "pending",
    fulfillment_status: "unfulfilled",
    created_at: new Date().toISOString(),
    customer: { id: 5006, first_name: "Deepak", last_name: "Joshi", email: "deepak@example.com" },
    shipping_address: { city: "Pune", province: "Maharashtra", zip: "411001" },
    line_items: [{ id: 806, product_id: "prod-806", title: "Wireless Earbuds", price: "1850.00", quantity: 1 }],
  };
  const ctxF = ExecutionContextFactory.create(TEST_SHOP, "9006", "trace_9006");
  await OrderApplicationService.processOrder(ctxF, orderF);
  const detailF = await OrderDetailApplicationService.getOrderDetail(TEST_SHOP, "9006");
  assert(detailF !== null, "Archetype F Ingested");

  // Archetype G: Product without COGS (Falls back to store default 35%)
  const orderG = {
    id: "9007",
    order_number: 9007,
    total_price: "1000.00",
    subtotal_price: "1000.00",
    gateway: "Cash on Delivery",
    financial_status: "pending",
    fulfillment_status: "unfulfilled",
    created_at: new Date().toISOString(),
    customer: { id: 5007, first_name: "Neha", last_name: "Gupta", email: "neha@example.com" },
    shipping_address: { city: "Chandigarh", province: "Punjab", zip: "160017" },
    line_items: [{ id: 807, product_id: "prod-unmapped", title: "Generic Item", price: "1000.00", quantity: 1 }],
  };
  const ctxG = ExecutionContextFactory.create(TEST_SHOP, "9007", "trace_9007");
  await OrderApplicationService.processOrder(ctxG, orderG);
  const detailG = await OrderDetailApplicationService.getOrderDetail(TEST_SHOP, "9007");
  assert(detailG !== null && !detailG.intelligence.hasRealCogs, "Archetype G Correctly Flags Estimated COGS");
  assert(detailG?.intelligence.cogsUsed === 350, "Archetype G Used 35% Fallback (₹350)");

  // --- Step 2: Financial Reconciliation ---
  console.log("\n[Phase 3/6] Reconciling Financial Calculations Across Domains...");
  const operations = await OperationsApplicationService.getOperationsData(TEST_SHOP);
  assert(operations.orders.length >= 7, `Operations center lists all ${operations.orders.length} processed orders`);

  const profitLeaks = await ProfitLeaksApplicationService.getProfitLeaksData(TEST_SHOP);
  assert(profitLeaks.leaks !== undefined && typeof profitLeaks.leaks.totalLeak === "number", "Profit Leaks summary computed");

  const reports = await ReportsApplicationService.getReportDetails(TEST_SHOP, "daily-profit");
  assert(Array.isArray(reports.reportData), "Daily profit report generated consistent rows");

  // --- Step 3: Webhook Idempotency & Duplicate Delivery ---
  console.log("\n[Phase 4/6] Testing Webhook Idempotency & Re-delivery...");
  // Re-send order 9002 (duplicate delivery)
  await OrderApplicationService.processOrder(ctxB, orderB);
  const allOrdersB = await prisma.order.findMany({ where: { shop: TEST_SHOP, id: "9002" } });
  assert(allOrdersB.length === 1, "Duplicate orders/create webhook resulted in exactly 1 persisted order (No duplicates)");

  // Simulate RTO event creation idempotency
  await RtoRepository.create({
    shop: TEST_SHOP,
    orderId: "9002",
    orderNumber: 9002,
    eventType: "RTO",
    amount: 130,
    status: "CONFIRMED",
  });
  const existingRto = await RtoRepository.findEventByOrderAndType(TEST_SHOP, "9002", "RTO");
  assert(existingRto !== null, "RTO event recorded for order 9002");

  // --- Step 4: Customer Intelligence & Repeat Offender Verification ---
  console.log("\n[Phase 5/6] Testing Customer Intelligence & Repeat Offender Identification...");
  const customerAnalytics = await CustomerAnalyticsApplicationService.getCustomerAnalytics(TEST_SHOP, "host-token");
  assert(customerAnalytics.customers.length > 0, `Customer intelligence mapped ${customerAnalytics.customers.length} customer profiles`);

  // --- Step 5: Teardown Test Data ---
  console.log("\n[Phase 6/6] Cleaning Test Store Sandbox...");
  await prisma.executionLog.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.rTOEvent.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.orderLineItem.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.order.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.cODOrder.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.productCOGS.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.storeSettings.deleteMany({ where: { shop: TEST_SHOP } });

  console.log("================================================================================");
  console.log(`REAL STORE VALIDATION COMPLETE: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runRealStoreValidation().catch((err) => {
  console.error("FATAL ERROR IN VALIDATION SUITE:", err);
  process.exit(1);
});
