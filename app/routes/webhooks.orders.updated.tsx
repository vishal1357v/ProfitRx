import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ShopifyService } from "../services/shopify.service";
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

    // 2. Real-time RTO detection: check if this order update is an RTO event
    const order = payload as any;
    const orderId = (order.id || "").toString();
    const orderNumber = order.order_number || 0;
    const totalPrice = parseFloat(order.total_price || "0");
    const fulfillmentStatus = (order.fulfillment_status || "").toLowerCase();
    const tags: string[] = (order.tags || "").split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);

    // Fetch store RTO detection pattern
    const storeSettings = await prisma.storeSettings.findUnique({ where: { shop } });
    const rtoPattern = storeSettings?.rtoDetectionPattern ||
      "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender";
    const rtoKeywords = rtoPattern.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);

    // Check fulfillment status and tags against RTO keywords
    const statusIsRTO = rtoKeywords.some((kw) => fulfillmentStatus.includes(kw));
    const tagIsRTO = tags.some((tag) => rtoKeywords.some((kw) => tag.includes(kw)));
    const isRTOEvent = statusIsRTO || tagIsRTO;

    if (isRTOEvent && orderId) {
      // Check if RTOEvent already exists for this order to avoid duplicates
      const existingRtoEvent = await prisma.rTOEvent.findFirst({
        where: { shop, orderId, eventType: "RTO" },
      });

      if (!existingRtoEvent) {
        // Estimate RTO loss: forward shipping + return shipping + COD handling + packaging
        const forwardShipping = storeSettings?.defaultForwardShipping ?? 60;
        const returnShipping = storeSettings?.defaultReturnShipping ?? 70;
        const codHandling = storeSettings?.defaultCODHandling ?? 40;
        const packaging = storeSettings?.defaultPackaging ?? 10;
        const rtoLossEstimate = forwardShipping + returnShipping + codHandling + packaging;

        await prisma.rTOEvent.create({
          data: {
            shop,
            orderId,
            orderNumber,
            eventType: "RTO",
            reason: statusIsRTO
              ? `Fulfillment status: ${fulfillmentStatus}`
              : `RTO tag detected: ${tags.find((t) => rtoKeywords.some((kw) => t.includes(kw)))}`,
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
