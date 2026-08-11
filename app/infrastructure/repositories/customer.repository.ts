import prisma from "../../db.server";

export interface CustomerProfileRecord {
  id: string;
  shop: string;
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  firstOrderDate: Date | null;
  lastOrderDate: Date | null;
  orderCount: number;
  totalRevenue: number;
  totalProfit: number;
  ltv: number;
  aov: number;
  repeatRate: number;
  cohortMonth: string | null;
  channelSource: string | null;
  updatedAt: Date;
}

export interface CustomerRiskRecord {
  id: string;
  shop: string;
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
  lastOrderDate: Date | null;
  riskScore: number;
  riskLevel: string;
  updatedAt: Date;
}

export class CustomerRepository {
  /**
   * Fetch customer profiles for a given shop with multi-tenant isolation.
   */
  static async findProfilesByShop(shop: string, limit = 100): Promise<CustomerProfileRecord[]> {
    return prisma.customerProfile.findMany({
      where: { shop },
      orderBy: { totalRevenue: "desc" },
      take: limit,
    });
  }

  /**
   * Fetch customer risk history for a given shop with multi-tenant isolation.
   */
  static async findRiskProfilesByShop(shop: string, limit = 100): Promise<CustomerRiskRecord[]> {
    return prisma.customerRisk.findMany({
      where: { shop },
      orderBy: { rtoCount: "desc" },
      take: limit,
    });
  }

  /**
   * Find single customer profile by ID with shop isolation.
   */
  static async findByCustomerId(shop: string, customerId: string): Promise<CustomerProfileRecord | null> {
    return prisma.customerProfile.findUnique({
      where: {
        shop_customerId: { shop, customerId },
      },
    });
  }
}
