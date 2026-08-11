import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { OrderFeatureService } from "../../../services/order-features/order-feature.service";
import prisma from "../../../db.server";

export class FeatureStep implements PipelineStep<OrderPipelineData> {
  name = "FeatureExtraction";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    const orderId = String(data.rawOrder?.id || context.orderId);
    const shop = context.shopId;

    // Ensure Order record exists in DB for OrderFeatureService to query
    const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existingOrder) {
      await prisma.order.create({
        data: {
          id: orderId,
          shop,
          orderNumber: Number(data.rawOrder?.order_number || data.rawOrder?.orderNumber || 1001),
          totalPrice: parseFloat(String(data.rawOrder?.total_price || data.rawOrder?.totalPrice || "0")),
          subtotalPrice: parseFloat(String(data.rawOrder?.subtotal_price || data.rawOrder?.subtotalPrice || "0")),
          totalTax: parseFloat(String(data.rawOrder?.total_tax || data.rawOrder?.totalTax || "0")),
          shippingPrice: parseFloat(String(data.rawOrder?.shipping_price || data.rawOrder?.shippingPrice || "0")),
          isCOD:
            (data.rawOrder?.gateway || "").toLowerCase().includes("cod") ||
            (data.rawOrder?.payment_gateway_names || []).some(
              (g: string) => g.toLowerCase().includes("manual") || g.toLowerCase().includes("cod")
            ),
          financialStatus: data.rawOrder?.financial_status || "pending",
          fulfillmentStatus: data.rawOrder?.fulfillment_status || "unfulfilled",
          customerId: data.rawOrder?.customer?.id ? String(data.rawOrder.customer.id) : null,
          customerName: data.rawOrder?.customer
            ? `${data.rawOrder.customer.first_name || ""} ${data.rawOrder.customer.last_name || ""}`.trim()
            : null,
          customerEmail: data.rawOrder?.customer?.email || data.rawOrder?.email || null,
          pincode: data.rawOrder?.shipping_address?.zip || data.rawOrder?.pincode || null,
          city: data.rawOrder?.shipping_address?.city || data.rawOrder?.city || null,
          province: data.rawOrder?.shipping_address?.province || data.rawOrder?.province || null,
          createdAt: data.rawOrder?.created_at ? new Date(data.rawOrder.created_at) : new Date(),
          processedAt: data.rawOrder?.processed_at ? new Date(data.rawOrder.processed_at) : new Date(),
        },
      });
    }

    const featureResult = await OrderFeatureService.extractFeatures({ shop, orderId });
    return {
      ...data,
      features: featureResult.features,
      metadata: featureResult.metadata,
    };
  }
}
