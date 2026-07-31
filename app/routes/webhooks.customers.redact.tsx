import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let authResult;
  try {
    authResult = await authenticate.webhook(request);
  } catch (err: any) {
    console.warn("GDPR Customer Redact signature verification failed:", err.message);
    return new Response("Unauthorized webhook signature", { status: 401 });
  }

  const { payload, shop, topic } = authResult;

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(`GDPR Customer Redact Payload:`, JSON.stringify(payload));

  // Erase customer personal information if stored
  try {
    const customerId = payload.customer?.id ? String(payload.customer.id) : null;
    const shopName = payload.shop_domain || shop;

    if (customerId) {
      console.log(`[GDPR Customer Redact] Deleting profile for customer ${customerId} in shop ${shopName}`);
      await (prisma as any).customerProfile.deleteMany({
        where: { shop: shopName, customerId },
      });

      // Redact customer details from orders associated with this customer
      await (prisma as any).order.updateMany({
        where: { shop: shopName, customerId },
        data: {
          customerName: null,
          customerEmail: null,
        },
      });
    }
  } catch (err: any) {
    console.error(`[GDPR Customer Redact] Failed to redact customer:`, err.message);
  }

  return new Response("Webhook received successfully", { status: 200 });
};
