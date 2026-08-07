import { OrderFeatureService } from "../app/services/order-features/order-feature.service";
import prisma from "../app/db.server";

async function main() {
  const shop = "greek-god-wvwt8ptt.myshopify.com";
  
  // Get any order
  const order = await prisma.order.findFirst({
    where: { shop }
  });

  if (!order) {
    console.log("No orders found for shop: " + shop);
    return;
  }

  const result = await OrderFeatureService.extractFeatures({
    shop,
    orderId: order.id
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
