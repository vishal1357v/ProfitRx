import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { ShopifyService } from "../services/shopify.service";

export async function loader({ request }: LoaderFunctionArgs) {
  // Verify Bearer Token
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  // For development testing/safety, check for unauthorized calls
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all offline sessions
    const sessions = await prisma.session.findMany({
      where: {
        isOnline: false,
        accessToken: { not: null },
      },
      select: {
        shop: true,
      },
    });

    const results: Record<string, any> = {};
    for (const session of sessions) {
      try {
        const syncResult = await ShopifyService.syncOrdersForShop(session.shop);
        results[session.shop] = { success: true, count: syncResult.count };
      } catch (err) {
        console.error(`[Auto-Sync Cron] Failed to sync ${session.shop}:`, err);
        results[session.shop] = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    return Response.json({ success: true, results });
  } catch (error) {
    console.error("[Auto-Sync Cron] Critical failure:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
