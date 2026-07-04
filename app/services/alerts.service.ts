import prisma from "../db.server";
import { ProfitService } from "./profit.service";
import { ProfitIntelligenceService } from "./profit-intelligence.service";

export class AlertService {
  /**
   * Evaluate store metrics against settings thresholds and create alerts
   */
  static async evaluateStoreAlerts(shop: string) {
    let settings = await prisma.storeSettings.findUnique({ where: { shop } });
    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: {
          shop,
          defaultCOGSPct: 40,
          rtoThreshold: 10,
          marginThreshold: 15,
        },
      });
    }

    const safeSettings = ProfitService.getSettings(settings);
    const { marginThreshold, rtoThreshold } = safeSettings;

    // Fetch orders and calculate summary
    const orders = await prisma.order.findMany({ where: { shop } });
    if (orders.length === 0) return { alertsCreated: 0 };

    const cogsDict = await ProfitService.getCOGS(shop);

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalFees = 0;
    let profitOrdersCount = 0;

    let codOrdersCount = 0;
    let codRtoCount = 0;

    for (const o of orders) {
      const c = cogsDict[o.productId || ""];
      if (c !== undefined) {
        const { fees } = ProfitService.calculateOrderProfit(o, c, safeSettings);
        totalCogs += c;
        totalFees += fees;
        profitOrdersCount++;
      }
      totalRevenue += o.totalPrice;

      if (o.isCOD) {
        codOrdersCount++;
        if (o.fulfillmentStatus === "RTO") codRtoCount++;
      }
    }

    const totalProfit = totalRevenue - totalCogs - totalFees;
    const storeMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const storeRtoRate = codOrdersCount > 0 ? (codRtoCount / codOrdersCount) * 100 : 0;

    const createdAlerts: string[] = [];

    // Helper to trigger alert if not already active
    const triggerAlert = async (type: string, severity: "CRITICAL" | "WARNING" | "INFO", message: string) => {
      const existing = await prisma.alert.findFirst({
        where: { shop, type, isRead: false },
      });
      if (!existing) {
        await prisma.alert.create({
          data: {
            shop,
            type,
            severity,
            message,
            isRead: false,
          },
        });
        createdAlerts.push(type);
      }
    };

    // Rule 1: Profit Drop Alert (Profit Margin below marginThreshold)
    if (profitOrdersCount > 0 && storeMargin < marginThreshold) {
      await triggerAlert(
        "PROFIT_DROP_ALERT",
        storeMargin < 5 ? "CRITICAL" : "WARNING",
        `Store profit margin (${storeMargin.toFixed(1)}%) dropped below target threshold (${marginThreshold}%). Review COGS and pricing.`
      );
    }

    // Rule 2: RTO Rate Alert (RTO rate exceeds rtoThreshold)
    if (codOrdersCount >= 3 && storeRtoRate > rtoThreshold) {
      await triggerAlert(
        "RTO_RATE_ALERT",
        storeRtoRate > 20 ? "CRITICAL" : "WARNING",
        `Store RTO rate (${storeRtoRate.toFixed(1)}%) exceeded safe threshold (${rtoThreshold}%). Check high-risk pincodes.`
      );
    }

    // Rule 3: COD Failure Alert
    if (codOrdersCount >= 3 && storeRtoRate > 15) {
      await triggerAlert(
        "COD_FAILURE_ALERT",
        "CRITICAL",
        `High COD Failure Rate: ${storeRtoRate.toFixed(1)}% of COD orders are returning. Enable COD verification.`
      );
    }

    // Rule 4: Low Margin Product Alert
    for (const [productId, cogs] of Object.entries(cogsDict)) {
      const prodOrders = orders.filter((o) => o.productId === productId);
      if (prodOrders.length > 0) {
        const prodRev = prodOrders.reduce((s, o) => s + o.totalPrice, 0);
        const { profit } = ProfitService.calculateOrderProfit(prodOrders[0], cogs, safeSettings);
        const prodMargin = prodRev > 0 ? (profit / (prodRev / prodOrders.length)) * 100 : 0;
        if (prodMargin < marginThreshold) {
          await triggerAlert(
            `LOW_MARGIN_PRODUCT_${productId}`,
            "WARNING",
            `Product margin (${prodMargin.toFixed(1)}%) is below threshold (${marginThreshold}%). Adjust product cost or selling price.`
          );
          break; // Avoid spamming multiple product alerts
        }
      }
    }

    // Rule 5: Health Score Alert
    const healthStatus = await ProfitIntelligenceService.getProfitHealthStatus(shop);
    if (healthStatus.status === "CRITICAL") {
      await triggerAlert(
        "HEALTH_SCORE_CRITICAL",
        "CRITICAL",
        `Store Health Score is CRITICAL: ${healthStatus.headline}`
      );
    } else if (healthStatus.status === "WARNING") {
      await triggerAlert(
        "HEALTH_SCORE_WARNING",
        "WARNING",
        `Store Health Score Warning: ${healthStatus.headline}`
      );
    }

    return { alertsCreated: createdAlerts.length, types: createdAlerts };
  }

  /**
   * Resolve an alert
   */
  static async resolveAlert(shop: string, alertId: string) {
    return await prisma.alert.updateMany({
      where: { id: alertId, shop },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
