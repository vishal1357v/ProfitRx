import { unauthenticated } from "../app/shopify.server";
import { ShopifyService } from "../app/services/shopify.service";

async function debugErrors() {
  const shop = "greek-god-wvwt8ptt.myshopify.com";
  try {
    const { admin } = await unauthenticated.admin(shop);
    console.log("Calling getOrders...");
    const orders = await ShopifyService.getOrders(admin, 10, shop);
    console.log("getOrders returned:", orders.length, "orders");
  } catch (err: any) {
    console.error("DEBUG CATCH ERR:", err.message);
    if (err.graphQLErrors) console.error("DEBUG graphQLErrors:", JSON.stringify(err.graphQLErrors, null, 2));
    if (err.response) {
      try {
        const text = await err.response.text();
        console.error("DEBUG response text:", text);
      } catch {}
    }
  }
}

debugErrors();
