import prisma from "../../db.server";

export class OperationsApplicationService {
  static async getOperationsData(shop: string) {
    // 1. Fetch Orders (recent 50)
    const orders = await prisma.order.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        totalPrice: true,
        isCOD: true,
        gateway: true,
        financialStatus: true,
        fulfillmentStatus: true,
        customerName: true,
        riskScore: true,
        riskLevel: true,
        merchantRecommendation: true,
        createdAt: true,
      }
    });

    // 2. Fetch COD Verifications (recent 50)
    const codVerifications = await prisma.cODOrder.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // We need to link CODOrders to Orders to get the orderNumber if possible.
    const orderIds = codVerifications.map(c => c.orderId);
    const relatedOrders = await prisma.order.findMany({
      where: { shop, id: { in: orderIds } },
      select: { id: true, orderNumber: true }
    });
    
    const verificationMap = codVerifications.map(cod => {
      const related = relatedOrders.find(o => o.id === cod.orderId || o.id === `gid://shopify/Order/${cod.orderId}`);
      return {
        ...cod,
        orderNumber: related ? related.orderNumber : null,
      };
    });

    // 3. Fetch Execution Logs (recent 50)
    const executionLogs = await prisma.executionLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        order: {
          select: {
            orderNumber: true,
          }
        }
      }
    });

    return {
      orders,
      codVerifications: verificationMap,
      executionLogs,
    };
  }
}
