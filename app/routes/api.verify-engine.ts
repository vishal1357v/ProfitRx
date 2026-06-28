import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { ProfitService } from "../services/profit.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "test-greek-god-store.myshopify.com";
  
  const results: Record<string, any> = {};

  // 1. Verify COGS Saving
  try {
    const testProductId = "test-prod-123";
    const testCogsVal = 49.99;
    const cogsResult = await ProfitService.saveCOGS(shop, testProductId, testCogsVal);
    results.cogsSave = {
      success: true,
      data: {
        id: cogsResult.id,
        shop: cogsResult.shop,
        productId: cogsResult.productId,
        cogs: cogsResult.cogs,
      },
    };
  } catch (err: any) {
    results.cogsSave = { success: false, error: err.message };
  }

  // 2. Verify Order Sync/Creation
  const testOrderId = "test-order-999";
  try {
    // Delete test order if it already exists to ensure a fresh sync test
    await prisma.order.deleteMany({
      where: { id: testOrderId },
    });

    const mockOrders = [
      {
        id: testOrderId,
        orderNumber: 9999,
        totalPrice: 150.0,
        subtotalPrice: 120.0,
        totalTax: 10.0,
        shippingPrice: 20.0,
        createdAt: new Date(),
        processedAt: new Date(),
        financialStatus: "paid",
        fulfillmentStatus: "fulfilled",
        productId: "test-prod-123",
      },
    ];

    const syncCount = await ProfitService.syncOrders(shop, mockOrders);
    results.orderSync = {
      success: true,
      createdCount: syncCount,
    };
  } catch (err: any) {
    results.orderSync = { success: false, error: err.message };
  }

  // 3. Verify Profit Calculation
  try {
    const profitData = await ProfitService.calculate(shop, 10);
    // Find our test order in the results
    const testOrderCalc = profitData.orders.find((o) => o.orderId === testOrderId);

    results.profitCalculate = {
      success: true,
      totalOrders: profitData.summary.orderCount,
      testOrderDetails: testOrderCalc
        ? {
            revenue: testOrderCalc.revenue,
            cogs: testOrderCalc.cogs,
            fees: testOrderCalc.fees,
            profit: testOrderCalc.profit,
            margin: testOrderCalc.margin,
            isCorrect: Math.abs(testOrderCalc.profit - (150.0 - 49.99 - (10.0 + 20.0))) < 0.01,
          }
        : null,
    };
  } catch (err: any) {
    results.profitCalculate = { success: false, error: err.message };
  }

  // 4. Verify RTO Event Saving
  try {
    const rtoEventId = "test-rto-999";
    // Delete existing test RTO event if any
    await prisma.rTOEvent.deleteMany({
      where: { orderId: testOrderId },
    });

    const rtoResult = await prisma.rTOEvent.create({
      data: {
        id: rtoEventId,
        shop,
        orderId: testOrderId,
        orderNumber: 9999,
        eventType: "RTO",
        amount: 20.0, // Loss from shipping
        status: "CONFIRMED",
        reason: "Customer rejected package on delivery",
      },
    });

    results.rtoSave = {
      success: true,
      data: {
        id: rtoResult.id,
        eventType: rtoResult.eventType,
        amount: rtoResult.amount,
        status: rtoResult.status,
      },
    };
  } catch (err: any) {
    results.rtoSave = { success: false, error: err.message };
  }

  return { shop, results };
};
