import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query GetOrders {
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            totalPriceSet { presentmentMoney { amount } }
            subtotalPriceSet { presentmentMoney { amount } }
            totalTaxSet { presentmentMoney { amount } }
            shippingLine { priceSet { presentmentMoney { amount } } }
            createdAt
            financialStatus
            fulfillmentStatus
          }
        }
      }
    }
  `);

  const data = await response.json();

  return new Response(JSON.stringify({ orders: data.data.orders.edges }), {
    headers: { "Content-Type": "application/json" },
  });
};