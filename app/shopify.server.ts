import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Startup guard — fail fast if critical env vars are missing
if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET || !process.env.SHOPIFY_APP_URL) {
  throw new Error(
    `[ProfitRx] Missing required environment variables. ` +
    `SHOPIFY_API_KEY=${process.env.SHOPIFY_API_KEY ? 'SET' : 'MISSING'}, ` +
    `SHOPIFY_API_SECRET=${process.env.SHOPIFY_API_SECRET ? 'SET' : 'MISSING'}, ` +
    `SHOPIFY_APP_URL=${process.env.SHOPIFY_APP_URL || 'MISSING'}. ` +
    `Set these in your Vercel Dashboard → Project → Settings → Environment Variables.`
  );
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.April26,
  scopes: process.env.SCOPES?.split(",") || [],
  appUrl: process.env.SHOPIFY_APP_URL!,
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
    "Starter": {
      trialDays: 14,
      lineItems: [
        {
          amount: 1500.0,
          currencyCode: "INR",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    "Growth": {
      trialDays: 14,
      lineItems: [
        {
          amount: 3000.0,
          currencyCode: "INR",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    "Pro": {
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
