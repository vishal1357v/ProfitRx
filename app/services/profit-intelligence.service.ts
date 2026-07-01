/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from "../db.server";
import { ProfitService } from "./profit.service";

// ── COD Risk Score ────────────────────────────────────────
export interface CODRiskResult {
  score: number;       // 0-100 (100 = certain RTO)
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasons: string[];
  isColdStart?: boolean;
}

export interface ProfitLeaks {
  rtoLoss: number;
  shippingOverage: number;
  discountLoss: number;
  codFailureLoss: number;
  totalLeak: number;
  // Trend (last 7 vs previous 7 days)
  rtoTrend: number;
  shippingTrend: number;
  discountTrend: number;
}

export interface LTVCohort {
  cohortMonth: string;
  customers: number;
  revenue: number;
  avgRevenue: number;
  repeat30: number;
  repeat60: number;
  repeat90: number;
}

export interface ROASData {
  totalRevenue: number;
  totalAdSpend: number;
  blendedROAS: number;
  trueCACRaw: number;  // Ad spend / total customers
  profitAdjustedROAS: number;
  cacPaybackOrders: number; // True CAC / Average Profit per Order
  byChannel: Array<{
    channel: string;
    spend: number;
    revenue: number;
    roas: number;
  }>;
}

export interface ProfitHealthStatus {
  status: "HEALTHY" | "WARNING" | "CRITICAL";
  emoji: "🟢" | "🟡" | "🔴";
  headline: string;
  drivers: Array<{
    label: string;
    status: "good" | "warning" | "critical";
    detail: string;
  }>;
}

const isCodGateway = (gateway: string | null | undefined): boolean => {
  if (!gateway) return false;
  const lower = gateway.toLowerCase();
  return lower.includes("cod") || lower.includes("cash") || lower.includes("manual");
};

export class ProfitIntelligenceService {

  // ── Pincode Stats ─────────────────────────────────────────
  static async getPincodeStats(shop: string, limit = 30) {
    const stats = await (prisma as any).pincodeStats.findMany({
      where: { shop },
      orderBy: { rtoRate: "desc" },
      take: limit,
    });
    return stats;
  }

  // ── COD Risk Score ────────────────────────────────────────
  static async getCODRiskScore(
    shop: string,
    pincode: string | null | undefined,
    orderValue: number,
    customerId: string | null | undefined,
  ): Promise<CODRiskResult> {
    const reasons: string[] = [];
    let score = 0;

    // Factor 1: Pincode history (40 pts max)
    if (pincode) {
      const pincodeData = await (prisma as any).pincodeStats.findUnique({
        where: { shop_pincode: { shop, pincode } },
      });
      if (pincodeData) {
        const pincodeRisk = Math.min(40, pincodeData.rtoRate * 2);
        score += pincodeRisk;
        if (pincodeData.rtoRate >= 30) reasons.push(`PIN ${pincode} has ${pincodeData.rtoRate.toFixed(0)}% RTO history`);
        else if (pincodeData.rtoRate >= 15) reasons.push(`PIN ${pincode} has elevated ${pincodeData.rtoRate.toFixed(0)}% RTO rate`);
      } else {
        // Try regional fallback (first 2 digits matching, which represent the region in India)
        const prefix = pincode.substring(0, 2);
        if (prefix && prefix.length === 2 && !isNaN(parseInt(prefix))) {
          const regionalPincodes = await (prisma as any).pincodeStats.findMany({
            where: { shop, pincode: { startsWith: prefix } }
          });
          if (regionalPincodes && regionalPincodes.length > 0) {
            const avgRegionalRto = regionalPincodes.reduce((sum: number, p: any) => sum + p.rtoRate, 0) / regionalPincodes.length;
            const pincodeRisk = Math.min(40, avgRegionalRto * 2);
            score += pincodeRisk;
            reasons.push(`Regional fallback: PINs starting with ${prefix} average ${avgRegionalRto.toFixed(0)}% RTO`);
          } else {
            // Unknown pincode with no regional history — moderate default risk
            score += 15;
            reasons.push(`PIN ${pincode} has no local or regional delivery history`);
          }
        } else {
          score += 15;
          reasons.push(`PIN ${pincode} has no delivery history`);
        }
      }
    } else {
      score += 20;
      reasons.push("No shipping pincode provided");
    }

    // Factor 2: Order value (30 pts max)
    // High-value COD orders have higher RTO risk
    if (orderValue > 5000) { score += 30; reasons.push(`High-value order ₹${orderValue.toLocaleString("en-IN")} via COD`); }
    else if (orderValue > 2000) { score += 20; reasons.push(`Mid-value order ₹${orderValue.toLocaleString("en-IN")} via COD`); }
    else if (orderValue > 1000) { score += 10; }
    else { score += 5; }

    // Factor 3: Customer history (30 pts max)
    if (customerId) {
      const profile = await (prisma as any).customerProfile.findUnique({
        where: { shop_customerId: { shop, customerId } },
      });
      if (!profile) {
        score += 25; // First-time customer
        reasons.push("First-time customer — no order history");
      } else if (profile.orderCount >= 3) {
        score -= 10; // Loyal customer — lower risk
        reasons.push("Loyal customer with 3+ orders");
      } else {
        score += 10;
      }
    } else {
      score += 25; // Anonymous / guest
      reasons.push("Guest checkout — no customer history");
    }

    // Cold start check (< 50 orders)
    const totalOrders = await prisma.order.count({ where: { shop } });
    const isColdStart = totalOrders < 50;

    score = Math.max(0, Math.min(100, score));
    const level: CODRiskResult["level"] =
      score >= 70 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";

    return { score, level, reasons, isColdStart };
  }

  // ── Profit Leaks ──────────────────────────────────────────
  static async getProfitLeaks(shop: string): Promise<ProfitLeaks> {
    const orders = await prisma.order.findMany({ where: { shop } });
    const rtoEvents = await prisma.rTOEvent.findMany({ where: { shop } });

    const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
    const settings = ProfitService.getSettings(rawSettings);

    const now = new Date();
    const last7 = new Date(now.getTime() - 7 * 86400000);
    const prev7Start = new Date(now.getTime() - 14 * 86400000);

    const recentOrders = orders.filter((o: any) => o.createdAt >= last7);
    const prevOrders = orders.filter((o: any) => o.createdAt >= prev7Start && o.createdAt < last7);
    const recentRTO = rtoEvents.filter((e: any) => e.createdAt >= last7);
    const prevRTO = rtoEvents.filter((e: any) => e.createdAt >= prev7Start && e.createdAt < last7);

    // RTO Loss — from rtoEvents table
    const rtoLoss = rtoEvents.reduce((s: number, e: any) => s + e.amount, 0);
    const recentRtoLoss = recentRTO.reduce((s: number, e: any) => s + e.amount, 0);
    const prevRtoLoss = prevRTO.reduce((s: number, e: any) => s + e.amount, 0);

    // Also count unfulfilled/returned orders automatically using courier RTO costs
    const autoRtoOrders = orders.filter((o: any) => o.fulfillmentStatus === "RTO");
    const autoRtoLoss = autoRtoOrders.reduce((s: number, o: any) => {
      const forward = settings.defaultForwardShipping;
      const ret = settings.defaultReturnShipping;
      const pkg = settings.defaultPackaging;
      const cod = o.isCOD ? settings.defaultCODHandling : 0;
      return s + (forward + ret + pkg + cod);
    }, 0);

    // Shipping Overage — total shipping collected vs avg baseline
    const totalShipping = orders.reduce((s: number, o: any) => s + o.shippingPrice, 0);
    const avgShipping = orders.length > 0 ? totalShipping / orders.length : 0;
    const baselineShipping = settings.defaultForwardShipping;
    const shippingOverage = Math.max(0, avgShipping - baselineShipping) * orders.length;

    const recentShipping = recentOrders.reduce((s: number, o: any) => s + Math.max(0, o.shippingPrice - baselineShipping), 0);
    const prevShipping = prevOrders.reduce((s: number, o: any) => s + Math.max(0, o.shippingPrice - baselineShipping), 0);

    // Discount Loss
    const discountLoss = orders.reduce((s: number, o: any) => s + ((o as any).discountAmount || 0), 0);
    const recentDiscountLoss = recentOrders.reduce((s: number, o: any) => s + ((o as any).discountAmount || 0), 0);
    const prevDiscountLoss = prevOrders.reduce((s: number, o: any) => s + ((o as any).discountAmount || 0), 0);

    // COD Failure Loss
    const codFailureLoss = rtoLoss + autoRtoLoss;

    const totalLeak = Math.max(0, rtoLoss + autoRtoLoss + shippingOverage + discountLoss);

    return {
      rtoLoss: Math.round(rtoLoss + autoRtoLoss),
      shippingOverage: Math.round(shippingOverage),
      discountLoss: Math.round(discountLoss),
      codFailureLoss: Math.round(codFailureLoss),
      totalLeak: Math.round(totalLeak),
      rtoTrend: prevRtoLoss > 0 ? Math.round(((recentRtoLoss - prevRtoLoss) / prevRtoLoss) * 100) : 0,
      shippingTrend: prevShipping > 0 ? Math.round(((recentShipping - prevShipping) / prevShipping) * 100) : 0,
      discountTrend: prevDiscountLoss > 0 ? Math.round(((recentDiscountLoss - prevDiscountLoss) / prevDiscountLoss) * 100) : 0,
    };
  }

  // ── 30-Day Leak Trend Chart Data ──────────────────────────
  static async getLeakTrend(shop: string) {
    const dailyLeaks: Record<string, { date: string; rto: number; shipping: number; discount: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      dailyLeaks[dateStr] = { date: dateStr.substring(8) + "/" + dateStr.substring(5, 7), rto: 0, shipping: 0, discount: 0 };
    }

    const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
    const settings = ProfitService.getSettings(rawSettings);

    const orders = await prisma.order.findMany({ where: { shop } });
    const rtoEvents = await prisma.rTOEvent.findMany({ where: { shop } });

    orders.forEach((o: any) => {
      const ds = o.createdAt.toISOString().split("T")[0];
      if (dailyLeaks[ds]) {
        dailyLeaks[ds].discount += (o as any).discountAmount || 0;
        dailyLeaks[ds].shipping += Math.max(0, o.shippingPrice - settings.defaultForwardShipping);
        if (o.fulfillmentStatus === "RTO") {
          const forward = settings.defaultForwardShipping;
          const ret = settings.defaultReturnShipping;
          const pkg = settings.defaultPackaging;
          const cod = o.isCOD ? settings.defaultCODHandling : 0;
          dailyLeaks[ds].rto += (forward + ret + pkg + cod);
        }
      }
    });

    rtoEvents.forEach((e: any) => {
      const ds = e.createdAt.toISOString().split("T")[0];
      if (dailyLeaks[ds]) dailyLeaks[ds].rto += e.amount;
    });

    return Object.values(dailyLeaks);
  }

  // ── LTV Cohort Analysis ───────────────────────────────────
  static async getLTVCohorts(shop: string): Promise<LTVCohort[]> {
    const profiles = await (prisma as any).customerProfile.findMany({ where: { shop } });

    const cohortMap: Record<string, {
      customers: string[];
      revenue: number;
      purchasers2: number; // 2 or more orders (30-day repeat proxy)
      purchasers3: number; // 3 or more orders (60-day repeat proxy)
      purchasers4: number; // 4 or more orders (90-day repeat proxy)
    }> = {};

    for (const p of profiles) {
      const cohort = p.cohortMonth || "Unknown";
      if (!cohortMap[cohort]) {
        cohortMap[cohort] = { customers: [], revenue: 0, purchasers2: 0, purchasers3: 0, purchasers4: 0 };
      }
      cohortMap[cohort].customers.push(p.customerId);
      cohortMap[cohort].revenue += p.totalRevenue;
      if (p.orderCount >= 2) cohortMap[cohort].purchasers2++;
      if (p.orderCount >= 3) cohortMap[cohort].purchasers3++;
      if (p.orderCount >= 4) cohortMap[cohort].purchasers4++;
    }

    return Object.entries(cohortMap)
      .map(([cohortMonth, data]) => {
        const customers = data.customers.length;
        return {
          cohortMonth,
          customers,
          revenue: Math.round(data.revenue),
          avgRevenue: customers > 0 ? Math.round(data.revenue / customers) : 0,
          repeat30: customers > 0 ? Math.round((data.purchasers2 / customers) * 100) : 0,
          repeat60: customers > 0 ? Math.round((data.purchasers3 / customers) * 100) : 0,
          repeat90: customers > 0 ? Math.round((data.purchasers4 / customers) * 100) : 0,
        };
      })
      .sort((a, b) => b.cohortMonth.localeCompare(a.cohortMonth))
      .slice(0, 12);
  }

  // ── Blended ROAS ──────────────────────────────────────────
  static async getROAS(shop: string): Promise<ROASData> {
    const orders = await prisma.order.findMany({ where: { shop } });
    const adSpends = await (prisma as any).adSpend.findMany({ where: { shop }, orderBy: { month: "desc" }, take: 12 });

    const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
    const settings = ProfitService.getSettings(rawSettings);

    const totalRevenue = orders.reduce((s: number, o: any) => s + o.totalPrice, 0);
    const totalAdSpend = adSpends.reduce((s: number, a: any) => s + a.amount, 0);
    const blendedROAS = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;

    // Customer count for CAC
    const uniqueCustomers = new Set(orders.map((o: any) => o.customerId || o.id)).size;
    const trueCACRaw = uniqueCustomers > 0 && totalAdSpend > 0 ? totalAdSpend / uniqueCustomers : 0;

    // Profit-adjusted using actual order-by-order profit (with COGS + fees + gateway % + COD handling)
    const cogsMap = await prisma.productCOGS.findMany({ where: { shop } });
    const cogsDict: Record<string, number> = {};
    cogsMap.forEach((c: any) => { cogsDict[c.productId] = c.cogs; });

    let totalProfit = 0;
    let profitOrdersCount = 0;
    for (const o of orders) {
      const c = cogsDict[o.productId || ""];
      if (c === undefined) continue;
      const { profit } = ProfitService.calculateOrderProfit(o, c, settings);
      totalProfit += profit;
      profitOrdersCount++;
    }

    const profitAdjustedROAS = totalAdSpend > 0 ? totalProfit / totalAdSpend : 0;
    const avgProfitPerOrder = profitOrdersCount > 0 ? totalProfit / profitOrdersCount : 0;
    const cacPaybackOrders = avgProfitPerOrder > 0 ? trueCACRaw / avgProfitPerOrder : 0;

    // By channel
    const byChannelMap: Record<string, { spend: number; revenue: number }> = {};
    for (const a of adSpends) {
      if (!byChannelMap[a.channel]) byChannelMap[a.channel] = { spend: 0, revenue: 0 };
      byChannelMap[a.channel].spend += a.amount;
    }
    // Map revenue by channel from orders
    for (const o of orders) {
      const ch = o.channelAttribution || "Website";
      if (!byChannelMap[ch]) byChannelMap[ch] = { spend: 0, revenue: 0 };
      byChannelMap[ch].revenue += o.totalPrice;
    }

    const byChannel = Object.entries(byChannelMap).map(([channel, d]) => ({
      channel,
      spend: Math.round(d.spend),
      revenue: Math.round(d.revenue),
      roas: d.spend > 0 ? Math.round((d.revenue / d.spend) * 10) / 10 : 0,
    }));

    return {
      totalRevenue: Math.round(totalRevenue),
      totalAdSpend: Math.round(totalAdSpend),
      blendedROAS: Math.round(blendedROAS * 10) / 10,
      trueCACRaw: Math.round(trueCACRaw),
      profitAdjustedROAS: Math.round(profitAdjustedROAS * 10) / 10,
      cacPaybackOrders: Math.round(cacPaybackOrders * 10) / 10,
      byChannel,
    };
  }

  // ── Profit Health Score ──────────────────────────────────
  static async getProfitHealthStatus(shop: string): Promise<ProfitHealthStatus> {
    const orders = await prisma.order.findMany({ where: { shop } });
    const rtoEvents = await prisma.rTOEvent.findMany({ where: { shop } });

    const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
    const settings = ProfitService.getSettings(rawSettings);

    const cogsMap = await prisma.productCOGS.findMany({ where: { shop } });
    const cogsDict: Record<string, number> = {};
    cogsMap.forEach((c: any) => { cogsDict[c.productId] = c.cogs; });

    let totalCogs = 0;
    let totalFees = 0;
    let profitRevenue = 0;
    for (const o of orders) {
      const c = cogsDict[o.productId || ""];
      if (c === undefined) continue;
      const { fees } = ProfitService.calculateOrderProfit(o, c, settings);
      totalCogs += c;
      totalFees += fees;
      profitRevenue += o.totalPrice;
    }

    const profit = profitRevenue - totalCogs - totalFees;
    const margin = profitRevenue > 0 ? (profit / profitRevenue) * 100 : 0;

    const codOrders = orders.filter((o: any) => o.isCOD || isCodGateway(o.gateway));
    const rtoCount = rtoEvents.filter((e: any) => e.eventType === "RTO").length + orders.filter((o: any) => o.fulfillmentStatus === "RTO").length;
    const rtoRate = codOrders.length > 0 ? (rtoCount / codOrders.length) * 100 : 0;

    // Week-over-week margin trend
    const last7 = new Date(Date.now() - 7 * 86400000);
    const prev7 = new Date(Date.now() - 14 * 86400000);
    const recentOrders = orders.filter((o: any) => o.createdAt >= last7);
    const prevOrders = orders.filter((o: any) => o.createdAt >= prev7 && o.createdAt < last7);

    let recentRevenue = 0;
    let recentCogs = 0, recentFees = 0;
    for (const o of recentOrders) {
      const c = cogsDict[o.productId || ""];
      if (c === undefined) continue;
      const { fees } = ProfitService.calculateOrderProfit(o, c, settings);
      recentCogs += c;
      recentFees += fees;
      recentRevenue += o.totalPrice;
    }
    const recentProfit = recentRevenue - recentCogs - recentFees;
    const recentMargin = recentRevenue > 0 ? (recentProfit / recentRevenue) * 100 : 0;

    let prevRevenue = 0;
    let prevCogs = 0, prevFees = 0;
    for (const o of prevOrders) {
      const c = cogsDict[o.productId || ""];
      if (c === undefined) continue;
      const { fees } = ProfitService.calculateOrderProfit(o, c, settings);
      prevCogs += c;
      prevFees += fees;
      prevRevenue += o.totalPrice;
    }
    const prevProfit = prevRevenue - prevCogs - prevFees;
    const prevMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;
    const marginChange = recentMargin - prevMargin;

    const drivers: ProfitHealthStatus["drivers"] = [];

    // Driver 1: Profit Margin
    if (margin >= 20) {
      drivers.push({ label: "Profit Margin", status: "good", detail: `${margin.toFixed(1)}% — healthy margin above 20% target` });
    } else if (margin >= 12) {
      drivers.push({ label: "Profit Margin", status: "warning", detail: `${margin.toFixed(1)}% — below 20% target${marginChange < -3 ? `, down ${Math.abs(marginChange).toFixed(1)}% this week` : ""}` });
    } else {
      drivers.push({ label: "Profit Margin", status: "critical", detail: `${margin.toFixed(1)}% — critically low. Raise prices or cut COGS urgently.` });
    }

    // Driver 2: RTO Rate
    if (rtoRate <= 8) {
      drivers.push({ label: "RTO / COD Risk", status: "good", detail: `${rtoRate.toFixed(1)}% RTO rate — well within healthy range` });
    } else if (rtoRate <= 15) {
      drivers.push({ label: "RTO / COD Risk", status: "warning", detail: `${rtoRate.toFixed(1)}% RTO rate — increasing. Review high-risk pincodes.` });
    } else {
      drivers.push({ label: "RTO / COD Risk", status: "critical", detail: `${rtoRate.toFixed(1)}% RTO rate — critical. Losing money on ${rtoCount} failed deliveries.` });
    }

    // Driver 3: Revenue Trend
    if (recentRevenue >= prevRevenue * 0.9) {
      drivers.push({ label: "Revenue Trend", status: "good", detail: `₹${recentRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} this week — stable or growing` });
    } else {
      const drop = prevRevenue > 0 ? Math.round(((prevRevenue - recentRevenue) / prevRevenue) * 100) : 0;
      drivers.push({ label: "Revenue Trend", status: "warning", detail: `Revenue down ${drop}% vs last week. Investigate channel performance.` });
    }

    // Overall status
    const criticals = drivers.filter(d => d.status === "critical").length;
    const warnings = drivers.filter(d => d.status === "warning").length;

    let status: ProfitHealthStatus["status"] = "HEALTHY";
    let emoji: ProfitHealthStatus["emoji"] = "🟢";
    let headline = `Your profit margin is healthy (${margin.toFixed(1)}%). RTO rate is under control.`;

    if (criticals >= 1) {
      status = "CRITICAL";
      emoji = "🔴";
      headline = criticals >= 2
        ? `Multiple critical issues detected. Profit margin ${margin.toFixed(1)}% and RTO ${rtoRate.toFixed(1)}% need immediate action.`
        : `Profit margin ${margin.toFixed(1)}% is critically low. Take immediate action.`;
    } else if (warnings >= 1) {
      status = "WARNING";
      emoji = "🟡";
      headline = marginChange < -3
        ? `Profit margin down ${Math.abs(marginChange).toFixed(1)}% in 7 days. RTO rate increasing — monitor closely.`
        : `Profit margin ${margin.toFixed(1)}% is below 20% target. Review COGS and pricing.`;
    }

    return { status, emoji, headline, drivers };
  }

  // ── AI Customer Quality Score ─────────────────────────────
  static async getChannelQualityScores(shop: string) {
    const orders = await prisma.order.findMany({ where: { shop } });
    const profiles = await (prisma as any).customerProfile.findMany({ where: { shop } });

    const channelMap: Record<string, {
      orders: number; revenue: number; customers: Set<string>;
      repeatCustomers: number; totalLTV: number;
    }> = {};

    for (const o of orders) {
      const ch = o.channelAttribution || "Website";
      if (!channelMap[ch]) channelMap[ch] = { orders: 0, revenue: 0, customers: new Set(), repeatCustomers: 0, totalLTV: 0 };
      channelMap[ch].orders++;
      channelMap[ch].revenue += o.totalPrice;
      if (o.customerId) channelMap[ch].customers.add(o.customerId);
    }

    for (const p of profiles) {
      const ch = p.channelSource || "Website";
      if (channelMap[ch] && p.orderCount >= 2) channelMap[ch].repeatCustomers++;
      if (channelMap[ch]) channelMap[ch].totalLTV += p.ltv;
    }

    return Object.entries(channelMap).map(([channel, d]) => {
      const uniqueCustomers = d.customers.size || 1;
      const aov = d.orders > 0 ? d.revenue / d.orders : 0;
      const ltv = uniqueCustomers > 0 ? d.totalLTV / uniqueCustomers : aov;
      const repeatRate = uniqueCustomers > 0 ? (d.repeatCustomers / uniqueCustomers) * 100 : 0;
      // Quality score: weighted AOV + LTV + repeat
      const qualityScore = Math.min(100, Math.round((aov / 500) * 30 + (ltv / 2000) * 40 + repeatRate * 0.3));
      return {
        channel,
        orders: d.orders,
        revenue: Math.round(d.revenue),
        aov: Math.round(aov),
        ltv: Math.round(ltv),
        repeatRate: Math.round(repeatRate * 10) / 10,
        qualityScore,
        customers: uniqueCustomers,
      };
    }).sort((a, b) => b.qualityScore - a.qualityScore);
  }
}
