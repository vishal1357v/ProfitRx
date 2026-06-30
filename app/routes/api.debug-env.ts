import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  return Response.json({
    SHOPIFY_APP_URL: process.env.SHOOPY_APP_URL || process.env.SHOPIFY_APP_URL || "MISSING",
    SHOPIFY_API_KEY_SET: !!process.env.SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET_SET: !!process.env.SHOPIFY_API_SECRET,
    SCOPES: process.env.SCOPES || "MISSING",
    NODE_ENV: process.env.NODE_ENV || "UNKNOWN",
    headers: {
      host: request.headers.get("host"),
      x_forwarded_host: request.headers.get("x-forwarded-host"),
      x_forwarded_proto: request.headers.get("x-forwarded-proto"),
    }
  });
}
