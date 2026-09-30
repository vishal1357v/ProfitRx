import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { safeGdprLogSummary } from "../utils/dlp";

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
  const shopName = payload?.shop_domain || shop;

  if (!shopName) {
    console.warn("[GDPR Shop Redact] Missing shop identifier in webhook payload");
    return new Response("Missing shop domain", { status: 400 });
  }

  console.log(`Received ${topic} webhook for ${shopName}`);
  console.log(`[GDPR Shop Redact] Summary:`, safeGdprLogSummary(payload as any));

  // Extract Shopify Webhook Delivery ID for duplicate delivery safety (idempotency)
  const webhookId = request.headers.get("x-shopify-webhook-id") || null;

  try {
    // 1. Idempotency check: if this specific webhook delivery was already recorded, return 200 immediately
    if (webhookId) {
      const existingDelivery = await (prisma as any).shopRedactionRequest.findUnique({
        where: { webhookId },
      });
      if (existingDelivery) {
        console.log(`[GDPR Shop Redact] Duplicate webhook delivery ${webhookId} for shop ${shopName}. Status: ${existingDelivery.status}`);
        return new Response("Webhook received successfully (idempotent duplicate)", { status: 200 });
      }
    }

    // 2. Check if a redaction request is already pending or processing for this shop
    const activeRequest = await (prisma as any).shopRedactionRequest.findFirst({
      where: {
        shop: shopName,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });

    if (activeRequest) {
      console.log(`[GDPR Shop Redact] Redaction request already active for ${shopName} (ID: ${activeRequest.id}, Status: ${activeRequest.status})`);
      return new Response("Webhook received successfully (already active)", { status: 200 });
    }

    // 3. Persist durable REDACT_REQUESTED tombstone in PostgreSQL
    await (prisma as any).shopRedactionRequest.create({
      data: {
        shop: shopName,
        webhookId,
        status: "PENDING",
        requestedAt: new Date(),
      },
    });

    logGdprAudit(shopName, "SHOP_REDACT_QUEUED", `Durable redaction request created (webhookId: ${webhookId || "none"}). Data will be purged via scheduled retention cleanup within the 30-day compliance window.`);
    console.log(`[GDPR Shop Redact] Successfully queued durable redaction request for ${shopName}`);

    // Return HTTP 200 comfortably within Shopify's 5-second requirement (<300ms)
    return new Response("Webhook received successfully", { status: 200 });
  } catch (err: any) {
    console.error(`[GDPR Shop Redact] Failed to persist redaction request for ${shopName}:`, err?.message || err);
    logGdprAudit(shopName, "SHOP_REDACT_PERSIST_ERROR", `Failed to persist redaction request: ${err?.message || err}`);
    return new Response(
      JSON.stringify({ error: "Failed to persist redaction request" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};


