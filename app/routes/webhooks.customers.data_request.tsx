import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(`GDPR Customer Data Request Payload:`, JSON.stringify(payload));

  // Handle customer data request (Shopify sends customer details and expects 200 OK)
  return new Response("Webhook received successfully", { status: 200 });
};
