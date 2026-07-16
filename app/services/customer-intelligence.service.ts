import prisma from "../db.server";

export interface LTVCohort {
  cohortMonth: string;
  customers: number;
  revenue: number;
  avgRevenue: number;
  repeat30: number; // % repeat within 30 days of 1st purchase
  repeat60: number; // % repeat within 60 days of 1st purchase
  repeat90: number; // % repeat within 90 days of 1st purchase
}

export class CustomerIntelligenceService {
  /**
   * Aggregate orders to populate & update CustomerProfile records
   */
  static async syncCustomerProfiles(shop: string) {
    const orders = await prisma.order.findMany({
      where: { shop },
      orderBy: { createdAt: "asc" },
    });

    if (orders.length === 0) return { updated: 0 };

    // Group orders by customer ID / email
    const customerGroupMap = new Map<string, any[]>();
    for (const o of orders) {
      const custKey = o.customerId || (o as any).customerEmail || (o as any).email || o.id;
      if (!customerGroupMap.has(custKey)) {
        customerGroupMap.set(custKey, []);
      }
      customerGroupMap.get(custKey)!.push(o);
    }

    const upsertPromises: any[] = [];

    for (const [customerId, custOrders] of customerGroupMap.entries()) {
      // Sort orders chronologically
      custOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const firstOrder = custOrders[0];
      const lastOrder = custOrders[custOrders.length - 1];

      const orderCount = custOrders.length;
      const totalRevenue = custOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
      const ltv = totalRevenue; // LTV = Cumulative lifetime spend
      const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

      const firstOrderDate = new Date(firstOrder.createdAt);
      const lastOrderDate = new Date(lastOrder.createdAt);
      const cohortMonth = firstOrderDate.toISOString().substring(0, 7); // "YYYY-MM"
      const channelSource = firstOrder.channelAttribution || "Website";

      const customerName = (firstOrder as any).customerName || (firstOrder as any).name || `Customer ${customerId.substring(0, 6)}`;
      const customerEmail = (firstOrder as any).customerEmail || (firstOrder as any).email || null;

      upsertPromises.push(
        (prisma as any).customerProfile.upsert({
          where: { shop_customerId: { shop, customerId } },
          update: {
            customerName,
            customerEmail,
            firstOrderDate,
            lastOrderDate,
            orderCount,
            totalRevenue,
            ltv,
            aov,
            cohortMonth,
            channelSource,
            updatedAt: new Date(),
          },
          create: {
            shop,
            customerId,
            customerName,
            customerEmail,
            firstOrderDate,
            lastOrderDate,
            orderCount,
            totalRevenue,
            ltv,
            aov,
            cohortMonth,
            channelSource,
            updatedAt: new Date(),
          },
        })
      );
    }

    // Run database operations in batches of 100 to prevent connection pools and memory timeout bottlenecks
    const batchSize = 100;
    for (let i = 0; i < upsertPromises.length; i += batchSize) {
      const batch = upsertPromises.slice(i, i + batchSize);
      await prisma.$transaction(batch);
    }

    return { updated: upsertPromises.length };
  }

  /**
   * Calculate exact date-based Cohort Retention Curves (30, 60, 90 day retention)
   */
  static async getLTVCohorts(shop: string): Promise<LTVCohort[]> {
    // Read directly from pre-computed DB records to keep page loads lightning fast

    const orders = await prisma.order.findMany({
      where: { shop },
      orderBy: { createdAt: "asc" },
    });

    if (orders.length === 0) return [];

    // Group orders by customer
    const custOrdersMap = new Map<string, any[]>();
    for (const o of orders) {
      const key = o.customerId || (o as any).customerEmail || o.id;
      if (!custOrdersMap.has(key)) custOrdersMap.set(key, []);
      custOrdersMap.get(key)!.push(o);
    }

    // Cohort aggregation structure
    const cohortMap = new Map<string, {
      totalCustomers: number;
      totalRevenue: number;
      repeat30Count: number;
      repeat60Count: number;
      repeat90Count: number;
    }>();

    for (const [_, custOrders] of custOrdersMap.entries()) {
      custOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const firstOrder = custOrders[0];
      const firstDate = new Date(firstOrder.createdAt);
      const cohortMonth = firstDate.toISOString().substring(0, 7);

      const custRevenue = custOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

      if (!cohortMap.has(cohortMonth)) {
        cohortMap.set(cohortMonth, {
          totalCustomers: 0,
          totalRevenue: 0,
          repeat30Count: 0,
          repeat60Count: 0,
          repeat90Count: 0,
        });
      }

      const cohort = cohortMap.get(cohortMonth)!;
      cohort.totalCustomers += 1;
      cohort.totalRevenue += custRevenue;

      // Check if customer made a repeat order within 30, 60, or 90 days of first purchase
      if (custOrders.length > 1) {
        const secondOrderDate = new Date(custOrders[1].createdAt);
        const diffDays = (secondOrderDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays <= 30) cohort.repeat30Count += 1;
        if (diffDays <= 60) cohort.repeat60Count += 1;
        if (diffDays <= 90) cohort.repeat90Count += 1;
      }
    }

    const results: LTVCohort[] = [];
    for (const [cohortMonth, data] of cohortMap.entries()) {
      const count = data.totalCustomers;
      results.push({
        cohortMonth,
        customers: count,
        revenue: Math.round(data.totalRevenue),
        avgRevenue: count > 0 ? Math.round(data.totalRevenue / count) : 0,
        repeat30: count > 0 ? Math.round((data.repeat30Count / count) * 100) : 0,
        repeat60: count > 0 ? Math.round((data.repeat60Count / count) * 100) : 0,
        repeat90: count > 0 ? Math.round((data.repeat90Count / count) * 100) : 0,
      });
    }

    return results.sort((a, b) => b.cohortMonth.localeCompare(a.cohortMonth)).slice(0, 12);
  }

  /**
   * Get customer list sorted by LTV / orders
   */
  static async getCustomerDirectory(shop: string, query: string = "") {
    await this.syncCustomerProfiles(shop);

    const profiles = await (prisma as any).customerProfile.findMany({
      where: {
        shop,
        ...(query ? {
          OR: [
            { customerName: { contains: query, mode: "insensitive" } },
            { customerEmail: { contains: query, mode: "insensitive" } },
            { customerId: { contains: query, mode: "insensitive" } },
          ],
        } : {}),
      },
      orderBy: { ltv: "desc" },
      take: 50,
    });

    return profiles.map((p: any) => ({
      id: p.id,
      customerId: p.customerId,
      name: p.customerName || `Customer ${p.customerId.substring(0, 6)}`,
      email: p.customerEmail || "N/A",
      orderCount: p.orderCount,
      totalRevenue: p.totalRevenue,
      ltv: p.ltv,
      aov: Math.round(p.aov || 0),
      cohortMonth: p.cohortMonth || "N/A",
      channelSource: p.channelSource || "Website",
      lastOrderDate: p.lastOrderDate ? new Date(p.lastOrderDate).toLocaleDateString() : "N/A",
    }));
  }
}
