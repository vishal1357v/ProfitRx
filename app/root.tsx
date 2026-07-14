import { Links, Meta, Outlet, Scripts, useLoaderData } from "react-router";
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