import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { ShopifyService } from "../services/shopify.service";
import { AdSpendService } from "../services/ad-spend.service";
import { WhatsAppService } from "../services/whatsapp.service";
import { RetentionCleanupService } from "../services/compliance/retention-cleanup.service";

export async function loader({ request }: LoaderFunctionArgs) {
  // Verify Bearer Token
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed if CRON_SECRET is not configured or header does not match
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

    const today = new Date();
    // Monthly reset of ordersUsed counter on 1st day of month
    if (today.getDate() === 1) {
      try {
        await prisma.subscription.updateMany({
          data: { ordersUsed: 0 },
        });
        console.log("[Auto-Sync Cron] Reset monthly ordersUsed counter for all stores.");
      } catch (resetErr) {
        console.error("[Auto-Sync Cron] Failed to reset monthly ordersUsed:", resetErr);
      }
    }

    const results: Record<string, any> = {};
    const batchSize = 5;

    for (let i = 0; i < sessions.length; i += batchSize) {
      const batch = sessions.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (session) => {
          try {
            // 1. Sync Orders
            const orderResult = await ShopifyService.syncOrdersForShop(session.shop);
            
            // 2. Sync Native Shopify COGS
            const cogsResult = await ShopifyService.syncNativeCOGS(session.shop);

            // 3. Sync Connected Ad Spend (Meta, Google, TikTok)
            const adSpendResult = await AdSpendService.syncAdSpend(session.shop);

            // 4. Send Weekly WhatsApp Digest on Mondays (1 is Monday)
            let whatsappDigestResult = { sent: false };
            if (today.getDay() === 1) {
              const digestRes = await WhatsAppService.sendWeeklyDigest(session.shop);
              whatsappDigestResult = { sent: digestRes.success, ...digestRes };
            }

            results[session.shop] = {
              success: true,
              ordersSynced: orderResult.count,
              cogsSynced: cogsResult.synced,
              adPlatformsSynced: adSpendResult.connectedCount,
              adSpendSyncedTotal: adSpendResult.totalSyncedSpend,
              whatsappDigestSent: whatsappDigestResult.sent,
            };
          } catch (err) {
            console.error(`[Auto-Sync Cron] Failed to sync ${session.shop}:`, err);
            results[session.shop] = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
      );
    }

    // 5. Scheduled Data Protection Retention Cleanup (Shopify PCD Level 2 compliance)
    let retentionCleanupResult: any = null;
    try {
      retentionCleanupResult = await RetentionCleanupService.runScheduledCleanup();
      console.log("[Auto-Sync Cron] Retention cleanup completed successfully:", retentionCleanupResult);
    } catch (cleanupErr: any) {
      console.error("[Auto-Sync Cron] Retention cleanup failed:", cleanupErr);
      retentionCleanupResult = {
        success: false,
        error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      };
    }

    return Response.json({ success: true, results, retentionCleanup: retentionCleanupResult });
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
