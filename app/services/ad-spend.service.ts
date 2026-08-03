import prisma from "../db.server";
import { decryptToken, encryptToken } from "./token-encryption.server";

export interface PlatformConnection {
  platform: "meta" | "google" | "tiktok";
  name: string;
  isConnected: boolean;
  accountId?: string | null;
  lastSyncedAt?: string | null;
}

export class AdSpendService {
  /**
   * Get connection status for all supported ad platforms
   */
  static async getConnectedPlatforms(shop: string): Promise<PlatformConnection[]> {
    const records = await (prisma as any).adSpend.findMany({
      where: { shop },
    });

    const recordMap = new Map<string, any>();
    records.forEach((r: any) => recordMap.set(r.platform.toLowerCase(), r));

    const platforms: Array<"meta" | "google" | "tiktok"> = ["meta", "google", "tiktok"];
    const labels: Record<string, string> = {
      meta: "Meta Ads (Facebook/Instagram)",
      google: "Google Ads",
      tiktok: "TikTok Ads",
    };

    return platforms.map((platform) => {
      const rec = recordMap.get(platform);
      return {
        platform,
        name: labels[platform],
        isConnected: Boolean(rec?.isConnected),
        accountId: rec?.accountId || null,
        lastSyncedAt: rec?.lastSyncedAt ? new Date(rec.lastSyncedAt).toLocaleString() : null,
      };
    });
  }

  /**
   * Connect an ad platform and save OAuth tokens
   */
  static async connectAdPlatform({
    shop,
    platform,
    accessToken,
    refreshToken,
    accountId,
    tokenExpiresAt,
  }: {
    shop: string;
    platform: string;
    accessToken: string;
    refreshToken?: string | null;
    accountId?: string | null;
    tokenExpiresAt?: Date | null;
  }) {
    const cleanPlatform = platform.toLowerCase();

    const updated = await (prisma as any).adSpend.upsert({
      where: { shop_platform: { shop, platform: cleanPlatform } },
      update: {
        accessToken: encryptToken(accessToken),
        refreshToken: refreshToken ? encryptToken(refreshToken) : null,
        accountId: accountId || null,
        isConnected: true,
        tokenExpiresAt: tokenExpiresAt || null,
        lastSyncedAt: new Date(),
      },
      create: {
        shop,
        platform: cleanPlatform,
        accessToken: encryptToken(accessToken),
        refreshToken: refreshToken ? encryptToken(refreshToken) : null,
        accountId: accountId || null,
        isConnected: true,
        tokenExpiresAt: tokenExpiresAt || null,
        lastSyncedAt: new Date(),
      },
    });

    // Immediately trigger a sync for the connected platform
    await this.syncAdSpendForPlatform(shop, cleanPlatform);
    return updated;
  }

  /**
   * Disconnect an ad platform
   */
  static async disconnectAdPlatform(shop: string, platform: string) {
    const cleanPlatform = platform.toLowerCase();
    return await (prisma as any).adSpend.updateMany({
      where: { shop, platform: cleanPlatform },
      data: {
        isConnected: false,
        accessToken: null,
        refreshToken: null,
      },
    });
  }

  /**
   * Fetch ad spend from a connected platform for a date range
   */
  static async fetchAdSpendFromPlatform(
    shop: string,
    platform: string,
    dateStr: string
  ): Promise<{ spend: number; clicks: number; impressions: number }> {
    const cleanPlatform = platform.toLowerCase();
    const conn = await (prisma as any).adSpend.findUnique({
      where: { shop_platform: { shop, platform: cleanPlatform } },
    });

    if (!conn || !conn.isConnected) {
      return { spend: 0, clicks: 0, impressions: 0 };
    }

    // Check token expiration and refresh if necessary
    let activeToken = decryptToken(conn.accessToken) || "";
    const refreshToken = decryptToken(conn.refreshToken) || "";
    const now = new Date();
    if (refreshToken && conn.tokenExpiresAt && new Date(conn.tokenExpiresAt).getTime() <= now.getTime() + 60000) {
      try {
        console.log(`[AdSpendService] Refreshing access token for ${cleanPlatform} on store ${shop}`);
        let newAccessToken = "";
        let newExpiresAt: Date | null = null;
        
        if (cleanPlatform === "google") {
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID || "",
              client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
              refresh_token: refreshToken,
              grant_type: "refresh_token",
            }),
          });
          const data = await response.json();
          if (data.access_token) {
            newAccessToken = data.access_token;
            if (data.expires_in) {
              newExpiresAt = new Date(Date.now() + data.expires_in * 1000);
            }
          }
        } else if (cleanPlatform === "tiktok") {
          const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              app_id: process.env.TIKTOK_APP_ID || "",
              secret: process.env.TIKTOK_APP_SECRET || "",
              refresh_token: refreshToken,
            }),
          });
          const data = await response.json();
          if (data.data?.access_token) {
            newAccessToken = data.data.access_token;
          }
        }
        
        if (newAccessToken) {
          activeToken = newAccessToken;
          await (prisma as any).adSpend.update({
            where: { shop_platform: { shop, platform: cleanPlatform } },
            data: {
              accessToken: encryptToken(newAccessToken),
              tokenExpiresAt: newExpiresAt,
              updatedAt: new Date(),
            },
          });
          console.log(`[AdSpendService] Successfully refreshed access token for ${cleanPlatform}`);
        }
      } catch (err: any) {
        console.error(`[AdSpendService Token Refresh Error]:`, err.message);
      }
    }

    // Live API integration calls with fallback mock spend if API tokens are dev/demo tokens
    try {
      if (cleanPlatform === "meta" && activeToken && !activeToken.startsWith("demo_") && !activeToken.startsWith("token_")) {
        const response = await fetch(
          `https://graph.facebook.com/v19.0/act_${conn.accountId || "me"}/insights?date_preset=today&fields=spend,clicks,impressions&access_token=${activeToken}`
        );

        if (response.status === 401) {
          console.warn(`[AdSpendService] Meta credentials expired. Disconnecting platform for ${shop}`);
          await this.disconnectAdPlatform(shop, "meta");
          return { spend: 0, clicks: 0, impressions: 0 };
        }

        const data = await response.json();
        if (data.error && (data.error.code === 190 || data.error.error_subcode === 467)) {
          console.warn(`[AdSpendService] Meta OAuth token invalid. Disconnecting.`);
          await this.disconnectAdPlatform(shop, "meta");
        }

        if (data.data?.[0]) {
          return {
            spend: parseFloat(data.data[0].spend || "0"),
            clicks: parseInt(data.data[0].clicks || "0", 10),
            impressions: parseInt(data.data[0].impressions || "0", 10),
          };
        }
      }

      if (cleanPlatform === "google" && activeToken && !activeToken.startsWith("demo_") && !activeToken.startsWith("token_")) {
        const response = await fetch(`https://googleads.googleapis.com/v16/customers/${conn.accountId}/googleAds:search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${activeToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "SELECT metrics.cost_micros, metrics.clicks, metrics.impressions FROM customer WHERE segments.date = DURING TODAY",
          }),
        });

        if (response.status === 401) {
          console.warn(`[AdSpendService] Google credentials expired. Disconnecting platform for ${shop}`);
          await this.disconnectAdPlatform(shop, "google");
          return { spend: 0, clicks: 0, impressions: 0 };
        }

        const data = await response.json();
        if (data.results?.[0]?.metrics) {
          const row = data.results[0].metrics;
          return {
            spend: (parseFloat(row.costMicros || "0") / 1000000) * 83, // INR equivalent
            clicks: parseInt(row.clicks || "0", 10),
            impressions: parseInt(row.impressions || "0", 10),
          };
        }
      }
      if (cleanPlatform === "tiktok" && activeToken && !activeToken.startsWith("demo_") && !activeToken.startsWith("token_")) {
        const response = await fetch(`https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=${conn.accountId}&report_type=BASIC&data_level=AUCTION_ADVERTISER&dimensions=["stat_time_day"]&metrics=["stat_cost","clicks","impressions"]`, {
          headers: {
            "Access-Token": activeToken,
          },
        });

        if (response.status === 401) {
          console.warn(`[AdSpendService] TikTok credentials expired. Disconnecting platform for ${shop}`);
          await this.disconnectAdPlatform(shop, "tiktok");
          return { spend: 0, clicks: 0, impressions: 0 };
        }

        const data = await response.json();
        if (data.code === 40100 || data.code === 40105) {
          console.warn(`[AdSpendService] TikTok token invalid. Disconnecting.`);
          await this.disconnectAdPlatform(shop, "tiktok");
        }

        const row = data.data?.list?.[0]?.metrics;
        if (row) {
          return {
            spend: parseFloat(row.stat_cost || "0"),
            clicks: parseInt(row.clicks || "0", 10),
            impressions: parseInt(row.impressions || "0", 10),
          };
        }
      }
    } catch (err) {
      console.warn(`[AdSpendService] Live API call failed for ${cleanPlatform}, falling back to daily estimate:`, err);
    }

    // Platform is connected but API call failed or token is a mock —
    // return zeros so the dashboard shows an honest "no real data" state
    // rather than fake deterministic numbers.
    console.warn(`[AdSpendService] No live spend data available for ${cleanPlatform} (token may be a mock). Returning 0.`);
    return { spend: 0, clicks: 0, impressions: 0 };
  }

  /**
   * Sync daily ad spend for a specific connected platform
   */
  static async syncAdSpendForPlatform(shop: string, platform: string) {
    const cleanPlatform = platform.toLowerCase();
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const todayDate = new Date(todayStr);

    const data = await this.fetchAdSpendFromPlatform(shop, cleanPlatform, todayStr);

    if (data.spend > 0) {
      await (prisma as any).adSpendDaily.upsert({
        where: { shop_platform_date: { shop, platform: cleanPlatform, date: todayDate } },
        update: {
          spend: data.spend,
          clicks: data.clicks,
          impressions: data.impressions,
        },
        create: {
          shop,
          platform: cleanPlatform,
          date: todayDate,
          spend: data.spend,
          clicks: data.clicks,
          impressions: data.impressions,
        },
      });

      await (prisma as any).adSpend.updateMany({
        where: { shop, platform: cleanPlatform },
        data: { lastSyncedAt: new Date() },
      });
    }

    return data;
  }

  /**
   * Sync ad spend for ALL connected platforms for a store (called by cron)
   */
  static async syncAdSpend(shop: string) {
    const connected = await this.getConnectedPlatforms(shop);
    const activePlatforms = connected.filter((p) => p.isConnected);

    let totalSyncedSpend = 0;
    for (const p of activePlatforms) {
      const res = await this.syncAdSpendForPlatform(shop, p.platform);
      totalSyncedSpend += res.spend;
    }

    return { connectedCount: activePlatforms.length, totalSyncedSpend };
  }
}
