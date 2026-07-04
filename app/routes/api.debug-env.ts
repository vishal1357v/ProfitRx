import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  let dbStatus = "UNKNOWN";
  let sessionCount = 0;
  let storeSettingsCount = 0;
  let sessions: any[] = [];
  let dbError = null;

  try {
    sessionCount = await prisma.session.count();
    storeSettingsCount = await prisma.storeSettings.count();
    const rawSessions = await prisma.session.findMany({ select: { id: true, shop: true, expires: true, isOnline: true } });
    sessions = rawSessions.map(s => ({ id: s.id, shop: s.shop, isOnline: s.isOnline, expires: s.expires }));
    dbStatus = "CONNECTED";
  } catch (err: any) {
    dbStatus = "FAILED";
    dbError = err.message || String(err);
  }

  const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const protoHeader = request.headers.get("x-forwarded-proto") || "https";
  const incomingOrigin = hostHeader ? `${protoHeader}://${hostHeader}` : "";
  const configuredAppUrl = process.env.SHOPIFY_APP_URL || "";
  const apiKey = process.env.SHOPIFY_API_KEY || "";

  const isUrlMatch = configuredAppUrl.replace(/\/$/, "") === incomingOrigin.replace(/\/$/, "");

  return Response.json({
    status: dbStatus === "CONNECTED" ? "HEALTHY" : "DEGRADED",
    database: {
      status: dbStatus,
      sessionCount,
      storeSettingsCount,
      activeShops: sessions.map(s => s.shop),
      sessions,
      error: dbError,
    },
    environment: {
      SHOPIFY_APP_URL: configuredAppUrl,
      SHOPIFY_API_KEY_PREFIX: apiKey ? `${apiKey.substring(0, 6)}...` : "MISSING",
      SHOPIFY_API_KEY_SET: !!process.env.SHOPIFY_API_KEY,
      SHOPIFY_API_SECRET_SET: !!process.env.SHOPIFY_API_SECRET,
      SCOPES: process.env.SCOPES || "MISSING",
      NODE_ENV: process.env.NODE_ENV || "UNKNOWN",
    },
    requestHeaders: {
      incomingOrigin,
      hostHeader,
      protoHeader,
      isUrlMatch,
    },
  });
}
