import { redirect, useRouteError } from "react-router";
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
      const status = error.status;
      const location = error.headers?.get("Location") || "";
      const isOAuth =
        location.includes("admin.shopify.com") ||
        location.includes("accounts.shopify.com") ||
        location.includes(".myshopify.com/admin/oauth") ||
        location.includes("/oauth/authorize") ||
        location.includes("/oauth/install");

      if (isOAuth) {
        const url = new URL(request.url);
        const shop = url.searchParams.get("shop") || "";
        const { escapeIframeAndRedirect } = await import("../utils/auth-redirect");
        throw escapeIframeAndRedirect(location, shop);
      }

      throw error;
    }
    console.error("OAuth error:", error);
    return redirect("/");
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export default function AuthCatchAll() {
  return null;
}
