import { CustomerAnalyticsApplicationService } from "../app/application/analytics/customer-analytics.application";
import { RoasAnalyticsApplicationService } from "../app/application/analytics/roas-analytics.application";
import { CustomerRepository } from "../app/infrastructure/repositories/customer.repository";
import { AdSpendRepository } from "../app/infrastructure/repositories/ad-spend.repository";
import prisma from "../app/db.server";

async function runPhase4Audit() {
  console.log("=================================================");
  console.log("PROFITRX PHASE 4 RUNTIME INTEGRATION AUDIT");
  console.log("=================================================");

  const SHOP_A = "audit-phase4-alpha.myshopify.com";
  const SHOP_B = "audit-phase4-beta.myshopify.com";
  const EMPTY_SHOP = "audit-phase4-empty.myshopify.com";

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
      await prisma.customerProfile.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.customerRisk.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.adSpend.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.adSpendDaily.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    const now = new Date();

    // ─────────────────────────────────────────────────────────────
    // PART 1: Customer Intelligence Tests
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing Customer Intelligence & Cohort Analytics ---");

    // Seed Customer Profiles for Shop A
    await prisma.customerProfile.createMany({
      data: [
        {
          shop: SHOP_A,
          customerId: "cust-1",
          customerName: "Aarav Sharma",
          customerEmail: "aarav@example.com",
          orderCount: 3,
          totalRevenue: 6000,
          totalProfit: 2400,
          ltv: 6000,
          aov: 2000,
          repeatRate: 66.7,
          cohortMonth: "2025-01",
          channelSource: "ChatGPT",
          firstOrderDate: new Date("2025-01-10"),
          lastOrderDate: new Date("2025-02-15"),
        },
        {
          shop: SHOP_A,
          customerId: "cust-2",
          customerName: "Priya Patel",
          customerEmail: "priya@example.com",
          orderCount: 1,
          totalRevenue: 1500,
          totalProfit: 600,
          ltv: 1500,
          aov: 1500,
          repeatRate: 0,
          cohortMonth: "2025-01",
          channelSource: "Website",
          firstOrderDate: new Date("2025-01-20"),
          lastOrderDate: new Date("2025-01-20"),
        },
        {
          shop: SHOP_A,
          customerId: "cust-3",
          customerName: "Rohan Verma",
          customerEmail: "rohan@example.com",
          orderCount: 2,
          totalRevenue: 4000,
          totalProfit: 1600,
          ltv: 4000,
          aov: 2000,
          repeatRate: 50.0,
          cohortMonth: "2025-02",
          channelSource: "Gemini",
          firstOrderDate: new Date("2025-02-05"),
          lastOrderDate: new Date("2025-03-01"),
        },
      ],
    });

    const customerData = await CustomerAnalyticsApplicationService.getCustomerAnalytics(SHOP_A, "host-a");
    assert(customerData.hasAccess === true, "Customer analytics has access");
    assert(customerData.customers.length === 3, "Customer directory returns exactly 3 profiles");
    assert(customerData.customers[0].name === "Aarav Sharma", "Highest LTV customer sorted first");
    assert(customerData.customers[0].ltv === 6000, "Customer Aarav LTV equals 6000");

    // Check CustomerRepository isolation
    const repoProfiles = await CustomerRepository.findProfilesByShop(SHOP_A);
    assert(repoProfiles.length === 3, "CustomerRepository fetches 3 profiles for Shop A");

    // ─────────────────────────────────────────────────────────────
    // PART 2: Marketing ROAS & Ad Spend Tests
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing Marketing ROAS & Ad Spend Management ---");

    // Seed Orders for Shop A (Total Revenue = 15,000)
    await prisma.order.createMany({
      data: [
        { id: "gid://shopify/Order/301", shop: SHOP_A, orderNumber: 301, totalPrice: 5000, subtotalPrice: 4500, totalTax: 500, shippingPrice: 0, isCOD: false, gateway: "Razorpay", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
        { id: "gid://shopify/Order/302", shop: SHOP_A, orderNumber: 302, totalPrice: 10000, subtotalPrice: 9000, totalTax: 1000, shippingPrice: 0, isCOD: false, gateway: "Shopify Payments", financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: now, processedAt: now },
      ],
    });

    // Save Manual Ad Spend
    const saveMeta = await RoasAnalyticsApplicationService.saveAdSpend(SHOP_A, {
      month: "2025-01",
      channel: "Meta",
      amount: 3000,
    });
    assert(saveMeta.success === true, "Saved Meta ad spend of ₹3,000");

    const saveGoogle = await RoasAnalyticsApplicationService.saveAdSpend(SHOP_A, {
      month: "2025-01",
      channel: "Google",
      amount: 2000,
    });
    assert(saveGoogle.success === true, "Saved Google ad spend of ₹2,000");

    // Test Validation Bounds
    const invalidSpend = await RoasAnalyticsApplicationService.saveAdSpend(SHOP_A, {
      month: "",
      channel: "TikTok",
      amount: -500,
    });
    assert(invalidSpend.success === false, "Rejects invalid/negative ad spend input");

    // Fetch ROAS Analytics
    const roasData = await RoasAnalyticsApplicationService.getRoasAnalytics(SHOP_A, "host-a");
    assert(roasData.hasAccess === true, "ROAS analytics has access");
    assert(roasData.roas.totalRevenue === 15000, "Total revenue matches orders sum (₹15,000)");
    assert(roasData.roas.totalAdSpend === 5000, "Total ad spend matches sum (3000 + 2000 = ₹5,000)");
    assert(roasData.roas.blendedROAS === 3.0, "Blended ROAS equals 15,000 / 5,000 = 3.0x");
    assert(roasData.revenueChart.length === 30, "Revenue trend chart has 30 days of points");
    assert(roasData.adSpendRecords.length === 2, "Ad spend records list contains 2 logged entries");

    // ─────────────────────────────────────────────────────────────
    // PART 3: Empty State & Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Testing Empty State Robustness & Multi-Tenant Isolation ---");

    // Empty Shop Test
    const emptyCust = await CustomerAnalyticsApplicationService.getCustomerAnalytics(EMPTY_SHOP, "host-empty");
    assert(emptyCust.customers.length === 0, "Empty shop has 0 customers");
    assert(emptyCust.cohorts.length === 0, "Empty shop has 0 cohorts");

    const emptyRoas = await RoasAnalyticsApplicationService.getRoasAnalytics(EMPTY_SHOP, "host-empty");
    assert(emptyRoas.roas.totalRevenue === 0, "Empty shop total revenue is 0");
    assert(emptyRoas.roas.totalAdSpend === 0, "Empty shop total ad spend is 0");
    assert(emptyRoas.roas.blendedROAS === 0, "Empty shop blended ROAS handles 0 ad spend safely (0x)");
    assert(emptyRoas.adSpendRecords.length === 0, "Empty shop ad spend records is empty array");

    // Shop B Tenant Isolation
    const shopBCust = await CustomerAnalyticsApplicationService.getCustomerAnalytics(SHOP_B, "host-b");
    assert(shopBCust.customers.length === 0, "Tenant isolation: Shop B has 0 customers (unaffected by Shop A)");

    const shopBRoas = await RoasAnalyticsApplicationService.getRoasAnalytics(SHOP_B, "host-b");
    assert(shopBRoas.adSpendRecords.length === 0, "Tenant isolation: Shop B has 0 ad spend records (unaffected by Shop A)");
    assert(shopBRoas.roas.totalAdSpend === 0, "Tenant isolation: Shop B total ad spend is 0");

    // ─────────────────────────────────────────────────────────────
    // Clean up test data
    // ─────────────────────────────────────────────────────────────
    await withRetry(async () => {
      await prisma.customerProfile.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.customerRisk.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.adSpend.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.adSpendDaily.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    console.log("\n=================================================");
    console.log(`PHASE 4 AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runPhase4Audit().catch((err) => {
  console.error(err);
  process.exit(1);
});
