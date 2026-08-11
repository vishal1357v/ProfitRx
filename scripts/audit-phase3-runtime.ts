import { RtoAnalyticsApplicationService } from "../app/application/analytics/rto-analytics.application";
import { ProfitLeaksApplicationService } from "../app/application/analytics/profit-leaks.application";
import { RtoRepository } from "../app/infrastructure/repositories/rto.repository";
import { ProfitRepository } from "../app/infrastructure/repositories/profit.repository";
import { OrderRepository } from "../app/infrastructure/repositories/order.repository";
import prisma from "../app/db.server";

async function runPhase3Audit() {
  console.log("=================================================");
  console.log("PROFITRX PHASE 3A RUNTIME INTEGRATION AUDIT");
  console.log("=================================================");

  const SHOP_A = "audit-phase3-alpha.myshopify.com";
  const SHOP_B = "audit-phase3-beta.myshopify.com";
  const EMPTY_SHOP = "audit-phase3-empty.myshopify.com";

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
    // 0. Clean any previous test data
    await withRetry(async () => {
      await prisma.rTOEvent.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.orderLineItem.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.productCOGS.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    // Seed Store Settings
    await prisma.storeSettings.create({
      data: {
        shop: SHOP_A,
        defaultCOGSPct: 40,
        defaultForwardShipping: 60,
        defaultReturnShipping: 90,
      },
    });

    // Seed Orders for Shop A (8 COD orders, 4 Prepaid orders)
    const now = new Date();
    const ordersA = [
      // 8 COD Orders
      { id: "gid://shopify/Order/201", shop: SHOP_A, orderNumber: 201, totalPrice: 2000, subtotalPrice: 1800, totalTax: 200, shippingPrice: 0, actualShippingCost: 120, discountAmount: 0, isCOD: true, gateway: "Cash on Delivery", financialStatus: "pending", fulfillmentStatus: "RTO", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/202", shop: SHOP_A, orderNumber: 202, totalPrice: 1500, subtotalPrice: 1350, totalTax: 150, shippingPrice: 0, actualShippingCost: 80, discountAmount: 0, isCOD: true, gateway: "COD", financialStatus: "pending", fulfillmentStatus: "RTO", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/203", shop: SHOP_A, orderNumber: 203, totalPrice: 3000, subtotalPrice: 2700, totalTax: 300, shippingPrice: 50, actualShippingCost: 60, discountAmount: 500, isCOD: true, gateway: "manual", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/204", shop: SHOP_A, orderNumber: 204, totalPrice: 1000, subtotalPrice: 900, totalTax: 100, shippingPrice: 0, actualShippingCost: 60, discountAmount: 0, isCOD: true, gateway: "COD", financialStatus: "pending", fulfillmentStatus: "unfulfilled", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/205", shop: SHOP_A, orderNumber: 205, totalPrice: 2500, subtotalPrice: 2250, totalTax: 250, shippingPrice: 0, actualShippingCost: 60, discountAmount: 300, isCOD: true, gateway: "COD", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/206", shop: SHOP_A, orderNumber: 206, totalPrice: 1200, subtotalPrice: 1080, totalTax: 120, shippingPrice: 0, actualShippingCost: 60, discountAmount: 0, isCOD: true, gateway: "COD", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/207", shop: SHOP_A, orderNumber: 207, totalPrice: 1800, subtotalPrice: 1620, totalTax: 180, shippingPrice: 0, actualShippingCost: 60, discountAmount: 0, isCOD: true, gateway: "COD", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/208", shop: SHOP_A, orderNumber: 208, totalPrice: 2200, subtotalPrice: 1980, totalTax: 220, shippingPrice: 0, actualShippingCost: 60, discountAmount: 0, isCOD: true, gateway: "COD", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
      // 4 Prepaid Orders
      { id: "gid://shopify/Order/209", shop: SHOP_A, orderNumber: 209, totalPrice: 4000, subtotalPrice: 3600, totalTax: 400, shippingPrice: 0, actualShippingCost: 60, discountAmount: 400, isCOD: false, gateway: "Razorpay", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/210", shop: SHOP_A, orderNumber: 210, totalPrice: 2000, subtotalPrice: 1800, totalTax: 200, shippingPrice: 0, actualShippingCost: 60, discountAmount: 0, isCOD: false, gateway: "Shopify Payments", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/211", shop: SHOP_A, orderNumber: 211, totalPrice: 1500, subtotalPrice: 1350, totalTax: 150, shippingPrice: 0, actualShippingCost: 60, discountAmount: 0, isCOD: false, gateway: "UPI", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/212", shop: SHOP_A, orderNumber: 212, totalPrice: 2500, subtotalPrice: 2250, totalTax: 250, shippingPrice: 0, actualShippingCost: 60, discountAmount: 0, isCOD: false, gateway: "Cards", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
    ];

    for (const o of ordersA) {
      await prisma.order.create({ data: o });
    }

    // Seed RTO Events for Shop A (Order 201 & 202)
    await prisma.rTOEvent.createMany({
      data: [
        { shop: SHOP_A, orderId: "gid://shopify/Order/201", orderNumber: 201, eventType: "RTO", amount: 250, status: "CONFIRMED", reason: "Customer not available", createdAt: now },
        { shop: SHOP_A, orderId: "gid://shopify/Order/202", orderNumber: 202, eventType: "RTO", amount: 180, status: "CONFIRMED", reason: "Refused at doorstep", createdAt: now },
      ],
    });

    // ─────────────────────────────────────────────────────────────
    // PART 1: RTO Analytics Tests
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing RTO Analytics Calculations & Summary ---");

    const rtoData = await RtoAnalyticsApplicationService.getRtoAnalytics(SHOP_A);
    assert(rtoData.hasOrders === true, "Store has orders");
    assert(rtoData.hasRtoEvents === true, "Store has RTO events");
    assert(rtoData.stats.totalLoss === 430, "Total RTO loss matches sum of events (250 + 180 = 430)");
    assert(rtoData.stats.codCount === 8, "COD order count equals 8");
    assert(rtoData.stats.prepaidCount === 4, "Prepaid order count equals 4");
    assert(rtoData.stats.codPercent === "66.7", "COD percent calculated accurately (8/12 = 66.7%)");
    assert(rtoData.stats.prepaidPercent === "33.3", "Prepaid percent calculated accurately (4/12 = 33.3%)");
    assert(rtoData.stats.rtoRate === "25.0", "COD RTO rate calculated accurately (2/8 = 25.0%)");
    assert(rtoData.chartData.length === 30, "Chart data contains 30 days of data points");

    // Test Bounded Pagination & Server-Side Filtering
    console.log("\n--- 2. Testing RTO Pagination & Server-Side Filters ---");
    const paginated1 = await RtoAnalyticsApplicationService.getRtoAnalytics(SHOP_A, undefined, { page: 1, pageSize: 1 });
    assert(paginated1.rtoEvents.length === 1, "Page size 1 returns exactly 1 item");
    assert(paginated1.pagination.total === 2, "Total count is 2");
    assert(paginated1.pagination.totalPages === 2, "Total pages is 2");

    const filterSearch = await RtoAnalyticsApplicationService.getRtoAnalytics(SHOP_A, undefined, { search: "doorstep" });
    assert(filterSearch.rtoEvents.length === 1 && filterSearch.rtoEvents[0].orderNumber === 202, "Search filter matches 'doorstep' for order #202");

    const filterStatus = await RtoAnalyticsApplicationService.getRtoAnalytics(SHOP_A, undefined, { status: "RESOLVED" });
    assert(filterStatus.rtoEvents.length === 0, "Status filter 'RESOLVED' returns 0 events");

    // Test Log RTO Event validation
    console.log("\n--- 3. Testing RTO Event Creation & Boundary Validations ---");
    const invalidOrder = await RtoAnalyticsApplicationService.logRtoEvent(SHOP_A, {
      orderNumber: 9999,
      amount: 100,
      eventType: "RTO",
      status: "CONFIRMED",
    });
    assert(invalidOrder.success === false && Boolean(invalidOrder.error?.includes("not found")), "Rejects logging event for non-existent order");

    const excessiveAmount = await RtoAnalyticsApplicationService.logRtoEvent(SHOP_A, {
      orderNumber: 203,
      amount: 50000,
      eventType: "RTO",
      status: "CONFIRMED",
    });
    assert(excessiveAmount.success === false && Boolean(excessiveAmount.error?.includes("cannot exceed")), "Rejects loss amount exceeding order total");

    const duplicateEvent = await RtoAnalyticsApplicationService.logRtoEvent(SHOP_A, {
      orderNumber: 201,
      amount: 200,
      eventType: "RTO",
      status: "CONFIRMED",
    });
    assert(duplicateEvent.success === false && Boolean(duplicateEvent.error?.includes("already been logged")), "Rejects duplicate event of same type for order");

    // Log valid event
    const validLog = await RtoAnalyticsApplicationService.logRtoEvent(SHOP_A, {
      orderNumber: 204,
      amount: 150,
      eventType: "COD_FAILURE",
      status: "CONFIRMED",
      reason: "Customer unreachable",
    });
    assert(validLog.success === true, "Valid COD failure event logged successfully");

    const reloadedRto = await RtoAnalyticsApplicationService.getRtoAnalytics(SHOP_A);
    assert(reloadedRto.stats.totalLoss === 580, "Updated total loss reflects new event (430 + 150 = 580)");

    // ─────────────────────────────────────────────────────────────
    // PART 2: Profit Leaks Tests
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 4. Testing Profit Leaks Diagnostics & COGS Transparency ---");

    const leaksData = await ProfitLeaksApplicationService.getProfitLeaksData(SHOP_A);
    assert(leaksData.hasData === true, "Profit leak data is present");
    assert(leaksData.leaks.rtoLoss > 0, "RTO loss is measured and > 0");
    assert(leaksData.leaks.discountLoss === 1200, "Discount loss accurately sums order discounts (500+300+400 = 1200)");
    assert(leaksData.leaks.totalLeak >= leaksData.leaks.rtoLoss + leaksData.leaks.discountLoss, "Total leak combines RTO, shipping, and discounts");
    assert(leaksData.trend.length === 30, "Leak trend has 30 days of stacked values");

    // COGS Transparency check
    assert(leaksData.cogsTransparency.isEstimated === true, "Marked as estimated because no custom ProductCOGS configured");
    assert(typeof leaksData.cogsTransparency.estimationReason === "string", "Explicit estimation reason provided to merchant");

    // Seed a custom product COGS and re-check transparency
    await prisma.productCOGS.create({
      data: {
        shop: SHOP_A,
        productId: "prod-1",
        cost: 400,
      },
    });

    const configuredLeaks = await ProfitLeaksApplicationService.getProfitLeaksData(SHOP_A);
    assert(configuredLeaks.cogsTransparency.isEstimated === false, "Recognizes custom COGS configured (isEstimated = false)");

    // ─────────────────────────────────────────────────────────────
    // PART 3: Affected Orders & Order Intelligence Linking
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 5. Testing Affected Orders Drill-Down to Order Intelligence ---");

    assert(configuredLeaks.affectedOrders.length > 0, "Affected orders drill-down list populated");
    const topAffected = configuredLeaks.affectedOrders[0];
    assert(topAffected.id.startsWith("gid://shopify/Order/"), "Affected order ID is a valid Shopify GID");
    assert(topAffected.leakAmount > 0, "Affected order has positive leak amount");
    assert(typeof topAffected.reason === "string", "Affected order has explanatory leak reason");

    // ─────────────────────────────────────────────────────────────
    // PART 4: Empty State & Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 6. Testing Empty State Robustness & Multi-Tenant Isolation ---");

    // Empty Shop Test
    const emptyRto = await RtoAnalyticsApplicationService.getRtoAnalytics(EMPTY_SHOP);
    assert(emptyRto.hasOrders === false, "Empty shop hasOrders === false");
    assert(emptyRto.hasRtoEvents === false, "Empty shop hasRtoEvents === false");
    assert(emptyRto.stats.totalLoss === 0, "Empty shop totalLoss === 0");
    assert(emptyRto.stats.rtoRate === "0.0", "Empty shop rtoRate === '0.0'");
    assert(emptyRto.rtoEvents.length === 0, "Empty shop rtoEvents is empty array");

    const emptyLeaks = await ProfitLeaksApplicationService.getProfitLeaksData(EMPTY_SHOP);
    assert(emptyLeaks.hasData === false, "Empty shop hasData === false");
    assert(emptyLeaks.leaks.totalLeak === 0, "Empty shop totalLeak === 0");
    assert(emptyLeaks.affectedOrders.length === 0, "Empty shop affectedOrders is empty");

    // Shop B Tenant Isolation
    const shopBRto = await RtoAnalyticsApplicationService.getRtoAnalytics(SHOP_B);
    assert(shopBRto.stats.totalLoss === 0, "Tenant isolation: Shop B has 0 RTO loss (isolated from Shop A)");
    assert(shopBRto.rtoEvents.length === 0, "Tenant isolation: Shop B has 0 RTO events");

    const shopBLeaks = await ProfitLeaksApplicationService.getProfitLeaksData(SHOP_B);
    assert(shopBLeaks.leaks.totalLeak === 0, "Tenant isolation: Shop B has 0 profit leaks");

    // ─────────────────────────────────────────────────────────────
    // Clean up test data
    // ─────────────────────────────────────────────────────────────
    await prisma.rTOEvent.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    await prisma.orderLineItem.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    await prisma.productCOGS.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });

    console.log("\n=================================================");
    console.log(`PHASE 3A AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runPhase3Audit().catch((err) => {
  console.error(err);
  process.exit(1);
});
