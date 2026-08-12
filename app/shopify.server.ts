import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-react-router/server";
import prisma from "./db.server";
import { EncryptedPrismaSessionStorage } from "./services/encrypted-session-storage.server";
import { SubscriptionSyncService } from "./services/subscription-sync.service";


const rawAppUrl = (process.env.SHOPIFY_APP_URL || "").trim().replace(/\/$/, "");
const DEFAULT_APP_URL = rawAppUrl || "https://greek-god-saas.vercel.app";
const DEFAULT_API_KEY = (process.env.SHOPIFY_API_KEY || "").trim();
const DEFAULT_SCOPES = process.env.SCOPES
  ? process.env.SCOPES.split(",").map((s) => s.trim())
  : ["read_products","read_orders","write_orders","read_customers","read_fulfillments","write_metafields","read_metafields","write_payment_customizations"];

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
  future: {},
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
  billing: {
    "STARTER": {
      trialDays: 14,
      lineItems: [
        {
          amount: 19.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    "GROWTH": {
      trialDays: 14,
      lineItems: [
        {
          amount: 39.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    "PRO": {
      trialDays: 14,
      lineItems: [
        {
          amount: 79.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
