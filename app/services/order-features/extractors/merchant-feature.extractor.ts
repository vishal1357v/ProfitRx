import prisma from "../../../db.server";
import { MerchantBaselineFeatures } from "../types";
import { ProfitService } from "../../profit.service";

export class MerchantFeatureExtractor {
  static async extract(params: {
    shop: string;
    asOf: Date;
    settings: ReturnType<typeof ProfitService.getSettings>;
  }): Promise<MerchantBaselineFeatures> {
    const { shop, asOf, settings } = params;

    // Use Prisma aggregates to calculate counts and AOV without loading all records
    const aggregate = await prisma.order.aggregate({
      where: {
        shop,
        createdAt: { lt: asOf },
      },
      _count: { id: true },
      _avg: { totalPrice: true },
    });

    const codOrders = await prisma.order.findMany({
      where: {
        shop,
        isCOD: true,
        createdAt: { lt: asOf },
      },
      select: {
        id: true,
        fulfillmentStatus: true,
      },
    });

    let merchantCodRtoCount = 0;
    for (const order of codOrders) {
      const status = (order.fulfillmentStatus || "").toLowerCase();
      if (status === "rto" || status.includes("returned") || status.includes("failed")) {
        merchantCodRtoCount++;
      }
    }

    const merchantHistoricalOrderCount = aggregate._count.id;
    const merchantCodOrderCount = codOrders.length;
    const merchantCodRtoRate = merchantCodOrderCount > 0 ? merchantCodRtoCount / merchantCodOrderCount : null;
    const merchantAverageOrderValue = aggregate._avg.totalPrice ?? null;

    // Sample recent orders for average margin calculation (limit to 200)
    const recentOrders = await prisma.order.findMany({
      where: {
        shop,
        createdAt: { lt: asOf },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    let totalMarginPct = 0;
    let marginSampleCount = 0;
    let totalRtoLoss = 0;
    let rtoLossCount = 0;

    for (const order of recentOrders) {
      const cogs = order.cogsAtTimeOfOrder ?? (order.totalPrice * (settings.defaultCOGSPct / 100));
      
      const status = (order.fulfillmentStatus || "").toLowerCase();
      const isRto = status === "rto" || status.includes("returned") || status.includes("failed");

      if (isRto) {
        // Mock order object for calculateRTOLoss
        const rtoOrder = {
          isCOD: order.isCOD,
          fulfillmentStatus: order.fulfillmentStatus,
          partialDepositCollected: 0,
        };
        const rtoLoss = ProfitService.calculateRTOLoss(rtoOrder, settings as any);
        totalRtoLoss += rtoLoss;
        rtoLossCount++;
      } else {
        const orderForCalc = {
          totalPrice: order.totalPrice,
          isCOD: order.isCOD,
          gateway: order.gateway,
          totalTax: order.totalTax,
          shippingPrice: order.shippingPrice,
          fulfillmentStatus: order.fulfillmentStatus,
        };
        const profit = ProfitService.calculateOrderProfit(orderForCalc, cogs, settings);
        if (order.totalPrice > 0) {
          totalMarginPct += (profit.profit / order.totalPrice);
          marginSampleCount++;
        }
      }
    }

    const merchantAverageMargin = marginSampleCount > 0 ? totalMarginPct / marginSampleCount : null;
    const merchantAverageRtoLoss = rtoLossCount > 0 ? totalRtoLoss / rtoLossCount : null;

    return {
      merchantHistoricalOrderCount,
      merchantCodOrderCount,
      merchantCodRtoCount,
      merchantCodRtoRate,
      merchantAverageOrderValue,
      merchantAverageMargin,
      merchantAverageRtoLoss,
    };
  }
}
