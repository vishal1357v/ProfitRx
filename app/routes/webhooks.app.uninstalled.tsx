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
  // Wrap all cleanup in try/catch and parallelize with Promise.allSettled to prevent timeouts and 500s.
  try {
    // 1. Invalidate session and mark subscription CANCELED
    await Promise.allSettled([
      db.session.deleteMany({ where: { shop } }),
      db.subscription.updateMany({
        where: { shop },
        data: { status: "CANCELED" },
      }),
    ]);

    // 2. Purge merchant data and customer PII in parallel
    await Promise.allSettled([
      db.order.deleteMany({ where: { shop } }),
      db.customerProfile.deleteMany({ where: { shop } }),
      db.alert.deleteMany({ where: { shop } }),
      db.pincodeStats.deleteMany({ where: { shop } }),
      db.productCOGS.deleteMany({ where: { shop } }),
      db.adSpend.deleteMany({ where: { shop } }),
      db.adSpendDaily.deleteMany({ where: { shop } }),
      db.rTOEvent.deleteMany({ where: { shop } }),
      db.cODOrder.deleteMany({ where: { shop } }),
      db.profitSnapshot.deleteMany({ where: { shop } }),
      db.storeSettings.deleteMany({ where: { shop } }),
    ]);
    console.log(`[GDPR App Uninstalled] Successfully purged database entries for shop: ${shop}`);
  } catch (err: any) {
    console.error(`[GDPR App Uninstalled Error] Failed to purge data for ${shop}:`, err?.message || err);
  }

  return new Response("OK", { status: 200 });
};
