import prisma from "../../db.server";

export interface PincodeStatRecord {
  id: string;
  shop: string;
  pincode: string;
  city: string | null;
  province: string | null;
  totalOrders: number;
  codOrders: number;
  rtoCount: number;
  totalLoss: number;
  rtoRate: number;
  riskLevel: string;
  successfulDeliveries: number;
  deliveryRate: number;
  aov: number;
  revenue: number;
  updatedAt: Date;
}

export class PincodeRepository {
  /**
   * Fetch top risk pincodes sorted by RTO rate descending with shop isolation.
   */
  static async findTopRiskPincodes(shop: string, limit = 50): Promise<PincodeStatRecord[]> {
    return prisma.pincodeStats.findMany({
      where: { shop },
      orderBy: { rtoRate: "desc" },
      take: limit,
    });
  }

  /**
   * Fetch pincode statistics for a shop.
   */
  static async findManyByShop(shop: string, limit = 30): Promise<PincodeStatRecord[]> {
    return prisma.pincodeStats.findMany({
      where: { shop },
      orderBy: { rtoRate: "desc" },
      take: limit,
    });
  }

  /**
   * Find statistical record for a single pincode with shop isolation.
   */
  static async findByPincode(shop: string, pincode: string): Promise<PincodeStatRecord | null> {
    return prisma.pincodeStats.findUnique({
      where: {
        shop_pincode: { shop, pincode },
      },
    });
  }
}
