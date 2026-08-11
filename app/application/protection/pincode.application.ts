import { PincodeRepository, PincodeStatRecord } from "../../infrastructure/repositories/pincode.repository";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { RtoRepository } from "../../infrastructure/repositories/rto.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { ProfitIntelligenceService } from "../../services/profit-intelligence.service";
import { ProfitService } from "../../services/profit.service";
import { CODManagementService } from "../../services/cod-management.service";

export interface PincodeHeatmapDTO {
  hasAccess: boolean;
  pincodeStats: Array<{
    pincode: string;
    city: string | null;
    province: string | null;
    totalOrders: number;
    codOrders: number;
    rtoCount: number;
    totalLoss: number;
    rtoRate: number;
    riskLevel: string;
  }>;
  codStats: {
    orders: number;
    revenue: number;
    profit: number;
    margin: number;
    rtoRate: number;
    aov: number;
  };
  prepaidStats: {
    orders: number;
    revenue: number;
    profit: number;
    margin: number;
    rtoRate: number;
    aov: number;
  };
  pendingCODWithRisk: Array<{
    id: string;
    orderNumber: number;
    value: number;
    pincode: string;
    city: string;
    riskScore: number;
    riskLevel: string;
    topReason: string;
  }>;
  totalOrders: number;
  shop: string;
  host: string;
}

export class PincodeApplicationService {
  /**
   * Orchestrates the Pincode RTO Heatmap and Regional Risk intelligence data.
   */
  static async getPincodeHeatmapData(shop: string, host: string): Promise<PincodeHeatmapDTO> {
    // 1. Fetch data through repositories in parallel
    const [pincodeStats, orders, rawSettings, cogsMap, rtoEvents] = await Promise.all([
      PincodeRepository.findManyByShop(shop, 30),
      OrderRepository.findByShop(shop),
      SettingsRepository.getByShop(shop),
      ProfitService.getCOGS(shop),
      RtoRepository.findByShop(shop),
    ]);

    // 2. Classify COD vs Prepaid
    const isCOD = (o: any) =>
      o.isCOD ||
      (o.gateway &&
        (o.gateway.toLowerCase().includes("cod") ||
          o.gateway.toLowerCase().includes("cash") ||
          o.gateway.toLowerCase().includes("manual")));

    const codOrders = orders.filter(isCOD);
    const prepaidOrders = orders.filter((o: any) => !isCOD(o));

    const codRevenue = codOrders.reduce((s: number, o: any) => s + (o.totalPrice || 0), 0);
    const prepaidRevenue = prepaidOrders.reduce((s: number, o: any) => s + (o.totalPrice || 0), 0);

    // 3. Calculate profit metrics
    const settings = ProfitService.getSettings(rawSettings);
    const calcProfit = (orderList: typeof orders) =>
      orderList.reduce((s: number, o: any) => {
        const c = cogsMap[o.productId || ""] ?? (o.totalPrice * settings.defaultCOGSPct) / 100;
        const { profit } = ProfitService.calculateOrderProfit(o, c, settings);
        return s + profit;
      }, 0);

    const codProfit = calcProfit(codOrders);
    const prepaidProfit = calcProfit(prepaidOrders);
    const codMargin = codRevenue > 0 ? (codProfit / codRevenue) * 100 : 0;
    const prepaidMargin = prepaidRevenue > 0 ? (prepaidProfit / prepaidRevenue) * 100 : 0;

    // 4. Calculate RTO events and rate
    const manualRtoIds = rtoEvents.filter((e) => e.eventType === "RTO").map((e) => e.orderId);
    const autoRtoIds = orders.filter((o: any) => o.fulfillmentStatus === "RTO").map((o: any) => o.id);
    const uniqueRtoIds = new Set([...manualRtoIds, ...autoRtoIds]);

    let codRtoCount = 0;
    for (const o of codOrders) {
      if (uniqueRtoIds.has(o.id)) codRtoCount++;
    }
    const codRtoRate = codOrders.length > 0 ? (codRtoCount / codOrders.length) * 100 : 0;

    const codAOV = codOrders.length > 0 ? codRevenue / codOrders.length : 0;
    const prepaidAOV = prepaidOrders.length > 0 ? prepaidRevenue / prepaidOrders.length : 0;

    // 5. COD risk for pending unfulfilled COD orders
    const pendingCOD = codOrders
      .filter(
        (o: any) =>
          o.fulfillmentStatus?.toLowerCase() === "unfulfilled" ||
          o.fulfillmentStatus?.toLowerCase() === "in progress"
      )
      .sort((a: any, b: any) => (b.totalPrice || 0) - (a.totalPrice || 0))
      .slice(0, 10);

    const pendingCODWithRisk = await Promise.all(
      pendingCOD.map(async (o: any) => {
        const risk = await ProfitIntelligenceService.getCODRiskScore(
          shop,
          o.pincode,
          o.totalPrice,
          o.customerId
        );
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          value: o.totalPrice,
          pincode: o.pincode || "N/A",
          city: o.city || "N/A",
          riskScore: risk.score,
          riskLevel: risk.level,
          topReason: risk.reasons[0] || "Unknown",
        };
      })
    );

    return {
      hasAccess: true,
      pincodeStats: pincodeStats.map((p) => ({
        pincode: p.pincode,
        city: p.city,
        province: p.province,
        totalOrders: p.totalOrders,
        codOrders: p.codOrders,
        rtoCount: p.rtoCount,
        totalLoss: p.totalLoss,
        rtoRate: Math.round(p.rtoRate * 10) / 10,
        riskLevel: p.riskLevel,
      })),
      codStats: {
        orders: codOrders.length,
        revenue: Math.round(codRevenue),
        profit: Math.round(codProfit),
        margin: Math.round(codMargin * 10) / 10,
        rtoRate: Math.round(codRtoRate * 10) / 10,
        aov: Math.round(codAOV),
      },
      prepaidStats: {
        orders: prepaidOrders.length,
        revenue: Math.round(prepaidRevenue),
        profit: Math.round(prepaidProfit),
        margin: Math.round(prepaidMargin * 10) / 10,
        rtoRate: 0,
        aov: Math.round(prepaidAOV),
      },
      pendingCODWithRisk,
      totalOrders: orders.length,
      shop,
      host,
    };
  }

  /**
   * Bulk blocks high-risk pincodes.
   */
  static async bulkBlockHighRisk(shop: string, pincodes: string[]): Promise<{ success: boolean; count: number }> {
    const updated = await CODManagementService.bulkUpdateBlockedPincodes(shop, pincodes);
    return { success: true, count: updated.length };
  }
}
