import { PipelineStep } from "../../pipeline/pipeline.interface";
import { ExecutionContext } from "../../../infrastructure/context/execution.context";
import { OrderPipelineData } from "../order-pipeline.types";
import { OrderFeatureService } from "../../../services/order-features/order-feature.service";
import { OrderRepository } from "../../../infrastructure/repositories/order.repository";
import { ProfitService } from "../../../services/profit.service";
import prisma from "../../../db.server";

export class FeatureStep implements PipelineStep<OrderPipelineData> {
  name = "FeatureExtraction";

  async execute(context: ExecutionContext, data: OrderPipelineData): Promise<OrderPipelineData> {
    const orderId = String(data.rawOrder?.id || context.orderId);
    const shop = context.shopId;

    // Ensure Order record exists in DB for OrderFeatureService to query
    const firstLineItem = data.rawOrder?.line_items?.[0];
    const productId = firstLineItem?.product_id ? String(firstLineItem.product_id) : null;
    const cogsDict = await ProfitService.getCOGS(shop);
    let resolvedCogs: number | null = null;
    if (productId && cogsDict[productId] !== undefined) {
      resolvedCogs = cogsDict[productId];
    }

    const rawLineItems = Array.isArray(data.rawOrder?.line_items) ? data.rawOrder.line_items : [];

    await OrderRepository.ensureOrderExists(shop, orderId, {
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
      productId,
      totalWeight: data.rawOrder?.total_weight ? parseFloat(String(data.rawOrder.total_weight)) : null,
      cogsAtTimeOfOrder: resolvedCogs,
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
    });

    if (rawLineItems.length > 0) {
      for (const li of rawLineItems) {
        try {
          await prisma.orderLineItem.create({
            data: {
              orderId,
              shop,
              shopifyLineItemId: String(li.id || Date.now()),
              productId: li.product_id ? String(li.product_id) : null,
              title: li.title || "Product",
              variantTitle: li.variant_title || null,
              quantity: li.quantity || 1,
              unitPrice: parseFloat(String(li.price || 0)),
              originalUnitPrice: parseFloat(String(li.price || 0)),
            },
          });
        } catch (liErr) {
          console.warn(`[FeatureStep] Could not insert line item for order ${orderId}:`, liErr);
        }
      }
    }

    const featureResult = await OrderFeatureService.extractFeatures({ shop, orderId });
    return {
      ...data,
      features: featureResult.features,
      metadata: featureResult.metadata,
    };
  }
}

