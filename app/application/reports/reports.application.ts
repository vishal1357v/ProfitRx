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
        let snapshots = await ReportsRepository.getProfitSnapshots(shop, 90);
        if (snapshots.length === 0) {
          const orders = await ReportsRepository.getOrdersForReports(shop, 90);
          const cogsMap = await ProfitService.getCOGS(shop);
          const dailyMap: Record<string, { revenue: number; profit: number; cogs: number; fees: number; rtoLoss: number }> = {};

          for (const o of orders) {
            const dateKey = new Date(o.createdAt).toISOString().split("T")[0];
            if (!dailyMap[dateKey]) {
              dailyMap[dateKey] = { revenue: 0, profit: 0, cogs: 0, fees: 0, rtoLoss: 0 };
            }
            const cogs = o.cogsAtTimeOfOrder ?? cogsMap[o.productId || ""] ?? ((o.totalPrice || 0) * (settings.defaultCOGSPct || 40)) / 100;
            const { profit, fees } = ProfitService.calculateOrderProfit(o, cogs, settings);
            const isRto = o.fulfillmentStatus === "RTO";

            if (isRto) {
              dailyMap[dateKey].fees += fees;
              dailyMap[dateKey].rtoLoss += fees;
              dailyMap[dateKey].profit -= fees;
            } else {
              dailyMap[dateKey].revenue += o.totalPrice || 0;
              dailyMap[dateKey].cogs += cogs;
              dailyMap[dateKey].fees += fees;
              dailyMap[dateKey].profit += profit;
            }
          }

          reportData = Object.entries(dailyMap)
            .map(([date, d]) => ({
              date,
              revenue: Math.round(d.revenue),
              profit: Math.round(d.profit),
              margin: d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0",
              cogs: Math.round(d.cogs),
              fees: Math.round(d.fees),
              rtoLoss: Math.round(d.rtoLoss),
            }))
            .sort((a, b) => b.date.localeCompare(a.date));
        } else {
          reportData = snapshots.map((s) => ({
            date: s.date.toISOString().split("T")[0],
            revenue: Math.round(s.revenue),
            profit: Math.round(s.profit),
            margin: s.margin.toFixed(1),
            cogs: Math.round(s.cogs),
            fees: Math.round(s.fees),
            rtoLoss: Math.round(s.rtoLoss),
          }));
        }
        break;
      }

      case "weekly-profit": {
        reportTitle = "Weekly Profit Report";
        let snapshots = await ReportsRepository.getProfitSnapshots(shop, 90);
        let dailyItems: Array<{ date: string; revenue: number; profit: number; cogs: number; fees: number }> = [];

        if (snapshots.length === 0) {
          const orders = await ReportsRepository.getOrdersForReports(shop, 90);
          const cogsMap = await ProfitService.getCOGS(shop);
          const dailyMap: Record<string, { revenue: number; profit: number; cogs: number; fees: number }> = {};

          for (const o of orders) {
            const dateKey = new Date(o.createdAt).toISOString().split("T")[0];
            if (!dailyMap[dateKey]) dailyMap[dateKey] = { revenue: 0, profit: 0, cogs: 0, fees: 0 };
            const cogs = o.cogsAtTimeOfOrder ?? cogsMap[o.productId || ""] ?? ((o.totalPrice || 0) * (settings.defaultCOGSPct || 40)) / 100;
            const { profit, fees } = ProfitService.calculateOrderProfit(o, cogs, settings);
            if (o.fulfillmentStatus !== "RTO") {
              dailyMap[dateKey].revenue += o.totalPrice || 0;
              dailyMap[dateKey].cogs += cogs;
              dailyMap[dateKey].fees += fees;
              dailyMap[dateKey].profit += profit;
            } else {
              dailyMap[dateKey].fees += fees;
              dailyMap[dateKey].profit -= fees;
            }
          }
          dailyItems = Object.entries(dailyMap).map(([date, d]) => ({ date, ...d }));
        } else {
          dailyItems = snapshots.map((s) => ({
            date: s.date.toISOString().split("T")[0],
            revenue: s.revenue,
            profit: s.profit,
            cogs: s.cogs,
            fees: s.fees,
          }));
        }

        const weeks: Record<string, { revenue: number; profit: number; cogs: number; fees: number; count: number }> = {};
        dailyItems.forEach((s) => {
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
        let snapshots = await ReportsRepository.getProfitSnapshots(shop, 365);
        let dailyItems: Array<{ date: string; revenue: number; profit: number; cogs: number; fees: number }> = [];

        if (snapshots.length === 0) {
          const orders = await ReportsRepository.getOrdersForReports(shop, 365);
          const cogsMap = await ProfitService.getCOGS(shop);
          const dailyMap: Record<string, { revenue: number; profit: number; cogs: number; fees: number }> = {};

          for (const o of orders) {
            const dateKey = new Date(o.createdAt).toISOString().split("T")[0];
            if (!dailyMap[dateKey]) dailyMap[dateKey] = { revenue: 0, profit: 0, cogs: 0, fees: 0 };
            const cogs = o.cogsAtTimeOfOrder ?? cogsMap[o.productId || ""] ?? ((o.totalPrice || 0) * (settings.defaultCOGSPct || 40)) / 100;
            const { profit, fees } = ProfitService.calculateOrderProfit(o, cogs, settings);
            if (o.fulfillmentStatus !== "RTO") {
              dailyMap[dateKey].revenue += o.totalPrice || 0;
              dailyMap[dateKey].cogs += cogs;
              dailyMap[dateKey].fees += fees;
              dailyMap[dateKey].profit += profit;
            } else {
              dailyMap[dateKey].fees += fees;
              dailyMap[dateKey].profit -= fees;
            }
          }
          dailyItems = Object.entries(dailyMap).map(([date, d]) => ({ date, ...d }));
        } else {
          dailyItems = snapshots.map((s) => ({
            date: s.date.toISOString().split("T")[0],
            revenue: s.revenue,
            profit: s.profit,
            cogs: s.cogs,
            fees: s.fees,
          }));
        }

        const months: Record<string, { revenue: number; profit: number; cogs: number; fees: number }> = {};
        dailyItems.forEach((s) => {
          const key = s.date.substring(0, 7);
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
        if (snapshots.length === 0) {
          const events = await ReportsRepository.getRtoEvents(shop, 100);
          const leakMap: Record<string, { rtoLoss: number; shippingOverage: number; discountLoss: number; codFailureLoss: number; totalLeak: number }> = {};
          events.forEach((e) => {
            const d = e.createdAt.toISOString().split("T")[0];
            if (!leakMap[d]) leakMap[d] = { rtoLoss: 0, shippingOverage: 0, discountLoss: 0, codFailureLoss: 0, totalLeak: 0 };
            leakMap[d].rtoLoss += e.amount || 0;
            leakMap[d].totalLeak += e.amount || 0;
          });
          reportData = Object.entries(leakMap).map(([date, d]) => ({
            date,
            rtoLoss: Math.round(d.rtoLoss),
            shippingOverage: Math.round(d.shippingOverage),
            discountLoss: Math.round(d.discountLoss),
            codFailureLoss: Math.round(d.codFailureLoss),
            totalLeak: Math.round(d.totalLeak),
          })).sort((a, b) => b.date.localeCompare(a.date));
        } else {
          reportData = snapshots.map((s) => ({
            date: s.date.toISOString().split("T")[0],
            rtoLoss: Math.round(s.rtoLoss),
            shippingOverage: Math.round(s.shippingOverage),
            discountLoss: Math.round(s.discountLoss),
            codFailureLoss: Math.round(s.codFailureLoss),
            totalLeak: Math.round(s.totalLeak),
          }));
        }
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
