import prisma from "../../db.server";

export interface MerchantPolicy {
  blockCodAboveValue: number;
  blockSpecificPincodes: string[];
  autoRefundThreshold: number;
  requirePrepaidAboveValue: number;
  autoFlagRepeatOffenders: boolean;
  autoRequireOtp: boolean;
}

export class SettingsRepository {
  /**
   * Retrieves strictly formatted domain policy for a shop.
   */
  static async getMerchantPolicy(shopId: string): Promise<MerchantPolicy> {
    const settings = await prisma.storeSettings.findUnique({
      where: { shop: shopId },
    });

    if (!settings) {
      return {
        blockCodAboveValue: 999999,
        blockSpecificPincodes: [],
        autoRefundThreshold: 0,
        requirePrepaidAboveValue: 999999,
        autoFlagRepeatOffenders: false,
        autoRequireOtp: false,
      };
    }

    return {
      blockCodAboveValue: settings.rulesRejectCodOver || 999999,
      blockSpecificPincodes: settings.codBlockedPincodes || settings.rulesDisableCodForPincodes || [],
      autoRefundThreshold: 0,
      requirePrepaidAboveValue: settings.rulesRequirePrepaidAbove || 999999,
      autoFlagRepeatOffenders: settings.rulesAutoFlagRepeatOffenders,
      autoRequireOtp: settings.rulesAutoRequireOtp,
    };
  }

  /**
   * Find raw store settings by shop.
   */
  static async getByShop(shopId: string): Promise<any | null> {
    return prisma.storeSettings.findUnique({
      where: { shop: shopId },
    });
  }

  /**
   * Get existing settings or create sensible defaults.
   */
  static async getOrCreate(shopId: string, email = ""): Promise<any> {
    let settings = await prisma.storeSettings.findUnique({
      where: { shop: shopId },
    });

    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: {
          shop: shopId,
          defaultCOGSPct: 40,
          defaultForwardShipping: 60,
          defaultReturnShipping: 70,
          defaultCODHandling: 40,
          defaultPackaging: 10,
          defaultGatewayFeePct: 2,
          rtoDetectionPattern:
            "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender",
          rtoThreshold: 10,
          marginThreshold: 15,
          alertEmail: email,
        },
      });
    }

    return settings;
  }

  /**
   * Upsert general store settings with shop isolation.
   */
  static async upsertStoreSettings(shopId: string, data: any): Promise<any> {
    const existing = await prisma.storeSettings.findUnique({
      where: { shop: shopId },
      select: { id: true },
    });

    if (existing) {
      return prisma.storeSettings.update({
        where: { shop: shopId },
        data,
      });
    }

    return prisma.storeSettings.create({
      data: {
        shop: shopId,
        ...data,
      },
    });
  }

  /**
   * Update COD Rules fields with shop isolation.
   */
  static async updateCodRules(shopId: string, rules: any): Promise<void> {
    const updateData = {
      rulesRejectCodOver: rules.rulesRejectCodOver,
      rulesRequirePrepaidAbove: rules.rulesRequirePrepaidAbove,
      rulesDisableCodForPincodes: rules.rulesDisableCodForPincodes,
      rulesAutoFlagRepeatOffenders: rules.rulesAutoFlagRepeatOffenders,
      rulesAutoRequireOtp: rules.rulesAutoRequireOtp,
    };

    const existing = await prisma.storeSettings.findUnique({
      where: { shop: shopId },
      select: { id: true },
    });

    if (existing) {
      await prisma.storeSettings.update({
        where: { shop: shopId },
        data: updateData,
      });
    } else {
      await prisma.storeSettings.create({
        data: {
          shop: shopId,
          ...updateData,
        },
      });
    }
  }

  /**
   * Update onboarding step & completion.
   */
  static async updateOnboarding(
    shopId: string,
    step: number,
    completed?: boolean
  ): Promise<any> {
    const data: any = { onboardingStep: step };
    if (completed !== undefined) {
      data.onboardingCompleted = completed;
    }

    const existing = await prisma.storeSettings.findUnique({
      where: { shop: shopId },
      select: { id: true },
    });

    if (existing) {
      return prisma.storeSettings.update({
        where: { shop: shopId },
        data,
      });
    }

    return prisma.storeSettings.create({
      data: {
        shop: shopId,
        ...data,
      },
    });
  }
}
