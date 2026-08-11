import { ReportsApplicationService } from "../app/application/reports/reports.application";
import { SearchApplicationService } from "../app/application/search/search.application";
import prisma from "../app/db.server";

async function runReportsSearchAudit() {
  console.log("=================================================");
  console.log("PROFITRX BLOCK 4 RUNTIME INTEGRATION AUDIT: REPORTS & SEARCH");
  console.log("=================================================");

  const SHOP_A = "audit-reports-alpha.myshopify.com";
  const SHOP_B = "audit-reports-beta.myshopify.com";
  const EMPTY_SHOP = "audit-reports-empty.myshopify.com";

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
      await prisma.rTOEvent.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.profitSnapshot.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.customerProfile.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.pincodeStats.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.productCOGS.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    const now = new Date();

    // ─────────────────────────────────────────────────────────────
    // PART 1: Seed Test Data for Shop A
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Seeding Multi-Entity Reporting & Search Data ---");

    await prisma.profitSnapshot.create({
      data: {
        shop: SHOP_A,
        date: now,
        revenue: 15000,
        profit: 4500,
        margin: 30.0,
        cogs: 6000,
        fees: 1500,
        rtoLoss: 1200,
        shippingOverage: 300,
        discountLoss: 1000,
        codFailureLoss: 500,
        totalLeak: 3000,
        rtoRate: 8.0,
        codRate: 60.0,
        healthStatus: "HEALTHY",
      },
    });

    await prisma.order.create({
      data: {
        id: "gid://shopify/Order/601",
        shop: SHOP_A,
        orderNumber: 601,
        totalPrice: 4999,
        subtotalPrice: 4500,
        totalTax: 499,
        shippingPrice: 0,
        isCOD: true,
        gateway: "manual",
        financialStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        customerName: "Arjun Verma",
        riskScore: 78,
        riskLevel: "HIGH",
        createdAt: now,
        processedAt: now,
      },
    });

    await prisma.productCOGS.create({
      data: {
        shop: SHOP_A,
        productId: "hercules-tee",
        cost: 450,
        source: "manual_override",
      },
    });

    await prisma.customerProfile.create({
      data: {
        shop: SHOP_A,
        customerId: "cust-601",
        customerName: "Arjun Verma",
        customerEmail: "arjun@example.com",
        orderCount: 4,
        totalRevenue: 12000,
        totalProfit: 4000,
        ltv: 12000,
        aov: 3000,
      },
    });

    await prisma.pincodeStats.create({
      data: {
        shop: SHOP_A,
        pincode: "110001",
        city: "New Delhi",
        totalOrders: 100,
        codOrders: 60,
        rtoCount: 6,
        rtoRate: 10.0,
        riskLevel: "LOW",
      },
    });

    await prisma.rTOEvent.create({
      data: {
        shop: SHOP_A,
        orderId: "601",
        orderNumber: 601,
        eventType: "RTO",
        reason: "Customer refused delivery",
        amount: 250,
        status: "CONFIRMED",
      },
    });

    // ─────────────────────────────────────────────────────────────
    // PART 2: ReportsApplicationService Generation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing ReportsApplicationService Report Generators ---");

    const dailyReport = await ReportsApplicationService.getReportDetails(SHOP_A, "daily-profit");
    assert(dailyReport.reportData.length === 1, "Daily profit report returned 1 snapshot");
    assert(dailyReport.reportData[0].revenue === 15000, "Daily profit report revenue = 15000");

    const rtoReport = await ReportsApplicationService.getReportDetails(SHOP_A, "rto-report");
    assert(rtoReport.reportData.length === 1, "RTO report returned 1 event");
    assert(rtoReport.reportData[0].orderNumber === 601, "RTO report order number matches #601");

    const custReport = await ReportsApplicationService.getReportDetails(SHOP_A, "customer-report");
    assert(custReport.reportData.length === 1, "Customer report returned 1 customer profile");
    assert(custReport.reportData[0].name === "Arjun Verma", "Customer name matches Arjun Verma");

    const leakReport = await ReportsApplicationService.getReportDetails(SHOP_A, "profit-leak-report");
    assert(leakReport.reportData.length === 1, "Profit leak report returned 1 snapshot");
    assert(leakReport.reportData[0].rtoLoss === 1200, "Profit leak RTO loss matches snapshot (1200)");

    // ─────────────────────────────────────────────────────────────
    // PART 3: SearchApplicationService Multi-Entity Search
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Testing SearchApplicationService Universal Querying ---");

    // Short query ignored
    const shortSearch = await SearchApplicationService.search(SHOP_A, "a");
    assert(shortSearch.length === 0, "Queries < 2 characters return empty array");

    // Search by numeric Order Number
    const orderSearch = await SearchApplicationService.search(SHOP_A, "601");
    assert(orderSearch.some((r) => r.category === "order" && r.url === "/app/orders/601"), "Matches order #601 with deep link /app/orders/601");
    assert(orderSearch.some((r) => r.category === "risk"), "Matches high-risk order #601");

    // Search by customer name
    const nameSearch = await SearchApplicationService.search(SHOP_A, "Arjun");
    assert(nameSearch.some((r) => r.category === "customer" && r.url === "/app/customers"), "Matches customer profile Arjun Verma");

    // Search by product COGS
    const productSearch = await SearchApplicationService.search(SHOP_A, "hercules");
    assert(productSearch.some((r) => r.category === "product" && r.url === "/app/cogs"), "Matches product COGS hercules-tee");

    // Search by pincode
    const pinSearch = await SearchApplicationService.search(SHOP_A, "110001");
    assert(pinSearch.some((r) => r.category === "pincode" && r.url === "/app/rto-heatmap"), "Matches pincode 110001");

    // ─────────────────────────────────────────────────────────────
    // PART 4: Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 4. Testing Multi-Tenant Isolation ---");

    const shopBSearch = await SearchApplicationService.search(SHOP_B, "Arjun");
    assert(shopBSearch.length === 0, "Tenant isolation: Shop B search returns 0 results for Shop A data");

    const shopBReports = await ReportsApplicationService.getReportDetails(SHOP_B, "daily-profit");
    assert(shopBReports.reportData.length === 0, "Tenant isolation: Shop B has 0 daily profit records");

    // ─────────────────────────────────────────────────────────────
    // Clean test data
    // ─────────────────────────────────────────────────────────────
    await withRetry(async () => {
      await prisma.rTOEvent.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.profitSnapshot.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.customerProfile.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.pincodeStats.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.productCOGS.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    console.log("\n=================================================");
    console.log(`BLOCK 4 AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runReportsSearchAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
