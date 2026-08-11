import prisma from "../../db.server";

export interface ProductCOGSRecord {
  id: string;
  shop: string;
  productId: string;
  variantId: string | null;
  cost: number | null;
  source: string;
  manualOverride: number | null;
  shopifyNative: number | null;
  cogs: number;
  lastSyncedAt: Date | null;
  updatedAt: Date;
}

export class CogsRepository {
  /**
   * Find all COGS records for a specific shop.
   */
  static async findManyByShop(shop: string): Promise<ProductCOGSRecord[]> {
    return prisma.productCOGS.findMany({
      where: { shop },
    });
  }

  static async findByShop(shop: string): Promise<ProductCOGSRecord[]> {
    return this.findManyByShop(shop);
  }

  /**
   * Find the most recently updated COGS record for timestamp tracking.
   */
  static async findLatestRecord(shop: string): Promise<ProductCOGSRecord | null> {
    return prisma.productCOGS.findFirst({
      where: { shop },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Fetch or create default store settings for COGS and shipping assumptions.
   */
  static async getOrCreateStoreSettings(shop: string, alertEmail = ""): Promise<any> {
    let settings = await prisma.storeSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: {
          shop,
          defaultCOGSPct: 40,
          defaultForwardShipping: 60,
          defaultReturnShipping: 70,
          defaultCODHandling: 40,
          defaultPackaging: 10,
          defaultGatewayFeePct: 2,
          rtoDetectionPattern: "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender",
          rtoThreshold: 10,
          marginThreshold: 15,
          alertEmail,
        },
      });
    }

    return settings;
  }

  /**
   * Bulk upsert manual COGS overrides for a shop's products.
   */
  static async bulkUpsertManualCOGS(shop: string, cogsData: Record<string, number>): Promise<void> {
    for (const [productId, cogs] of Object.entries(cogsData)) {
      if (typeof cogs !== "number" || cogs < 0) continue;
      const id = `${shop}_${productId}`;
      await prisma.productCOGS.upsert({
        where: { shop_productId: { shop, productId } },
        update: {
          cost: cogs,
          manualOverride: cogs,
          source: "manual_override",
          cogs,
          updatedAt: new Date(),
        },
        create: {
          id,
          shop,
          productId,
          cost: cogs,
          manualOverride: cogs,
          source: "manual_override",
          cogs,
          updatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Upsert a single product's manual COGS override with shop scoping.
   */
  static async upsertManualOverride(
    shop: string,
    productId: string,
    cogs: number
  ): Promise<ProductCOGSRecord> {
    const id = `${shop}_${productId}`;
    return prisma.productCOGS.upsert({
      where: { shop_productId: { shop, productId } },
      update: {
        cost: cogs,
        manualOverride: cogs,
        source: "manual_override",
        cogs,
        updatedAt: new Date(),
      },
      create: {
        id,
        shop,
        productId,
        cost: cogs,
        manualOverride: cogs,
        source: "manual_override",
        cogs,
      },
    });
  }

  /**
   * Update the store's default fallback COGS percentage.
   */
  static async updateDefaultCOGSPct(shop: string, defaultCOGSPct: number): Promise<void> {
    await prisma.storeSettings.upsert({
      where: { shop },
      update: { defaultCOGSPct },
      create: { shop, defaultCOGSPct },
    });
  }
}
