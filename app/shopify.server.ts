import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const rawAppUrl = process.env.SHOPIFY_APP_URL || "";
const DEFAULT_APP_URL = rawAppUrl || "https://greek-god-saas.vercel.app";
const DEFAULT_API_KEY = process.env.SHOPIFY_API_KEY || "08f8a7442c2182a3a390f753591c06f3";
const DEFAULT_SCOPES = process.env.SCOPES
  ? process.env.SCOPES.split(",")
  : ["read_products","read_orders","write_orders","read_customers","read_fulfillments","write_metafields","read_metafields","write_payment_customizations"];

const apiSecretKey = process.env.SHOPIFY_API_SECRET || "";

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
  sessionStorage: new PrismaSessionStorage(prisma),
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
        const existingSub = await prisma.subscription.findUnique({ where: { shop: session.shop } });
        if (!existingSub || existingSub.status === "CANCELED") {
           await prisma.subscription.upsert({
             where: { shop: session.shop },
             update: { status: "ACTIVE", plan: existingSub?.plan === "FREE" ? "FREE" : (existingSub?.plan || "FREE") },
             create: { shop: session.shop, plan: "FREE", status: "ACTIVE", orderLimit: 50, ordersUsed: 0 }
           });
        }

        // Trigger background 30-day orders and native COGS sync
        setTimeout(async () => {
          try {
            const { ShopifyService } = await import("./services/shopify.service");
            console.log(`[afterAuth.background] Triggering 30-day sync for ${session.shop}...`);
            await ShopifyService.syncOrdersForShop(session.shop);
            await ShopifyService.syncNativeCOGS(session.shop);
            console.log(`[afterAuth.background] Initial background sync complete for ${session.shop}`);
          } catch (err: any) {
            console.error(`[afterAuth.background] Error syncing shop ${session.shop}:`, err);
          }
        }, 100);
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
          amount: 1500.0,
          currencyCode: "INR",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    "GROWTH": {
      trialDays: 14,
      lineItems: [
        {
          amount: 3000.0,
          currencyCode: "INR",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    "PRO": {
      trialDays: 14,
      lineItems: [
        {
          amount: 6000.0,
          currencyCode: "INR",
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
