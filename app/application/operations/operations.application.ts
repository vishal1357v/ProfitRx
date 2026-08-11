import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { CodOrderRepository } from "../../infrastructure/repositories/cod-order.repository";
import { ExecutionLogRepository } from "../../infrastructure/repositories/execution-log.repository";

export interface OperationsDataDTO {
  orders: any[];
  codVerifications: any[];
  executionLogs: any[];
}

export class OperationsApplicationService {
  /**
   * Aggregates recent orders, COD verifications, and AI execution logs with tenant isolation.
   */
  static async getOperationsData(shop: string): Promise<OperationsDataDTO> {
    // 1. Fetch Orders (recent 50) via OrderRepository
    const recentOrders = await OrderRepository.findByShop(shop, 50);

    // 2. Fetch COD Verifications (recent 50) via CodOrderRepository
    const codVerifications = await CodOrderRepository.findByShop(shop, { limit: 50 });

    // Link COD orders to orders for order number display
    const verificationMap = codVerifications.map((cod) => {
      const cleanCodOrderId = cod.orderId.replace("gid://shopify/Order/", "");
      const related = recentOrders.find(
        (o) =>
          o.id === cod.orderId ||
          o.id === `gid://shopify/Order/${cod.orderId}` ||
          o.id.replace("gid://shopify/Order/", "") === cleanCodOrderId
      );
      return {
        ...cod,
        orderNumber: related ? related.orderNumber : null,
      };
    });

    // 3. Fetch Execution Logs (recent 50) via ExecutionLogRepository
    const executionLogs = await ExecutionLogRepository.findByShop(shop, 50);

    return {
      orders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        totalPrice: o.totalPrice,
        isCOD: o.isCOD,
        gateway: o.gateway,
        financialStatus: o.financialStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        customerName: o.customerName,
        riskScore: o.riskScore,
        riskLevel: o.riskLevel,
        merchantRecommendation: o.merchantRecommendation,
        createdAt: o.createdAt,
      })),
      codVerifications: verificationMap,
      executionLogs,
    };
  }
}
