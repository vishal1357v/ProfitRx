/**
 * /api/health — Lightweight, unauthenticated health-check endpoint.
 *
 * Returns pass/fail booleans for each subsystem without exposing secrets.
 * Use this for uptime monitoring (e.g. UptimeRobot, Vercel Checks).
 *
 * Visit: https://greek-god-saas.vercel.app/api/health
 */
import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const start = Date.now();

  // 1. Environment variables check (booleans only — no values leaked)
  const envOk =
    !!process.env.SHOPIFY_API_KEY &&
    !!process.env.SHOPIFY_API_SECRET &&
    !!process.env.DATABASE_URL &&
    !!process.env.SHOPIFY_APP_URL;

  // 2. Database connectivity (Neon cold-start detection)
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  let sessionCount: number | null = null;
  try {
    const dbStart = Date.now();
    sessionCount = await prisma.session.count();
    dbLatencyMs = Date.now() - dbStart;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  // 3. App URL match check
  const hostHeader =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const incomingOrigin = `${proto}://${hostHeader}`.replace(/\/$/, "");
  const configuredUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const urlMatch = configuredUrl === incomingOrigin;

  const totalMs = Date.now() - start;
  const healthy = envOk && dbOk;

  return Response.json(
    {
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        env: envOk ? "pass" : "fail",
        database: dbOk ? "pass" : "fail",
        urlMatch: urlMatch ? "pass" : "mismatch",
      },
      metrics: {
        dbLatencyMs,
        sessionCount,
        totalMs,
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
