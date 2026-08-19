import * as crypto from "crypto";
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
   * Send live SMS or WhatsApp message via Meta Cloud API or Twilio
   */
  static async sendSMSOrWhatsApp(phone: string, message: string): Promise<{ success: boolean; provider: string; messageId?: string }> {
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    // Option A: Meta WhatsApp Cloud API
    const metaToken = process.env.META_WHATSAPP_TOKEN;
    const metaPhoneId = process.env.META_WHATSAPP_PHONE_ID;

    if (metaToken && metaPhoneId) {
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${metaPhoneId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${metaToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: formattedPhone,
            type: "text",
            text: { body: message },
          }),
        });
        const data = await res.json();
        if (data.messages?.[0]?.id) {
          return { success: true, provider: "meta_whatsapp", messageId: data.messages[0].id };
        }
      } catch (err) {
        console.warn("[WhatsAppService] Meta Cloud API error:", err);
      }
    }

    // Option B: Twilio Messaging API
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER || "whatsapp:+14155238886";

    if (twilioSid && twilioToken) {
      try {
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");
        const body = new URLSearchParams({
          From: twilioFrom.startsWith("whatsapp:") ? twilioFrom : `whatsapp:+${twilioFrom}`,
          To: `whatsapp:+${formattedPhone}`,
          Body: message,
        });

        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });
        const data = await res.json();
        if (data.sid) {
          return { success: true, provider: "twilio", messageId: data.sid };
        }
      } catch (err) {
        console.warn("[WhatsAppService] Twilio API error:", err);
      }
    }

    console.warn("[WhatsAppService] No Meta WhatsApp or Twilio credentials are configured; message was not sent.");
    return { success: false, provider: "unconfigured" };
  }

  /**
   * Send Customer COD OTP Verification Message
   */
  static async sendOTP(phone: string, otp: string, shop: string = "", orderId: string = "") {
    let msg = `*ProfitRx COD Order Verification* 🛡️\n\nYour OTP confirmation code is: *${otp}*\n\nValid for 10 minutes.`;
    const secret = process.env.SHOPIFY_API_SECRET || "";
    if (shop && orderId && secret) {
      const appUrl = process.env.SHOPIFY_APP_URL || "https://greek-god-saas.vercel.app";
      const token = crypto.createHmac("sha256", secret).update(`${shop}:${orderId}`).digest("hex");
      msg += `\n\nPlease confirm your order here: ${appUrl}/verify-cod?shop=${shop}&orderId=${orderId}&token=${token}`;
    } else {
      msg += `\n\nPlease enter this code to confirm your COD order.`;
    }
    return await this.sendSMSOrWhatsApp(phone, msg);
  }

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
      defaultReturnShipping: settings?.defaultReturnShipping ?? 70,
      defaultPackaging: settings?.defaultPackaging ?? 10,
      defaultCOGSPct: settings?.defaultCOGSPct ?? 40,
    };

    for (const o of targetOrders) {
      totalRevenue += o.totalPrice;
      const c = cogsDict[o.productId || ""] ?? (o.totalPrice * (evalSettings.defaultCOGSPct / 100));
      const { fees } = ProfitService.calculateOrderProfit(o, c, evalSettings);
      totalCogs += c;
      totalFees += fees;
      if (o.fulfillmentStatus === "RTO") {
        rtoLoss += ProfitService.calculateRTOLoss(o, evalSettings);
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
    const pincodeListStr = highRtoPincodes.map((p) => p.pincode).join(", ");
    const highRtoPincodeLoss = highRtoPincodes.reduce((sum, p) => sum + (p.totalLoss || 0), 0);
    const pincodeSavings = highRtoPincodeLoss > 0 ? Math.round(highRtoPincodeLoss) : Math.round(rtoLoss * 0.4);
    const productSavings = Math.max(0, Math.round(rtoLoss * 0.3));
    const courierSavings = Math.max(0, Math.round(rtoLoss * 0.15));

    // Action 2: Top Product
    const firstOrder = targetOrders[0];
    const topProdName = firstOrder?.productId || "Catalog Items";

    const actionItems = [
      pincodeListStr
        ? `1. 🛑 *Block COD in pincodes:* ${pincodeListStr} (Saves approx. ₹${pincodeSavings.toLocaleString("en-IN")})`
        : `1. 🛑 *Enable High-Risk Pincode Shield* (Protects against regional RTO clusters)`,
      `2. ⚡ *Verify COD on High-Risk Orders of:* ${topProdName} (Saves approx. ₹${productSavings.toLocaleString("en-IN")})`,
      `3. 🚚 *Logistics Optimization:* Review shipping providers with >15% return rate (Saves approx. ₹${courierSavings.toLocaleString("en-IN")})`,
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
   * Trigger WhatsApp delivery
   */
  static async sendWeeklyDigest(shop: string) {
    const payload = await this.generateWeeklyDigestPayload(shop);
    if (payload.phone) {
      await this.sendSMSOrWhatsApp(payload.phone, payload.formattedMessage);
    }
    
    return {
      success: true,
      shop,
      messageSent: payload.formattedMessage,
    };
  }
}
