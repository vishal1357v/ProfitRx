/**
 * /api/diagnose — Unauthenticated endpoint to test every subsystem independently.
 * Visit: https://your-app.vercel.app/api/diagnose
 */
import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

async function testStep(name: string, fn: () => Promise<any>) {
  try {
    const result = await fn();
    return { name, status: "OK", result };
  } catch (err: any) {
    return {
      name,
      status: "FAILED",
      error: err?.message || String(err),
      code: err?.code,
      stack: (err?.stack || "").split("\n").slice(0, 6).join("\n"),
    };
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const secretHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  const secretParam = url.searchParams.get("secret");
  const secret = secretHeader || secretParam;

  // Allow in any environment as long as the caller provides the correct secret.
  // Previously this was fully blocked in production — now you can diagnose live Vercel deployments.
  if (!secret || !process.env.SHOPIFY_API_SECRET || secret !== process.env.SHOPIFY_API_SECRET) {
    return new Response("Not Found", { status: 404 });
  }
  const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const incomingOrigin = `${proto}://${hostHeader}`;
  const configuredAppUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const incomingNormalized = incomingOrigin.replace(/\/$/, "");

  const steps = await Promise.all([
    testStep("env_vars", async () => {
      const apiKey = process.env.SHOPIFY_API_KEY || "";
      const apiSecret = process.env.SHOPIFY_API_SECRET || "";
      const isSecretSameAsKey = apiKey && apiSecret && apiKey === apiSecret;
      const hasAngleBrackets = apiSecret.startsWith("<") || apiSecret.endsWith(">");

      return {
        SHOPIFY_API_KEY: apiKey ? `${apiKey.slice(0, 6)}...` : "MISSING ❌",
        SHOPIFY_API_SECRET: apiSecret
          ? isSecretSameAsKey
            ? "INVALID ❌ (equals API_KEY — copy Client Secret from Partner Dashboard)"
            : hasAngleBrackets
              ? "INVALID ❌ — contains angle brackets < > — remove them in Vercel env vars! Value should be: shpss_xxxx not <shpss_xxxx>"
              : "SET ✅"
          : "MISSING ❌",
        SHOPIFY_APP_URL: configuredAppUrl || "MISSING ❌",
        SCOPES: process.env.SCOPES || "MISSING ❌",
        DATABASE_URL: process.env.DATABASE_URL ? "SET ✅" : "MISSING ❌",
        NODE_ENV: process.env.NODE_ENV,
      };
    }),

    testStep("url_match", async () => {
      const rawAppUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
      const isMatch = rawAppUrl === incomingNormalized;
      return {
        configuredAppUrl: rawAppUrl || "MISSING ❌",
        incomingOrigin,
        match: isMatch ? "MATCH ✅" : `MISMATCH ❌ — SHOPIFY_APP_URL is "${rawAppUrl}" but request came from "${incomingNormalized}"`,
      };
    }),

    testStep("prisma_session_count", async () => {
      const count = await prisma.session.count();
      return {
        sessionCount: count,
        note: count === 0 ? "⚠️ No sessions — OAuth has never completed. Visit /auth/login to re-authorize." : `✅ ${count} session(s) found.`,
      };
    }),

    testStep("prisma_sessions_detail", async () => {
      const sessions = await prisma.session.findMany({
        select: { id: true, shop: true, isOnline: true, expires: true, accessToken: true, scope: true },
        orderBy: { shop: "asc" },
      });
      return sessions.map(s => ({
        shop: s.shop,
        isOnline: s.isOnline,
        hasAccessToken: !!s.accessToken,
        accessTokenPrefix: s.accessToken ? `${s.accessToken.substring(0, 8)}...` : "NONE ❌",
        scope: s.scope || "NONE ❌",
        expires: s.expires ? s.expires.toISOString() : "never",
        expired: s.expires ? s.expires < new Date() : false,
      }));
    }),

    testStep("prisma_store_settings", async () => {
      const count = await prisma.storeSettings.count();
      return { storeSettingsCount: count };
    }),

    testStep("prisma_subscription", async () => {
      const subs = await prisma.subscription.findMany({
        select: { shop: true, plan: true, status: true },
      });
      return subs;
    }),

    testStep("partner_api_live", async () => {
      const orgId = process.env.SHOPIFY_ORGANIZATION_ID || process.env.SHOPIFY_PARTNER_ORGANIZATION_ID;
      const partnerToken = process.env.SHOPIFY_PARTNER_API_TOKEN || process.env.SHOPIFY_PARTNER_TOKEN;
      const appId = process.env.SHOPIFY_APP_ID || process.env.SHOPIFY_API_KEY;
      const bypassBilling = process.env.BYPASS_BILLING;

      const envStatus = {
        SHOPIFY_ORGANIZATION_ID: orgId ? "SET ✅" : "MISSING ❌",
        SHOPIFY_PARTNER_API_TOKEN: partnerToken ? "SET ✅" : "MISSING ❌",
        SHOPIFY_APP_ID: appId ? "SET ✅" : "MISSING ❌",
        BYPASS_BILLING: bypassBilling || "false",
      };

      if (!orgId || !partnerToken || !appId) {
        return { envStatus, error: "Partner API credentials not configured" };
      }

      const formattedAppId = appId.startsWith("gid://") ? appId : `gid://shopify/App/${appId.replace(/\D/g, "")}`;
      const { PARTNER_ACTIVE_SUBSCRIPTION_QUERY } = await import("../services/partner-billing.service");
      const { decryptToken } = await import("../services/token-encryption.server");

      // ── Step 1: Resolve canonical Shop GID ───────────────────────────────
      const targetShop = url.searchParams.get("shop") || "greek-god-wvwt8ptt.myshopify.com";
      let shopGidResolution: any = { method: null, gid: null, numericId: null, error: null };

      // Method 1: Canonical Shopify store meta endpoint
      try {
        const metaRes = await fetch(`https://${targetShop}/meta.json`);
        if (metaRes.ok) {
          const metaJson: any = await metaRes.json();
          if (metaJson?.id) {
            const numericId = String(metaJson.id);
            const canonicalGid = `gid://shopify/Shop/${numericId}`;
            const isValidGid = /^gid:\/\/shopify\/Shop\/\d+$/.test(canonicalGid);

            shopGidResolution = {
              method: "CANONICAL_STORE_META",
              numericId,
              gid: canonicalGid,
              isValidGidFormat: isValidGid,
              shopName: metaJson.name,
              myshopifyDomain: metaJson.myshopify_domain || metaJson.domain,
              currency: metaJson.currency,
              country: metaJson.country,
            };
          }
        }
      } catch (metaErr: any) {
        shopGidResolution.metaError = metaErr.message;
      }

      // Method 2: If meta.json failed, try Admin API with stored session
      if (!shopGidResolution.gid) {
        const session = await prisma.session.findFirst({
          where: { shop: targetShop, isOnline: false },
          select: { accessToken: true, shop: true },
        });

        if (session?.accessToken) {
          try {
            const plainAccessToken = decryptToken(session.accessToken);
            if (plainAccessToken) {
              const adminRes = await fetch(`https://${targetShop}/admin/api/2025-01/shop.json`, {
                headers: { "X-Shopify-Access-Token": plainAccessToken },
              });
              const adminJson: any = await adminRes.json();
              if (adminJson?.shop?.id) {
                const numericId = String(adminJson.shop.id);
                shopGidResolution = {
                  method: "ADMIN_API_REST",
                  numericId,
                  gid: `gid://shopify/Shop/${numericId}`,
                  isValidGidFormat: /^gid:\/\/shopify\/Shop\/\d+$/.test(`gid://shopify/Shop/${numericId}`),
                  shopName: adminJson.shop.name,
                  myshopifyDomain: adminJson.shop.myshopify_domain,
                };
              }
            }
          } catch (e: any) {
            shopGidResolution.adminError = e.message;
          }
        }
      }

      // ── Step 2: Execute activeSubscription with canonical GID ─────────────
      let activeSubscriptionResult: any = null;
      let rawPartnerResponseText: string | null = null;
      let partnerHttpStatus: number | null = null;
      const resolvedShopGid = shopGidResolution.gid;

      const partnerQuery = `
        query ActiveSubscriptionVerification($appId: ID!, $shopId: ID!) {
          app(id: $appId) {
            id
            name
          }
          activeSubscription(appId: $appId, shopId: $shopId) {
            shop {
              id
              myshopifyDomain
            }
            billingPeriod
            cancelAtEndOfCycle
            trialEndsAt
            currentBillingCycle {
              startTime
              endTime
            }
            items {
              handle
              description
              price {
                amount
                currencyCode
              }
            }
            legacySubscriptionId
          }
        }
      `;

      if (resolvedShopGid && orgId && partnerToken) {
        try {
          const endpoint = `https://partners.shopify.com/${orgId}/api/unstable/graphql.json`;
          const subRes = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": partnerToken,
            },
            body: JSON.stringify({
              query: partnerQuery,
              variables: { appId: formattedAppId, shopId: resolvedShopGid },
            }),
          });
          partnerHttpStatus = subRes.status;
          activeSubscriptionResult = await subRes.json();
        } catch (subErr: any) {
          activeSubscriptionResult = { error: subErr.message };
        }
      } else {
        activeSubscriptionResult = {
          skipped: true,
          reason: !resolvedShopGid
            ? "Shop GID could not be resolved"
            : "Partner credentials missing",
        };
      }

      // Analyze partner API response
      const hasGraphqlErrors = !!activeSubscriptionResult?.errors?.length;
      const shopNotFoundError = activeSubscriptionResult?.errors?.some((e: any) =>
        e.message?.toLowerCase().includes("shop not found")
      );
      const activeSubData = activeSubscriptionResult?.data?.activeSubscription;
      const appData = activeSubscriptionResult?.data?.app;

      return {
        envStatus: {
          SHOPIFY_ORGANIZATION_ID: orgId ? "SET ✅" : "MISSING ❌",
          SHOPIFY_PARTNER_API_TOKEN: partnerToken ? "SET ✅" : "MISSING ❌",
          SHOPIFY_APP_ID: appId ? "SET ✅" : "MISSING ❌",
          BYPASS_BILLING: process.env.BYPASS_BILLING || "FALSE",
        },
        formattedAppId,
        targetShop,
        canonicalShopGid: resolvedShopGid,
        shopGidResolution,
        activeSubscriptionProbe: {
          queryVariables: { appId: formattedAppId, shopId: resolvedShopGid },
          endpoint: `https://partners.shopify.com/${orgId}/api/unstable/graphql.json`,
          httpStatus: partnerHttpStatus,
          response: activeSubscriptionResult,
          analysis: {
            appRecognized: !!appData?.id,
            appName: appData?.name || null,
            hasGraphqlErrors,
            shopNotFoundError: !!shopNotFoundError,
            activeSubscriptionPresent: activeSubData !== null && activeSubData !== undefined,
            activeSubscriptionValue: activeSubData ?? null,
            verdict: shopNotFoundError
              ? "FAIL: Shop not found by Partner API"
              : activeSubData === null
              ? "CONFIRMED: Shop exists in Partner API; activeSubscription is NULL because App Pricing is not enabled yet or no active subscription exists."
              : "SUCCESS: Active App Pricing subscription discovered!",
          },
        },
      };
    }),
  ]);

  const allOk = steps.every(s => s.status === "OK");

  return Response.json({
    overall: allOk ? "✅ ALL SYSTEMS HEALTHY" : "❌ ISSUES DETECTED — see steps below",
    timestamp: new Date().toISOString(),
    steps,
    recovery: {
      reauth: `${configuredAppUrl}/auth/login`,
      debugEnv: `${configuredAppUrl}/api/debug-env`,
    },
  }, { status: 200 });
}
