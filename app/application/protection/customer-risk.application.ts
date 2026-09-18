import { CustomerRepository, CustomerRiskRecord } from "../../infrastructure/repositories/customer.repository";
import { AuditLogService } from "../../services/compliance/audit-log.service";

export interface CustomerRiskItem {
  id: string;
  customerId: string;
  phone: string | null;
  email: string | null;
  totalOrders: number;
  codOrders: number;
  prepaidOrders: number;
  successfulDeliveries: number;
  rtoCount: number;
  cancellationCount: number;
  aov: number;
  lifetimeSpend: number;
  lastOrderDate: string | null;
  riskScore: number;
  riskLevel: string;
  rtoRate: number;
  estimatedLoss: number;
  deliveryRate: number;
}

export interface CustomerRiskDTO {
  shop: string;
  summary: {
    totalOffenders: number;
    highRiskCount: number;
    totalLoss: number;
    avgRtoRate: number;
    repeatCodCount: number;
  };
  customers: CustomerRiskItem[];
}

export class CustomerRiskApplicationService {
  /**
   * Retrieves all customer risk profiles, calculates RTO rates and aggregate loss figures.
   */
  static async getCustomerRiskData(shop: string): Promise<CustomerRiskDTO> {
    const rawProfiles = await CustomerRepository.findRiskProfilesByShop(shop, 100);

    let totalLoss = 0;
    let sumRtoRate = 0;
    let highRiskCount = 0;
    let totalOffenders = 0;
    let repeatCodCount = 0;

    const customers: CustomerRiskItem[] = rawProfiles.map((p) => {
      const rtoRate = p.codOrders > 0 ? Math.round((p.rtoCount / p.codOrders) * 100) : 0;
      const deliveryRate = p.totalOrders > 0 ? Math.round((p.successfulDeliveries / p.totalOrders) * 100) : 0;
      const estimatedLoss = Math.round(p.rtoCount * 250); // Standard ₹250 avg return shipping & handling waste

      if (p.rtoCount >= 1 || p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH") {
        totalOffenders += 1;
        totalLoss += estimatedLoss;
        sumRtoRate += rtoRate;
      }

      if (p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH" || p.riskScore >= 60) {
        highRiskCount += 1;
      }

      if (p.codOrders >= 2) {
        repeatCodCount += 1;
      }

      return {
        id: p.id,
        customerId: p.customerId,
        phone: p.phone,
        email: p.email,
        totalOrders: p.totalOrders,
        codOrders: p.codOrders,
        prepaidOrders: p.prepaidOrders,
        successfulDeliveries: p.successfulDeliveries,
        rtoCount: p.rtoCount,
        cancellationCount: p.cancellationCount,
        aov: Math.round(p.aov),
        lifetimeSpend: Math.round(p.lifetimeSpend),
        lastOrderDate: p.lastOrderDate ? new Date(p.lastOrderDate).toISOString() : null,
        riskScore: p.riskScore,
        riskLevel: p.riskLevel,
        rtoRate,
        estimatedLoss,
        deliveryRate,
      };
    });

    const avgRtoRate = totalOffenders > 0 ? Math.round(sumRtoRate / totalOffenders) : 0;

    // Log merchant access for PCD audit trail
    await AuditLogService.logAccess({
      shop,
      actor: "merchant_admin",
      resource: "CUSTOMER_RISK_VIEW",
      action: "VIEW",
    });

    return {
      shop,
      summary: {
        totalOffenders,
        highRiskCount,
        totalLoss,
        avgRtoRate,
        repeatCodCount,
      },
      customers,
    };
  }

  /**
   * Overrides customer risk status (e.g. forcing prepaid or clearing risk).
   */
  static async updateCustomerRiskAction(
    shop: string,
    customerId: string,
    action: "FORCE_PREPAID" | "ALLOW_COD" | "FLAG_CRITICAL"
  ): Promise<{ success: boolean; message: string; customerId: string }> {
    let riskLevel = "LOW";
    let riskScore = 10;
    let message = "Customer risk cleared. COD is permitted.";

    if (action === "FORCE_PREPAID" || action === "FLAG_CRITICAL") {
      riskLevel = "CRITICAL";
      riskScore = 85;
      message = "Customer flagged as CRITICAL risk. COD blocked or OTP required.";
    }

    await CustomerRepository.updateRiskLevel(shop, customerId, {
      riskLevel,
      riskScore,
    });

    // Log action in audit log
    await AuditLogService.logAccess({
      shop,
      actor: "merchant_admin",
      resource: "CUSTOMER_RISK_ACTION",
      resourceId: customerId,
      action: "VIEW",
    });

    return { success: true, message, customerId };
  }
}
