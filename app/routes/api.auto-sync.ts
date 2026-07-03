import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { ShopifyService } from "../services/shopify.service";
import { AdSpendService } from "../services/ad-spend.service";

export async function loader({ request }: LoaderFunctionArgs) {
  // Verify Bearer Token
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  // For development testing/safety, check for unauthorized calls if CRON_SECRET is set
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
        // 1. Sync Orders
        const orderResult = await ShopifyService.syncOrdersForShop(session.shop);
        
        // 2. Sync Native Shopify COGS
        const cogsResult = await ShopifyService.syncNativeCOGS(session.shop);

        // 3. Sync Connected Ad Spend (Meta, Google, TikTok)
        const adSpendResult = await AdSpendService.syncAdSpend(session.shop);

        results[session.shop] = {
          success: true,
          ordersSynced: orderResult.count,
          cogsSynced: cogsResult.synced,
          adPlatformsSynced: adSpendResult.connectedCount,
          adSpendSyncedTotal: adSpendResult.totalSyncedSpend,
        };
      } catch (err) {
        console.error(`[Auto-Sync Cron] Failed to sync ${session.shop}:`, err);
        results[session.shop] = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
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

export async function action(args: ActionFunctionArgs) {
  return loader(args);
}
