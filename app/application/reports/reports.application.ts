import { ReportsRepository } from "../../infrastructure/repositories/reports.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { ProfitService } from "../../services/profit.service";

export interface ReportResultDTO {
  reportTitle: string;
  reportType: string;
  reportData: any[];
}

export class ReportsApplicationService {
  /**
   * Generates structured report data for merchant reporting dashboards and CSV exports.
   */
  static async getReportDetails(shop: string, type: string): Promise<ReportResultDTO> {
    const rawSettings = await SettingsRepository.getOrCreate(shop);
    const settings = ProfitService.getSettings(rawSettings);

    let reportData: any[] = [];
    let reportTitle = "";

    switch (type) {
      case "daily-profit": {
        reportTitle = "Daily Profit Report";
        const snapshots = await ReportsRepository.getProfitSnapshots(shop, 90);
        reportData = snapshots.map((s) => ({
          date: s.date.toISOString().split("T")[0],
          revenue: Math.round(s.revenue),
          profit: Math.round(s.profit),
          margin: s.margin.toFixed(1),
          cogs: Math.round(s.cogs),
          fees: Math.round(s.fees),
          rtoLoss: Math.round(s.rtoLoss),
        }));
        break;
      }

      case "weekly-profit": {
        reportTitle = "Weekly Profit Report";
        const snapshots = await ReportsRepository.getProfitSnapshots(shop, 90);
        const weeks: Record<
          string,
          { revenue: number; profit: number; cogs: number; fees: number; count: number }
        > = {};

        snapshots.forEach((s) => {
          const d = new Date(s.date);
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          const key = weekStart.toISOString().split("T")[0];
          if (!weeks[key]) weeks[key] = { revenue: 0, profit: 0, cogs: 0, fees: 0, count: 0 };
          weeks[key].revenue += s.revenue;
          weeks[key].profit += s.profit;
          weeks[key].cogs += s.cogs;
          weeks[key].fees += s.fees;
          weeks[key].count += 1;
        });

        reportData = Object.entries(weeks)
          .map(([week, d]) => ({
            week,
            revenue: Math.round(d.revenue),
            profit: Math.round(d.profit),
            margin: d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0",
            cogs: Math.round(d.cogs),
            fees: Math.round(d.fees),
            days: d.count,
          }))
          .reverse();
        break;
      }

      case "monthly-profit": {
        reportTitle = "Monthly Profit Report";
        const snapshots = await ReportsRepository.getProfitSnapshots(shop, 365);
        const months: Record<
          string,
          { revenue: number; profit: number; cogs: number; fees: number }
        > = {};

        snapshots.forEach((s) => {
          const key = s.date.toISOString().substring(0, 7);
          if (!months[key]) months[key] = { revenue: 0, profit: 0, cogs: 0, fees: 0 };
          months[key].revenue += s.revenue;
          months[key].profit += s.profit;
          months[key].cogs += s.cogs;
          months[key].fees += s.fees;
        });

        reportData = Object.entries(months)
          .map(([month, d]) => ({
            month,
            revenue: Math.round(d.revenue),
            profit: Math.round(d.profit),
            margin: d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0",
            cogs: Math.round(d.cogs),
            fees: Math.round(d.fees),
          }))
          .reverse();
        break;
      }

      case "top-products":
      case "worst-products": {
        reportTitle =
          type === "top-products" ? "Top Products by Profit" : "Worst Products by Profit";
        const orders = await ReportsRepository.getProductOrderMetrics(shop);
        const cogsMap = await ProfitService.getCOGS(shop);
        const productMap: Record<string, { revenue: number; profit: number; volume: number }> = {};

        orders.forEach((o) => {
          const pid = o.productId || "unknown";
          if (!productMap[pid]) productMap[pid] = { revenue: 0, profit: 0, volume: 0 };
          productMap[pid].revenue += o.totalPrice || 0;
          productMap[pid].volume += 1;
          const cogs =
            o.cogsAtTimeOfOrder ??
            cogsMap[pid] ??
            ((o.totalPrice || 0) * (settings.defaultCOGSPct || 40)) / 100;
          const { profit } = ProfitService.calculateOrderProfit(o, cogs, settings);
          productMap[pid].profit += profit;
        });

        reportData = Object.entries(productMap)
          .map(([id, d]) => ({
            productId: id,
            revenue: Math.round(d.revenue),
            profit: Math.round(d.profit),
            margin: d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0",
            volume: d.volume,
          }))
          .sort((a, b) =>
            type === "top-products" ? b.profit - a.profit : a.profit - b.profit
          )
          .slice(0, 50);
        break;
      }

      case "rto-report": {
        reportTitle = "RTO Report";
        const events = await ReportsRepository.getRtoEvents(shop, 100);
        reportData = events.map((e) => ({
          orderId: e.orderId,
          orderNumber: e.orderNumber,
          eventType: e.eventType,
          reason: e.reason || "Unknown",
          amount: Math.round(e.amount),
          status: e.status,
          date: e.createdAt.toISOString().split("T")[0],
        }));
        break;
      }

      case "customer-report": {
        reportTitle = "Customer Report";
        const customers = await ReportsRepository.getCustomerProfiles(shop, 100);
        reportData = customers.map((c) => ({
          name: c.customerName || "Unknown",
          email: c.customerEmail || "",
          orders: c.orderCount,
          revenue: Math.round(c.totalRevenue),
          profit: Math.round(c.totalProfit),
          ltv: Math.round(c.ltv),
          aov: Math.round(c.aov),
        }));
        break;
      }

      case "profit-leak-report": {
        reportTitle = "Profit Leak Report";
        const snapshots = await ReportsRepository.getProfitSnapshots(shop, 90);
        reportData = snapshots.map((s) => ({
          date: s.date.toISOString().split("T")[0],
          rtoLoss: Math.round(s.rtoLoss),
          shippingOverage: Math.round(s.shippingOverage),
          discountLoss: Math.round(s.discountLoss),
          codFailureLoss: Math.round(s.codFailureLoss),
          totalLeak: Math.round(s.totalLeak),
        }));
        break;
      }

      default:
        reportTitle = "Daily Profit Report";
        reportData = [];
    }

    return {
      reportTitle,
      reportType: type,
      reportData,
    };
  }
}
