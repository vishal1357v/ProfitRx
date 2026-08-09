import prisma from "../../db.server";

// We extract Merchant Policy out of the raw settings
export interface MerchantPolicy {
  blockCodAboveValue: number;
  blockSpecificPincodes: string[];
  autoRefundThreshold: number;
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
        autoRefundThreshold: 0
      };
    }

    return {
      blockCodAboveValue: 999999, // Legacy fallback
      blockSpecificPincodes: settings.codBlockedPincodes || [], 
      autoRefundThreshold: 0
    };
  }

  static async updateCodLimit(shopId: string, limit: number): Promise<void> {
    // Legacy function, replaced by UI settings page
  }
}
