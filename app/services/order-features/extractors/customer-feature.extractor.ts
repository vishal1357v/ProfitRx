import prisma from "../../../db.server";
import { CustomerFeatures, FeatureWarning } from "../types";

export class CustomerFeatureExtractor {
  static async extract(params: {
    shop: string;
    customerId: string | null;
    asOf: Date;
    useTemporalQuery: boolean;
  }): Promise<CustomerFeatures> {
    const { shop, customerId, asOf, useTemporalQuery } = params;
    const warnings: FeatureWarning[] = [];

    const defaultFeatures: CustomerFeatures = {
      customerOrderCount: 0,
      customerCodOrderCount: 0,
      customerPrepaidOrderCount: 0,
      customerDeliveredCount: 0,
      customerRtoCount: 0,
      customerCancellationCount: 0,
      customerRtoRate: null,
      customerAov: null,
      customerLifetimeSpend: null,
      isNewCustomer: true,
      daysSinceLastOrder: null,
      customerAgeDays: null,
      repeatPurchaseGap: null,
      source: "NONE",
      warnings,
    };

    if (!customerId) {
      warnings.push("MISSING_CUSTOMER_ID");
      warnings.push("NO_CUSTOMER_HISTORY");
      return defaultFeatures;
    }

    if (useTemporalQuery) {
      return await this.extractTemporal(shop, customerId, asOf, warnings);
    } else {
      warnings.push("AGGREGATE_DATA_USED");
      return await this.extractLive(shop, customerId, asOf, warnings);
    }
  }

  private static async extractTemporal(
    shop: string,
    customerId: string,
    asOf: Date,
    warnings: FeatureWarning[]
  ): Promise<CustomerFeatures> {
    const orders = await prisma.order.findMany({
      where: {
        shop,
        customerId,
        createdAt: { lt: asOf },
      },
      orderBy: { createdAt: "asc" },
    });

    if (orders.length === 0) {
      warnings.push("NO_CUSTOMER_HISTORY");
      warnings.push("NEW_CUSTOMER");
      return {
        customerOrderCount: 0,
        customerCodOrderCount: 0,
        customerPrepaidOrderCount: 0,
        customerDeliveredCount: 0,
        customerRtoCount: 0,
        customerCancellationCount: 0,
        customerRtoRate: null,
        customerAov: null,
        customerLifetimeSpend: null,
        isNewCustomer: true,
        daysSinceLastOrder: null,
        customerAgeDays: null,
        repeatPurchaseGap: null,
        source: "NONE",
        warnings,
      };
    }

    let codCount = 0;
    let prepaidCount = 0;
    let deliveredCount = 0;
    let rtoCount = 0;
    let cancelledCount = 0;
    let spend = 0;

    for (const order of orders) {
      if (order.isCOD) codCount++;
      else prepaidCount++;

      const status = (order.fulfillmentStatus || "").toLowerCase();
      if (status === "fulfilled" || status === "delivered") {
        deliveredCount++;
      } else if (status === "rto" || status.includes("returned") || status.includes("failed")) {
        rtoCount++;
      }

      if (order.financialStatus?.toLowerCase() === "refunded") {
        cancelledCount++;
      }

      spend += order.totalPrice;
    }

    const firstOrderDate = orders[0].createdAt;
    const lastOrderDate = orders[orders.length - 1].createdAt;

    const daysSinceLastOrder = (asOf.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24);
    const customerAgeDays = (asOf.getTime() - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24);

    let repeatPurchaseGap: number | null = null;
    if (orders.length > 1) {
      let totalGap = 0;
      for (let i = 1; i < orders.length; i++) {
        totalGap += (orders[i].createdAt.getTime() - orders[i - 1].createdAt.getTime());
      }
      repeatPurchaseGap = (totalGap / (orders.length - 1)) / (1000 * 60 * 60 * 24);
    }

    return {
      customerOrderCount: orders.length,
      customerCodOrderCount: codCount,
      customerPrepaidOrderCount: prepaidCount,
      customerDeliveredCount: deliveredCount,
      customerRtoCount: rtoCount,
      customerCancellationCount: cancelledCount,
      customerRtoRate: codCount > 0 ? rtoCount / codCount : null,
      customerAov: spend / orders.length,
      customerLifetimeSpend: spend,
      isNewCustomer: false,
      daysSinceLastOrder,
      customerAgeDays,
      repeatPurchaseGap,
      source: "TEMPORAL_QUERY",
      warnings,
    };
  }

  private static async extractLive(
    shop: string,
    customerId: string,
    asOf: Date,
    warnings: FeatureWarning[]
  ): Promise<CustomerFeatures> {
    const risk = await prisma.customerRisk.findUnique({
      where: { shop_customerId: { shop, customerId } },
    });

    const profile = await prisma.customerProfile.findUnique({
      where: { shop_customerId: { shop, customerId } },
    });

    if (!risk) {
      warnings.push("NO_CUSTOMER_HISTORY");
      warnings.push("NEW_CUSTOMER");
      return {
        customerOrderCount: 0,
        customerCodOrderCount: 0,
        customerPrepaidOrderCount: 0,
        customerDeliveredCount: 0,
        customerRtoCount: 0,
        customerCancellationCount: 0,
        customerRtoRate: null,
        customerAov: null,
        customerLifetimeSpend: null,
        isNewCustomer: true,
        daysSinceLastOrder: null,
        customerAgeDays: null,
        repeatPurchaseGap: null,
        source: "NONE",
        warnings,
      };
    }

    let daysSinceLastOrder: number | null = null;
    if (risk.lastOrderDate) {
      daysSinceLastOrder = (asOf.getTime() - risk.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastOrder < 0) daysSinceLastOrder = 0;
    }

    let customerAgeDays: number | null = null;
    if (profile?.firstOrderDate) {
      customerAgeDays = (asOf.getTime() - profile.firstOrderDate.getTime()) / (1000 * 60 * 60 * 24);
      if (customerAgeDays < 0) customerAgeDays = 0;
    }

    return {
      customerOrderCount: risk.totalOrders,
      customerCodOrderCount: risk.codOrders,
      customerPrepaidOrderCount: risk.prepaidOrders,
      customerDeliveredCount: risk.successfulDeliveries,
      customerRtoCount: risk.rtoCount,
      customerCancellationCount: risk.cancellationCount,
      customerRtoRate: risk.codOrders > 0 ? risk.rtoCount / risk.codOrders : null,
      customerAov: risk.aov,
      customerLifetimeSpend: risk.lifetimeSpend,
      isNewCustomer: risk.totalOrders === 0,
      daysSinceLastOrder,
      customerAgeDays,
      repeatPurchaseGap: null, // Hard to compute precisely from aggregates alone
      source: "AGGREGATE_TABLE",
      warnings,
    };
  }
}
