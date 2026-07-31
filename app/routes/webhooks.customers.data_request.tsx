import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let authResult;
  try {
    authResult = await authenticate.webhook(request);
  } catch (err: any) {
    console.warn("GDPR Customer Data Request signature verification failed:", err.message);
    return new Response("Unauthorized webhook signature", { status: 401 });
  }

  const { payload, shop, topic } = authResult;

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(`GDPR Customer Data Request Payload:`, JSON.stringify(payload));

  try {
    const customerId = payload.customer?.id ? String(payload.customer.id) : null;
    const shopDomain = payload.shop_domain || shop;

    if (customerId) {
      const profile = await prisma.customerProfile.findUnique({
        where: {
          shop_customerId: {
            shop: shopDomain,
            customerId,
          },
        },
      });

      const orders = await prisma.order.findMany({
        where: {
          shop: shopDomain,
          customerId,
        },
      });

      console.log(`[GDPR Data Request] Found customer profile:`, JSON.stringify(profile));
      console.log(`[GDPR Data Request] Found ${orders.length} orders for customer`);
    }
  } catch (err: any) {
    console.error(`[GDPR Data Request Error]`, err.message);
  }

  return new Response("Webhook received successfully", { status: 200 });
};
