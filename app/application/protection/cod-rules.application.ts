import { CODManagementService, CODSettings } from "../../services/cod-management.service";
import { PincodeRepository, PincodeStatRecord } from "../../infrastructure/repositories/pincode.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";

export interface CodRulesDTO {
  shop: string;
  codSettings: CODSettings;
  storeSettings: any;
  isShopifyPlus: boolean;
  pincodeStats: Array<PincodeStatRecord & { rtoRate: number; totalLoss: number }>;
}

export interface MerchantRulesInput {
  rulesRejectCodOver: number;
  rulesRequirePrepaidAbove: number;
  rulesAutoFlagRepeatOffenders: boolean;
  rulesAutoRequireOtp: boolean;
}

export class CodRulesApplicationService {
  /**
   * Retrieves all COD settings, risk rules, and top risk pincode statistics.
   */
  static async getCodRulesData(shop: string): Promise<CodRulesDTO> {
    const [codSettings, pincodeStats, storeSettings] = await Promise.all([
      CODManagementService.getCODSettings(shop),
      PincodeRepository.findTopRiskPincodes(shop, 50),
      SettingsRepository.getByShop(shop),
    ]);

    const isShopifyPlus = storeSettings?.shopifyPlanName?.toLowerCase().includes("plus") || false;

    return {
      shop,
      codSettings,
      storeSettings,
      isShopifyPlus,
      pincodeStats: pincodeStats.map((p) => ({
        ...p,
        rtoRate: Math.round(p.rtoRate),
        totalLoss: Math.round(p.totalLoss),
      })),
    };
  }

  /**
   * Updates merchant-configured COD risk rules and thresholds.
   */
  static async saveMerchantRules(shop: string, rules: MerchantRulesInput): Promise<{ success: boolean; message: string }> {
    await SettingsRepository.updateCodRules(shop, rules);
    return { success: true, message: "Advanced Merchant Rules saved successfully!" };
  }

  /**
   * Toggles blocking status for a specific pincode.
   */
  static async togglePincode(shop: string, pincode: string): Promise<{ success: boolean; blocked: boolean }> {
    const res = await CODManagementService.togglePincodeBlock(shop, pincode);
    return { success: true, blocked: res.blocked };
  }

  /**
   * Bulk updates blocked pincodes from raw merchant input string.
   */
  static async bulkImportPincodes(shop: string, rawInput: string): Promise<{ success: boolean; count: number }> {
    const parsed = (rawInput || "").split(/[\n,\s]+/).filter(Boolean);
    const updated = await CODManagementService.bulkUpdateBlockedPincodes(shop, parsed);
    return { success: true, count: updated.length };
  }
}
