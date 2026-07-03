import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { ShopifyService } from "../services/shopify.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const result = await ShopifyService.syncNativeCOGS(request);
    return Response.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[api.sync-cogs Loader Error]:", error);
    return Response.json(
      { success: false, error: error.message || "Failed to sync native COGS" },
      { status: 500 }
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const result = await ShopifyService.syncNativeCOGS(request);
    return Response.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[api.sync-cogs Action Error]:", error);
    return Response.json(
      { success: false, error: error.message || "Failed to sync native COGS" },
      { status: 500 }
    );
  }
};
