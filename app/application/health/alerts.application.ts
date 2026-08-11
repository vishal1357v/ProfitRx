import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { AlertRepository } from "../../infrastructure/repositories/alert.repository";
import { AlertService } from "../../services/alerts.service";

export interface AlertViewDTO {
  id: string;
  shop: string;
  type: string;
  severity: string;
  message: string;
  data: any;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
}

export interface AlertsDataDTO {
  settings: any;
  activeAlerts: AlertViewDTO[];
  resolvedAlerts: AlertViewDTO[];
}

export class AlertsApplicationService {
  /**
   * Evaluates store conditions and returns active and resolved alerts.
   */
  static async getAlertsData(shop: string, email = ""): Promise<AlertsDataDTO> {
    const settings = await SettingsRepository.getOrCreate(shop, email);

    // Auto-evaluate current store conditions against thresholds
    await AlertService.evaluateStoreAlerts(shop);

    const [activeAlerts, resolvedAlerts] = await Promise.all([
      AlertRepository.findActiveByShop(shop),
      AlertRepository.findResolvedByShop(shop, 15),
    ]);

    return {
      settings,
      activeAlerts: activeAlerts.map((a) => ({
        id: a.id,
        shop: a.shop,
        type: a.type,
        severity: a.severity,
        message: a.message,
        data: a.data,
        isRead: a.isRead,
        createdAt: a.createdAt.toISOString().split("T")[0],
      })),
      resolvedAlerts: resolvedAlerts.map((a) => ({
        id: a.id,
        shop: a.shop,
        type: a.type,
        severity: a.severity,
        message: a.message,
        data: a.data,
        isRead: a.isRead,
        createdAt: a.createdAt.toISOString().split("T")[0],
        readAt: a.readAt ? a.readAt.toISOString().split("T")[0] : null,
      })),
    };
  }

  /**
   * Resolve an alert.
   */
  static async resolveAlert(shop: string, alertId: string): Promise<void> {
    await AlertService.resolveAlert(shop, alertId);
  }

  /**
   * Update alert thresholds & notification settings with validation.
   */
  static async updateAlertSettings(
    shop: string,
    input: {
      alertEmail: string;
      rtoThreshold: number;
      marginThreshold: number;
    }
  ): Promise<{ success: boolean; error?: string }> {
    if (isNaN(input.rtoThreshold) || input.rtoThreshold < 0 || input.rtoThreshold > 100) {
      return { success: false, error: "RTO threshold must be a number between 0% and 100%." };
    }
    if (isNaN(input.marginThreshold) || input.marginThreshold < -100 || input.marginThreshold > 100) {
      return { success: false, error: "Margin threshold must be a valid percentage." };
    }

    await SettingsRepository.upsertStoreSettings(shop, {
      alertEmail: input.alertEmail,
      rtoThreshold: input.rtoThreshold,
      marginThreshold: input.marginThreshold,
    });

    // Re-evaluate alerts with new settings thresholds
    await AlertService.evaluateStoreAlerts(shop);

    return { success: true };
  }
}
