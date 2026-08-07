import prisma from "../../../db.server";
import { PincodeFeatureResult, FeatureWarning } from "../types";

export class PincodeFeatureExtractor {
  static async extract(params: {
    shop: string;
    pincode: string | null;
    asOf: Date;
    useTemporalQuery: boolean;
  }): Promise<PincodeFeatureResult> {
    const { shop, pincode, asOf, useTemporalQuery } = params;
    const warnings: FeatureWarning[] = [];

    const defaultFeatures: PincodeFeatureResult = {
      pincodeOrderCount: 0,
      pincodeCodOrderCount: 0,
      pincodeSuccessfulDeliveries: 0,
      pincodeRtoCount: 0,
      pincodeRtoRate: null,
      pincodeDeliveryRate: null,
      pincodeSampleSize: 0,
      regionalOrderCount: 0,
      regionalCodOrderCount: 0,
      regionalRtoCount: 0,
      regionalRtoRate: null,
      regionalSampleSize: 0,
      source: "NONE",
      warnings,
    };

    if (!pincode) {
      warnings.push("MISSING_ADDRESS");
      warnings.push("UNKNOWN_PINCODE");
      warnings.push("NO_PINCODE_HISTORY");
      warnings.push("NO_REGIONAL_HISTORY");
      return defaultFeatures;
    }

    if (useTemporalQuery) {
      return await this.extractTemporal(shop, pincode, asOf, warnings);
    } else {
      warnings.push("AGGREGATE_DATA_USED");
      return await this.extractLive(shop, pincode, warnings);
    }
  }

  private static async extractTemporal(
    shop: string,
    pincode: string,
    asOf: Date,
    warnings: FeatureWarning[]
  ): Promise<PincodeFeatureResult> {
    // 1. Exact Pincode Match
    const orders = await prisma.order.findMany({
      where: {
        shop,
        pincode,
        createdAt: { lt: asOf },
      },
    });

    let exactCodCount = 0;
    let exactDeliveredCount = 0;
    let exactRtoCount = 0;

    for (const order of orders) {
      if (order.isCOD) exactCodCount++;

      const status = (order.fulfillmentStatus || "").toLowerCase();
      if (status === "fulfilled" || status === "delivered") {
        exactDeliveredCount++;
      } else if (status === "rto" || status.includes("returned") || status.includes("failed")) {
        exactRtoCount++;
      }
    }

    if (orders.length === 0) {
      warnings.push("NO_PINCODE_HISTORY");
    }

    // 2. Regional Fallback (First 2 digits)
    const regionPrefix = pincode.substring(0, 2);
    let regionalCodCount = 0;
    let regionalRtoCount = 0;
    let regionalOrderCount = 0;

    if (regionPrefix.length === 2) {
      const regionalOrders = await prisma.order.findMany({
        where: {
          shop,
          pincode: { startsWith: regionPrefix },
          createdAt: { lt: asOf },
        },
      });

      regionalOrderCount = regionalOrders.length;
      for (const order of regionalOrders) {
        if (order.isCOD) regionalCodCount++;
        const status = (order.fulfillmentStatus || "").toLowerCase();
        if (status === "rto" || status.includes("returned") || status.includes("failed")) {
          regionalRtoCount++;
        }
      }
    }

    if (regionalOrderCount === 0) {
      warnings.push("NO_REGIONAL_HISTORY");
    }

    return {
      pincodeOrderCount: orders.length,
      pincodeCodOrderCount: exactCodCount,
      pincodeSuccessfulDeliveries: exactDeliveredCount,
      pincodeRtoCount: exactRtoCount,
      pincodeRtoRate: exactCodCount > 0 ? exactRtoCount / exactCodCount : null,
      pincodeDeliveryRate: orders.length > 0 ? exactDeliveredCount / orders.length : null,
      pincodeSampleSize: orders.length,
      regionalOrderCount,
      regionalCodOrderCount: regionalCodCount,
      regionalRtoCount: regionalRtoCount,
      regionalRtoRate: regionalCodCount > 0 ? regionalRtoCount / regionalCodCount : null,
      regionalSampleSize: regionalOrderCount,
      source: "TEMPORAL_QUERY",
      warnings,
    };
  }

  private static async extractLive(
    shop: string,
    pincode: string,
    warnings: FeatureWarning[]
  ): Promise<PincodeFeatureResult> {
    const stats = await prisma.pincodeStats.findUnique({
      where: { shop_pincode: { shop, pincode } },
    });

    let exactOrderCount = 0;
    let exactCodCount = 0;
    let exactDeliveredCount = 0;
    let exactRtoCount = 0;

    if (stats) {
      exactOrderCount = stats.totalOrders;
      exactCodCount = stats.codOrders;
      exactDeliveredCount = stats.successfulDeliveries;
      exactRtoCount = stats.rtoCount;
    } else {
      warnings.push("NO_PINCODE_HISTORY");
    }

    // Regional fallback from PincodeStats
    const regionPrefix = pincode.substring(0, 2);
    let regionalOrderCount = 0;
    let regionalCodCount = 0;
    let regionalRtoCount = 0;

    if (regionPrefix.length === 2) {
      const regionalStats = await prisma.pincodeStats.findMany({
        where: { shop, pincode: { startsWith: regionPrefix } },
      });

      for (const s of regionalStats) {
        regionalOrderCount += s.totalOrders;
        regionalCodCount += s.codOrders;
        regionalRtoCount += s.rtoCount;
      }
    }

    if (regionalOrderCount === 0) {
      warnings.push("NO_REGIONAL_HISTORY");
    }

    return {
      pincodeOrderCount: exactOrderCount,
      pincodeCodOrderCount: exactCodCount,
      pincodeSuccessfulDeliveries: exactDeliveredCount,
      pincodeRtoCount: exactRtoCount,
      pincodeRtoRate: exactCodCount > 0 ? exactRtoCount / exactCodCount : null,
      pincodeDeliveryRate: exactOrderCount > 0 ? exactDeliveredCount / exactOrderCount : null,
      pincodeSampleSize: exactOrderCount,
      regionalOrderCount,
      regionalCodOrderCount: regionalCodCount,
      regionalRtoCount: regionalRtoCount,
      regionalRtoRate: regionalCodCount > 0 ? regionalRtoCount / regionalCodCount : null,
      regionalSampleSize: regionalOrderCount,
      source: "AGGREGATE_TABLE",
      warnings,
    };
  }
}
