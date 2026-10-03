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

      // ── Step 1: Resolve canonical Shop GID via Admin API ──────────────────
      // Use the offline session access token stored in Prisma to query the Shopify Admin API
      const targetShop = url.searchParams.get("shop") || "greek-god-wvwt8ptt.myshopify.com";
      const session = await prisma.session.findFirst({
        where: { shop: targetShop, isOnline: false },
        select: { accessToken: true, shop: true },
      });

      let shopGidResolution: any = { method: null, gid: null, error: null };

      if (session?.accessToken) {
        // Decrypt the encrypted access token
        let plainAccessToken: string | null = null;
        try {
          plainAccessToken = decryptToken(session.accessToken);
        } catch (decryptErr: any) {
          shopGidResolution = {
            method: "DECRYPT_FAILED",
            error: decryptErr.message,
            tokenPrefix: session.accessToken.substring(0, 12) + "...",
          };
        }

        if (plainAccessToken) {
          const versionsToTry = ["2025-01", "2024-10", "2024-07", "2025-04", "2025-07", "2025-10"];
          const adminAttempts: any[] = [];

          for (const ver of versionsToTry) {
            if (shopGidResolution.gid) break;

            // 1. Try GraphQL Admin API
            try {
              const gqlEndpoint = `https://${targetShop}/admin/api/${ver}/graphql.json`;
              const gqlRes = await fetch(gqlEndpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Shopify-Access-Token": plainAccessToken,
                },
                body: JSON.stringify({ query: `{ shop { id name myshopifyDomain } }` }),
              });
              const gqlStatus = gqlRes.status;
              const gqlJson: any = await gqlRes.json();
              adminAttempts.push({
                ver,
                type: "graphql",
                status: gqlStatus,
                shopId: gqlJson?.data?.shop?.id,
                error: gqlJson?.errors,
              });

              if (gqlJson?.data?.shop?.id) {
                shopGidResolution = {
                  method: "ADMIN_API_GRAPHQL",
                  apiVersion: ver,
                  gid: gqlJson.data.shop.id,
                  shopName: gqlJson.data.shop.name,
                  myshopifyDomain: gqlJson.data.shop.myshopifyDomain,
                  adminApiStatus: gqlStatus,
                  adminAttempts,
                };
                break;
              }
            } catch (err: any) {
              adminAttempts.push({ ver, type: "graphql", error: err.message });
            }

            // 2. Try REST Admin API
            if (!shopGidResolution.gid) {
              try {
                const restEndpoint = `https://${targetShop}/admin/api/${ver}/shop.json`;
                const restRes = await fetch(restEndpoint, {
                  method: "GET",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Access-Token": plainAccessToken,
                  },
                });
                const restStatus = restRes.status;
                const restJson: any = await restRes.json();
                adminAttempts.push({
                  ver,
                  type: "rest",
                  status: restStatus,
                  shopId: restJson?.shop?.id,
                  error: restJson?.errors,
                });

                if (restJson?.shop?.id) {
                  const numericId = String(restJson.shop.id);
                  shopGidResolution = {
                    method: "ADMIN_API_REST",
                    apiVersion: ver,
                    gid: `gid://shopify/Shop/${numericId}`,
                    shopName: restJson.shop.name,
                    myshopifyDomain: restJson.shop.myshopify_domain,
                    adminApiStatus: restStatus,
                    adminAttempts,
                  };
                  break;
                }
              } catch (err: any) {
                adminAttempts.push({ ver, type: "rest", error: err.message });
              }
            }
          }

          if (!shopGidResolution.gid) {
            shopGidResolution = {
              method: "ADMIN_API_FAILED_ALL_VERSIONS",
              adminAttempts,
            };
          }
        }
      } else {
        shopGidResolution = {
          method: "NO_SESSION",
          error: `No offline session found for ${targetShop}`,
        };
      }

      // Also introspect Partner API schema for QueryRoot and App fields
      let partnerSchemaInfo: any = null;
      try {
        const schemaRes = await fetch(`https://partners.shopify.com/${orgId}/api/unstable/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": partnerToken,
          },
          body: JSON.stringify({
            query: `
              query Introspect {
                queryRoot: __type(name: "QueryRoot") {
                  fields {
                    name
                    args {
                      name
                    }
                  }
                }
                appType: __type(name: "App") {
                  fields {
                    name
                  }
                }
              }
            `,
          }),
        });
        const schemaJson: any = await schemaRes.json();
        partnerSchemaInfo = {
          queryRootFields: schemaJson?.data?.queryRoot?.fields?.map((f: any) => ({
            name: f.name,
            args: f.args?.map((a: any) => a.name),
          })),
          appFields: schemaJson?.data?.appType?.fields?.map((f: any) => f.name),
        };
      } catch (schemaErr: any) {
        partnerSchemaInfo = { error: schemaErr.message };
      }

      // ── Step 2: Execute activeSubscription with real GID ──────────────────
      let activeSubscriptionResult: any = null;
      const resolvedShopGid = shopGidResolution.gid;

      if (resolvedShopGid) {
        try {
          const subRes = await fetch(`https://partners.shopify.com/${orgId}/api/unstable/graphql.json`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": partnerToken,
            },
            body: JSON.stringify({
              query: PARTNER_ACTIVE_SUBSCRIPTION_QUERY,
              variables: { appId: formattedAppId, shopId: resolvedShopGid },
            }),
          });
          activeSubscriptionResult = await subRes.json();
        } catch (subErr: any) {
          activeSubscriptionResult = { error: subErr.message };
        }
      } else {
        activeSubscriptionResult = { skipped: true, reason: "Shop GID could not be resolved" };
      }

      return {
        envStatus: {
          SHOPIFY_ORGANIZATION_ID: orgId ? "SET ✅" : "MISSING ❌",
          SHOPIFY_PARTNER_API_TOKEN: partnerToken ? "SET ✅" : "MISSING ❌",
          SHOPIFY_APP_ID: appId ? "SET ✅" : "MISSING ❌",
          BYPASS_BILLING: process.env.BYPASS_BILLING || "FALSE",
        },
        formattedAppId,
        targetShop,
        shopGidResolution,
        partnerSchemaInfo,
        activeSubscriptionQuery: {
          appId: formattedAppId,
          shopId: resolvedShopGid || "UNRESOLVED",
          endpoint: `https://partners.shopify.com/${orgId}/api/unstable/graphql.json`,
          result: activeSubscriptionResult,
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
