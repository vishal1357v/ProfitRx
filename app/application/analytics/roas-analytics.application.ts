import { ProfitIntelligenceService } from "../../services/profit-intelligence.service";
import { AdSpendService } from "../../services/ad-spend.service";
import { AdSpendRepository } from "../../infrastructure/repositories/ad-spend.repository";

export interface RoasAnalyticsDTO {
  hasAccess: boolean;
  shop: string;
  host: string;
  roas: any;
  connectedPlatforms: any;
  adSpendRecords: Array<{
    id: string;
    month: string | null;
    channel: string | null;
    amount: number | null;
  }>;
  revenueChart: Array<{
    date: string;
    revenue: number;
  }>;
}

export interface SaveAdSpendInput {
  month: string;
  channel: string;
  amount: number;
}

export class RoasAnalyticsApplicationService {
  /**
   * Orchestrates Marketing ROAS, Blended CAC, Ad Spend Aggregations, and 30-Day Revenue Trend.
   */
  static async getRoasAnalytics(shop: string, host: string): Promise<RoasAnalyticsDTO> {
    const [roas, adSpendRecords, connectedPlatforms, revenueChart] = await Promise.all([
      ProfitIntelligenceService.getROAS(shop),
      AdSpendRepository.findByShop(shop, 24),
      AdSpendService.getConnectedPlatforms(shop),
      AdSpendRepository.getDailyRevenue(shop, 30),
    ]);

    return {
      hasAccess: true,
      shop,
      host,
      roas,
      connectedPlatforms,
      adSpendRecords: adSpendRecords.map((a) => ({
        id: a.id,
        month: a.month,
        channel: a.channel || a.platform,
        amount: a.amount,
      })),
      revenueChart,
    };
  }

  /**
   * Saves or updates a manual ad spend record with validation.
   */
  static async saveAdSpend(
    shop: string,
    input: SaveAdSpendInput
  ): Promise<{ success: boolean; error?: string }> {
    if (!input.month || !input.channel) {
      return { success: false, error: "Month and channel are required." };
    }
    if (isNaN(input.amount) || input.amount < 0) {
      return { success: false, error: "Ad spend amount must be a non-negative number." };
    }

    await AdSpendRepository.upsertManualSpend(shop, input);
    return { success: true };
  }
}
