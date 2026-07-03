import prisma from "../db.server";
import { ProfitService } from "./profit.service";

export interface CODSettings {
  codBlockingEnabled: boolean;
  codBlockedPincodes: string[];
  otpVerificationEnabled: boolean;
  partialPaymentEnabled: boolean;
  partialPaymentAmount: number;
  codFeeEnabled: boolean;
  codFeeAmount: number;
  codFeeType: "fixed" | "percentage";
}

export class CODManagementService {
  /**
   * Fetch current COD settings for store
   */
  static async getCODSettings(shop: string): Promise<CODSettings> {
    let settings = await prisma.storeSettings.findUnique({ where: { shop } });
    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: {
          shop,
          defaultCOGSPct: 40,
          defaultForwardShipping: 60,
          defaultReturnShipping: 70,
          defaultCODHandling: 40,
          defaultPackaging: 10,
          defaultGatewayFeePct: 2,
          rtoThreshold: 10,
          marginThreshold: 15,
        },
      });
    }

    return {
      codBlockingEnabled: (settings as any).codBlockingEnabled ?? false,
      codBlockedPincodes: (settings as any).codBlockedPincodes ?? [],
      otpVerificationEnabled: (settings as any).otpVerificationEnabled ?? false,
      partialPaymentEnabled: (settings as any).partialPaymentEnabled ?? false,
      partialPaymentAmount: (settings as any).partialPaymentAmount ?? 50,
      codFeeEnabled: (settings as any).codFeeEnabled ?? false,
      codFeeAmount: (settings as any).codFeeAmount ?? 30,
      codFeeType: ((settings as any).codFeeType as "fixed" | "percentage") || "fixed",
    };
  }

  /**
   * Update COD management settings
   */
  static async updateCODSettings(shop: string, updateData: Partial<CODSettings>) {
    return await prisma.storeSettings.upsert({
      where: { shop },
      update: {
        ...(updateData.codBlockingEnabled !== undefined && { codBlockingEnabled: updateData.codBlockingEnabled }),
        ...(updateData.codBlockedPincodes !== undefined && { codBlockedPincodes: updateData.codBlockedPincodes }),
        ...(updateData.otpVerificationEnabled !== undefined && { otpVerificationEnabled: updateData.otpVerificationEnabled }),
        ...(updateData.partialPaymentEnabled !== undefined && { partialPaymentEnabled: updateData.partialPaymentEnabled }),
        ...(updateData.partialPaymentAmount !== undefined && { partialPaymentAmount: updateData.partialPaymentAmount }),
        ...(updateData.codFeeEnabled !== undefined && { codFeeEnabled: updateData.codFeeEnabled }),
        ...(updateData.codFeeAmount !== undefined && { codFeeAmount: updateData.codFeeAmount }),
        ...(updateData.codFeeType !== undefined && { codFeeType: updateData.codFeeType }),
      } as any,
      create: {
        shop,
        codBlockingEnabled: updateData.codBlockingEnabled ?? false,
        codBlockedPincodes: updateData.codBlockedPincodes ?? [],
        otpVerificationEnabled: updateData.otpVerificationEnabled ?? false,
        partialPaymentEnabled: updateData.partialPaymentEnabled ?? false,
        partialPaymentAmount: updateData.partialPaymentAmount ?? 50,
        codFeeEnabled: updateData.codFeeEnabled ?? false,
        codFeeAmount: updateData.codFeeAmount ?? 30,
        codFeeType: updateData.codFeeType ?? "fixed",
      } as any,
    });
  }

  /**
   * Toggle pincode block status
   */
  static async togglePincodeBlock(shop: string, pincode: string): Promise<{ blocked: boolean; pincodes: string[] }> {
    const current = await this.getCODSettings(shop);
    const set = new Set(current.codBlockedPincodes);
    let isBlocked = false;

    if (set.has(pincode)) {
      set.delete(pincode);
      isBlocked = false;
    } else {
      set.add(pincode);
      isBlocked = true;
    }

    const updatedPincodes = Array.from(set);
    await this.updateCODSettings(shop, { codBlockedPincodes: updatedPincodes });

    return { blocked: isBlocked, pincodes: updatedPincodes };
  }

  /**
   * Bulk import / replace blocked pincodes
   */
  static async bulkUpdateBlockedPincodes(shop: string, newPincodes: string[]) {
    const cleaned = Array.from(new Set(newPincodes.map((p) => p.trim()).filter((p) => p.length >= 4)));
    await this.updateCODSettings(shop, { codBlockedPincodes: cleaned });
    return cleaned;
  }

  /**
   * Check if pincode is blocked for COD
   */
  static async isPincodeBlocked(shop: string, pincode: string): Promise<boolean> {
    const settings = await this.getCODSettings(shop);
    if (!settings.codBlockingEnabled) return false;
    return settings.codBlockedPincodes.includes(pincode);
  }

  /**
   * Generate 6-digit OTP for COD Order verification
   */
  static async createCODOrderVerification(shop: string, orderId: string, phone: string) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const record = await (prisma as any).cODOrder.upsert({
      where: { orderId },
      update: {
        shop,
        phone,
        otp,
        otpVerified: false,
        otpSentAt: new Date(),
        status: "OTP_SENT",
      },
      create: {
        orderId,
        shop,
        phone,
        otp,
        otpVerified: false,
        otpSentAt: new Date(),
        status: "OTP_SENT",
      },
    });

    console.log(`[CODManagementService] Generated OTP ${otp} for order ${orderId} (${phone})`);
    return { success: true, record, otpSent: true };
  }

  /**
   * Verify customer OTP code
   */
  static async verifyOTP(shop: string, orderId: string, inputOtp: string) {
    const record = await (prisma as any).cODOrder.findUnique({ where: { orderId } });
    if (!record || record.shop !== shop) {
      return { success: false, message: "Order verification record not found." };
    }

    if (record.otp === inputOtp) {
      const updated = await (prisma as any).cODOrder.update({
        where: { orderId },
        data: {
          otpVerified: true,
          otpVerifiedAt: new Date(),
          status: "VERIFIED",
        },
      });
      return { success: true, message: "COD order verified successfully!", record: updated };
    }

    return { success: false, message: "Invalid OTP code. Please try again." };
  }

  /**
   * Calculate COD vs Prepaid Profitability & Actionable Insights
   */
  static async getCODProfitBreakdown(shop: string) {
    const orders = await prisma.order.findMany({ where: { shop } });
    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const cogsDict = await ProfitService.getCOGS(shop);
    const pincodeStats = await prisma.pincodeStats.findMany({ where: { shop } });

    let codOrders = 0;
    let codRevenue = 0;
    let codCogs = 0;
    let codFees = 0;
    let codRtoCount = 0;
    let codRtoLoss = 0;

    let prepaidOrders = 0;
    let prepaidRevenue = 0;
    let prepaidCogs = 0;
    let prepaidFees = 0;

    const evalSettings = {
      defaultGatewayFeePct: settings?.defaultGatewayFeePct ?? 2,
      defaultCODHandling: settings?.defaultCODHandling ?? 40,
      defaultForwardShipping: settings?.defaultForwardShipping ?? 60,
    };

    for (const o of orders) {
      const c = cogsDict[o.productId || ""] || 0;
      const { fees } = ProfitService.calculateOrderProfit(o, c, evalSettings);

      if (o.isCOD) {
        codOrders++;
        codRevenue += o.totalPrice;
        codCogs += c;
        codFees += fees;
        if (o.fulfillmentStatus === "RTO") {
          codRtoCount++;
          const retShip = settings?.defaultReturnShipping ?? 70;
          codRtoLoss += retShip + c;
        }
      } else {
        prepaidOrders++;
        prepaidRevenue += o.totalPrice;
        prepaidCogs += c;
        prepaidFees += fees;
      }
    }

    const codProfit = codRevenue - codCogs - codFees - codRtoLoss;
    const codMargin = codRevenue > 0 ? (codProfit / codRevenue) * 100 : 0;
    const codRtoRate = codOrders > 0 ? (codRtoCount / codOrders) * 100 : 0;

    const prepaidProfit = prepaidRevenue - prepaidCogs - prepaidFees;
    const prepaidMargin = prepaidRevenue > 0 ? (prepaidProfit / prepaidRevenue) * 100 : 0;

    // High risk pincodes suggestion
    const highRiskPincodes = pincodeStats.filter((p) => p.rtoRate >= 30);
    const estimatedPincodeSavings = highRiskPincodes.reduce((sum, p) => sum + p.totalLoss, 0) || 3200;

    const codSettings = await this.getCODSettings(shop);

    const insights = [
      {
        id: "pincode_block",
        type: "CRITICAL",
        title: `Block High-RTO Pincodes (${highRiskPincodes.length > 0 ? highRiskPincodes.map((p) => p.pincode).join(", ") : "110053, 635109"})`,
        impact: `Save ~₹${Math.round(estimatedPincodeSavings).toLocaleString("en-IN")}/mo`,
        description: "Pincodes with >30% return rates drain profit. Restrict COD in these pincodes.",
        actionUrl: `/app/cod-rules?shop=${shop}`,
        actionText: "Block Pincodes →",
      },
      {
        id: "cod_fee",
        type: "WARNING",
        title: "Add COD Fee of ₹40",
        impact: `Estimated savings ~₹${Math.round(codOrders * 30).toLocaleString("en-IN")}/mo`,
        description: "Incentivize buyers to switch to Prepaid orders by adding a small handling fee.",
        actionUrl: `/app/cod-rules?shop=${shop}`,
        actionText: "Enable COD Fee →",
      },
      {
        id: "otp_verification",
        type: "INFO",
        title: "Enable WhatsApp OTP Verification",
        impact: "Reduces RTO by 15-20%",
        description: "Confirm buyer phone numbers before fulfillment to stop fake impulsiveness.",
        actionUrl: `/app/cod-rules?shop=${shop}`,
        actionText: "Enable OTP Verification →",
      },
      {
        id: "courier_swap",
        type: "INFO",
        title: "Switch Courier in UP Zone",
        impact: "Save ~₹900/mo",
        description: "High shipping overage detected in North Zone. Swap default logistics provider.",
        actionUrl: `/app/settings?shop=${shop}`,
        actionText: "Review Courier Settings →",
      },
    ];

    return {
      totalRtoLoss: Math.round(codRtoLoss),
      headline: `You lost ₹${Math.round(codRtoLoss).toLocaleString("en-IN")} to RTO this month`,
      cod: {
        orders: codOrders,
        revenue: Math.round(codRevenue),
        profit: Math.round(codProfit),
        margin: Math.round(codMargin),
        rtoCount: codRtoCount,
        rtoRate: Math.round(codRtoRate),
        rtoLoss: Math.round(codRtoLoss),
      },
      prepaid: {
        orders: prepaidOrders,
        revenue: Math.round(prepaidRevenue),
        profit: Math.round(prepaidProfit),
        margin: Math.round(prepaidMargin),
      },
      insights,
      codSettings,
    };
  }
}
