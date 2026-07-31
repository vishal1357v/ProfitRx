import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function logGdprAudit(shop: string, action: string, details: string) {
  console.log(`[GDPR-AUDIT] ${new Date().toISOString()} SHOP: ${shop} | ${action} | ${details}`);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  let authResult;
  try {
    authResult = await authenticate.webhook(request);
  } catch (err: any) {
    console.warn("GDPR Shop Redact authentication signature verification failed:", err.message);
    return new Response("Unauthorized webhook signature", { status: 401 });
  }

  const { payload, shop, topic } = authResult;

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(`GDPR Shop Redact Payload:`, JSON.stringify(payload));

  const shopName = payload.shop_domain || shop;

  // ⚡ Respond immediately (within 5 seconds) as required by Shopify Webhook spec
  // Run heavy database purges asynchronously in the background
  setTimeout(async () => {
    try {
      console.log(`[GDPR Shop Redact] Purging store data in background for: ${shopName}`);

      // Run deletions in parallel to reduce database connection time
      await Promise.all([
        (prisma as any).productCOGS.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).rTOEvent.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).alert.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).order.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).subscription.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).storeSettings.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).pincodeStats.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).customerProfile.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).adSpend.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).profitSnapshot.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).aISearchQuery.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
        (prisma as any).session.deleteMany({ where: { shop: shopName } }).catch((e: any) => console.warn(e)),
      ]);

      console.log(`[GDPR Shop Redact] Successfully purged data for: ${shopName}`);
      logGdprAudit(shopName, "SHOP_REDACT_SUCCESS", "Successfully purged all records in the background.");
    } catch (err: any) {
      console.error(`[GDPR Shop Redact] Failed to purge data:`, err.message);
      logGdprAudit(shopName, "SHOP_REDACT_FAILURE", `Failed to purge data in background: ${err.message}`);
    }
  }, 10);

  return new Response("Webhook received successfully", { status: 200 });
};
