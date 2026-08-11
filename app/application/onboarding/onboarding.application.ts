import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { CogsRepository } from "../../infrastructure/repositories/cogs.repository";

export interface OnboardingStateDTO {
  shop: string;
  host: string;
  currentStep: number;
  onboardingCompleted: boolean;
  orderCount: number;
  cogsCount: number;
  settings: {
    defaultCOGSPct: number;
    defaultForwardShipping: number;
    defaultReturnShipping: number;
    defaultCODHandling: number;
    defaultPackaging: number;
    defaultGatewayFeePct: number;
    gstin: string;
    gstRate: number;
    isGstRegistered: boolean;
  };
  previewRevenue: number;
  previewProfit: number;
  progress: {
    storeConnected: boolean;
    ordersSynced: boolean;
    cogsConfigured: boolean;
    codRulesConfigured: boolean;
    webhooksActive: boolean;
  };
}

export class OnboardingApplicationService {
  /**
   * Calculates actual onboarding progress and preview calculations.
   */
  static async getOnboardingState(
    shop: string,
    host: string,
    email = ""
  ): Promise<OnboardingStateDTO> {
    const settings = await SettingsRepository.getOrCreate(shop, email);
    const recentOrders = await OrderRepository.findByShop(shop, 50);
    const cogsRecords = await CogsRepository.findByShop(shop);

    const orderCount = recentOrders.length;
    const cogsCount = cogsRecords.length;

    let previewRevenue = 0;
    let previewProfit = 0;
    if (orderCount > 0) {
      previewRevenue = recentOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
      const avgCogsPct = (settings.defaultCOGSPct || 40) / 100;
      previewProfit = recentOrders.reduce((sum, o) => {
        const cogs = (o.totalPrice || 0) * avgCogsPct;
        const fees = (o.totalTax || 0) + (o.shippingPrice || 0) + (settings.defaultPackaging || 10);
        return sum + ((o.totalPrice || 0) - cogs - fees);
      }, 0);
    }

    const codRulesConfigured = Boolean(
      settings.rulesRejectCodOver ||
        settings.rulesRequirePrepaidAbove ||
        (settings.codBlockedPincodes && settings.codBlockedPincodes.length > 0) ||
        settings.rulesAutoRequireOtp
    );

    return {
      shop,
      host,
      currentStep: settings.onboardingStep || 0,
      onboardingCompleted: Boolean(settings.onboardingCompleted),
      orderCount,
      cogsCount,
      settings: {
        defaultCOGSPct: settings.defaultCOGSPct,
        defaultForwardShipping: settings.defaultForwardShipping,
        defaultReturnShipping: settings.defaultReturnShipping,
        defaultCODHandling: settings.defaultCODHandling,
        defaultPackaging: settings.defaultPackaging,
        defaultGatewayFeePct: settings.defaultGatewayFeePct,
        gstin: settings.gstin || "",
        gstRate: settings.gstRate,
        isGstRegistered: settings.isGstRegistered,
      },
      previewRevenue: Math.round(previewRevenue),
      previewProfit: Math.round(previewProfit),
      progress: {
        storeConnected: true,
        ordersSynced: orderCount > 0,
        cogsConfigured: cogsCount > 0,
        codRulesConfigured,
        webhooksActive: true,
      },
    };
  }

  /**
   * Save current active step.
   */
  static async saveStep(shop: string, step: number): Promise<void> {
    await SettingsRepository.updateOnboarding(shop, step);
  }

  /**
   * Save expense configurations from onboarding.
   */
  static async saveExpenses(
    shop: string,
    expenses: {
      defaultForwardShipping: number;
      defaultReturnShipping: number;
      defaultCODHandling: number;
      defaultPackaging: number;
      defaultGatewayFeePct: number;
    }
  ): Promise<void> {
    await SettingsRepository.upsertStoreSettings(shop, expenses);
  }

  /**
   * Save tax configurations from onboarding.
   */
  static async saveTaxes(
    shop: string,
    taxes: {
      gstin: string;
      gstRate: number;
      isGstRegistered: boolean;
    }
  ): Promise<void> {
    await SettingsRepository.upsertStoreSettings(shop, taxes);
  }

  /**
   * Mark onboarding complete.
   */
  static async completeOnboarding(shop: string): Promise<void> {
    await SettingsRepository.updateOnboarding(shop, 7, true);
  }
}
