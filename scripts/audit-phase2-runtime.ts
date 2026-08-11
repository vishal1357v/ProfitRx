import { CodRulesApplicationService } from "../app/application/protection/cod-rules.application";
import { PincodeApplicationService } from "../app/application/protection/pincode.application";
import { SettingsRepository } from "../app/infrastructure/repositories/settings.repository";
import { PincodeRepository } from "../app/infrastructure/repositories/pincode.repository";
import { OrderRepository } from "../app/infrastructure/repositories/order.repository";
import { RtoRepository } from "../app/infrastructure/repositories/rto.repository";
import prisma from "../app/db.server";

async function runAudit() {
  console.log("=================================================");
  console.log("PROFITRX PHASE 2 RUNTIME REGRESSION AUDIT");
  console.log("=================================================");

  const SHOP_A = "audit-merchant-alpha.myshopify.com";
  const SHOP_B = "audit-merchant-beta.myshopify.com";
  const EMPTY_SHOP = "audit-merchant-empty.myshopify.com";

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
      await prisma.pincodeStats.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    // ─────────────────────────────────────────────────────────────
    // 1. COD Rules Workflow Audit
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing COD Rules Workflow & Policy Updates ---");
    
    // Initial Load
    const initialData = await CodRulesApplicationService.getCodRulesData(SHOP_A);
    assert(initialData.shop === SHOP_A, "Initial COD rules loaded for Shop A");
    assert(Array.isArray(initialData.codSettings.codBlockedPincodes), "COD blocked pincodes is an array");

    // Save New Merchant Rules
    const saveResult = await CodRulesApplicationService.saveMerchantRules(SHOP_A, {
      rulesRejectCodOver: 7500,
      rulesRequirePrepaidAbove: 4500,
      rulesAutoFlagRepeatOffenders: true,
      rulesAutoRequireOtp: true,
    });
    assert(saveResult.success === true, "Merchant rules saved successfully");

    // Reload and Confirm Persistence
    const reloadedRules = await CodRulesApplicationService.getCodRulesData(SHOP_A);
    assert(reloadedRules.storeSettings.rulesRejectCodOver === 7500, "rulesRejectCodOver persisted as 7500");
    assert(reloadedRules.storeSettings.rulesRequirePrepaidAbove === 4500, "rulesRequirePrepaidAbove persisted as 4500");
    assert(reloadedRules.storeSettings.rulesAutoFlagRepeatOffenders === true, "rulesAutoFlagRepeatOffenders persisted as true");
    assert(reloadedRules.storeSettings.rulesAutoRequireOtp === true, "rulesAutoRequireOtp persisted as true");

    // Verify SettingsRepository Domain Compatibility (used by Decision Engine and Shopify Functions)
    const domainPolicy = await SettingsRepository.getMerchantPolicy(SHOP_A);
    assert(domainPolicy.blockCodAboveValue === 7500, "Domain policy blockCodAboveValue reads 7500");
    assert(domainPolicy.requirePrepaidAboveValue === 4500, "Domain policy requirePrepaidAboveValue reads 4500");
    assert(domainPolicy.autoFlagRepeatOffenders === true, "Domain policy autoFlagRepeatOffenders reads true");
    assert(domainPolicy.autoRequireOtp === true, "Domain policy autoRequireOtp reads true");

    // ─────────────────────────────────────────────────────────────
    // 2. Pincode Protection & Multi-Tenant Isolation Audit
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing Pincode Protection & Multi-Tenant Scoping ---");

    // Seed Pincode Stats
    await prisma.pincodeStats.createMany({
      data: [
        { shop: SHOP_A, pincode: "110001", city: "New Delhi", province: "Delhi", totalOrders: 20, codOrders: 15, rtoCount: 6, totalLoss: 1200, rtoRate: 40.0, riskLevel: "CRITICAL" },
        { shop: SHOP_A, pincode: "560001", city: "Bengaluru", province: "Karnataka", totalOrders: 30, codOrders: 10, rtoCount: 1, totalLoss: 180, rtoRate: 10.0, riskLevel: "LOW" },
        { shop: SHOP_B, pincode: "110001", city: "New Delhi", province: "Delhi", totalOrders: 5, codOrders: 5, rtoCount: 0, totalLoss: 0, rtoRate: 0.0, riskLevel: "LOW" },
      ],
    });

    // Toggle Block on Pincode '110001' for Shop A
    const toggleBlock1 = await CodRulesApplicationService.togglePincode(SHOP_A, "110001");
    assert(toggleBlock1.blocked === true, "Toggled pincode 110001 to BLOCKED for Shop A");

    const reloadedBlocked = await CodRulesApplicationService.getCodRulesData(SHOP_A);
    assert(reloadedBlocked.codSettings.codBlockedPincodes.includes("110001"), "Pincode 110001 confirmed present in blocked list");

    // Toggle Unblock on Pincode '110001' for Shop A
    const toggleBlock2 = await CodRulesApplicationService.togglePincode(SHOP_A, "110001");
    assert(toggleBlock2.blocked === false, "Toggled pincode 110001 to UNBLOCKED for Shop A");

    // Bulk Import Pincodes for Shop A
    const bulkImport = await CodRulesApplicationService.bulkImportPincodes(SHOP_A, "110001, 110002\n400001 560001");
    assert(bulkImport.success === true && bulkImport.count === 4, "Bulk imported 4 pincodes successfully");

    const reloadedBulk = await CodRulesApplicationService.getCodRulesData(SHOP_A);
    assert(
      ["110001", "110002", "400001", "560001"].every(pin => reloadedBulk.codSettings.codBlockedPincodes.includes(pin)),
      "All 4 bulk-imported pincodes verified in persisted settings"
    );

    // Multi-tenant check: Shop B must NOT have Shop A's blocked pincodes
    const shopBData = await CodRulesApplicationService.getCodRulesData(SHOP_B);
    assert(shopBData.codSettings.codBlockedPincodes.length === 0, "Tenant isolation: Shop B has 0 blocked pincodes (unaffected by Shop A)");

    // ─────────────────────────────────────────────────────────────
    // 3. RTO Heatmap & Calculation Parity Audit
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Testing RTO Heatmap Calculation Parity ---");

    // Seed realistic Orders for Shop A: 6 COD (2 RTOs), 4 Prepaid (0 RTOs)
    const now = new Date();
    const orderData = [
      // COD Orders (6)
      { id: "gid://shopify/Order/101", shop: SHOP_A, orderNumber: 101, totalPrice: 2000, subtotalPrice: 1800, totalTax: 200, shippingPrice: 0, isCOD: true, gateway: "Cash on Delivery (COD)", financialStatus: "pending", fulfillmentStatus: "RTO", pincode: "110001", city: "New Delhi", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/102", shop: SHOP_A, orderNumber: 102, totalPrice: 1500, subtotalPrice: 1350, totalTax: 150, shippingPrice: 0, isCOD: true, gateway: "COD", financialStatus: "pending", fulfillmentStatus: "RTO", pincode: "110001", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/103", shop: SHOP_A, orderNumber: 103, totalPrice: 3000, subtotalPrice: 2700, totalTax: 300, shippingPrice: 0, isCOD: true, gateway: "manual", financialStatus: "pending", fulfillmentStatus: "unfulfilled", pincode: "110001", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/104", shop: SHOP_A, orderNumber: 104, totalPrice: 1000, subtotalPrice: 900, totalTax: 100, shippingPrice: 0, isCOD: true, gateway: "COD", financialStatus: "pending", fulfillmentStatus: "unfulfilled", pincode: "560001", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/105", shop: SHOP_A, orderNumber: 105, totalPrice: 2500, subtotalPrice: 2250, totalTax: 250, shippingPrice: 0, isCOD: true, gateway: "COD", financialStatus: "paid", fulfillmentStatus: "fulfilled", pincode: "560001", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/106", shop: SHOP_A, orderNumber: 106, totalPrice: 1200, subtotalPrice: 1080, totalTax: 120, shippingPrice: 0, isCOD: true, gateway: "COD", financialStatus: "paid", fulfillmentStatus: "fulfilled", pincode: "560001", createdAt: now, processedAt: now },
      // Prepaid Orders (4)
      { id: "gid://shopify/Order/107", shop: SHOP_A, orderNumber: 107, totalPrice: 4000, subtotalPrice: 3600, totalTax: 400, shippingPrice: 0, isCOD: false, gateway: "Razorpay", financialStatus: "paid", fulfillmentStatus: "fulfilled", pincode: "560001", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/108", shop: SHOP_A, orderNumber: 108, totalPrice: 2000, subtotalPrice: 1800, totalTax: 200, shippingPrice: 0, isCOD: false, gateway: "Shopify Payments", financialStatus: "paid", fulfillmentStatus: "fulfilled", pincode: "560001", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/109", shop: SHOP_A, orderNumber: 109, totalPrice: 1500, subtotalPrice: 1350, totalTax: 150, shippingPrice: 0, isCOD: false, gateway: "UPI", financialStatus: "paid", fulfillmentStatus: "unfulfilled", pincode: "110001", createdAt: now, processedAt: now },
      { id: "gid://shopify/Order/110", shop: SHOP_A, orderNumber: 110, totalPrice: 2500, subtotalPrice: 2250, totalTax: 250, shippingPrice: 0, isCOD: false, gateway: "Cards", financialStatus: "paid", fulfillmentStatus: "fulfilled", pincode: "560001", createdAt: now, processedAt: now },
    ];

    for (const o of orderData) {
      await prisma.order.create({ data: o });
    }

    // Seed RTO events
    await prisma.rTOEvent.createMany({
      data: [
        { shop: SHOP_A, orderId: "gid://shopify/Order/101", orderNumber: 101, eventType: "RTO", amount: 200, status: "CONFIRMED" },
        { shop: SHOP_A, orderId: "gid://shopify/Order/102", orderNumber: 102, eventType: "RTO", amount: 180, status: "CONFIRMED" },
      ],
    });

    const heatmapData = await PincodeApplicationService.getPincodeHeatmapData(SHOP_A, "admin.shopify.com/store/audit-merchant-alpha");

    assert(heatmapData.totalOrders === 10, "Total orders evaluated equals 10");
    assert(heatmapData.codStats.orders === 6, "COD order count equals 6");
    assert(heatmapData.prepaidStats.orders === 4, "Prepaid order count equals 4");
    assert(heatmapData.codStats.revenue === 11200, "COD revenue calculated accurately (2000+1500+3000+1000+2500+1200 = 11,200)");
    assert(heatmapData.prepaidStats.revenue === 10000, "Prepaid revenue calculated accurately (4000+2000+1500+2500 = 10,000)");
    assert(heatmapData.codStats.aov === Math.round(11200 / 6), "COD AOV equals Math.round(11200 / 6) = 1867");
    assert(heatmapData.prepaidStats.aov === 2500, "Prepaid AOV equals 10000 / 4 = 2500");
    assert(heatmapData.codStats.rtoRate === 33.3, "COD RTO rate calculated accurately (2/6 = 33.3%)");
    assert(heatmapData.prepaidStats.rtoRate === 0, "Prepaid RTO rate is 0%");

    // Verify pending COD risk predictions
    assert(heatmapData.pendingCODWithRisk.length === 2, "Found exactly 2 pending COD orders (Order 103 and 104)");
    assert(heatmapData.pendingCODWithRisk[0].orderNumber === 103, "Top pending order is #103 (highest value ₹3,000)");
    assert(heatmapData.pendingCODWithRisk[0].riskScore > 0, "Risk score successfully computed for pending order");

    // ─────────────────────────────────────────────────────────────
    // 4. Empty State Robustness Audit
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 4. Testing Empty State Robustness ---");

    const emptyHeatmap = await PincodeApplicationService.getPincodeHeatmapData(EMPTY_SHOP, "admin.shopify.com/store/audit-empty");
    assert(emptyHeatmap.totalOrders === 0, "Empty shop has 0 total orders");
    assert(emptyHeatmap.codStats.orders === 0, "Empty shop has 0 COD orders");
    assert(emptyHeatmap.codStats.margin === 0, "Empty shop margin handles division by zero safely (returns 0)");
    assert(emptyHeatmap.codStats.aov === 0, "Empty shop AOV handles division by zero safely (returns 0)");
    assert(emptyHeatmap.pincodeStats.length === 0, "Empty shop pincodeStats is empty array");
    assert(emptyHeatmap.pendingCODWithRisk.length === 0, "Empty shop pendingCODWithRisk is empty array");

    // ─────────────────────────────────────────────────────────────
    // 5. Clean up audit test data
    // ─────────────────────────────────────────────────────────────
    await prisma.rTOEvent.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    await prisma.pincodeStats.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });

    console.log("\n=================================================");
    console.log(`AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
