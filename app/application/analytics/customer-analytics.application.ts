import { CustomerIntelligenceService } from "../../services/customer-intelligence.service";
import { ProfitIntelligenceService } from "../../services/profit-intelligence.service";

export interface CustomerAnalyticsDTO {
  hasAccess: boolean;
  shop: string;
  host: string;
  cohorts: any[];
  channelQuality: any[];
  customers: any[];
}

export class CustomerAnalyticsApplicationService {
  /**
   * Orchestrates Customer Intelligence, LTV Cohorts, Acquisition Quality, and Directory Analytics.
   */
  static async getCustomerAnalytics(shop: string, host: string): Promise<CustomerAnalyticsDTO> {
    const [cohorts, channelQuality, customers] = await Promise.all([
      CustomerIntelligenceService.getLTVCohorts(shop),
      ProfitIntelligenceService.getChannelQualityScores(shop),
      CustomerIntelligenceService.getCustomerDirectory(shop),
    ]);

    return {
      hasAccess: true,
      shop,
      host,
      cohorts,
      channelQuality,
      customers,
    };
  }
}
