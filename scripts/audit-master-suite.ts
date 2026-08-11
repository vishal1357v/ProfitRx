import { OrderDetailApplicationService } from "../app/application/order/order-detail.application";
import { CodRulesApplicationService } from "../app/application/protection/cod-rules.application";
import { PincodeApplicationService } from "../app/application/protection/pincode.application";
import { RtoAnalyticsApplicationService } from "../app/application/analytics/rto-analytics.application";
import { ProfitLeaksApplicationService } from "../app/application/analytics/profit-leaks.application";
import { CustomerAnalyticsApplicationService } from "../app/application/analytics/customer-analytics.application";
import { RoasAnalyticsApplicationService } from "../app/application/analytics/roas-analytics.application";
import { SettingsApplicationService } from "../app/application/settings/settings.application";
import { BillingApplicationService } from "../app/application/billing/billing.application";
import { HealthApplicationService } from "../app/application/health/health.application";
import { AlertsApplicationService } from "../app/application/health/alerts.application";
import { ReportsApplicationService } from "../app/application/reports/reports.application";
import { SearchApplicationService } from "../app/application/search/search.application";
import { OperationsApplicationService } from "../app/application/operations/operations.application";
import { OrderApplicationService } from "../app/application/order/order.application";
import { ExecutionContextFactory } from "../app/infrastructure/context/execution.context";
import { checkRateLimit, validateCOGS, validateRTOEvent, getCorsHeaders } from "../app/utils/security.server";
import prisma from "../app/db.server";

async function runMasterSuite() {
  console.log("================================================================================");
  console.log("PROFITRX MASTER END-TO-END INTEGRATION AUDIT SUITE");
  console.log("================================================================================");

  const SHOP_A = "master-audit-alpha.myshopify.com";
  const SHOP_B = "master-audit-beta.myshopify.com";

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

  async function withRetry<T>(fn: () => Promise<T>, retries = 8, delay = 2000): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        if (i === retries - 1) throw err;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error("Retry limit reached");
  }

  async function cleanTestData() {
    const shops = [SHOP_A, SHOP_B];
    const tables = [
      () => prisma.rTOEvent.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.profitSnapshot.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.customerProfile.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.customerRisk.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.pincodeStats.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.cODOrder.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.alert.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.subscription.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.productCOGS.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.adSpend.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.order.deleteMany({ where: { shop: { in: shops } } }),
      () => prisma.storeSettings.deleteMany({ where: { shop: { in: shops } } }),
    ];

    for (const deleteOp of tables) {
      try {
        await withRetry(deleteOp, 5, 1500);
      } catch (e) {
        // Continue cleaning other tables
      }
    }
  }

  try {
    // 0. Clean test data
    await cleanTestData();

    const now = new Date();

    // ─────────────────────────────────────────────────────────────
    // STEP 1: Ingest Store Settings & Order Pipeline
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [1/10] Seed Store Settings & Run Order Pipeline ---");

    await withRetry(() =>
      SettingsApplicationService.saveSettings(SHOP_A, {
        defaultForwardShipping: 60,
        defaultReturnShipping: 70,
        defaultCODHandling: 40,
        defaultPackaging: 10,
        defaultGatewayFeePct: 2,
        gatewayFixedFee: 0,
        rtoDetectionPattern: "rto,returned",
        alertEmail: "founder@brand.com",
        rtoThreshold: 10,
        marginThreshold: 15,
      })
    );

    const context = ExecutionContextFactory.create(SHOP_A, "1001", "trace-master-1001");
    const rawOrderPayload = {
      id: "1001",
      order_number: 1001,
      total_price: "3499.00",
      subtotal_price: "3100.00",
      total_tax: "399.00",
      financial_status: "pending",
      fulfillment_status: "unfulfilled",
      gateway: "Cash on Delivery (COD)",
      payment_gateway_names: ["manual"],
      customer: {
        id: "cust-1001",
        first_name: "Vikram",
        last_name: "Malhotra",
        email: "vikram@example.com",
        phone: "+919811223344",
        orders_count: 5,
      },
      shipping_address: {
        zip: "110001",
        city: "New Delhi",
        province: "Delhi",
        country_code: "IN",
      },
      line_items: [
        {
          id: "li-1001",
          product_id: "prod-zeus-01",
          title: "Zeus Performance Hoodie",
          price: "3499.00",
          quantity: 1,
        },
      ],
      created_at: now.toISOString(),
    };

    await withRetry(() => OrderApplicationService.processOrder(context, rawOrderPayload));
    const orderDetail = await withRetry(() => OrderDetailApplicationService.getOrderDetail(SHOP_A, "1001"));
    assert(orderDetail !== null, "Order #1001 processed and retrieved via OrderDetailApplicationService");
    assert(orderDetail !== null && typeof orderDetail.order.riskScore === "number", "Computed dynamic risk score for order");

    // ─────────────────────────────────────────────────────────────
    // STEP 2: Operations Slice
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [2/10] Operations Vertical Slice ---");

    const opsData = await withRetry(() => OperationsApplicationService.getOperationsData(SHOP_A));
    assert(opsData.orders.length === 1, "Operations data lists processed order");

    // ─────────────────────────────────────────────────────────────
    // STEP 3: Protection (COD Rules & Pincode Heatmap) Slices
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [3/10] Protection (COD Rules & Pincodes) Vertical Slices ---");

    const codRules = await withRetry(() => CodRulesApplicationService.getCodRulesData(SHOP_A));
    assert(codRules.codSettings !== undefined, "COD rules loaded");

    const pincodeData = await withRetry(() => PincodeApplicationService.getPincodeHeatmapData(SHOP_A, "test-host"));
    assert(typeof pincodeData.codStats.orders === "number", "Pincode metrics calculated");

    // ─────────────────────────────────────────────────────────────
    // STEP 4: Analytics (RTO Analytics & Profit Leaks) Slices
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [4/10] Analytics (RTO & Profit Leaks) Vertical Slices ---");

    const rtoData = await withRetry(() => RtoAnalyticsApplicationService.getRtoAnalytics(SHOP_A));
    assert(typeof rtoData.stats.rtoRate === "string", "RTO Analytics loaded without error");

    const leaksData = await withRetry(() => ProfitLeaksApplicationService.getProfitLeaksData(SHOP_A));
    assert(typeof leaksData.leaks.totalLeak === "number", "Profit Leaks summary loaded without error");

    // ─────────────────────────────────────────────────────────────
    // STEP 5: Customer Intelligence & Marketing ROAS Slices
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [5/10] Customer Intelligence & ROAS Vertical Slices ---");

    const custData = await withRetry(() => CustomerAnalyticsApplicationService.getCustomerAnalytics(SHOP_A, "test-host"));
    assert(Array.isArray(custData.customers), "Customer intelligence loaded");

    const roasData = await withRetry(() => RoasAnalyticsApplicationService.getRoasAnalytics(SHOP_A, "test-host"));
    assert(roasData.roas !== undefined, "Marketing ROAS loaded");

    // ─────────────────────────────────────────────────────────────
    // STEP 6: Billing, Health & Alerts Slices
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [6/10] Billing, Health & Alerts Vertical Slices ---");

    const mockBilling = {
      check: async () => ({ hasActivePayment: true, oneTimePurchases: [], appSubscriptions: [] }),
      request: async () => {},
      cancel: async () => {},
    };
    const billData = await withRetry(() => BillingApplicationService.getBillingData(SHOP_A, mockBilling, "test-host"));
    assert(billData.plan === "FREE", "Default plan mapped to FREE");

    const healthData = await withRetry(() => HealthApplicationService.getHealthData(SHOP_A));
    assert(healthData.healthStatus !== undefined, "Store health status evaluated");

    const alertsData = await withRetry(() => AlertsApplicationService.getAlertsData(SHOP_A));
    assert(Array.isArray(alertsData.activeAlerts), "Active alerts retrieved");

    // ─────────────────────────────────────────────────────────────
    // STEP 7: Reports & Universal Search Slices
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [7/10] Reports & Universal Search Vertical Slices ---");

    const reportRes = await withRetry(() => ReportsApplicationService.getReportDetails(SHOP_A, "daily-profit"));
    assert(reportRes.reportTitle === "Daily Profit Report", "Daily profit report generated");

    const searchRes = await withRetry(() => SearchApplicationService.search(SHOP_A, "1001"));
    assert(searchRes.some((r) => r.url === "/app/orders/1001"), "Universal search found order with deep link");

    // ─────────────────────────────────────────────────────────────
    // STEP 8: Security, Rate Limiting & Input Validation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [8/10] Security Utilities & Guardrails ---");

    const cors = getCorsHeaders(new Request("https://profitrx.app", { headers: { origin: "https://my-store.myshopify.com" } }));
    assert(cors["Access-Control-Allow-Origin"] === "https://my-store.myshopify.com", "CORS permits valid Shopify store origin");

    assert(validateCOGS(400, 1000) === true, "COGS validator accepts valid cost");
    assert(validateCOGS(-1, 1000) === false, "COGS validator rejects negative cost");

    // ─────────────────────────────────────────────────────────────
    // STEP 9: Multi-Tenant Isolation Verification
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [9/10] Multi-Tenant Isolation Boundary ---");

    const shopBDetail = await withRetry(() => OrderDetailApplicationService.getOrderDetail(SHOP_B, "1001"));
    assert(shopBDetail === null, "Shop B cannot access Shop A order #1001");

    const shopBSearch = await withRetry(() => SearchApplicationService.search(SHOP_B, "1001"));
    assert(shopBSearch.length === 0, "Shop B search returns 0 results for Shop A data");

    // ─────────────────────────────────────────────────────────────
    // STEP 10: Clean test data
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- [10/10] Teardown & Clean Test Records ---");
    await cleanTestData();

    console.log("\n================================================================================");
    console.log(`MASTER AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("================================================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Master audit threw unexpected error:", error);
    process.exit(1);
  }
}

runMasterSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
