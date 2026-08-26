import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { ProfitService } from "../../services/profit.service";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export interface SaveSettingsInput {
  defaultCOGSPct?: number;
  defaultForwardShipping?: number;
  defaultReturnShipping?: number;
  defaultCODHandling?: number;
  defaultPackaging?: number;
  defaultGatewayFeePct?: number;
  gatewayFixedFee?: number;
  rtoDetectionPattern?: string;
  alertEmail?: string;
  rtoThreshold?: number;
  marginThreshold?: number;
  gstin?: string;
  isGstRegistered?: boolean;
  gstRate?: number;
  whatsappPhone?: string;
  whatsappEnabled?: boolean;
  shippingSlabs?: any;
  codBlockedPincodes?: string[];
  rulesDisableCodForPincodes?: string[];
}

export class SettingsApplicationService {
  /**
   * Retrieves formatted store settings for presentation.
   */
  static async getSettingsData(shop: string, email = "") {
    const rawSettings = await SettingsRepository.getOrCreate(shop, email);
    const settings = ProfitService.getSettings(rawSettings);
    return {
      shop,
      settings,
      dpaAcceptedAt: rawSettings.dpaAcceptedAt ? new Date(rawSettings.dpaAcceptedAt).toISOString() : null,
      dpaAcceptedVersion: rawSettings.dpaAcceptedVersion || null,
    };
  }

  /**
   * Records merchant acceptance of the Data Processing Agreement (DPA).
   */
  static async acceptDpa(shop: string, version = "1.0"): Promise<{ success: boolean }> {
    await SettingsRepository.acceptDpa(shop, version);
    return { success: true };
  }

  /**
   * Validates and saves merchant store settings.
   */
  static async saveSettings(
    shop: string,
    input: SaveSettingsInput
  ): Promise<{ success: boolean; error?: string }> {
    // Validate percentages
    if (input.defaultGatewayFeePct !== undefined && (input.defaultGatewayFeePct < 0 || input.defaultGatewayFeePct > 100)) {
      return { success: false, error: "Gateway fee percentage must be between 0% and 100%." };
    }
    if (input.gstRate !== undefined && (input.gstRate < 0 || input.gstRate > 100)) {
      return { success: false, error: "GST rate must be between 0% and 100%." };
    }
    if (input.rtoThreshold !== undefined && (input.rtoThreshold < 0 || input.rtoThreshold > 100)) {
      return { success: false, error: "RTO alert threshold must be between 0% and 100%." };
    }
    if (input.marginThreshold !== undefined && (input.marginThreshold < 0 || input.marginThreshold > 100)) {
      return { success: false, error: "Margin alert threshold must be between 0% and 100%." };
    }

    // Validate non-negative costs
    if ((input.defaultForwardShipping !== undefined && input.defaultForwardShipping < 0) || 
        (input.defaultReturnShipping !== undefined && input.defaultReturnShipping < 0)) {
      return { success: false, error: "Shipping costs cannot be negative." };
    }
    if ((input.defaultCODHandling !== undefined && input.defaultCODHandling < 0) || 
        (input.defaultPackaging !== undefined && input.defaultPackaging < 0) || 
        (input.gatewayFixedFee !== undefined && input.gatewayFixedFee < 0)) {
      return { success: false, error: "Handling and packaging fees cannot be negative." };
    }

    // Validate WhatsApp Phone
    if (input.whatsappEnabled && input.whatsappPhone) {
      const phoneNumber = parsePhoneNumberFromString(input.whatsappPhone);
      if (!phoneNumber || !phoneNumber.isValid()) {
        return {
          success: false,
          error: "Invalid WhatsApp phone number format. Please include country code (e.g. +919876543210).",
        };
      }
    }

    const updatePayload: any = {};
    if (input.defaultCOGSPct !== undefined) updatePayload.defaultCOGSPct = input.defaultCOGSPct;
    if (input.defaultForwardShipping !== undefined) updatePayload.defaultForwardShipping = input.defaultForwardShipping;
    if (input.defaultReturnShipping !== undefined) updatePayload.defaultReturnShipping = input.defaultReturnShipping;
    if (input.defaultCODHandling !== undefined) updatePayload.defaultCODHandling = input.defaultCODHandling;
    if (input.defaultPackaging !== undefined) updatePayload.defaultPackaging = input.defaultPackaging;
    if (input.defaultGatewayFeePct !== undefined) updatePayload.defaultGatewayFeePct = input.defaultGatewayFeePct;
    if (input.gatewayFixedFee !== undefined) updatePayload.gatewayFixedFee = input.gatewayFixedFee;
    if (input.rtoDetectionPattern !== undefined) updatePayload.rtoDetectionPattern = input.rtoDetectionPattern;
    if (input.alertEmail !== undefined) updatePayload.alertEmail = input.alertEmail;
    if (input.rtoThreshold !== undefined) updatePayload.rtoThreshold = input.rtoThreshold;
    if (input.marginThreshold !== undefined) updatePayload.marginThreshold = input.marginThreshold;
    if (input.gstin !== undefined) updatePayload.gstin = input.gstin || null;
    if (input.isGstRegistered !== undefined) updatePayload.isGstRegistered = Boolean(input.isGstRegistered);
    if (input.gstRate !== undefined) updatePayload.gstRate = input.gstRate;
    if (input.whatsappPhone !== undefined) updatePayload.whatsappPhone = input.whatsappPhone || null;
    if (input.whatsappEnabled !== undefined) {
      updatePayload.whatsappEnabled = Boolean(input.whatsappEnabled);
      updatePayload.otpVerificationEnabled = Boolean(input.whatsappEnabled);
    }
    if (input.shippingSlabs !== undefined) updatePayload.shippingSlabs = input.shippingSlabs || null;
    if (input.codBlockedPincodes !== undefined) {
      updatePayload.codBlockedPincodes = input.codBlockedPincodes;
      updatePayload.rulesDisableCodForPincodes = input.codBlockedPincodes;
    }
    if (input.rulesDisableCodForPincodes !== undefined) {
      updatePayload.rulesDisableCodForPincodes = input.rulesDisableCodForPincodes;
    }

    await SettingsRepository.upsertStoreSettings(shop, updatePayload);

    return { success: true };
  }
}
