import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { CodOrderRepository } from "../../infrastructure/repositories/cod-order.repository";
import { ExecutionLogRepository } from "../../infrastructure/repositories/execution-log.repository";
import { EventBus } from "../../infrastructure/events/event.bus";
import { ExecutionContextFactory } from "../../infrastructure/context/execution.context";

export interface OperationsDataDTO {
  orders: any[];
  codVerifications: any[];
  executionLogs: any[];
  actionQueue: any[];
  summary: {
    totalOrders: number;
    totalCodOrders: number;
    atRiskCodCount: number;
    pendingOtpCount: number;
    failedActionCount: number;
  };
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

    const formattedOrders = recentOrders.map((o) => ({
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
    }));

    // Derive Action Queue: Orders awaiting merchant review, high-risk COD, or verification
    const actionQueue = formattedOrders.filter(
      (o) =>
        o.isCOD &&
        (o.riskLevel === "CRITICAL" ||
          o.riskLevel === "HIGH" ||
          o.merchantRecommendation === "OTP_VERIFY" ||
          o.merchantRecommendation === "BLOCK_COD" ||
          o.merchantRecommendation === "REVIEW")
    );

    const totalCodOrders = formattedOrders.filter((o) => o.isCOD).length;
    const atRiskCodCount = formattedOrders.filter(
      (o) => o.isCOD && (o.riskLevel === "HIGH" || o.riskLevel === "CRITICAL")
    ).length;
    const pendingOtpCount = codVerifications.filter(
      (c) => c.status === "PENDING" || c.status === "OTP_SENT"
    ).length;
    const failedActionCount = executionLogs.filter((l) => l.status === "FAILED").length;

    return {
      orders: formattedOrders,
      codVerifications: verificationMap,
      executionLogs,
      actionQueue,
      summary: {
        totalOrders: formattedOrders.length,
        totalCodOrders,
        atRiskCodCount,
        pendingOtpCount,
        failedActionCount,
      },
    };
  }

  /**
   * Quick action execution from Operations queue.
   */
  static async applyOrderAction(
    shop: string,
    orderId: string,
    action: string,
    reason = "Operations queue quick action"
  ): Promise<{ success: boolean; message: string }> {
    const order = await OrderRepository.findById(shop, orderId);
    if (!order) {
      return { success: false, message: "Order not found" };
    }

    await OrderRepository.updateDecision(shop, orderId, {
      merchantRecommendation: action,
    });

    await ExecutionLogRepository.createLog({
      shop,
      orderId,
      step: "OPERATIONS_ACTION",
      status: "SUCCESS",
      message: `Action ${action} applied from Operations Center. Reason: ${reason}`,
      data: { action, reason, timestamp: new Date().toISOString() },
    });

    const context = ExecutionContextFactory.create(shop, orderId, `ops_act_${Date.now()}`);
    await EventBus.publish({
      type: "DECISION_MADE",
      context,
      payload: {
        action,
        confidence: 1.0,
        expectedValue: 0,
        riskScore: order.riskScore || 0,
        isOverride: true,
        overrideReason: reason,
      },
    });

    return { success: true, message: `Action ${action} applied to order #${order.orderNumber}` };
  }
}

