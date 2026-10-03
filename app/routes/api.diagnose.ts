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
      const appHandle = process.env.SHOPIFY_APP_HANDLE;
      const bypassBilling = process.env.BYPASS_BILLING;

      const envStatus = {
        SHOPIFY_ORGANIZATION_ID: orgId ? "SET ✅" : "MISSING ❌",
        SHOPIFY_PARTNER_API_TOKEN: partnerToken ? "SET ✅" : "MISSING ❌",
        SHOPIFY_APP_ID: appId ? "SET ✅" : "MISSING ❌",
        SHOPIFY_APP_HANDLE: appHandle || "DEFAULT (profitrx-rto-profit)",
        BYPASS_BILLING: bypassBilling || "false",
      };

      if (!orgId || !partnerToken || !appId) {
        return {
          envStatus,
          queryStatus: "SKIPPED_CREDENTIALS_MISSING",
          error: "Partner API organization ID, token, or app ID not configured in environment",
        };
      }

      // Live query test with Shopify Partner API
      const endpoint = `https://partners.shopify.com/${orgId}/api/2026-04/graphql.json`;
      const testShopId = url.searchParams.get("testShopId") || "gid://shopify/Shop/1";
      const formattedAppId = appId.startsWith("gid://") ? appId : `gid://shopify/App/${appId.replace(/\D/g, "")}`;
      const formattedShopId = testShopId.startsWith("gid://") ? testShopId : `gid://shopify/Shop/${testShopId.replace(/\D/g, "")}`;

      const { PARTNER_ACTIVE_SUBSCRIPTION_QUERY } = await import("../services/partner-billing.service");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": partnerToken,
        },
        body: JSON.stringify({
          query: PARTNER_ACTIVE_SUBSCRIPTION_QUERY,
          variables: { appId: formattedAppId, shopId: formattedShopId },
        }),
      });

      const responseStatus = res.status;
      const responseText = await res.text();
      let responseJson: any = null;
      try {
        responseJson = JSON.parse(responseText);
      } catch {}

      // Also run introspection on queryType fields to see available schema
      let introspectionFields: string[] = [];
      let appFields: string[] = [];
      let appQueryArgs: any[] = [];
      try {
        const introRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": partnerToken,
          },
          body: JSON.stringify({
            query: `
              query IntrospectApp {
                __type(name: "App") {
                  fields {
                    name
                    type {
                      name
                      kind
                      ofType { name kind }
                    }
                  }
                }
                __schema {
                  queryType {
                    fields {
                      name
                      args {
                        name
                        type { name kind ofType { name kind } }
                      }
                    }
                  }
                }
              }
            `,
          }),
        });
        const introJson: any = await introRes.json();
        const appType = introJson?.data?.__type;
        if (appType?.fields) {
          appFields = appType.fields.map((f: any) => `${f.name}: ${f.type?.name || f.type?.ofType?.name || f.type?.kind}`);
        }
        const qFields = introJson?.data?.__schema?.queryType?.fields;
        if (qFields) {
          const appQ = qFields.find((f: any) => f.name === "app");
          if (appQ) {
            appQueryArgs = appQ.args;
          }
          introspectionFields = qFields.map((f: any) => f.name);
        }
      } catch (err: any) {
        introspectionFields = [`Introspection failed: ${err.message}`];
      }

      return {
        envStatus,
        endpoint,
        formattedAppId,
        formattedShopId,
        httpStatus: responseStatus,
        response: responseJson || responseText,
        availableQueries: introspectionFields,
        appQueryArgs,
        appFields,
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
