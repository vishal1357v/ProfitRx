import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let authResult;
  try {
    authResult = await authenticate.webhook(request);
  } catch (err: any) {
    console.warn("GDPR App Uninstalled signature verification failed:", err.message);
    return new Response("Unauthorized webhook signature", { status: 401 });
  }

  const { shop, session, topic } = authResult;

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  await db.session.deleteMany({ where: { shop } });
  
  await db.subscription.updateMany({
    where: { shop },
    data: { status: "CANCELED" },
  });

  // Purge all merchant data and customer PII to satisfy GDPR compliance
  try {
    await db.order.deleteMany({ where: { shop } });
    await db.customerProfile.deleteMany({ where: { shop } });
    await db.alert.deleteMany({ where: { shop } });
    await db.pincodeStats.deleteMany({ where: { shop } });
    await db.productCOGS.deleteMany({ where: { shop } });
    await db.adSpend.deleteMany({ where: { shop } });
    await db.adSpendDaily.deleteMany({ where: { shop } });
    await db.rTOEvent.deleteMany({ where: { shop } });
    await db.cODOrder.deleteMany({ where: { shop } });
    await db.profitSnapshot.deleteMany({ where: { shop } });
    await db.storeSettings.deleteMany({ where: { shop } });
    console.log(`[GDPR App Uninstalled] Purged all database entries for shop: ${shop}`);
  } catch (err: any) {
    console.error(`[GDPR App Uninstalled Error] Failed to purge data for ${shop}:`, err.message);
  }

  return new Response();
};
