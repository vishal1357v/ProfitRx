import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import prisma from "./db.server";
import { EncryptedPrismaSessionStorage } from "./services/encrypted-session-storage.server";
import { SubscriptionSyncService } from "./services/subscription-sync.service";


const rawAppUrl = (process.env.SHOPIFY_APP_URL || "").trim().replace(/\/$/, "");
const DEFAULT_APP_URL = rawAppUrl || "https://greek-god-saas.vercel.app";
const DEFAULT_API_KEY = (process.env.SHOPIFY_API_KEY || "").trim();
const DEFAULT_SCOPES = process.env.SCOPES
  ? process.env.SCOPES.split(",").map((s) => s.trim())
  : ["read_products","write_products","read_orders","write_orders","read_customers","read_fulfillments","read_inventory","write_payment_customizations"];

let apiSecretKey = (process.env.SHOPIFY_API_SECRET || "").trim();
if (apiSecretKey.startsWith("<") && apiSecretKey.endsWith(">")) {
  apiSecretKey = apiSecretKey.slice(1, -1).trim();
}

if (!DEFAULT_API_KEY && process.env.NODE_ENV === "production") {
  console.error("[ProfitRx Critical Error] SHOPIFY_API_KEY is missing from environment variables.");
}

const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
if (!tokenKey) {
  console.error("[ProfitRx Critical Error] TOKEN_ENCRYPTION_KEY is missing from environment variables.");
  if (process.env.NODE_ENV === "production") process.exit(1);
} else {
  try {
    const keyBuffer = Buffer.from(tokenKey, "base64");
    if (keyBuffer.length !== 32) {
      console.error("[ProfitRx Critical Error] TOKEN_ENCRYPTION_KEY must be a 32-byte base64 string.");
      if (process.env.NODE_ENV === "production") process.exit(1);
    }
  } catch (err) {
    console.error("[ProfitRx Critical Error] TOKEN_ENCRYPTION_KEY is not a valid base64 string.");
    if (process.env.NODE_ENV === "production") process.exit(1);
  }
}

if (!apiSecretKey && process.env.NODE_ENV === "production") {
  console.error("[ProfitRx Critical Error] SHOPIFY_API_SECRET is missing from environment variables. Copy Client Secret from Shopify Partner Dashboard -> App setup -> Client credentials.");
}

const shopify = shopifyApp({
  apiKey: DEFAULT_API_KEY,
  apiSecretKey: apiSecretKey || "MISSING_SECRET_KEY_CHECK_VERCEL_ENV",
  apiVersion: ApiVersion.April26,
  scopes: DEFAULT_SCOPES,
  appUrl: DEFAULT_APP_URL,
  authPathPrefix: "/auth",
  sessionStorage: new EncryptedPrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      console.log(`[afterAuth] Seeding default StoreSettings and starting 30-day background sync for ${session.shop}`);

      try {
        // Auto-inject sensible default StoreSettings into Prisma
        await prisma.storeSettings.upsert({
          where: { shop: session.shop },
          update: {
            rtoThreshold: 30,
            defaultCODHandling: 50,
            defaultForwardShipping: 60,
            defaultReturnShipping: 70,
            defaultPackaging: 10,
            defaultGatewayFeePct: 2,
          },
          create: {
            shop: session.shop,
            rtoThreshold: 30,
            defaultCODHandling: 50,
            defaultForwardShipping: 60,
            defaultReturnShipping: 70,
            defaultPackaging: 10,
            defaultGatewayFeePct: 2,
            defaultCOGSPct: 40,
          },
        });

        // Re-activate canceled subscriptions upon reinstall to prevent lockout
        await SubscriptionSyncService.handleAfterAuth(session.shop);

        // Cancel any pending GDPR shop redactions for reinstalled shop (prevents reinstall race conditions)
        try {
          await (prisma as any).shopRedactionRequest.updateMany({
            where: { shop: session.shop, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
            data: {
              status: "CANCELLED_REINSTALLED",
              lastError: `Shop reinstalled on ${new Date().toISOString()}`,
              updatedAt: new Date(),
            },
          });
        } catch (redactCancelErr) {
          console.warn(`[afterAuth] Could not update shopRedactionRequest for ${session.shop}:`, redactCancelErr);
        }

        // Trigger initial orders and native COGS sync for shop synchronously so Vercel does not terminate task
        try {
          const { ShopifyService } = await import("./services/shopify.service");
          console.log(`[afterAuth] Triggering initial sync for ${session.shop}...`);
          await ShopifyService.syncOrdersForShop(session.shop);
          await ShopifyService.syncNativeCOGS(session.shop);
          console.log(`[afterAuth] Initial sync complete for ${session.shop}`);
        } catch (err: any) {
          console.error(`[afterAuth] Error syncing shop ${session.shop}:`, err);
        }
      } catch (err: any) {
        console.error(`[afterAuth] Error in afterAuth hook:`, err);
      }
    },
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;

/**
 * Normalizes requests arriving from Shopify Admin inside an iframe.
 *
 * In Shopify App Bridge v4, the embedded app runs within an iframe.
 * If embedded=1 is missing from the query string (e.g. initial navigation from
 * Shopify Admin menu links or direct sub-route visits), Shopify's SDK will attempt
 * a 302 redirect to admin.shopify.com.
 * Inside an iframe, that redirect cascades to accounts.shopify.com, which sets
 * X-Frame-Options: DENY and crashes the UI with "accounts.shopify.com refused to connect".
 *
 * This function ensures embedded=1 and host are always set whenever the request
 * is detected to come from Shopify Admin.
 */
export function normalizeShopifyRequest(request: Request): Request {
  const url = new URL(request.url);
  let modified = false;

  const shop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "";
  let host = url.searchParams.get("host") || "";

  // If host is missing but shop is known, synthesize the base64 host
  if (!host && shop) {
    const storeHandle = shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
    url.searchParams.set("host", host);
    modified = true;
  }

  // Detect embedded context:
  // 1. Host param or shop param is present
  // 2. Sec-Fetch-Dest header is "iframe"
  // 3. Referer is admin.shopify.com or myshopify.com
  const isEmbedded =
    Boolean(host) ||
    Boolean(shop) ||
    request.headers.get("sec-fetch-dest") === "iframe" ||
    (request.headers.get("referer") || "").includes("admin.shopify.com");

  if (isEmbedded && url.searchParams.get("embedded") !== "1") {
    url.searchParams.set("embedded", "1");
    modified = true;
  }

  if (shop && !url.searchParams.has("shop")) {
    url.searchParams.set("shop", shop);
    modified = true;
  }

  return modified ? new Request(url.toString(), request) : request;
}

const rawAuthenticateAdmin = shopify.authenticate.admin;

const wrappedAuthenticateAdmin = (async (request: Request) => {
  const normalizedRequest = normalizeShopifyRequest(request);
  try {
    return await rawAuthenticateAdmin(normalizedRequest);
  } catch (err: any) {
    if (err instanceof Response) {
      const status = err.status;
      const location = err.headers.get("Location") || "";

      // Intercept 302 redirects to admin.shopify.com or accounts.shopify.com inside embedded iframes.
      // A raw 302 inside an iframe will hit X-Frame-Options: DENY on accounts.shopify.com and crash.
      if (
        status >= 300 &&
        status < 400 &&
        (location.includes("admin.shopify.com") || location.includes("accounts.shopify.com"))
      ) {
        const url = new URL(request.url);
        const shop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "";
        console.warn(`[shopify.server.ts] Intercepted 3xx redirect to ${location} inside embedded iframe. Escaping iframe.`);
        const { escapeIframeAndRedirect } = await import("./utils/auth-redirect");
        throw escapeIframeAndRedirect(location, shop);
      }
    }
    throw err;
  }
}) as typeof shopify.authenticate.admin;

export const authenticate = {
  ...shopify.authenticate,
  admin: wrappedAuthenticateAdmin,
};
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
