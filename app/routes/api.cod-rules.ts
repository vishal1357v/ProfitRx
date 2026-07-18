import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { CODManagementService } from "../services/cod-management.service";
import { ShopifyService } from "../services/shopify.service";
import prisma from "../db.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function corsResponse(data: any, status = 200) {
  return Response.json(data, {
    status,
    headers: CORS_HEADERS,
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response("", { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const pincode = url.searchParams.get("pincode");
  const orderId = url.searchParams.get("orderId");

  if (!shop) {
    return corsResponse({ error: "Missing required query param: shop" }, 400);
  }

  if (orderId) {
    const cleanOrderId = orderId.replace("gid://shopify/Order/", "");
    const record = await prisma.cODOrder.findUnique({
      where: { orderId: cleanOrderId }
    });
    if (!record) {
      return corsResponse({ status: "NOT_FOUND", verified: false, required: false });
    }
    return corsResponse({
      status: record.status,
      verified: record.otpVerified,
      required: record.status === "OTP_SENT" && !record.otpVerified,
      phone: record.phone ? `******${record.phone.slice(-4)}` : null,
    });
  }

  const settings = await CODManagementService.getCODSettings(shop);
  let isBlocked = false;
  if (pincode) {
    isBlocked = await CODManagementService.isPincodeBlocked(shop, pincode);
  }

  return corsResponse({
    shop,
    settings,
    checkedPincode: pincode,
    isBlocked,
    isCodAllowed: !isBlocked,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response("", { headers: CORS_HEADERS });
  }

  try {
    const payload = await request.json();
    const { shop, intent } = payload;

    if (!shop) {
      return corsResponse({ error: "Missing shop parameter" }, 400);
    }

    if (intent === "check_pincode") {
      const { pincode } = payload;
      const isBlocked = await CODManagementService.isPincodeBlocked(shop, pincode);
      return corsResponse({ shop, pincode, isBlocked, isCodAllowed: !isBlocked });
    }

    if (intent === "send_otp") {
      const { orderId, phone } = payload;
      if (!orderId || !phone) {
        return corsResponse({ error: "Missing orderId or phone" }, 400);
      }
      const cleanOrderId = orderId.replace("gid://shopify/Order/", "");
      const res = await CODManagementService.createCODOrderVerification(shop, cleanOrderId, phone);
      return corsResponse(res);
    }

    if (intent === "verify_otp") {
      const { orderId, otp } = payload;
      if (!orderId || !otp) {
        return corsResponse({ error: "Missing orderId or otp" }, 400);
      }
      const cleanOrderId = orderId.replace("gid://shopify/Order/", "");
      const res = await CODManagementService.verifyOTP(shop, cleanOrderId, otp);
      return corsResponse(res);
    }

    if (intent === "cancel_order") {
      const { orderId } = payload;
      if (!orderId) {
        return corsResponse({ error: "Missing orderId" }, 400);
      }
      const cleanOrderId = orderId.replace("gid://shopify/Order/", "");
      const res = await ShopifyService.cancelOrder(shop, cleanOrderId);
      if (res.success) {
        await prisma.cODOrder.update({
          where: { orderId: cleanOrderId },
          data: { status: "CANCELLED" },
        });
      }
      return corsResponse(res);
    }

    if (intent === "update_settings") {
      const updated = await CODManagementService.updateCODSettings(shop, payload.settings);
      return corsResponse({ success: true, settings: updated });
    }

    return corsResponse({ error: "Invalid intent" }, 400);
  } catch (err: any) {
    return corsResponse({ error: err.message || "Internal server error" }, 500);
  }
};
