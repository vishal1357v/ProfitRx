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
  const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const incomingOrigin = `${proto}://${hostHeader}`;
  const configuredAppUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const incomingNormalized = incomingOrigin.replace(/\/$/, "");

  const steps = await Promise.all([
    testStep("env_vars", async () => ({
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY ? `${process.env.SHOPIFY_API_KEY.slice(0, 6)}...` : "MISSING ❌",
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET ? "SET ✅" : "MISSING ❌",
      SHOPIFY_APP_URL: configuredAppUrl || "MISSING ❌",
      SCOPES: process.env.SCOPES || "MISSING ❌",
      DATABASE_URL: process.env.DATABASE_URL ? "SET ✅" : "MISSING ❌",
      NODE_ENV: process.env.NODE_ENV,
    })),

    testStep("url_match", async () => ({
      configuredAppUrl,
      incomingOrigin,
      match: configuredAppUrl === incomingNormalized ? "MATCH ✅" : `MISMATCH ❌ — fix SHOPIFY_APP_URL in Vercel env vars to equal "${incomingNormalized}"`,
    })),

    testStep("prisma_session_count", async () => {
      const count = await prisma.session.count();
      return {
        sessionCount: count,
        note: count === 0 ? "⚠️ No sessions — OAuth has never completed. Visit /auth/login to re-authorize." : `✅ ${count} session(s) found.`,
      };
    }),

    testStep("prisma_sessions_detail", async () => {
      const sessions = await prisma.session.findMany({
        select: { id: true, shop: true, isOnline: true, expires: true },
        orderBy: { shop: "asc" },
      });
      return sessions.map(s => ({
        shop: s.shop,
        isOnline: s.isOnline,
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
