import { Links, Meta, Outlet, Scripts, useLoaderData, useRouteError, isRouteErrorResponse } from "react-router";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import translations from "@shopify/polaris/locales/en.json";
import { getGlobalStyles } from "./styles.server";

export const links = () => [
  { rel: "preconnect", href: "https://cdn.shopify.com/" },
  { rel: "stylesheet", href: polarisStyles },
];

// Allow the shell to be cached by Shopify's edge CDN for 60s, reducing TTFB
export const headers: HeadersFunction = () => ({
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return { globalStyles: getGlobalStyles() };
};

export default function App() {
  const { globalStyles } = useLoaderData<typeof loader>() || { globalStyles: "" };

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body>
        <AppProvider i18n={translations}>
          <Outlet />
        </AppProvider>
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && typeof error.data === "string" && (error.data.includes("<script") || error.data.includes("app-bridge"))) {
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
        </head>
        <body>
          <div dangerouslySetInnerHTML={{ __html: error.data }} />
          <Scripts />
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "40px 20px", background: "#f6f6f7" }}>
        <div style={{ maxWidth: "600px", margin: "40px auto", padding: "24px", background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: "18px", color: "#d72c0d", marginBottom: "8px" }}>Connection Interrupted</h2>
          <p style={{ color: "#6d7175", fontSize: "14px", marginBottom: "16px" }}>The session could not be completed. Please reload or reopen ProfitRx in Shopify Admin.</p>
          <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", background: "#008060", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}>
            Reload Page
          </button>
        </div>
        <Scripts />
      </body>
    </html>
  );
}