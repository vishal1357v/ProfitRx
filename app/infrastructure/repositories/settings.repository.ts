import prisma from "../../db.server";

// We extract Merchant Policy out of the raw settings
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
   * Retrieves strictly formatted domain settings for a shop.
   * Isolates the Decision Engine from raw Prisma models.
   */
  static async getMerchantPolicy(shopId: string): Promise<MerchantPolicy> {
    const settings = await prisma.storeSettings.findUnique({
      where: { shop: shopId }
    });

    if (!settings) {
      return {
        blockCodAboveValue: 999999,
        blockSpecificPincodes: [],
        autoRefundThreshold: 0,
        requirePrepaidAboveValue: 999999,
        autoFlagRepeatOffenders: false,
        autoRequireOtp: false
      };
    }

    return {
      blockCodAboveValue: settings.rulesRejectCodOver || 999999,
      blockSpecificPincodes: settings.codBlockedPincodes || settings.rulesDisableCodForPincodes || [], 
      autoRefundThreshold: 0,
      requirePrepaidAboveValue: settings.rulesRequirePrepaidAbove || 999999,
      autoFlagRepeatOffenders: settings.rulesAutoFlagRepeatOffenders,
      autoRequireOtp: settings.rulesAutoRequireOtp
    };
  }

  static async updateCodRules(shopId: string, rules: any): Promise<void> {
    await prisma.storeSettings.upsert({
      where: { shop: shopId },
      update: {
        rulesRejectCodOver: rules.rulesRejectCodOver,
        rulesRequirePrepaidAbove: rules.rulesRequirePrepaidAbove,
        rulesDisableCodForPincodes: rules.rulesDisableCodForPincodes,
        rulesAutoFlagRepeatOffenders: rules.rulesAutoFlagRepeatOffenders,
        rulesAutoRequireOtp: rules.rulesAutoRequireOtp,
      },
      create: {
        shop: shopId,
        rulesRejectCodOver: rules.rulesRejectCodOver,
        rulesRequirePrepaidAbove: rules.rulesRequirePrepaidAbove,
        rulesDisableCodForPincodes: rules.rulesDisableCodForPincodes,
        rulesAutoFlagRepeatOffenders: rules.rulesAutoFlagRepeatOffenders,
        rulesAutoRequireOtp: rules.rulesAutoRequireOtp,
      }
    });
  }
}
