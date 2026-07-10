import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { CODManagementService } from "../services/cod-management.service";
import { ShopifyService } from "../services/shopify.service";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const pincode = url.searchParams.get("pincode");

  if (!shop) {
    return Response.json({ error: "Missing required query param: shop" }, { status: 400 });
  }

  const settings = await CODManagementService.getCODSettings(shop);
  let isBlocked = false;
  if (pincode) {
    isBlocked = await CODManagementService.isPincodeBlocked(shop, pincode);
  }

  return Response.json({
    shop,
    settings,
    checkedPincode: pincode,
    isBlocked,
    isCodAllowed: !isBlocked,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const payload = await request.json();
    const { shop, intent } = payload;

    if (!shop) {
      return Response.json({ error: "Missing shop parameter" }, { status: 400 });
    }

    if (intent === "check_pincode") {
      const { pincode } = payload;
      const isBlocked = await CODManagementService.isPincodeBlocked(shop, pincode);
      return Response.json({ shop, pincode, isBlocked, isCodAllowed: !isBlocked });
    }

    if (intent === "send_otp") {
      const { orderId, phone } = payload;
      if (!orderId || !phone) {
        return Response.json({ error: "Missing orderId or phone" }, { status: 400 });
      }
      const res = await CODManagementService.createCODOrderVerification(shop, orderId, phone);
      return Response.json(res);
    }

    if (intent === "verify_otp") {
      const { orderId, otp } = payload;
      if (!orderId || !otp) {
        return Response.json({ error: "Missing orderId or otp" }, { status: 400 });
      }
      const res = await CODManagementService.verifyOTP(shop, orderId, otp);
      return Response.json(res);
    }

    if (intent === "cancel_order") {
      const { orderId } = payload;
      if (!orderId) {
        return Response.json({ error: "Missing orderId" }, { status: 400 });
      }
      const res = await ShopifyService.cancelOrder(shop, orderId);
      if (res.success) {
        await (prisma as any).cODOrder.update({
          where: { orderId },
          data: { status: "CANCELLED" },
        });
      }
      return Response.json(res);
    }

    if (intent === "update_settings") {
      const updated = await CODManagementService.updateCODSettings(shop, payload.settings);
      return Response.json({ success: true, settings: updated });
    }

    return Response.json({ error: "Invalid intent" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
};
