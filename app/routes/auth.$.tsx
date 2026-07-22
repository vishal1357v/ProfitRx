import { redirect } from "react-router";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);

    const url = new URL(request.url);
    const host = url.searchParams.get("host") || "";
    const shop = url.searchParams.get("shop") || session?.shop || "";

    // Force redirect to dashboard with host and shop
    return redirect(`/app/dashboard?host=${encodeURIComponent(host)}&shop=${encodeURIComponent(shop)}`);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("OAuth error:", error);
    return redirect("/");
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
