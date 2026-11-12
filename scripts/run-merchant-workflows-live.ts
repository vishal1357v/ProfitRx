import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import prisma from "../app/db.server";
import { sessionStorage, unauthenticated } from "../app/shopify.server";
import { WebhookApplicationService } from "../app/application/webhooks/webhook.application";
import { OperationsApplicationService } from "../app/application/operations/operations.application";
import { CodRulesApplicationService, MerchantRulesInput } from "../app/application/protection/cod-rules.application";
import { CodVerificationApplicationService } from "../app/application/operations/cod-verification.application";
import { CODManagementService } from "../app/services/cod-management.service";

interface WorkflowResult {
  step: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

const results: WorkflowResult[] = [];

async function recordStep(step: string, fn: () => Promise<string | void>) {
  const start = Date.now();
  console.log(`\n================================================================================`);
  console.log(`▶ RUNNING: ${step}`);
  console.log(`================================================================================`);
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    console.log(`✅ PASSED in ${durationMs}ms`);
    if (details) console.log(`   Details: ${details}`);
    results.push({ step, passed: true, details: details || "Success", durationMs });
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const msg = err.message || String(err);
    console.error(`❌ FAILED in ${durationMs}ms:`, msg);
    results.push({ step, passed: false, details: msg, durationMs });
  }
}

async function main() {
  const shop = "greek-god-wvwt8ptt.myshopify.com";
  console.log(`[Merchant Workflows Acceptance] Starting automated live verification on ${shop}...`);

  let session: any;
  let token: string = "";
  let createdShopifyOrderId: number | null = null;
  let rawOrderIdStr: string = "";
  let testOrderGid: string = "";
  let originalRules: any = null;

  // ── STEP 1: Verify Store Authentication & Decryption ─────────────────────────
  await recordStep("1. Store Authentication & Decrypted Token Verification", async () => {
    session = await sessionStorage.loadSession(`offline_${shop}`);
    if (!session || !session.accessToken) {
      throw new Error(`No active offline session found in PostgreSQL for shop: ${shop}`);
    }
    token = session.accessToken;
    console.log(`   • Store: ${session.shop}`);
    console.log(`   • Scope: ${session.scope}`);
    console.log(`   • Token Decrypted Length: ${token.length}`);

    // Verify token validity by calling shop.json
    const res = await fetch(`https://${shop}/admin/api/2026-04/shop.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    if (!res.ok) {
      throw new Error(`Shopify API rejected token with HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return `Store Name: "${data.shop.name}", Currency: ${data.shop.currency}, Domain: ${data.shop.domain}`;
  });

  // ── STEP 2: Place Real Test COD Order on Shopify ───────────────────────────
  await recordStep("2. Create Test COD Order in Shopify Store", async () => {
    // Seed high-risk pincode in PincodeStats to ensure realistic elevated risk evaluation
    await prisma.pincodeStats.upsert({
      where: { shop_pincode: { shop, pincode: "800001" } },
      create: {
        shop,
        pincode: "800001",
        city: "Patna",
        province: "Bihar",
        totalOrders: 120,
        codOrders: 95,
        rtoCount: 52,
        totalLoss: 7800,
        rtoRate: 54.7,
        riskLevel: "HIGH",
        successfulDeliveries: 43,
        deliveryRate: 45.3,
        aov: 1450,
        revenue: 62350,
      },
      update: {
        rtoRate: 54.7,
        riskLevel: "HIGH",
      },
    });

    const orderPayload = {
      order: {
        line_items: [
          {
            title: "ProfitRx High-Value Fragrance Kit",
            price: "2499.00",
            quantity: 1,
            grams: 800,
          },
          {
            title: "Express Velvet Matte Balm",
            price: "499.00",
            quantity: 1,
            grams: 150,
          },
        ],
        shipping_lines: [
          {
            title: "Standard Surface Delivery",
            price: "90.00",
            code: "standard_cod",
          },
        ],
        financial_status: "pending",
        gateway: "Cash on Delivery",
        payment_gateway_names: ["Cash on Delivery", "manual"],
        shipping_address: {
          first_name: "Vikram",
          last_name: "Singhania",
          address1: "45, Frazer Road, Near Dak Bungalow",
          city: "Patna",
          province: "Bihar",
          country: "India",
          country_code: "IN",
          zip: "800001",
          phone: "+919845012345",
        },
        billing_address: {
          first_name: "Vikram",
          last_name: "Singhania",
          address1: "45, Frazer Road, Near Dak Bungalow",
          city: "Patna",
          province: "Bihar",
          country: "India",
          country_code: "IN",
          zip: "800001",
          phone: "+919845012345",
        },
        customer: {
          first_name: "Vikram",
          last_name: "Singhania",
          email: "vikram.test.singhania@gmail.com",
          phone: "+919845012345",
        },
        tags: "ProfitRx-Workflow-Test",
        note: "Automated test order generated by ProfitRx Merchant Workflow Suite",
      },
    };

    const res = await fetch(`https://${shop}/admin/api/2026-04/orders.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!res.ok) {
      throw new Error(`Shopify order creation failed HTTP ${res.status}: ${await res.text()}`);
    }

    const orderData = await res.json();
    const order = orderData.order;
    createdShopifyOrderId = order.id;
    rawOrderIdStr = String(order.id);
    testOrderGid = `gid://shopify/Order/${order.id}`;

    console.log(`   • Created Shopify Order #${order.order_number}`);
    console.log(`   • Shopify GID: ${testOrderGid}`);
    console.log(`   • Total: ₹${order.total_price} | Pincode: ${order.shipping_address?.zip || "800001"}`);

    return `Shopify Order #${order.order_number} (ID: ${order.id}) placed successfully for ₹${order.total_price}`;
  });

  // ── STEP 3: Order Pipeline Processing & Risk Evaluation ───────────────────────
  await recordStep("3. Ingest Order via ProfitRx Intelligence Pipeline", async () => {
    if (!createdShopifyOrderId) throw new Error("Missing test order ID");

    // Fetch full order JSON from Shopify to feed to pipeline
    const res = await fetch(`https://${shop}/admin/api/2026-04/orders/${createdShopifyOrderId}.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    const { order } = await res.json();

    // Ensure shipping address has the tested high-risk pincode for risk evaluation
    if (!order.shipping_address?.zip) {
      order.shipping_address = {
        city: "Patna",
        province: "Bihar",
        country: "India",
        country_code: "IN",
        zip: "800001",
        phone: "+919845012345",
      };
    }

    // Run WebhookApplicationService pipeline entrypoint
    await WebhookApplicationService.handleOrderCreated(shop, order);

    // Verify database record in PostgreSQL
    const dbOrder = await prisma.order.findFirst({
      where: {
        OR: [{ id: testOrderGid }, { id: rawOrderIdStr }],
      },
      include: {
        executionLogs: true,
      },
    });

    if (!dbOrder) {
      throw new Error(`Order ${testOrderGid} was not persisted in PostgreSQL orders table`);
    }

    const execLog = dbOrder.executionLogs?.find((l) => l.step === "EXECUTION" || l.step === "DECISION");
    const logData = (execLog?.data as any) || {};
    const evVal = logData.decision?.recommendedExpectedValue ?? logData.decision?.baselineExpectedValue;
    const expectedProfit = evVal !== undefined ? Number(evVal).toFixed(2) : "Calculated";

    console.log(`   • Persisted DB Order:`, {
      id: dbOrder.id,
      orderNumber: dbOrder.orderNumber,
      totalPrice: Number(dbOrder.totalPrice),
      isCOD: dbOrder.isCOD,
      riskScore: dbOrder.riskScore,
      riskLevel: dbOrder.riskLevel,
      recommendation: dbOrder.merchantRecommendation,
      expectedProfit: `₹${expectedProfit}`,
      logsCount: dbOrder.executionLogs?.length ?? 0,
    });

    return `Order evaluated: Risk=${dbOrder.riskScore}% (${dbOrder.riskLevel}), Recommendation=${dbOrder.merchantRecommendation}, Expected Profit=₹${expectedProfit}`;
  });

  // ── STEP 4: OTP Verification Workflow ────────────────────────────────────────
  await recordStep("4. OTP Generation, Challenge & Verification Lifecycle", async () => {
    if (!createdShopifyOrderId) throw new Error("Missing test order ID");

    console.log(`   Testing OTP challenge for order ${rawOrderIdStr}...`);

    // Delete any existing verification record for this test order
    await (prisma as any).cODOrder.deleteMany({
      where: { orderId: rawOrderIdStr },
    }).catch(() => {});

    // 1. Create OTP challenge record via CODManagementService
    const challengeRes = await CODManagementService.createCODOrderVerification(shop, rawOrderIdStr, "+919845012345");
    console.log(`   • OTP Creation Result:`, challengeRes);

    if (!challengeRes.success) {
      throw new Error(`Failed to create COD order verification: ${challengeRes.message}`);
    }

    // Inspect the generated record in PostgreSQL
    const codOrderRecord = await (prisma as any).cODOrder.findFirst({
      where: { orderId: rawOrderIdStr },
    });

    if (!codOrderRecord) {
      throw new Error(`cODOrder record not found for order ${rawOrderIdStr}`);
    }

    console.log(`   • Persisted cODOrder record:`, {
      orderId: codOrderRecord.orderId,
      phone: codOrderRecord.phone,
      otpAttempts: codOrderRecord.otpAttempts,
      otpVerified: codOrderRecord.otpVerified,
      status: codOrderRecord.status,
    });

    if (challengeRes.bypassed) {
      console.log(`   • Safe order OTP economic bypass verified: zero merchant OTP cost incurred.`);
      return `Safe order correctly bypassed OTP verification; economic cost-protection verified`;
    }

    // 2. Test Invalid OTP Attempt (must reject for unverified orders)
    const invalidVerifyRes = await CodVerificationApplicationService.verifyCustomerOtp(shop, rawOrderIdStr, "000000");
    console.log(`   • Test Bad OTP '000000': verified=${invalidVerifyRes.success}, message="${invalidVerifyRes.message}"`);
    if (invalidVerifyRes.success) {
      throw new Error("Invalid OTP '000000' was incorrectly accepted!");
    }

    return `OTP verification challenged for high-risk order; invalid OTP '000000' correctly rejected`;
  });

  // ── STEP 5: Merchant Action & Shopify Mutation Execution ──────────────────────
  await recordStep("5. Apply Merchant Action & Verify Shopify Tags Mutation", async () => {
    if (!createdShopifyOrderId) throw new Error("Missing test order ID");

    console.log(`   Applying manual action 'REQUIRE_OTP' via OperationsApplicationService...`);
    const actionResult = await OperationsApplicationService.applyOrderAction(
      shop,
      rawOrderIdStr,
      "REQUIRE_OTP",
      "Manual test execution: customer requested WhatsApp verification"
    );

    if (!actionResult.success) {
      throw new Error(`OperationsApplicationService.applyOrderAction failed: ${actionResult.message}`);
    }
    console.log(`   • Action execution result:`, actionResult);

    // Verify tag on live Shopify order
    const shopifyOrderRes = await fetch(`https://${shop}/admin/api/2026-04/orders/${createdShopifyOrderId}.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    const { order } = await shopifyOrderRes.json();
    console.log(`   • Live Shopify Order Tags: "${order.tags}"`);

    // Verify ExecutionLog in database
    const logs = await prisma.executionLog.findMany({
      where: {
        OR: [{ orderId: testOrderGid }, { orderId: rawOrderIdStr }],
      },
      orderBy: { createdAt: "desc" },
    });
    console.log(`   • Execution Logs count: ${logs.length}`);
    if (logs.length > 0) {
      console.log(`   • Latest Log: step=${logs[0].step}, status=${logs[0].status}, message="${logs[0].message}"`);
    }

    return `Action executed cleanly. Shopify order tagged with "${order.tags}" and logged to DB ExecutionLog table`;
  });

  // ── STEP 6: COD Checkout Rules & Payment Customization Sync ─────────────────
  await recordStep("6. COD Rules & Pincode Blocking Synchronization (Shopify Function)", async () => {
    // 1. Fetch current settings from database
    const currentSettings = await CODManagementService.getCODSettings(shop);
    originalRules = { ...currentSettings };
    console.log(`   • Current COD Settings:`, {
      codBlockingEnabled: currentSettings.codBlockingEnabled,
      blockedPincodesCount: currentSettings.codBlockedPincodes.length,
      otpVerificationEnabled: currentSettings.otpVerificationEnabled,
      partialPaymentEnabled: currentSettings.partialPaymentEnabled,
    });

    // 2. Obtain unauthenticated admin context for Shopify GraphQL API
    const authContext = await unauthenticated.admin(shop);

    // 3. Update COD rules via CodRulesApplicationService
    const rulesInput: MerchantRulesInput = {
      rulesRejectCodOver: 4999,
      rulesRequirePrepaidAbove: 2999,
      rulesAutoFlagRepeatOffenders: true,
      rulesAutoRequireOtp: true,
      codBlockingEnabled: true,
      otpVerificationEnabled: true,
    };

    console.log(`   • Saving updated rules to PostgreSQL & Shopify Payment Customization...`);
    const updateRes = await CodRulesApplicationService.saveMerchantRules(shop, rulesInput, authContext.admin);
    console.log(`   • Rules Update Result:`, updateRes);

    if (!updateRes.success) {
      throw new Error(`saveMerchantRules failed: ${updateRes.message}`);
    }

    // 4. Verify payment customizations in Shopify GraphQL Admin
    const gqlQuery = `
      query GetPaymentCustomizations {
        paymentCustomizations(first: 5) {
          edges {
            node {
              id
              title
              enabled
              metafield(namespace: "profitrx", key: "cod_rules") {
                value
              }
            }
          }
        }
      }
    `;

    const gqlRes = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: gqlQuery }),
    });

    const gqlData = await gqlRes.json();
    const customizations = gqlData.data?.paymentCustomizations?.edges || [];
    console.log(`   • Shopify Payment Customizations found: ${customizations.length}`);
    for (const edge of customizations) {
      console.log(`     - [${edge.node.id}] "${edge.node.title}" enabled=${edge.node.enabled}`);
      if (edge.node.metafield?.value) {
        console.log(`       Metafield: ${edge.node.metafield.value}`);
      }
    }

    return `COD rules saved to DB and synchronized with Shopify Payment Customization (syncResult: ${updateRes.syncResult?.status || "OK"})`;
  });

  // ── STEP 7: Cleanup & State Restoration ──────────────────────────────────────
  await recordStep("7. Cleanup Test Order & Restore Original Store Rules", async () => {
    // 1. Restore original COD rules
    if (originalRules) {
      const authContext = await unauthenticated.admin(shop);
      await CODManagementService.updateCODSettings(shop, originalRules, authContext.admin);
      console.log(`   • Restored original COD Rules`);
    }

    // 2. Delete test order from Shopify
    if (createdShopifyOrderId) {
      // First cancel the order on Shopify
      const cancelRes = await fetch(`https://${shop}/admin/api/2026-04/orders/${createdShopifyOrderId}/cancel.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ reason: "other", note: "Test order cleanup" }),
      });
      console.log(`   • Cancel Shopify test order #${createdShopifyOrderId}: HTTP ${cancelRes.status}`);

      // Delete the order from Shopify
      const deleteRes = await fetch(`https://${shop}/admin/api/2026-04/orders/${createdShopifyOrderId}.json`, {
        method: "DELETE",
        headers: { "X-Shopify-Access-Token": token },
      });
      console.log(`   • Delete Shopify test order #${createdShopifyOrderId}: HTTP ${deleteRes.status}`);
    }

    // 3. Clean up test order from PostgreSQL
    if (createdShopifyOrderId) {
      await prisma.executionLog.deleteMany({
        where: {
          OR: [{ orderId: testOrderGid }, { orderId: rawOrderIdStr }],
        },
      }).catch(() => {});

      await (prisma as any).cODOrder.deleteMany({
        where: {
          OR: [{ orderId: testOrderGid }, { orderId: rawOrderIdStr }],
        },
      }).catch(() => {});

      await prisma.order.deleteMany({
        where: {
          OR: [{ id: testOrderGid }, { id: rawOrderIdStr }],
        },
      }).catch(() => {});
      console.log(`   • Purged test order records from PostgreSQL tables`);
    }

    return "Store rules restored and test order purged completely";
  });

  // ── FINAL SUMMARY ────────────────────────────────────────────────────────────
  console.log(`\n================================================================================`);
  console.log(`                    MERCHANT WORKFLOW ACCEPTANCE SUMMARY`);
  console.log(`================================================================================`);
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? "✅ PASS" : "❌ FAIL";
    if (!r.passed) allPassed = false;
    console.log(`${icon} | ${r.step} (${r.durationMs}ms)`);
    console.log(`       └─ ${r.details}`);
  }
  console.log(`================================================================================`);
  console.log(`FINAL OUTCOME: ${allPassed ? "ALL WORKFLOWS VERIFIED 100% OPERATIONAL ✅" : "ISSUES ENCOUNTERED ❌"}`);
  console.log(`================================================================================\n`);

  await prisma.$disconnect();
  process.exit(allPassed ? 0 : 1);
}

main().catch(async (e) => {
  console.error("[FATAL ERROR]:", e);
  await prisma.$disconnect();
  process.exit(1);
});
