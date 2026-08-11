import { OperationsApplicationService } from "../app/application/operations/operations.application";
import { CodVerificationApplicationService } from "../app/application/operations/cod-verification.application";
import { CodOrderRepository } from "../app/infrastructure/repositories/cod-order.repository";
import prisma from "../app/db.server";
import * as crypto from "crypto";

async function runOperationsAudit() {
  console.log("=================================================");
  console.log("PROFITRX BLOCK 1 RUNTIME INTEGRATION AUDIT: OPERATIONS & COD VERIFICATION");
  console.log("=================================================");

  const SHOP_A = "audit-ops-alpha.myshopify.com";
  const SHOP_B = "audit-ops-beta.myshopify.com";
  const EMPTY_SHOP = "audit-ops-empty.myshopify.com";

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
      await prisma.executionLog.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.cODOrder.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    const now = new Date();
    process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "test_audit_secret_key_12345";

    // ─────────────────────────────────────────────────────────────
    // PART 1: CodOrderRepository Tests
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing CodOrderRepository Lifecycle & Persistence ---");

    const createdCod = await CodOrderRepository.upsert(SHOP_A, {
      orderId: "gid://shopify/Order/401",
      phone: "+919876543210",
      otp: "123456",
      status: "OTP_SENT",
      partialAmount: 100,
      codFee: 30,
    });
    assert(createdCod.orderId === "401", "Normalized orderId to numeric id (401)");
    assert(createdCod.status === "OTP_SENT", "Initial status is OTP_SENT");
    assert(createdCod.otpAttempts === 0, "Initial OTP attempts is 0");

    // Record failed attempt
    const afterFail = await CodOrderRepository.recordFailedAttempt(SHOP_A, "401");
    assert(afterFail !== null && afterFail.otpAttempts === 1, "Failed attempt recorded (attempts = 1)");

    // Mark verified
    const afterVerified = await CodOrderRepository.markVerified(SHOP_A, "401");
    assert(afterVerified !== null && afterVerified.otpVerified === true, "Marked as otpVerified = true");
    assert(afterVerified !== null && afterVerified.status === "VERIFIED", "Status transitioned to VERIFIED");

    // ─────────────────────────────────────────────────────────────
    // PART 2: Customer Token Signature & Verification Service
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing CodVerificationApplicationService Customer Link ---");

    const validToken = crypto
      .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
      .update(`${SHOP_A}:401`)
      .digest("hex");

    const invalidToken = "tampered_fake_signature_token";

    // Seed corresponding Order
    await prisma.order.create({
      data: {
        id: "gid://shopify/Order/401",
        shop: SHOP_A,
        orderNumber: 401,
        totalPrice: 2499,
        subtotalPrice: 2200,
        totalTax: 299,
        shippingPrice: 0,
        isCOD: true,
        gateway: "manual",
        financialStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        customerName: "Vikram Malhotra",
        createdAt: now,
        processedAt: now,
      },
    });

    // Test Token Validation
    assert(
      CodVerificationApplicationService.validateToken(SHOP_A, "401", validToken) === true,
      "Valid HMAC signature validated successfully"
    );
    assert(
      CodVerificationApplicationService.validateToken(SHOP_A, "401", invalidToken) === false,
      "Tampered signature token correctly rejected"
    );

    // Fetch Details via Application Service
    const validDetails = await CodVerificationApplicationService.getVerificationDetails(
      SHOP_A,
      "401",
      validToken
    );
    assert(validDetails.success === true, "Verification details returned successfully");
    assert(validDetails.orderNumber === 401, "Order number matches linked order (401)");
    assert(validDetails.customerName === "Vikram Malhotra", "Customer name matches order (Vikram Malhotra)");
    assert(validDetails.phone === "******3210", "Customer phone masked securely (******3210)");

    // Test rejection with invalid token
    const invalidDetails = await CodVerificationApplicationService.getVerificationDetails(
      SHOP_A,
      "401",
      invalidToken
    );
    assert(invalidDetails.success === false, "Application service rejects access with invalid token");

    // ─────────────────────────────────────────────────────────────
    // PART 3: Operations Center Aggregations
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Testing OperationsApplicationService Aggregations ---");

    // Seed Execution Log
    await prisma.executionLog.create({
      data: {
        shop: SHOP_A,
        orderId: "gid://shopify/Order/401",
        step: "OTP_SENT",
        status: "SUCCESS",
        message: "WhatsApp OTP delivered to +919876543210",
      },
    });

    const opsData = await OperationsApplicationService.getOperationsData(SHOP_A);
    assert(opsData.orders.length === 1, "Operations orders list contains 1 order");
    assert(opsData.codVerifications.length === 1, "Operations COD verifications contains 1 record");
    assert(opsData.codVerifications[0].orderNumber === 401, "COD verification record linked to order #401");
    assert(opsData.executionLogs.length === 1, "Execution logs list contains 1 event");

    // ─────────────────────────────────────────────────────────────
    // PART 4: Empty State & Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 4. Testing Empty State & Multi-Tenant Isolation ---");

    const emptyOps = await OperationsApplicationService.getOperationsData(EMPTY_SHOP);
    assert(emptyOps.orders.length === 0, "Empty shop has 0 orders");
    assert(emptyOps.codVerifications.length === 0, "Empty shop has 0 COD verifications");
    assert(emptyOps.executionLogs.length === 0, "Empty shop has 0 execution logs");

    // Shop B Tenant Isolation
    const shopBOps = await OperationsApplicationService.getOperationsData(SHOP_B);
    assert(shopBOps.orders.length === 0, "Tenant isolation: Shop B has 0 orders (unaffected by Shop A)");
    assert(shopBOps.codVerifications.length === 0, "Tenant isolation: Shop B has 0 COD verifications");
    assert(shopBOps.executionLogs.length === 0, "Tenant isolation: Shop B has 0 execution logs");

    const crossShopCod = await CodOrderRepository.findByOrderId(SHOP_B, "401");
    assert(crossShopCod === null, "Tenant isolation: Shop B cannot access Shop A COD order #401");

    // ─────────────────────────────────────────────────────────────
    // Clean test data
    // ─────────────────────────────────────────────────────────────
    await withRetry(async () => {
      await prisma.executionLog.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.cODOrder.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B, EMPTY_SHOP] } } });
    });

    console.log("\n=================================================");
    console.log(`BLOCK 1 AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runOperationsAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
