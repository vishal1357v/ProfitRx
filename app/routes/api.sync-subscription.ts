import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncSubscriptionWithShopify } from "../services/subscription-sync.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session, billing } = await authenticate.admin(request);
    const subscription = await syncSubscriptionWithShopify(session.shop, billing);
    return Response.json({
      success: true,
      shop: session.shop,
      subscription,
    });
  } catch (error: any) {
    console.error("[api.sync-subscription Loader Error]:", error);
    return Response.json(
      { success: false, error: error.message || "Failed to sync subscription" },
      { status: 500 }
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session, billing } = await authenticate.admin(request);
    const subscription = await syncSubscriptionWithShopify(session.shop, billing);
    return Response.json({
      success: true,
      shop: session.shop,
      subscription,
    });
  } catch (error: any) {
    console.error("[api.sync-subscription Action Error]:", error);
    return Response.json(
      { success: false, error: error.message || "Failed to sync subscription" },
      { status: 500 }
    );
  }
};
