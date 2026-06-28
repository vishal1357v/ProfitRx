import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

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
          customerName: "Redacted Customer",
          customerEmail: "redacted@example.com",
        },
      });
    }
  } catch (err: any) {
    console.error(`[GDPR Customer Redact] Failed to redact customer:`, err.message);
  }

  return new Response("Webhook received successfully", { status: 200 });
};
