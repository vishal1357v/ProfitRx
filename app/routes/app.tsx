import { useState, useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, redirect, useLocation, useNavigation, Link as ReactRouterLink, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider, Banner, Page, Layout, BlockStack, InlineStack, Text, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

function RemixLink({ url, children, external, ...props }: any) {
  if (external || !url || /^https?:\/\//.test(url)) {
    return (
      <a href={url} target="_top" {...props}>
        {children}
      </a>
    );
  }
  return (
    <ReactRouterLink to={url} {...props}>
      {children}
    </ReactRouterLink>
  );
}

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getFeatureList, getSubscription } from "../services/feature-access.service";
import { syncSubscriptionWithShopify } from "../services/subscription-sync.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // ── Step 1: Authenticate with Shopify ─────────────────────────────────────
  // IMPORTANT: Do NOT wrap authenticate.admin in a try/catch that swallows its
  // redirect Response. The Shopify SDK throws a special Response with ExitIframe
  // headers when OAuth is needed inside an embedded app. If we intercept it and
  // return a plain redirect(), the browser blocks it (cross-origin iframe policy).
  // We must let the SDK's Response propagate so App Bridge can escape the iframe.
  let authResult: Awaited<ReturnType<typeof authenticate.admin>>;
  try {
    authResult = await authenticate.admin(request);
  } catch (authErr: any) {
    // Always re-throw Response objects — these are intentional SDK redirects
    // (ExitIframe, OAuth, etc.) and must reach the browser untouched.
    if (authErr instanceof Response) {
      throw authErr;
    }

    // For non-Response errors (e.g. "Unexpected Server Error" from wrong API secret),
    // DO NOT delete the session — that makes things worse. Just redirect to re-auth.
    console.error("[app.tsx authenticate.admin error]:", authErr?.message || authErr);

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "";
    const host = url.searchParams.get("host") || "";

    throw redirect(`/auth/login?shop=${shop}&host=${host}`);
  }

  const { billing, session, redirect: shopifyRedirect } = authResult;
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";

  // ── Step 2: Sync billing ────────────────────────────────────────────────────
  let localSub: { plan: string; status: string; orderLimit: number | null; ordersUsed: number };
  try {
    localSub = await syncSubscriptionWithShopify(session.shop, billing);
  } catch (syncErr: any) {
    console.error("[app.tsx syncSubscriptionWithShopify FAILED]:", syncErr);
    // Default to FREE so the app can still render
    localSub = { plan: "FREE", status: "ACTIVE", orderLimit: 50, ordersUsed: 0 };
  }

  const isBypass = process.env.BYPASS_BILLING === "true";
  const isFreePlan = localSub.plan === "FREE" || isBypass;

  // ── Step 3: Require billing for paid plans ─────────────────────────────────
  if (!isFreePlan && !url.pathname.includes("/app/pricing")) {
    try {
      await billing.require({
        plans: ["STARTER", "GROWTH", "PRO", "Starter", "Growth", "Pro"] as any,
        isTest: true,
        onFailure: async () => {
          return shopifyRedirect(`/app/pricing?shop=${session.shop}&host=${host}`);
        },
      });
    } catch (err) {
      if (err instanceof Response || (err && typeof err === "object" && "status" in err)) {
        throw err;
      }
      console.error("[app.tsx billing.require Error]:", err);
    }
  }

  // ── Step 4: Load features ─────────────────────────────────────────────────
  let features: string[] = [];
  try {
    features = await getFeatureList(session.shop);
  } catch (featErr: any) {
    console.error("[app.tsx getFeatureList FAILED]:", featErr);
  }

  const billingStatus = localSub.status || "ACTIVE";

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    host,
    features,
    plan: localSub.plan,
    billingStatus,
  };
};

const NAV_ITEMS = [
  { label: "Dashboard", url: "/app/dashboard", icon: "📊" },
  { label: "COGS Catalog", url: "/app/cogs", icon: "📦" },
  { label: "COD Risk Shield", url: "/app/cod-rules", icon: "🛡️", badge: "India" },
  { label: "COD Analytics", url: "/app/cod-dashboard", icon: "⚡" },
  { label: "RTO Analytics", url: "/app/rto", icon: "🚚", feature: "basic_rto" },
  { label: "Pincode Heatmap", url: "/app/rto-heatmap", icon: "🗺️", feature: "rto_heatmap", badge: "Pro" },
  { label: "Profit Leaks", url: "/app/profit-leaks", icon: "🔍", feature: "basic_insights" },
  { label: "Customer LTV", url: "/app/customers", icon: "👥", feature: "ltv_cohort", badge: "Pro" },
  { label: "Ad Spend Sync", url: "/app/roas", icon: "📈", feature: "blended_roas", badge: "Pro" },
  { label: "Alerts", url: "/app/alerts", icon: "🔔", feature: "basic_alerts" },
  { label: "Store Health", url: "/app/health", icon: "❤️" },
  { label: "Plans & Billing", url: "/app/pricing", icon: "💎" },
  { label: "Settings", url: "/app/settings", icon: "⚙️" },
];

export default function App() {
  const { apiKey, shop, host, features = [], billingStatus } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isNavigating = navigation.state !== "idle";

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const isDunningActive = ["FROZEN", "DECLINED", "FAILED", "CANCELED"].includes((billingStatus || "").toUpperCase());

  return (
    <AppProvider apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations} linkComponent={RemixLink}>
        {/* Top Dunning Banner for RBI Mandate Failures — Simple Warning */}
        {isDunningActive && (
          <div style={{ padding: "12px 20px" }}>
            <Banner tone="warning" title="⚠️ Payment Action Required — RBI Mandate Notice">
              <p style={{ margin: 0, fontSize: "13px" }}>
                Shopify was unable to process your subscription payment. Under RBI regulations for Indian cards and UPI mandates, please update your payment method or approve the mandate in your bank app to keep ProfitRx active.
              </p>
              <div style={{ marginTop: "8px" }}>
                <Button url={`/app/pricing?shop=${shop}&host=${host}`} variant="secondary" size="micro">
                  Update Payment Method →
                </Button>
              </div>
            </Banner>
          </div>
        )}

        <div className="gg-app-container">
          {/* Top Bar for Mobile Toggle */}
          <div className="gg-topbar-mobile">
            <button
              className="gg-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? "✕" : "☰ Menu"}
            </button>
            <div className="gg-mobile-brand">
              <span className="gg-logo-icon">⚡</span>
              <span className="gg-logo-text">ProfitRx</span>
            </div>
          </div>

          {/* Navigation Sidebar */}
          <nav className={`gg-sidebar ${mobileMenuOpen ? "gg-sidebar-open" : ""}`}>
            <div className="gg-sidebar-brand">
              <div className="gg-brand-content">
                <span className="gg-logo-icon">⚡</span>
                <span className="gg-logo-text">ProfitRx</span>
              </div>
              <span className="gg-badge-moat">India COD</span>
            </div>

            <div className="gg-nav-list">
              {NAV_ITEMS.filter((item) => !item.feature || features.includes(item.feature)).map((item) => {
                const isActive = location.pathname === item.url || (item.url !== "/app/dashboard" && location.pathname.startsWith(item.url));
                const fullUrl = `${item.url}?shop=${shop}&host=${host}`;

                return (
                  <ReactRouterLink
                    key={item.url}
                    to={fullUrl}
                    className={`gg-nav-item ${isActive ? "active" : ""}`}
                  >
                    <span className="gg-nav-icon">{item.icon}</span>
                    <span className="gg-nav-label">{item.label}</span>
                    {item.badge && (
                      <span className={`gg-nav-badge ${item.badge === "Pro" ? "pro" : "india"}`}>
                        {item.badge}
                      </span>
                    )}
                  </ReactRouterLink>
                );
              })}
            </div>

            <div className="gg-sidebar-footer">
              <div className="gg-store-pill">
                <span className="gg-store-dot" />
                <span className="gg-store-name" title={shop}>
                  {shop.replace(".myshopify.com", "")}
                </span>
              </div>
            </div>
          </nav>

          {/* Main Content Area */}
          <main className="gg-main-content">
            {isNavigating ? (
              <div className="gg-skeleton-container">
                <div className="skeleton-header skeleton-pulse" />
                <div className="skeleton-grid">
                  <div className="skeleton-pulse skeleton-card" />
                  <div className="skeleton-pulse skeleton-card" />
                  <div className="skeleton-pulse skeleton-card" />
                </div>
                <div className="skeleton-pulse skeleton-chart" style={{ marginBottom: 16 }} />
                <div className="skeleton-row" style={{ flexDirection: "column", gap: 10 }}>
                  <div className="skeleton-pulse skeleton-line" style={{ width: "100%" }} />
                  <div className="skeleton-pulse skeleton-line" style={{ width: "90%" }} />
                  <div className="skeleton-pulse skeleton-line" style={{ width: "80%" }} />
                  <div className="skeleton-pulse skeleton-line" style={{ width: "75%" }} />
                </div>
              </div>
            ) : (
              <div className="gg-page-enter">
                <Outlet />
              </div>
            )}
          </main>
        </div>
      </PolarisProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();

  console.error("[Greek God SaaS Error Diagnostic]:", error);

  let errorTitle = "Runtime Exception";
  let errorKind = "Unknown";
  let statusCode = 500;
  let statusText = "Internal Server Error";
  let detailsText = "";
  let isUnexpectedServerError = false;

  if (isRouteErrorResponse(error)) {
    errorKind = "RouteErrorResponse (Shopify Server Response)";
    statusCode = error.status;
    statusText = error.statusText || "Route Error";
    errorTitle = `HTTP ${error.status}: ${statusText}`;
    if (typeof error.data === "string") {
      detailsText = error.data;
    } else if (error.data) {
      detailsText = JSON.stringify(error.data, null, 2);
    } else {
      detailsText = `Route error response returned with HTTP ${error.status} status.`;
    }

    if (error.statusText === "Unexpected Server Error" || error.data === "Unexpected Server Error" || error.status === 500) {
      isUnexpectedServerError = true;
    }
  } else if (error instanceof Error) {
    errorKind = error.name || "JavaScript Runtime Error";
    statusCode = 500;
    statusText = error.message || "Error";
    errorTitle = `${error.name || "Error"}: ${error.message}`;
    detailsText = error.stack || error.message;

    if (error.message.includes("Unexpected Server Error")) {
      isUnexpectedServerError = true;
    }
  } else if (typeof error === "object" && error !== null) {
    errorKind = "Object Exception";
    errorTitle = "Uncaught Exception Object";
    try {
      detailsText = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
    } catch {
      detailsText = String(error);
    }
  } else {
    errorKind = typeof error;
    errorTitle = String(error);
    detailsText = String(error);
  }

  return (
    <PolarisProvider i18n={enTranslations}>
      <div style={{ padding: "40px 20px", maxWidth: "900px", margin: "0 auto" }}>
        <Page title="Greek God SaaS — Diagnostic & Recovery Portal">
          <Layout>
            <Layout.Section>
              <Banner tone="critical" title={`🚨 ${errorTitle}`}>
                <BlockStack gap="400">
                  <Text variant="bodyMd" as="p">
                    Greek God SaaS captured an exception while executing <code>{location.pathname}</code>:
                  </Text>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "rgba(15, 23, 42, 0.7)", padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div>
                      <Text variant="bodyXs" as="p" tone="subdued">ERROR CLASSIFICATION</Text>
                      <div style={{ color: "#38bdf8", fontWeight: "bold" }}>
                        <Text variant="bodySm" as="p">{errorKind}</Text>
                      </div>
                    </div>
                    <div>
                      <Text variant="bodyXs" as="p" tone="subdued">HTTP / SYSTEM STATUS</Text>
                      <div style={{ color: "#f43f5e", fontWeight: "bold" }}>
                        <Text variant="bodySm" as="p">{`${statusCode} ${statusText}`}</Text>
                      </div>
                    </div>
                  </div>

                  {isUnexpectedServerError && (
                    <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "14px 16px", borderRadius: "8px" }}>
                      <div style={{ color: "#f59e0b", marginBottom: "6px", fontWeight: "bold" }}>
                        <Text variant="headingSm" as="h3">
                          🔑 Diagnostic Insight: Shopify Session Validation Failure
                        </Text>
                      </div>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Shopify App SDK threw <code>Unexpected Server Error</code> when validating your store session token. This happens when:
                      </Text>
                      <ul style={{ paddingLeft: "20px", marginTop: "6px", fontSize: "13px", color: "#cbd5e1" }}>
                        <li><strong>1. Missing / Stale Session:</strong> The PostgreSQL <code>Session</code> table does not have an active OAuth token for your shop.</li>
                        <li><strong>2. Client Secret Mismatch:</strong> <code>SHOPIFY_API_SECRET</code> in <code>.env</code> / Vercel does not match your app secret in Shopify Partner Dashboard.</li>
                        <li><strong>3. Domain Mismatch:</strong> <code>SHOPIFY_APP_URL</code> in <code>.env</code> does not match the active host URL.</li>
                      </ul>
                    </div>
                  )}

                  <div>
                    <div style={{ marginBottom: "4px" }}>
                      <Text variant="bodyXs" as="p" tone="subdued">RAW DIAGNOSTIC PAYLOAD & STACK TRACE:</Text>
                    </div>
                    <pre style={{ background: "#090d16", color: "#38bdf8", padding: "16px", borderRadius: "8px", overflowX: "auto", fontSize: "12px", fontFamily: "monospace", maxHeight: "300px", border: "1px solid #1e293b" }}>
                      {detailsText || "No detailed error payload returned."}
                    </pre>
                  </div>

                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Choose a recovery action for your store session:
                    </Text>
                    <InlineStack gap="200">
                      <Button variant="secondary" onClick={() => window.location.reload()}>
                        Reload Page 🔄
                      </Button>
                      <Button variant="primary" url="/auth/login" external>
                        Re-Authorize Session 🔑
                      </Button>
                      <Button variant="plain" url="/api/debug-env" external>
                        Check Environment API 🛠️
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </BlockStack>
              </Banner>
            </Layout.Section>
          </Layout>
        </Page>
      </div>
    </PolarisProvider>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
