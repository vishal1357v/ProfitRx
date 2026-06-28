import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect: shopifyRedirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  
  const shop = url.searchParams.get("shop") || session.shop;
  const host = url.searchParams.get("host") || "";

  const searchParams = new URLSearchParams();
  if (shop) searchParams.set("shop", shop);
  if (host) searchParams.set("host", host);

  return shopifyRedirect(`/app/dashboard?${searchParams.toString()}`);
};

export default function AppIndex() {
  return null;
}
