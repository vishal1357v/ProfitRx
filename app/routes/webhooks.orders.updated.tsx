import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ShopifyService } from "../services/shopify.service";
import { ProfitService } from "../services/profit.service";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!payload) {
    return new Response();
  }

  try {
    // 1. Sync the updated order into our DB
    await ShopifyService.syncOrderPayload(shop, payload);

    const order = payload as any;
    const orderId = (order.id || "").toString();
    const orderNumber = order.order_number || 0;

    // Fetch store RTO detection pattern and check DB for synced order
    const [storeSettings, syncedOrder] = await Promise.all([
      prisma.storeSettings.findUnique({ where: { shop } }),
      prisma.order.findUnique({ where: { id: orderId } })
    ]);

    const isRTOEvent = syncedOrder?.fulfillmentStatus === "RTO";

    if (isRTOEvent && orderId) {
      // Check if RTOEvent already exists for this order to avoid duplicates
      const existingRtoEvent = await prisma.rTOEvent.findFirst({
        where: { shop, orderId, eventType: "RTO" },
      });

      if (!existingRtoEvent) {
        const rtoLossEstimate = ProfitService.calculateRTOLoss(
          syncedOrder || { isCOD: true, partialDepositCollected: 0 },
          storeSettings || { defaultForwardShipping: 60, defaultReturnShipping: 70 } as any
        );

        await prisma.rTOEvent.create({
          data: {
            shop,
            orderId,
            orderNumber,
            eventType: "RTO",
            reason: "Fulfillment shipment status or order tags matched RTO keyword pattern",
            amount: rtoLossEstimate,
            status: "CONFIRMED",
          },
        });

        console.log(`[orders/updated webhook] Auto-created RTOEvent for order #${orderNumber} in ${shop}`);

        // 3. Refresh pincode stats in real-time so heatmap reflects this RTO immediately
        try {
          await ShopifyService.updatePincodeStats(shop);
          console.log(`[orders/updated webhook] Refreshed pincode stats for ${shop}`);
        } catch (statsErr) {
          console.error(`[orders/updated webhook] Failed to update pincode stats:`, statsErr);
        }
      }
    }
  } catch (err) {
    console.error(`[orders/updated webhook] Error processing webhook for ${shop}:`, err);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }

  return new Response();
};
