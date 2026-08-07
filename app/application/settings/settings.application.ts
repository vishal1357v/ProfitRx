import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { ExecutionContext } from "../../infrastructure/context/execution.context";
import { EventBus } from "../../infrastructure/events/event.bus";

export class SettingsApplicationService {
  /**
   * Validates and persists merchant configuration.
   * Immediately updates the configuration that the Domain Layer reads.
   */
  static async updateCodLimit(context: ExecutionContext, limit: number): Promise<void> {
    if (limit < 0) throw new Error("COD Limit cannot be negative");

    await SettingsRepository.updateCodLimit(context.shopId, limit);

    // Optionally publish a configuration change event so other services can react
    // if we add a CONFIGURATION_CHANGED event type.
  }
}
