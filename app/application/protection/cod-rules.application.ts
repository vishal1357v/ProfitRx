import { CODManagementService, CODSettings, AdminApiContext, CodSyncResult } from "../../services/cod-management.service";
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
  codBlockingEnabled?: boolean;
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
   * Updates merchant-configured COD risk rules, thresholds, and activation state.
   */
  static async saveMerchantRules(
    shop: string,
    rules: MerchantRulesInput,
    admin?: AdminApiContext
  ): Promise<{ success: boolean; message: string; syncResult?: CodSyncResult }> {
    await SettingsRepository.updateCodRules(shop, rules);

    let syncResult: CodSyncResult | undefined;
    if (rules.codBlockingEnabled !== undefined) {
      const updateRes = await CODManagementService.updateCODSettings(
        shop,
        { codBlockingEnabled: rules.codBlockingEnabled },
        admin
      );
      syncResult = updateRes.syncResult;
    } else {
      syncResult = await CODManagementService.syncCODRulesToShopify(shop, admin);
    }

    let message = "Advanced Merchant Rules saved successfully!";
    if (syncResult && !syncResult.success) {
      message = `Rules saved, but checkout synchronization warning: ${syncResult.message}`;
    }

    return { success: true, message, syncResult };
  }

  /**
   * Explicitly toggles COD checkout blocking on or off with Shopify Payment Customization sync.
   */
  static async toggleCodBlocking(
    shop: string,
    enabled: boolean,
    admin?: AdminApiContext
  ): Promise<{ success: boolean; enabled: boolean; message: string; syncResult?: CodSyncResult }> {
    const { settings, syncResult } = await CODManagementService.updateCODSettings(
      shop,
      { codBlockingEnabled: enabled },
      admin
    );

    const message = syncResult?.message || (enabled ? "COD checkout blocking enabled." : "COD checkout blocking disabled.");

    return {
      success: syncResult ? syncResult.success : true,
      enabled: (settings as any).codBlockingEnabled ?? enabled,
      message,
      syncResult,
    };
  }

  /**
   * Toggles blocking status for a specific pincode.
   */
  static async togglePincode(
    shop: string,
    pincode: string,
    admin?: AdminApiContext
  ): Promise<{ success: boolean; blocked: boolean; pincodes: string[]; syncResult?: CodSyncResult }> {
    const res = await CODManagementService.togglePincodeBlock(shop, pincode, admin);
    return { success: true, blocked: res.blocked, pincodes: res.pincodes, syncResult: res.syncResult };
  }

  /**
   * Bulk updates blocked pincodes from raw merchant input string.
   */
  static async bulkImportPincodes(
    shop: string,
    rawInput: string,
    admin?: AdminApiContext
  ): Promise<{ success: boolean; count: number; pincodes: string[]; syncResult?: CodSyncResult }> {
    const parsed = (rawInput || "").split(/[\n,\s]+/).filter(Boolean);
    const updated = await CODManagementService.bulkUpdateBlockedPincodes(shop, parsed, admin);
    return { success: true, count: updated.pincodes.length, pincodes: updated.pincodes, syncResult: updated.syncResult };
  }
}
