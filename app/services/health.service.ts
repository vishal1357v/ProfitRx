import prisma from "../db.server";
import { ProfitService } from "./profit.service";

export class HealthScoreService {
  /**
   * Calculate 5 KPIs and persist daily Health Score snapshot
   */
  static async calculateAndSave(shop: string) {
    console.log(`[HealthScoreService.calculateAndSave] Calculating KPIs for shop: ${shop}`);

    // Fetch orders
    const orders = await prisma.order.findMany({
      where: { shop },
    });

    const orderCount = orders.length;

    // Helper to check for COD gateways
    const isCodGateway = (gateway: string | null) => {
      if (!gateway) return false;
      const lower = gateway.toLowerCase();
      return lower.includes("cod") || lower.includes("cash") || lower.includes("manual");
    };

    // 1. Profit Margin
    let profitMargin = 0;
    try {
      const profitData = await ProfitService.calculate(shop, 100);
      profitMargin = profitData.summary.avgMargin;
    } catch (err) {
      console.error(`[HealthScoreService] Error calculating profit margin:`, err);
    }

    // 2. RTO Rate (% of COD orders)
    const codOrders = orders.filter((o: any) => isCodGateway(o.gateway));
    const codCount = codOrders.length;

    const rtoEvents = await prisma.rTOEvent.findMany({
      where: { shop, eventType: "RTO" },
    });
    const rtoCount = rtoEvents.length;
    const rtoRate = codCount > 0 ? (rtoCount / codCount) * 100 : 0;

    // 3. Average Order Value (AOV)
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + o.totalPrice, 0);
    const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

    // 4. Repeat Customer Rate (Simulated based on store sales volume)
    const repeatRate = orderCount > 0 ? Math.min(15 + (orderCount * 0.05), 42.5) : 0;

    // 5. Ad Cost Percentage (Placeholder/Assumed standard industry rate)
    const adCostPercent = orderCount > 0 ? 18.5 : 0;

    // 6. Discount Percentage (Placeholder/Assumed standard rate)
    const discountPercent = orderCount > 0 ? 6.8 : 0;

    // Calculate overall Health Score (0 to 100)
    let score = 100;
    
    // Deductions for low profit margins
    if (profitMargin < 25) {
      score -= (25 - profitMargin) * 1.5;
    }
    // Deductions for high RTO rates
    if (rtoRate > 10) {
      score -= (rtoRate - 10) * 2;
    }
    // Deductions for high assumed ad cost
    if (adCostPercent > 15) {
      score -= 5;
    }
    // Deductions for low AOV
    if (aov > 0 && aov < 500) {
      score -= 10;
    }

    // Bound the final score
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Normalize date to Start of Day (midnight UTC) to satisfy @@unique([shop, date]) constraint
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    const record = await prisma.healthScore.upsert({
      where: {
        shop_date: {
          shop,
          date,
        },
      },
      update: {
        score,
        profitMargin,
        rtoRate,
        aov,
        repeatRate,
        adCostPercent,
        discountPercent,
      },
      create: {
        shop,
        date,
        score,
        profitMargin,
        rtoRate,
        aov,
        repeatRate,
        adCostPercent,
        discountPercent,
      },
    });

    console.log(`[HealthScoreService] Successfully saved Health Score snapshot for ${shop} on ${date.toISOString().split('T')[0]}: Score=${score}`);
    return record;
  }
}
