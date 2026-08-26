import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { safeGdprLogSummary } from "../utils/dlp";
import { AuditLogService } from "../services/compliance/audit-log.service";

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
  console.log(`[GDPR Data Request] Summary:`, safeGdprLogSummary(payload as any));

  try {
    const customerId = payload.customer?.id ? String(payload.customer.id) : null;
    const shopDomain = payload.shop_domain || shop;

    if (customerId) {
      AuditLogService.logAccess({
        shop: shopDomain,
        actor: "shopify_gdpr_webhook",
        resource: "GDPR_DATA_REQUEST",
        resourceId: customerId,
        action: "EXPORT",
      });

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
        select: {
          id: true,
          orderNumber: true,
        },
      });

      console.log(`[GDPR Data Request] Processed request for customerId=${customerId}: profileExists=${Boolean(profile)}, orderCount=${orders.length}`);
    }
  } catch (err: any) {
    console.error(`[GDPR Data Request Error]`, err?.message || err);
  }

  return new Response("Webhook received successfully", { status: 200 });
};
