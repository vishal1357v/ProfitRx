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
    console.warn("GDPR Customer Redact signature verification failed:", err.message);
    return new Response("Unauthorized webhook signature", { status: 401 });
  }

  const { payload, shop, topic } = authResult;

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(`[GDPR Customer Redact] Summary:`, safeGdprLogSummary(payload as any));

  // Erase customer personal information across all associated records (SEC-01)
  try {
    const customer = (payload as any)?.customer || {};
    const customerId = customer.id ? String(customer.id) : null;
    const customerEmail = customer.email ? String(customer.email).trim() : null;
    const customerPhone = customer.phone ? String(customer.phone).trim() : null;
    const shopName = (payload as any)?.shop_domain || shop;

    const rawOrdersToRedact = Array.isArray((payload as any)?.orders_to_redact)
      ? (payload as any).orders_to_redact
      : [];
    const ordersToRedact: string[] = rawOrdersToRedact.map((id: any) => String(id));

    // Include both raw numeric and GID formats
    const allOrderIdsToMatch: string[] = [];
    for (const id of ordersToRedact) {
      allOrderIdsToMatch.push(id);
      allOrderIdsToMatch.push(`gid://shopify/Order/${id}`);
    }

    if (customerId || customerEmail || customerPhone || ordersToRedact.length > 0) {
      console.log(`[GDPR Customer Redact] Executing complete PII erasure for shop ${shopName}`);

      // 1. Delete CustomerProfile records
      const profileConditions: any[] = [];
      if (customerId) profileConditions.push({ customerId });
      if (customerEmail) profileConditions.push({ customerEmail });

      if (profileConditions.length > 0) {
        await prisma.customerProfile.deleteMany({
          where: {
            shop: shopName,
            OR: profileConditions,
          },
        });
      }

      // 2. Delete CustomerRisk records (contains phone, email, customerId)
      const riskConditions: any[] = [];
      if (customerId) riskConditions.push({ customerId });
      if (customerEmail) riskConditions.push({ email: customerEmail });
      if (customerPhone) riskConditions.push({ phone: customerPhone });

      if (riskConditions.length > 0) {
        await prisma.customerRisk.deleteMany({
          where: {
            shop: shopName,
            OR: riskConditions,
          },
        });
      }

      // 3. Delete CODOrder records (contains customer phone and verification OTP)
      const codOrderConditions: any[] = [];
      if (allOrderIdsToMatch.length > 0) {
        codOrderConditions.push({ orderId: { in: allOrderIdsToMatch } });
      }
      if (customerPhone) {
        codOrderConditions.push({ phone: customerPhone });
      }

      if (codOrderConditions.length > 0) {
        await prisma.cODOrder.deleteMany({
          where: {
            shop: shopName,
            OR: codOrderConditions,
          },
        });
      }

      // 4. Anonymize customer details from orders associated with this customer
      const orderMatchConditions: any[] = [];
      if (customerId) orderMatchConditions.push({ customerId });
      if (customerEmail) orderMatchConditions.push({ customerEmail });
      if (allOrderIdsToMatch.length > 0) orderMatchConditions.push({ id: { in: allOrderIdsToMatch } });

      if (orderMatchConditions.length > 0) {
        await prisma.order.updateMany({
          where: {
            shop: shopName,
            OR: orderMatchConditions,
          },
          data: {
            customerName: null,
            customerEmail: null,
          },
        });
      }

      // 5. Record compliance audit log (no PII in resourceId)
      AuditLogService.logAccess({
        shop: shopName,
        actor: "shopify_gdpr_webhook",
        resource: "GDPR_CUSTOMER_REDACT",
        resourceId: customerId || "[REDACTED_IDENTIFIER]",
        action: "EXPORT",
      });

      console.log(`[GDPR Customer Redact] Successfully redacted customer PII across CustomerProfile, CustomerRisk, CODOrder, and Order for ${shopName}`);
    }
  } catch (err: any) {
    console.error(`[GDPR Customer Redact] Failed to redact customer:`, err.message);
  }

  return new Response("Webhook received successfully", { status: 200 });
};
