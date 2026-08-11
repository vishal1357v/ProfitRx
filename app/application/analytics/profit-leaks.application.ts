import { ProfitIntelligenceService } from "../../services/profit-intelligence.service";
import { ProfitRepository, AffectedOrderLeak, CogsStatus } from "../../infrastructure/repositories/profit.repository";

export interface ProfitLeaksDTO {
  leaks: {
    rtoLoss: number;
    shippingLoss: number;
    discountLoss: number;
    codFailureLoss: number;
    totalLeak: number;
    rtoTrend: number;
    shippingTrend: number;
    discountTrend: number;
  };
  trend: Array<{ date: string; rto: number; shipping: number; discount: number }>;
  cogsTransparency: {
    isEstimated: boolean;
    estimationReason?: string;
    configuredProductCount: number;
    defaultCogsPct: number;
  };
  affectedOrders: Array<{
    id: string;
    orderNumber: number;
    totalPrice: number;
    leakAmount: number;
    leakType: "rto" | "shipping" | "discount";
    reason: string;
    createdAt: string;
  }>;
  hasData: boolean;
  shop: string;
}

export class ProfitLeaksApplicationService {
  /**
   * Coordinates profit leak diagnostics, trend models, COGS transparency, and affected order drill-down.
   */
  static async getProfitLeaksData(shop: string): Promise<ProfitLeaksDTO> {
    const [leaks, trend, cogsStatus, rawAffectedOrders] = await Promise.all([
      ProfitIntelligenceService.getProfitLeaks(shop),
      ProfitIntelligenceService.getLeakTrend(shop),
      ProfitRepository.getCogsStatus(shop),
      ProfitRepository.getAffectedLeakOrders(shop, 10),
    ]);

    const isEstimated = !cogsStatus.hasCustomCogs;
    const estimationReason = isEstimated
      ? `Using fallback estimate of ${cogsStatus.defaultCogsPct}% COGS. Configure custom product costs in COGS Catalog for exact margin auditing.`
      : undefined;

    const affectedOrders = rawAffectedOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      totalPrice: o.totalPrice,
      leakAmount: o.leakAmount,
      leakType: o.leakType,
      reason: o.reason,
      createdAt: o.createdAt.toISOString().split("T")[0],
    }));

    return {
      leaks,
      trend,
      cogsTransparency: {
        isEstimated,
        estimationReason,
        configuredProductCount: cogsStatus.configuredProductCount,
        defaultCogsPct: cogsStatus.defaultCogsPct,
      },
      affectedOrders,
      hasData: leaks.totalLeak > 0,
      shop,
    };
  }
}
