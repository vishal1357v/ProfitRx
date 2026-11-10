/**
 * Client- and server-safe auth redirect and iframe breakout utilities.
 *
 * In Shopify embedded apps, the app runs inside an iframe (window.top !== window.self).
 * Standard HTTP 302 redirects cannot escape an iframe and will fail when redirecting
 * to accounts.shopify.com or admin.shopify.com/oauth due to browser security policies
 * (X-Frame-Options: DENY and CSP frame-ancestors).
 */

export function getShopifyInstallUrl(shop: string, apiKey?: string): string {
  const key =
    apiKey ||
    (typeof process !== "undefined" && process.env?.SHOPIFY_API_KEY) ||
    "08f8a7442c2182a3a390f753591c06f3";
  const cleanShop = shop.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const fullShop = cleanShop.includes(".") ? cleanShop : `${cleanShop}.myshopify.com`;
  const storeHandle = fullShop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/oauth/install?client_id=${key}`;
}

export function escapeIframeAndRedirect(destinationUrl: string, shop?: string): Response {
  const key =
    (typeof process !== "undefined" && process.env?.SHOPIFY_API_KEY) ||
    "08f8a7442c2182a3a390f753591c06f3";
  const storeOrigin = shop ? `https://${shop} ` : "";
  const csp = `frame-ancestors ${storeOrigin}https://admin.shopify.com https://*.spin.dev https://admin.myshopify.io https://admin.shop.dev;`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorizing ProfitRx...</title>
  <script data-api-key="${key}" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <script>
    (function() {
      function breakout() {
        var dest = ${JSON.stringify(destinationUrl)};
        // 1. Try Shopify App Bridge v4 open() via postMessage to Shopify Admin parent window
        try {
          if (window.shopify && typeof window.shopify.open === "function") {
            window.shopify.open(dest, "_top");
            return;
          }
        } catch (e) {}

        // 2. Try window.open (intercepted by App Bridge v4 script to perform top-level navigation)
        try {
          if (typeof window.open === "function") {
            window.open(dest, "_top");
            return;
          }
        } catch (e) {}

        // 3. Try window.top location navigation
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.href = dest;
            return;
          }
        } catch (e) {}
      }

      breakout();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", breakout);
      }
    })();
  </script>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0b0f19; color: #f8fafc;">
  <div style="text-align: center; max-width: 440px; padding: 32px; background: #131926; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);">
    <div style="margin-bottom: 16px; font-size: 24px;">🛡️</div>
    <h2 style="font-size: 16px; font-weight: 600; color: #f8fafc; margin: 0 0 8px;">Connecting to Shopify Admin</h2>
    <p style="font-size: 13px; color: #94a3b8; margin: 0 0 20px; line-height: 1.5;">Opening Shopify authentication to verify your store credentials...</p>
    <a href="${destinationUrl}" target="_top" style="display: inline-block; padding: 10px 20px; background: #38bdf8; color: #0b0f19; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 600; transition: background 0.2s;">Continue to Shopify &rarr;</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
    },
  });
}

