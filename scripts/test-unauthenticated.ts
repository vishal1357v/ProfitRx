import { unauthenticated } from "../app/shopify.server";

async function testUnauthenticated() {
  const shop = "greek-god-wvwt8ptt.myshopify.com";
  console.log("Testing unauthenticated.admin for shop:", shop);
  try {
    const { admin, session } = await unauthenticated.admin(shop);
    console.log("Session loaded successfully! Shop:", session.shop, "Scope:", session.scope);
    const shopQuery = `#graphql
      query {
        shop {
          name
          myshopifyDomain
        }
      }
    `;
    const res = await admin.graphql(shopQuery);
    const data = await res.json();
    console.log("Shopify Admin GraphQL response:", data);
  } catch (err) {
    console.error("Error in unauthenticated.admin:", err);
  }
}

testUnauthenticated();
