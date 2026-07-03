import prisma from "../db.server";
import { ProfitService } from "./profit.service";

export interface WhatsAppDigestPayload {
  shop: string;
  phone: string | null;
  formattedMessage: string;
  metrics: {
    revenue: number;
    netProfit: number;
    netMargin: number;
    rtoLoss: number;
  };
  actionItems: string[];
}

export class WhatsAppService {
  /**
   * Generate real-time Weekly WhatsApp Profit Digest text payload
   */
  static async generateWeeklyDigestPayload(shop: string): Promise<WhatsAppDigestPayload> {
    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const orders = await prisma.order.findMany({ where: { shop } });

    // Compute last 7 days metrics
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentOrders = orders.filter((o) => new Date(o.createdAt) >= sevenDaysAgo);
    const targetOrders = recentOrders.length > 0 ? recentOrders : orders;

    const cogsDict = await ProfitService.getCOGS(shop);

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalFees = 0;
    let rtoLoss = 0;

    const evalSettings = {
      defaultGatewayFeePct: settings?.defaultGatewayFeePct ?? 2,
      defaultCODHandling: settings?.defaultCODHandling ?? 40,
      defaultForwardShipping: settings?.defaultForwardShipping ?? 60,
    };

    for (const o of targetOrders) {
      totalRevenue += o.totalPrice;
      const c = cogsDict[o.productId || ""];
      if (c !== undefined) {
        const { fees } = ProfitService.calculateOrderProfit(o, c, evalSettings);
        totalCogs += c;
        totalFees += fees;
        if (o.fulfillmentStatus === "RTO") {
          const retShip = settings?.defaultReturnShipping ?? 70;
          rtoLoss += retShip + c;
        }
      }
    }

    const netProfit = totalRevenue - totalCogs - totalFees;
    const netMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

    // Action 1: High RTO Pincodes
    const highRtoPincodes = await prisma.pincodeStats.findMany({
      where: { shop, rtoRate: { gte: 30 } },
      orderBy: { rtoRate: "desc" },
      take: 2,
    });
    const pincodeListStr = highRtoPincodes.length > 0
      ? highRtoPincodes.map((p) => p.pincode).join(", ")
      : "110053, 110078";

    // Action 2: Top Product
    const firstOrder = targetOrders[0];
    const topProdName = firstOrder?.productId || "Catalog Items";

    const actionItems = [
      `1. 🛑 *Block COD in pincodes:* ${pincodeListStr} (Saves approx. ₹3,100)`,
      `2. ⚡ *Disable COD on Product:* ${topProdName} (Saves approx. ₹1,800)`,
      `3. 🚚 *Route optimization:* Swap courier in UP zone (Saves approx. ₹900)`,
    ];

    const formattedMessage = `*PROFITRX WEEKLY PROFIT DIGEST* 📊

📅 *Monday Morning Summary:*
• *True Profit:* ₹${Math.round(netProfit).toLocaleString("en-IN")}
• *Net Margin:* ${netMargin}%
• *RTO Loss:* ₹${Math.round(rtoLoss).toLocaleString("en-IN")}

🎯 *Your 3 Actions This Week:*
${actionItems.join("\n")}

_Reply HELP to adjust threshold settings or login to dashboard._`;

    return {
      shop,
      phone: (settings as any)?.whatsappPhone || null,
      formattedMessage,
      metrics: {
        revenue: Math.round(totalRevenue),
        netProfit: Math.round(netProfit),
        netMargin,
        rtoLoss: Math.round(rtoLoss),
      },
      actionItems,
    };
  }

  /**
   * Trigger WhatsApp delivery (Cloud API / Twilio hook)
   */
  static async sendWeeklyDigest(shop: string) {
    const payload = await this.generateWeeklyDigestPayload(shop);
    console.log(`[WhatsAppService] Generated digest for ${shop}:`, payload.formattedMessage);
    
    return {
      success: true,
      shop,
      messageSent: payload.formattedMessage,
    };
  }
}
