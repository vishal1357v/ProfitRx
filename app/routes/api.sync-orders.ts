import type { ActionFunctionArgs } from "react-router";
import { ShopifyService } from "../services/shopify.service";
import {
  checkRateLimit,
  getClientIp,
  withDbRetry,
} from "../utils/security.server";

export async function action({ request }: ActionFunctionArgs) {
  const ip = getClientIp(request);
  const { allowed, resetIn } = checkRateLimit(ip);
  if (!allowed) {
    return Response.json(
      { error: `Too many requests. Please try again in ${resetIn} seconds.` },
      {
        status: 429,
        headers: {
          "Retry-After": resetIn.toString(),
        },
      }
    );
  }

  try {
    const result = await withDbRetry(async () => {
      return await ShopifyService.syncOrders(request);
    });
    return Response.json({ success: true, count: result.count });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error('[Sync Orders API] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to sync orders' },
      { status: 500 }
    );
  }
}