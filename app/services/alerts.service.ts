import prisma from "../db.server";
import { ProfitService } from "./profit.service";
import { ProfitIntelligenceService } from "./profit-intelligence.service";
import { Resend } from "resend";

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
        await AlertService.sendEmailNotification(shop, type, severity, message);
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

  /**
   * Dispatch an email notification for a triggered alert via Resend
   */
  static async sendEmailNotification(
    shop: string,
    type: string,
    severity: "CRITICAL" | "WARNING" | "INFO",
    message: string
  ) {
    const settings = await prisma.storeSettings.findUnique({
      where: { shop },
    });

    if (!settings?.alertEmail) {
      console.log(`[AlertService] No alert email configured for shop: ${shop}. Skipping email dispatch.`);
      return;
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn(`[AlertService] RESEND_API_KEY is not configured in environment. Skipping email dispatch.`);
      return;
    }

    try {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: "ProfitRx <alerts@profitrx.app>",
        to: settings.alertEmail,
        subject: `[${severity}] ProfitRx Alert: ${message.slice(0, 50)}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px; max-width: 600px;">
            <h2 style="color: #d9534f;">ProfitRx Alert</h2>
            <p>We detected a metrics issue on your shop: <strong>${shop}</strong></p>
            <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;" />
            <table style="width: 100%;">
              <tr>
                <td style="padding: 5px 0; font-weight: bold; width: 120px;">Alert Type:</td>
                <td style="padding: 5px 0;">${type}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold;">Severity:</td>
                <td style="padding: 5px 0;"><span style="background-color: ${severity === "CRITICAL" ? "#d9534f" : "#f0ad4e"}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${severity}</span></td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold; vertical-align: top;">Message:</td>
                <td style="padding: 5px 0;">${message}</td>
              </tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;" />
            <p style="font-size: 12px; color: #777;">Please log in to your Shopify store admin and open ProfitRx to review your dashboard metrics.</p>
          </div>
        `,
      });
      console.log(`[AlertService] Alert email dispatched successfully to ${settings.alertEmail}`);
    } catch (err) {
      console.error(`[AlertService] Failed to send email alert via Resend:`, err);
    }
  }
}
