import { CogsRepository, ProductCOGSRecord } from "../../infrastructure/repositories/cogs.repository";
import { ShopifyService } from "../../services/shopify.service";
import { resolveEffectiveCOGS } from "../../utils/cogs";

export interface CogsCatalogDTO {
  products: any[];
  cogsRecords: Array<{
    productId: string;
    cost: number | null;
    shopifyNative: number | null;
    manualOverride: number | null;
    source: string;
    lastSyncedAt: string | null;
  }>;
  defaultCOGSPct: number;
  lastUpdated: string;
}

export class CogsApplicationService {
  /**
   * Loads the complete COGS catalog with Shopify products and database COGS records.
   */
  static async getCogsCatalog(shop: string, admin: any, alertEmail = ""): Promise<CogsCatalogDTO> {
    // 1. Fetch products from Shopify
    let products: any[] = [];
    try {
      products = await ShopifyService.getProducts(admin);
    } catch (err) {
      console.error("[CogsApplicationService] Failed to load products from Shopify:", err);
    }

    // 2. Fetch existing COGS records from repository
    const cogsRecords = await CogsRepository.findManyByShop(shop);

    // 3. Fetch default settings
    const settings = await CogsRepository.getOrCreateStoreSettings(shop, alertEmail);

    // 4. Determine last updated timestamp
    const latestRecord = await CogsRepository.findLatestRecord(shop);
    const lastUpdated = latestRecord?.lastSyncedAt
      ? latestRecord.lastSyncedAt.toLocaleString()
      : latestRecord
      ? latestRecord.updatedAt.toLocaleString()
      : "Never";

    return {
      products,
      cogsRecords: cogsRecords.map((r) => {
        const cost = resolveEffectiveCOGS(r, r.shopifyNative);
        return {
          productId: r.productId,
          cost,
          shopifyNative: r.shopifyNative,
          manualOverride: r.manualOverride,
          source: r.source || (r.manualOverride ? "manual_override" : "shopify_native"),
          lastSyncedAt: r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleString() : null,
        };
      }),
      defaultCOGSPct: settings.defaultCOGSPct ?? 40,
      lastUpdated,
    };
  }

  /**
   * Saves manual COGS overrides.
   */
  static async saveCogs(shop: string, cogsData: Record<string, number>): Promise<{ success: boolean }> {
    if (!cogsData || typeof cogsData !== "object") {
      throw new Error("Invalid COGS data payload");
    }
    await CogsRepository.bulkUpsertManualCOGS(shop, cogsData);
    return { success: true };
  }

  /**
   * Updates store-wide default COGS percentage fallback.
   */
  static async updateDefaultCogs(shop: string, defaultCOGSPct: number): Promise<{ success: boolean }> {
    const validPct = isNaN(defaultCOGSPct) ? 40 : Math.max(0, Math.min(100, defaultCOGSPct));
    await CogsRepository.updateDefaultCOGSPct(shop, validPct);
    return { success: true };
  }

  /**
   * Triggers Shopify native COGS sync.
   */
  static async syncNativeCogs(request: Request): Promise<any> {
    return ShopifyService.syncNativeCOGS(request);
  }

  /**
   * Refreshes historical order COGS snapshots.
   */
  static async refreshHistoricalCogs(shop: string): Promise<any> {
    return ShopifyService.refreshHistoricalCOGS(shop);
  }
}
