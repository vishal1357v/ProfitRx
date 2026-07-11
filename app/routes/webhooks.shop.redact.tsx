import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function logGdprAudit(shop: string, action: string, details: string) {
  console.log(`[GDPR-AUDIT] ${new Date().toISOString()} SHOP: ${shop} | ${action} | ${details}`);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(`GDPR Shop Redact Payload:`, JSON.stringify(payload));

  const shopName = payload.shop_domain || shop;

  try {
    console.log(`[GDPR Shop Redact] Purging store data for: ${shopName}`);

    // Delete records in related tables
    await (prisma as any).productCOGS.deleteMany({ where: { shop: shopName } });
    await (prisma as any).rTOEvent.deleteMany({ where: { shop: shopName } });
    await (prisma as any).alert.deleteMany({ where: { shop: shopName } });
    await (prisma as any).order.deleteMany({ where: { shop: shopName } });
    await (prisma as any).subscription.deleteMany({ where: { shop: shopName } });
    await (prisma as any).storeSettings.deleteMany({ where: { shop: shopName } });
    await (prisma as any).pincodeStats.deleteMany({ where: { shop: shopName } });
    await (prisma as any).customerProfile.deleteMany({ where: { shop: shopName } });
    await (prisma as any).adSpend.deleteMany({ where: { shop: shopName } });
    await (prisma as any).profitSnapshot.deleteMany({ where: { shop: shopName } });
    await (prisma as any).aISearchQuery.deleteMany({ where: { shop: shopName } });
    await (prisma as any).session.deleteMany({ where: { shop: shopName } });

    console.log(`[GDPR Shop Redact] Successfully purged data for: ${shopName}`);
    logGdprAudit(shopName, "SHOP_REDACT_SUCCESS", "Successfully purged all productCOGS, rTOEvent, alert, order, subscription, storeSettings, pincodeStats, customerProfile, adSpend, profitSnapshot, aISearchQuery, and session records.");
  } catch (err: any) {
    console.error(`[GDPR Shop Redact] Failed to purge data:`, err.message);
    logGdprAudit(shopName, "SHOP_REDACT_FAILURE", `Failed to purge data: ${err.message}`);
  }

  return new Response("Webhook received successfully", { status: 200 });
};
