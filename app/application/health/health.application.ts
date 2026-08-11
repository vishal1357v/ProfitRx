import { ProfitIntelligenceService } from "../../services/profit-intelligence.service";

export class HealthApplicationService {
  /**
   * Retrieves overall store profit health status and channel quality metrics.
   */
  static async getHealthData(shop: string) {
    const [healthStatus, qualityScores] = await Promise.all([
      ProfitIntelligenceService.getProfitHealthStatus(shop),
      ProfitIntelligenceService.getChannelQualityScores(shop),
    ]);

    return {
      healthStatus,
      qualityScores,
    };
  }
}
