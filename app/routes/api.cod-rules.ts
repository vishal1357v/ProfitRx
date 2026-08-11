import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import * as crypto from "crypto";
import { CODManagementService } from "../services/cod-management.service";
import { CodOrderRepository } from "../infrastructure/repositories/cod-order.repository";
import { getCorsHeaders } from "../utils/security.server";

function corsResponse(request: Request, data: any, status = 200) {
  return Response.json(data, {
    status,
    headers: getCorsHeaders(request),
  });
}

function verifyToken(shop: string, orderId: string, token?: string): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret || !token) return false;
  try {
    const expectedToken = crypto
      .createHmac("sha256", secret)
      .update(`${shop}:${orderId}`)
      .digest("hex");
    return token === expectedToken;
  } catch {
    return false;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response("", { headers: getCorsHeaders(request) });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const pincode = url.searchParams.get("pincode");
  const orderId = url.searchParams.get("orderId");

  if (!shop) {
    return corsResponse(request, { error: "Missing required query param: shop" }, 400);
  }

  if (orderId) {
    const cleanOrderId = orderId.replace("gid://shopify/Order/", "");
    const record = await CodOrderRepository.findByOrderId(shop, cleanOrderId);
    if (!record) {
      return corsResponse(request, {
        status: "NOT_FOUND",
        verified: false,
        required: false,
      });
    }
    return corsResponse(request, {
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

  return corsResponse(request, {
    shop,
    settings,
    checkedPincode: pincode,
    isBlocked,
    isCodAllowed: !isBlocked,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response("", { headers: getCorsHeaders(request) });
  }

  try {
    const payload = await request.json();
    const { shop, intent, token } = payload;

    if (!shop) {
      return corsResponse(request, { error: "Missing shop parameter" }, 400);
    }

    if (intent === "check_pincode") {
      const { pincode } = payload;
      const isBlocked = await CODManagementService.isPincodeBlocked(shop, pincode);
      return corsResponse(request, { shop, pincode, isBlocked, isCodAllowed: !isBlocked });
    }

    if (intent === "send_otp") {
      const { orderId, phone } = payload;
      if (!orderId || !phone) {
        return corsResponse(request, { error: "Missing orderId or phone" }, 400);
      }
      const cleanOrderId = orderId.replace("gid://shopify/Order/", "");

      // Verify token or verify order exists in database for this shop
      if (!token || !verifyToken(shop, cleanOrderId, token)) {
        return corsResponse(request, { error: "Invalid security token" }, 401);
      }

      const res = await CODManagementService.createCODOrderVerification(
        shop,
        cleanOrderId,
        phone
      );
      return corsResponse(request, res);
    }

    if (intent === "verify_otp") {
      const { orderId, otp } = payload;
      if (!orderId || !otp) {
        return corsResponse(request, { error: "Missing orderId or otp" }, 400);
      }
      const cleanOrderId = orderId.replace("gid://shopify/Order/", "");

      if (!token || !verifyToken(shop, cleanOrderId, token)) {
        return corsResponse(request, { error: "Invalid security token" }, 401);
      }

      const res = await CODManagementService.verifyOTP(shop, cleanOrderId, otp);
      return corsResponse(request, res);
    }

    return corsResponse(request, { error: "Invalid intent" }, 400);
  } catch (err: any) {
    console.error("[api.cod-rules error]:", err);
    return corsResponse(request, { error: "An internal error occurred" }, 500);
  }
};
