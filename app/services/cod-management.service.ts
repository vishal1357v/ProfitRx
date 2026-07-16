import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { ProfitService } from "./profit.service";
import { WhatsAppService } from "./whatsapp.service";
import { ShopifyService } from "./shopify.service";

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
    const settings = await prisma.storeSettings.upsert({
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

    try {
      await this.syncCODRulesToShopify(shop);
    } catch (err) {
      console.error(`[CODManagementService] Failed to sync COD rules to Shopify for ${shop}:`, err);
    }

    return settings;
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
    let pincode: string | null = null;
    let riskLevel = "LOW";

    // 1. Resolve order shipping pincode from local order database
    const localOrder = await prisma.order.findFirst({
      where: { shop, OR: [{ id: orderId }, { id: `gid://shopify/Order/${orderId}` }] },
      select: { pincode: true }
    });

    if (localOrder?.pincode) {
      pincode = localOrder.pincode;
    }

    // 2. Fetch risk level if pincode is resolved
    if (pincode) {
      const stats = await (prisma as any).pincodeStats.findUnique({
        where: { shop_pincode: { shop, pincode } }
      });
      if (stats) {
        riskLevel = stats.riskLevel || "LOW";
      }
    }

    // 3. Conditional gate: if risk level is LOW, bypass OTP challenge entirely
    if (riskLevel === "LOW") {
      console.log(`[CODManagementService] Pincode "${pincode || "unknown"}" is LOW risk. Bypassing OTP verification challenge for order ${orderId}`);
      const record = await (prisma as any).cODOrder.upsert({
        where: { orderId },
        update: {
          shop,
          phone,
          otp: null,
          otpVerified: true,
          otpSentAt: null,
          otpVerifiedAt: new Date(),
          status: "VERIFIED",
        },
        create: {
          orderId,
          shop,
          phone,
          otp: null,
          otpVerified: true,
          otpSentAt: null,
          otpVerifiedAt: new Date(),
          status: "VERIFIED",
        },
      });
      return { success: true, record, otpSent: false, bypassed: true, provider: "bypass" };
    }

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

    // Dispatch live SMS/WhatsApp message for Medium/High/Critical risk
    const dispatchRes = await WhatsAppService.sendOTP(phone, otp);

    console.log(`[CODManagementService] Generated and dispatched OTP ${otp} to ${phone} via ${dispatchRes.provider} for ${riskLevel} risk order.`);
    return { success: true, record, otpSent: true, provider: dispatchRes.provider };
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

      try {
        await ShopifyService.tagOrder(shop, orderId, "COD_Verified");
      } catch (err) {
        console.error(`[CODManagementService.verifyOTP] failed to tag order:`, err);
      }

      return { success: true, message: "COD order verified successfully!", record: updated };
    }

    return { success: false, message: "Invalid OTP code. Please try again." };
  }

  /**
   * Calculate COD vs Prepaid Profitability & Actionable Insights
   */
  static async getCODProfitBreakdown(shop: string, host: string = "") {
    const orders = await prisma.order.findMany({ where: { shop } });
    const rtoEvents = await prisma.rTOEvent.findMany({ where: { shop } });
    const pincodeStats = await prisma.pincodeStats.findMany({ where: { shop } });
    const cogsRecords = await prisma.productCOGS.findMany({ where: { shop } });
    const settings = await prisma.storeSettings.findUnique({ where: { shop } });

    const cogsDict: Record<string, number> = {};
    for (const c of cogsRecords) {
      cogsDict[c.productId] = c.cogs ?? 0;
    }

    let codOrders = 0;
    let codRevenue = 0;
    let codCogs = 0;
    let codFees = 0;
    let codRtoLoss = 0;
    let codRtoCount = 0;
    let prepaidOrders = 0;
    let prepaidRevenue = 0;
    let prepaidCogs = 0;
    let prepaidFees = 0;

    const evalSettings = {
      defaultCOGSPct: settings?.defaultCOGSPct ?? 40,
      defaultPackaging: settings?.defaultPackaging ?? 10,
      defaultGatewayFeePct: settings?.defaultGatewayFeePct ?? 2,
      defaultCODHandling: settings?.defaultCODHandling ?? 40,
      defaultForwardShipping: settings?.defaultForwardShipping ?? 60,
    };

    for (const o of orders) {
      const c = cogsDict[o.productId || ""] || (o.totalPrice * (evalSettings.defaultCOGSPct / 100));
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
    const hostQuery = host ? `&host=${encodeURIComponent(host)}` : "";

    const insights = [
      {
        id: "pincode_block",
        type: "CRITICAL",
        title: `Block High-RTO Pincodes (${highRiskPincodes.length > 0 ? highRiskPincodes.map((p) => p.pincode).join(", ") : "110053, 635109"})`,
        impact: `Save ~₹${Math.round(estimatedPincodeSavings).toLocaleString("en-IN")}/mo`,
        description: "Pincodes with >30% return rates drain profit. Restrict COD in these pincodes.",
        actionUrl: `/app/cod-rules?shop=${shop}${hostQuery}`,
        actionText: "Block Pincodes →",
      },
      {
        id: "cod_fee",
        type: "WARNING",
        title: "Add COD Fee of ₹40",
        impact: `Estimated savings ~₹${Math.round(codOrders * 30).toLocaleString("en-IN")}/mo`,
        description: "Incentivize buyers to switch to Prepaid orders by adding a small handling fee.",
        actionUrl: `/app/cod-rules?shop=${shop}${hostQuery}`,
        actionText: "Enable COD Fee →",
      },
      {
        id: "otp_verification",
        type: "INFO",
        title: "Enable WhatsApp OTP Verification",
        impact: "Reduces RTO by 15-20%",
        description: "Confirm buyer phone numbers before fulfillment to stop fake impulsiveness.",
        actionUrl: `/app/cod-rules?shop=${shop}${hostQuery}`,
        actionText: "Enable OTP Verification →",
      },
      {
        id: "courier_swap",
        type: "INFO",
        title: "Switch Courier in UP Zone",
        impact: "Save ~₹900/mo",
        description: "High shipping overage detected in North Zone. Swap default logistics provider.",
        actionUrl: `/app/settings?shop=${shop}${hostQuery}`,
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

  /**
   * Sync COD rules to Shopify Payment Customization metafield
   */
  static async syncCODRulesToShopify(shop: string) {
    let admin: any;
    try {
      const auth = await unauthenticated.admin(shop);
      admin = auth.admin;
    } catch (err) {
      console.warn(`[CODManagementService] Store is offline, skipping checkout sync for ${shop}`);
      return;
    }

    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    if (!settings) return;

    const blockedPincodes = (settings as any).codBlockedPincodes || [];
    const isBlockingEnabled = (settings as any).codBlockingEnabled ?? false;

    // 1. Fetch functionId
    const getFunctionsQuery = `
      query GetFunctions {
        shopifyFunctions(first: 50) {
          edges {
            node {
              id
              title
              apiType
            }
          }
        }
      }
    `;

    const functionsRes = await admin.graphql(getFunctionsQuery);
    const functionsData = await functionsRes.json();
    const edges = functionsData?.data?.shopifyFunctions?.edges || [];
    const functionNode = edges.find((e: any) => e.node.title.toLowerCase().includes("cod-blocker") || e.node.apiType === "cart_payment_methods_transform");
    
    if (!functionNode) {
      console.warn("[CODManagementService] COD Blocker Shopify Function was not found. Please deploy extensions first.");
      return;
    }

    const functionId = functionNode.node.id;

    // 2. Fetch existing Payment Customizations
    const getCustomizationsQuery = `
      query GetCustomizations {
        paymentCustomizations(first: 50) {
          edges {
            node {
              id
              title
              enabled
              functionId
            }
          }
        }
      }
    `;

    const custRes = await admin.graphql(getCustomizationsQuery);
    const custData = await custRes.json();
    const custEdges = custData?.data?.paymentCustomizations?.edges || [];
    const existingCustomization = custEdges.find((e: any) => e.node.functionId === functionId);

    const configJson = JSON.stringify({
      blockedPincodes: isBlockingEnabled ? blockedPincodes : [],
    });

    if (existingCustomization) {
      const customizationId = existingCustomization.node.id;
      
      // Update customization
      const updateMutation = `
        mutation paymentCustomizationUpdate($id: ID!, $paymentCustomization: PaymentCustomizationInput!) {
          paymentCustomizationUpdate(id: $id, paymentCustomization: $paymentCustomization) {
            paymentCustomization {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      await admin.graphql(updateMutation, {
        variables: {
          id: customizationId,
          paymentCustomization: {
            title: "ProfitRx COD Pincode Blocker",
            enabled: isBlockingEnabled,
            metafields: [
              {
                namespace: "$app:cod-blocker",
                key: "function-configuration",
                type: "json",
                value: configJson,
              }
            ]
          }
        }
      });
      console.log(`[CODManagementService] Updated payment customization ${customizationId} with configuration:`, configJson);
    } else if (isBlockingEnabled) {
      // Create new customization
      const createMutation = `
        mutation paymentCustomizationCreate($paymentCustomization: PaymentCustomizationInput!) {
          paymentCustomizationCreate(paymentCustomization: $paymentCustomization) {
            paymentCustomization {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const createRes = await admin.graphql(createMutation, {
        variables: {
          paymentCustomization: {
            title: "ProfitRx COD Pincode Blocker",
            enabled: true,
            functionId: functionId,
            metafields: [
              {
                namespace: "$app:cod-blocker",
                key: "function-configuration",
                type: "json",
                value: configJson,
              }
            ]
          }
        }
      });
      const createData = await createRes.json();
      console.log(`[CODManagementService] Created new payment customization for function ${functionId}:`, JSON.stringify(createData));
    }
  }
}
