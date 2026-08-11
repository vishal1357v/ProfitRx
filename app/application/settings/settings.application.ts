import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { ProfitService } from "../../services/profit.service";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export interface SaveSettingsInput {
  defaultForwardShipping: number;
  defaultReturnShipping: number;
  defaultCODHandling: number;
  defaultPackaging: number;
  defaultGatewayFeePct: number;
  gatewayFixedFee: number;
  rtoDetectionPattern: string;
  alertEmail: string;
  rtoThreshold: number;
  marginThreshold: number;
  gstin?: string;
  isGstRegistered?: boolean;
  gstRate?: number;
  whatsappPhone?: string;
  whatsappEnabled?: boolean;
  shippingSlabs?: any;
}

export class SettingsApplicationService {
  /**
   * Retrieves formatted store settings for presentation.
   */
  static async getSettingsData(shop: string, email = "") {
    const rawSettings = await SettingsRepository.getOrCreate(shop, email);
    const settings = ProfitService.getSettings(rawSettings);
    return { shop, settings };
  }

  /**
   * Validates and saves merchant store settings.
   */
  static async saveSettings(
    shop: string,
    input: SaveSettingsInput
  ): Promise<{ success: boolean; error?: string }> {
    // Validate percentages
    if (input.defaultGatewayFeePct < 0 || input.defaultGatewayFeePct > 100) {
      return { success: false, error: "Gateway fee percentage must be between 0% and 100%." };
    }
    if (input.gstRate !== undefined && (input.gstRate < 0 || input.gstRate > 100)) {
      return { success: false, error: "GST rate must be between 0% and 100%." };
    }
    if (input.rtoThreshold < 0 || input.rtoThreshold > 100) {
      return { success: false, error: "RTO alert threshold must be between 0% and 100%." };
    }
    if (input.marginThreshold < 0 || input.marginThreshold > 100) {
      return { success: false, error: "Margin alert threshold must be between 0% and 100%." };
    }

    // Validate non-negative costs
    if (input.defaultForwardShipping < 0 || input.defaultReturnShipping < 0) {
      return { success: false, error: "Shipping costs cannot be negative." };
    }
    if (input.defaultCODHandling < 0 || input.defaultPackaging < 0 || input.gatewayFixedFee < 0) {
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

    await SettingsRepository.upsertStoreSettings(shop, {
      defaultForwardShipping: input.defaultForwardShipping,
      defaultReturnShipping: input.defaultReturnShipping,
      defaultCODHandling: input.defaultCODHandling,
      defaultPackaging: input.defaultPackaging,
      defaultGatewayFeePct: input.defaultGatewayFeePct,
      gatewayFixedFee: input.gatewayFixedFee,
      rtoDetectionPattern: input.rtoDetectionPattern,
      alertEmail: input.alertEmail,
      rtoThreshold: input.rtoThreshold,
      marginThreshold: input.marginThreshold,
      gstin: input.gstin || null,
      isGstRegistered: Boolean(input.isGstRegistered),
      gstRate: input.gstRate || 18,
      whatsappPhone: input.whatsappPhone || null,
      whatsappEnabled: Boolean(input.whatsappEnabled),
      otpVerificationEnabled: Boolean(input.whatsappEnabled),
      shippingSlabs: input.shippingSlabs || null,
    });

    return { success: true };
  }
}
