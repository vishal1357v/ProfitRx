import { OrderApplicationService } from "../app/application/order/order.application";
import { ExecutionContextFactory } from "../app/infrastructure/context/execution.context";
import { OrderRepository } from "../app/infrastructure/repositories/order.repository";
import { RtoRepository } from "../app/infrastructure/repositories/rto.repository";
import prisma from "../app/db.server";

async function runPipelineDashboardAudit() {
  console.log("=================================================");
  console.log("PROFITRX BLOCK 5 RUNTIME INTEGRATION AUDIT: PIPELINE & INTEGRITY");
  console.log("=================================================");

  const SHOP_A = "audit-pipeline-alpha.myshopify.com";
  const SHOP_B = "audit-pipeline-beta.myshopify.com";

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
      await prisma.rTOEvent.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
    });

    const now = new Date();

    // ─────────────────────────────────────────────────────────────
    // PART 1: Order Pipeline Execution & Grounded Confidence
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing Order Pipeline Execution & Grounded Confidence ---");

    const context = ExecutionContextFactory.create(
      SHOP_A,
      "701",
      "trace-audit-001"
    );

    const rawOrderPayload = {
      id: "701",
      order_number: 701,
      total_price: "2999.00",
      subtotal_price: "2600.00",
      total_tax: "399.00",
      financial_status: "pending",
      fulfillment_status: "unfulfilled",
      gateway: "Cash on Delivery (COD)",
      payment_gateway_names: ["manual"],
      customer: {
        id: "cust-701",
        first_name: "Rohan",
        last_name: "Gupta",
        email: "rohan@example.com",
        phone: "+919876543210",
        orders_count: 3,
      },
      shipping_address: {
        zip: "110001",
        city: "New Delhi",
        province: "Delhi",
        country_code: "IN",
      },
      line_items: [
        {
          id: "li-701",
          product_id: "prod-701",
          title: "Hercules Gym Bag",
          price: "2999.00",
          quantity: 1,
        },
      ],
      created_at: now.toISOString(),
    };

    // Execute full pipeline
    await OrderApplicationService.processOrder(context, rawOrderPayload);

    // Verify order was saved and risk assessment completed
    const savedOrder = await OrderRepository.findById(SHOP_A, "701");
    assert(savedOrder !== null, "Pipeline successfully ingested order #701");
    assert(savedOrder !== null && typeof savedOrder.riskScore === "number", "Risk score computed and saved");

    // ─────────────────────────────────────────────────────────────
    // PART 2: RTO Event Creation via Webhook Logic
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing RTO Event Creation ---");

    const createdRto = await RtoRepository.create({
      shop: SHOP_A,
      orderId: "701",
      orderNumber: 701,
      eventType: "RTO",
      reason: "Undelivered - Customer Refused",
      amount: 140,
      status: "CONFIRMED",
    });

    assert(createdRto.orderNumber === 701, "RTO event recorded for order #701");
    assert(createdRto.amount === 140, "RTO loss amount recorded as 140");

    const rtoCheck = await RtoRepository.findEventByOrderAndType(SHOP_A, "701", "RTO");
    assert(rtoCheck !== null && rtoCheck.status === "CONFIRMED", "RTO duplicate check correctly identifies existing event");

    // ─────────────────────────────────────────────────────────────
    // Clean test data
    // ─────────────────────────────────────────────────────────────
    await withRetry(async () => {
      await prisma.rTOEvent.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.order.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
      await prisma.storeSettings.deleteMany({ where: { shop: { in: [SHOP_A, SHOP_B] } } });
    });

    console.log("\n=================================================");
    console.log(`BLOCK 5 AUDIT COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("=================================================");

    if (testFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Audit threw unexpected error:", error);
    process.exit(1);
  }
}

runPipelineDashboardAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
