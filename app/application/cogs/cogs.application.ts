import prisma from "../../db.server";
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
  static async getCogsCatalog(shop: string, admin?: any, alertEmail = ""): Promise<CogsCatalogDTO> {
    // 1. Fetch products from Shopify if admin client available
    let products: any[] = [];
    if (admin) {
      try {
        products = await ShopifyService.getProducts(admin);
      } catch (err) {
        console.error("[CogsApplicationService] Failed to load products from Shopify:", err);
      }
    }

    // 2. Fetch existing COGS records from repository
    const cogsRecords = await CogsRepository.findManyByShop(shop);

    // Fallback: If no Shopify admin products returned (e.g. demo mode / offline), synthesize from database records
    if (products.length === 0 && cogsRecords.length > 0) {
      const orderItems = await prisma.orderLineItem.findMany({
        where: { shop },
        select: { productId: true, title: true, unitPrice: true },
        distinct: ["productId"],
      });
      const orderProductMap = new Map(orderItems.map((item) => [item.productId, item]));

      const productTitles: Record<string, string> = {
        "101": "Oversized Heavyweight Graphic Tee",
        "102": "Premium Fleece Pullover Hoodie",
        "103": "Tactical Cargo Utility Joggers",
        "104": "Classic Pure Linen Button-down Shirt",
        "105": "Handcrafted Leather Chelsea Boots",
        "106": "Quilted Winter Bomber Jacket",
      };

      products = cogsRecords.map((r) => {
        const item = orderProductMap.get(r.productId);
        const rawId = r.productId.replace(/.*Product\//, "").replace(/.*_/, "");
        const fallbackTitle = productTitles[rawId] || `Product ${rawId}`;
        return {
          id: r.productId,
          title: item?.title || fallbackTitle,
          price: item?.unitPrice ? String(item.unitPrice) : "1999",
          shopifyNativeCost: r.shopifyNative,
          images: [],
          variants: [],
        };
      });
    }

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
  static async syncNativeCogs(requestOrAdmin: any, shop?: string): Promise<any> {
    return ShopifyService.syncNativeCOGS(requestOrAdmin, shop);
  }

  /**
   * Refreshes historical order COGS snapshots.
   */
  static async refreshHistoricalCogs(shop: string): Promise<any> {
    return ShopifyService.refreshHistoricalCOGS(shop);
  }
}
