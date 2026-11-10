import { useState, useEffect, Suspense, lazy } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, redirect, useLocation, useNavigation, Link as ReactRouterLink, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisProvider, Banner, Page, Layout, BlockStack, InlineStack, Text, Button, Badge, Icon, Popover, ActionList, TextField } from "@shopify/polaris";
import { SearchCommand } from "../components/SearchCommand";
import { NotificationCenter } from "../components/NotificationCenter";
import { ProductTour } from "../components/ProductTour";
import { LoadingCard } from "../components/LoadingCard";
import enTranslations from "@shopify/polaris/locales/en.json";
import {
  HomeIcon,
  ProductIcon,
  ShieldCheckMarkIcon,
  ChartVerticalIcon,
  DeliveryIcon,
  LocationIcon,
  SearchIcon,
  PersonIcon,
  ChartLineIcon,
  NotificationIcon,
  HeartIcon,
  PaymentIcon,
  SettingsIcon,
  ExportIcon,
} from "@shopify/polaris-icons";



function RemixLink({ url, children, external, ...props }: any) {
  const location = useLocation();

  if (external || !url || /^https?:\/\//.test(url)) {
    return (
      <a href={url} target="_top" {...props}>
        {children}
      </a>
    );
  }

  // Consistent link search param preservation across server & client
  let targetUrl = url;
  if (url.startsWith("/") && location?.search) {
    const [path, existingQuery] = url.split("?");
    const currentParams = new URLSearchParams(location.search);
    const targetParams = new URLSearchParams(existingQuery || "");

    const shopParam = currentParams.get("shop");
    const hostParam = currentParams.get("host");
    const previewParam = currentParams.get("preview") || currentParams.get("demo");

    if (shopParam && !targetParams.has("shop")) targetParams.set("shop", shopParam);
    if (hostParam && !targetParams.has("host")) targetParams.set("host", hostParam);
    if (previewParam && !targetParams.has("preview")) targetParams.set("preview", "true");

    const searchStr = targetParams.toString();
    targetUrl = searchStr ? `${path}?${searchStr}` : path;
  }

  return (
    <ReactRouterLink to={targetUrl} {...props}>
      {children}
    </ReactRouterLink>
  );
}

import { authenticate } from "../shopify.server";
import { getFeatureList, getSubscription, normalizePlanName, PLAN_FEATURES } from "../services/feature-access.service";
import { syncSubscriptionWithShopify } from "../services/subscription-sync.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";

  if (isPreview) {
    const demoShop = "glam-aura-india.myshopify.com";
    const demoHost = Buffer.from("admin.shopify.com/store/glam-aura-india").toString("base64");
    return {
      apiKey: process.env.SHOPIFY_API_KEY || "demo_preview_key",
      shop: demoShop,
      host: demoHost,
      features: ["ALL_FEATURES"],
      plan: "PRO",
      billingStatus: "ACTIVE",
      isPreview: true,
    };
  }

  let host = url.searchParams.get("host") || "";
  const shopParam = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "";

  if (!host && shopParam) {
    const storeHandle = shopParam.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
    url.searchParams.set("host", host);
    request = new Request(url.toString(), request);
  }

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
    const url = new URL(request.url);
    const shopFallback = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "";
    const hostFallback = url.searchParams.get("host") || "";
    const reauthFailed = url.searchParams.get("reauth_failed") === "true";

    if (authErr instanceof Response) {
      const status = authErr.status;
      const isRedirect = status >= 300 && status < 400;
      const isReauthHeader = authErr.headers?.has("X-Shopify-API-Request-Failure-Reauthorize") || authErr.headers?.has("X-Shopify-App-Redirect");

      // Pass-through intentional 3xx redirects or App Bridge exit-iframe re-auth responses
      if (isRedirect || isReauthHeader) {
        throw authErr;
      }

      // If status is 500 / 4xx ("Unexpected Server Error" / missing session),
      // attempt automatic OAuth recovery if shop parameter is present and not already retried
      if (shopFallback && !reauthFailed) {
        console.warn(`[app.tsx] Session validation returned HTTP ${status}. Triggering OAuth re-auth for ${shopFallback}...`);
        throw redirect(`/auth/login?shop=${encodeURIComponent(shopFallback)}&host=${encodeURIComponent(hostFallback)}&reauth_failed=true`);
      }

      // Last resort: no shop param to recover with — redirect to login instead
      // of propagating the raw Shopify SDK error as a 500
      console.warn(`[app.tsx] Auth response HTTP ${status} with no shop param. Redirecting to login.`);
      throw redirect("/auth/login");
    }

    console.error("[app.tsx authenticate.admin error]:", authErr?.message || authErr);

    if (shopFallback && !reauthFailed) {
      throw redirect(`/auth/login?shop=${encodeURIComponent(shopFallback)}&host=${encodeURIComponent(hostFallback)}&reauth_failed=true`);
    }

    // Last resort: redirect to login rather than showing a raw 500 error page
    console.warn("[app.tsx] Auth failed with no shop param to recover. Redirecting to login.");
    throw redirect("/auth/login");
  }

  const { billing, session, redirect: shopifyRedirect } = authResult;
  url = new URL(request.url);
  host = url.searchParams.get("host") || "";

  // Auto-generate base64 host parameter if missing from query string
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  const planHandle = url.searchParams.get("plan_handle");
  const forceSync = url.searchParams.get("plan_updated") === "true" || url.searchParams.get("sync") === "true" || Boolean(planHandle);

  // ── Step 2: Sync billing with Shopify (sequential to avoid stale reads) ────
  let localSub: { plan: string; status: string; orderLimit: number | null; ordersUsed: number };

  try {
    localSub = await syncSubscriptionWithShopify(session.shop, billing, forceSync, planHandle);
  } catch (syncErr: any) {
    console.error("[app.tsx syncSubscriptionWithShopify FAILED]:", syncErr);
    localSub = { plan: "FREE", status: "ACTIVE", orderLimit: 50, ordersUsed: 0 };
  }

  const isBypassed = process.env.BYPASS_BILLING === "true";
  const activePlan = isBypassed ? "PRO" : localSub.plan;
  const activeStatus = isBypassed ? "ACTIVE" : (localSub.status || "ACTIVE");

  // ── Step 3: Derive features from the plan (no stale DB read) ────────
  const normalizedPlan = normalizePlanName(activePlan);
  const features: string[] = isBypassed ? PLAN_FEATURES["PRO"] : (PLAN_FEATURES[normalizedPlan] || []);

  const billingStatus = activeStatus;

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    host,
    features,
    plan: activePlan,
    billingStatus,
    isPreview: false,
  };
};


export default function App() {
  const { apiKey, shop, host, features = [], billingStatus, isPreview = false } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== "idle";

  const isDunningActive = !isPreview && ["FROZEN", "DECLINED", "FAILED", "CANCELED"].includes((billingStatus || "").toUpperCase());

  // Popover Group States
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const togglePopover = (group: string) => {
    setActivePopover(activePopover === group ? null : group);
  };

  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("profitrx-theme");
      if (stored === "dark") {
        setIsDarkMode(true);
      }
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("profitrx-theme", newTheme ? "dark" : "light");
    }
  };

  // Detect if running inside Shopify Admin iframe — suppress mobile nav when true
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add("dark-theme");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.body.classList.remove("dark-theme");
      document.documentElement.setAttribute("data-theme", "light");
    }
    // Detect iframe (Shopify Admin embedded context)
    try {
      setIsEmbedded(window.self !== window.top);
    } catch {
      setIsEmbedded(true); // cross-origin iframe access blocked = definitely embedded
    }
  }, [isDarkMode]);

  const isDashboardActive = location.pathname === "/app/dashboard" || location.pathname === "/app" || location.pathname === "/app/";
  const isOperationsActive = ["/app/operations", "/app/orders"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );
  const isProtectionActive = ["/app/cod-rules", "/app/rto-heatmap", "/app/customer-risk", "/app/rto"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );
  const isProfitActive = ["/app/cogs", "/app/profit-leaks", "/app/roas", "/app/reports", "/app/cod-dashboard", "/app/customers"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );
  const isSettingsActive = ["/app/settings", "/app/billing", "/app/pricing", "/app/health", "/app/alerts"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );

  return (
    <AppProvider apiKey={apiKey} embedded={!isPreview}>
      <NavMenu>
        <a href="/app/dashboard" rel="home">Dashboard</a>
        <a href="/app/operations">Orders to Check</a>
        <a href="/app/cod-rules">COD Rules</a>
        <a href="/app/rto-heatmap">High Return Pincodes</a>
        <a href="/app/customer-risk">Frequent Returners</a>
        <a href="/app/cogs">Product Costs</a>
        <a href="/app/profit-leaks">Where You Lose Money</a>
        <a href="/app/rto">Courier Return Reports</a>
        <a href="/app/settings">Settings</a>
        <a href="/app/billing">Billing</a>
      </NavMenu>
      <PolarisProvider i18n={enTranslations} linkComponent={RemixLink}>
        {/* Live Demo Standalone Banner — Clean Native Polaris */}
        {isPreview && (
          <div style={{ padding: "12px 16px 0 16px" }}>
            <Banner
              tone="info"
              title="ProfitRx Preview Mode — glam-aura-india.myshopify.com"
            >
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm">
                  Viewing simulated store data with 1,240 orders. Decision workflows and financial intelligence are interactive.
                </Text>
                <a href="/_index" style={{ fontSize: "12px", color: "var(--p-color-text-link)", textDecoration: "none" }}>
                  Exit Preview ↗
                </a>
              </InlineStack>
            </Banner>
          </div>
        )}
        {/* Top Dunning Banner for RBI Mandate Failures — Simple Warning */}
        {isDunningActive && (
          <div style={{ padding: "12px 20px 0 20px" }}>
            <Banner tone="warning" title="Payment Action Required — RBI Mandate Notice">
              <p style={{ margin: 0, fontSize: "13px" }}>
                Shopify was unable to process your subscription payment. Under RBI regulations for Indian cards and UPI mandates, please update your payment method or approve the mandate in your bank app to keep ProfitRx active.
              </p>
              <div style={{ marginTop: "8px" }}>
                <Button url={`/app/pricing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`} variant="secondary" size="micro">
                  Update Payment Method →
                </Button>
              </div>
            </Banner>
          </div>
        )}

        {/* Skip to main content — Accessibility */}
        <a href="#prx-main-content" className="prx-skip-link" tabIndex={0}>
          Skip to main content
        </a>

        <div style={{ minHeight: "100vh", backgroundColor: "var(--gg-bg-base)" }}>
          {/* Top Navigation Bar — Native Polaris */}
          <header style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            backgroundColor: "var(--p-color-bg-surface)",
            borderBottom: "1px solid var(--p-color-border-subdued)",
            padding: "8px 16px",
          }}>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingSm" as="span" fontWeight="bold">
                    ProfitRx
                  </Text>
                  <Badge tone="info">COD Protection</Badge>
                </InlineStack>
              </InlineStack>

              {/* Header Right Area: Search, Notifications, Shop Badge, and Mobile Menu Toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* Notifications Bell — only poll in authenticated sessions */}
                {!isPreview && <NotificationCenter shop={shop} host={host} />}

                <div className="gg-desktop-only">
                  <Badge tone="success">{shop.replace(".myshopify.com", "")}</Badge>
                </div>
                <button
                  className="gg-mobile-menu-toggle"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle Menu"
                >
                  <span style={{ fontSize: "18px" }}>{mobileMenuOpen ? "✕" : "☰"}</span>
                </button>
              </div>
            </InlineStack>

            {/* Main Navigation Component */}
            <nav className={`gg-main-nav ${mobileMenuOpen ? "open" : ""}`}>
              {/* DESKTOP-ONLY NAVIGATION (POPOVERS) */}
              <div className="gg-desktop-only" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {/* 1. Home / Dashboard */}
                <ReactRouterLink
                  to={`/app/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                  className={`gg-nav-link ${isDashboardActive ? "active" : ""}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s ease",
                  }}
                >
                  <Icon source={HomeIcon} tone={isDashboardActive ? "primary" : "subdued"} />
                  <span>Home</span>
                </ReactRouterLink>

                {/* 2. Orders & Review */}
                <ReactRouterLink
                  to={`/app/operations?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                  className={`gg-nav-link ${isOperationsActive ? "active" : ""}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s ease",
                  }}
                >
                  <Icon source={ProductIcon} tone={isOperationsActive ? "primary" : "subdued"} />
                  <span>Orders</span>
                </ReactRouterLink>

                {/* 3. Protection */}
                <Popover
                  active={activePopover === "protection"}
                  activator={
                    <button
                      onClick={() => togglePopover("protection")}
                      className={`gg-nav-link ${isProtectionActive ? "active" : ""}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "inherit",
                        whiteSpace: "nowrap",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Icon source={ShieldCheckMarkIcon} tone={isProtectionActive ? "primary" : "subdued"} />
                      <span>Protection</span>
                      <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>▼</span>
                    </button>
                  }
                  onClose={() => setActivePopover(null)}
                >
                  <ActionList
                    items={[
                      {
                        content: "COD Protection Rules",
                        url: `/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ShieldCheckMarkIcon,
                      },
                      {
                        content: "High Return Pincodes",
                        url: `/app/rto-heatmap?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: LocationIcon,
                      },
                      {
                        content: "Frequent Returners & Delivery History",
                        url: `/app/customer-risk?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: PersonIcon,
                      },
                      {
                        content: "Courier Return Reports",
                        url: `/app/rto?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: DeliveryIcon,
                      },
                    ].map(i => ({ ...i, onAction: () => setActivePopover(null) }))}
                  />
                </Popover>

                {/* 4. Profit & Costs */}
                <Popover
                  active={activePopover === "profit"}
                  activator={
                    <button
                      onClick={() => togglePopover("profit")}
                      className={`gg-nav-link ${isProfitActive ? "active" : ""}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "inherit",
                        whiteSpace: "nowrap",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Icon source={ChartVerticalIcon} tone={isProfitActive ? "primary" : "subdued"} />
                      <span>Profit & Costs</span>
                      <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>▼</span>
                    </button>
                  }
                  onClose={() => setActivePopover(null)}
                >
                  <ActionList
                    items={[
                      {
                        content: "Product Costs (Making/Buying)",
                        url: `/app/cogs?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ProductIcon,
                      },
                      {
                        content: "Where You Lose Money (Leaks)",
                        url: `/app/profit-leaks?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: SearchIcon,
                      },
                      {
                        content: "Cash on Delivery Profit Overview",
                        url: `/app/cod-dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ShieldCheckMarkIcon,
                      },
                      {
                        content: "Ad Spend vs Real Sales (ROAS)",
                        url: `/app/roas?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ChartLineIcon,
                      },
                      {
                        content: "Repeat Customer Value",
                        url: `/app/customers?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: PersonIcon,
                      },
                      {
                        content: "Download Reports & CSV",
                        url: `/app/reports?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ExportIcon,
                      },
                    ].map(i => ({ ...i, onAction: () => setActivePopover(null) }))}
                  />
                </Popover>

                {/* 5. Settings & Account */}
                <Popover
                  active={activePopover === "settings"}
                  activator={
                    <button
                      onClick={() => togglePopover("settings")}
                      className={`gg-nav-link ${isSettingsActive ? "active" : ""}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "inherit",
                        whiteSpace: "nowrap",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Icon source={SettingsIcon} tone={isSettingsActive ? "primary" : "subdued"} />
                      <span>Settings</span>
                      <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>▼</span>
                    </button>
                  }
                  onClose={() => setActivePopover(null)}
                >
                  <ActionList
                    items={[
                      {
                        content: "Store & Courier Costs",
                        url: `/app/settings?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: SettingsIcon,
                      },
                      {
                        content: "Subscription & Billing",
                        url: `/app/billing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: PaymentIcon,
                      },
                      {
                        content: "WhatsApp & Email Alerts",
                        url: `/app/alerts?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: NotificationIcon,
                      },
                      {
                        content: "System Health & Diagnostic",
                        url: `/app/health?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: HeartIcon,
                      },
                    ].map(i => ({ ...i, onAction: () => setActivePopover(null) }))}
                  />
                </Popover>
              </div>

              {/* MOBILE-ONLY SIDEBAR / COLLAPSIBLE PANEL */}
              <div className="gg-mobile-only" style={{ display: "none", width: "100%" }}>
                <BlockStack gap="100">
                  {/* Store Badge on Mobile Header */}
                  <div style={{ padding: "0 8px 10px 8px", borderBottom: "1px solid var(--gg-border)" }}>
                    <Badge tone="success">{shop.replace(".myshopify.com", "")}</Badge>
                  </div>

                  {/* 1. Home */}
                  <ReactRouterLink
                    to={`/app/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={HomeIcon} />
                    <span>Home / Dashboard</span>
                  </ReactRouterLink>

                  {/* 2. Orders */}
                  <ReactRouterLink
                    to={`/app/operations?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ProductIcon} />
                    <span>Orders to Check</span>
                  </ReactRouterLink>

                  {/* 3. Protection Category */}
                  <span className="gg-mobile-category-title">Protection</span>
                  <ReactRouterLink
                    to={`/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ShieldCheckMarkIcon} />
                    <span>COD Protection Rules</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/rto-heatmap?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={LocationIcon} />
                    <span>High Return Pincodes</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/customer-risk?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={PersonIcon} />
                    <span>Frequent Returners</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/rto?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={DeliveryIcon} />
                    <span>Courier Return Reports</span>
                  </ReactRouterLink>

                  {/* 4. Profit & Costs Category */}
                  <span className="gg-mobile-category-title">Profit & Costs</span>
                  <ReactRouterLink
                    to={`/app/cogs?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ProductIcon} />
                    <span>Product Costs (Making/Buying)</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/profit-leaks?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={SearchIcon} />
                    <span>Where You Lose Money (Leaks)</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/cod-dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ShieldCheckMarkIcon} />
                    <span>Cash on Delivery Profit Overview</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/roas?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ChartLineIcon} />
                    <span>Ad Spend vs Real Sales</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/reports?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ExportIcon} />
                    <span>Download Reports & CSV</span>
                  </ReactRouterLink>

                  {/* 5. Settings Category */}
                  <span className="gg-mobile-category-title">Settings</span>
                  <ReactRouterLink
                    to={`/app/settings?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={SettingsIcon} />
                    <span>Store & Courier Costs</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/billing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={PaymentIcon} />
                    <span>Subscription & Billing</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/alerts?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={NotificationIcon} />
                    <span>WhatsApp & Email Alerts</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/health?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={HeartIcon} />
                    <span>System Health</span>
                  </ReactRouterLink>
                </BlockStack>
              </div>
            </nav>
          </header>

          {/* Main Content Area */}
          <main id="prx-main-content" style={{ padding: "0 0 40px 0" }} role="main">
            {isNavigating ? (
              <div className="prx-loading-container" style={{ padding: "24px" }} aria-busy="true" aria-label="Loading page">
                <LoadingCard variant="metric" columns={5} rows={1} />
                <div style={{ marginTop: 16 }}>
                  <LoadingCard variant="chart" />
                </div>
                <div style={{ marginTop: 16 }}>
                  <LoadingCard variant="table" rows={5} />
                </div>
              </div>
            ) : (
              <div className="gg-page-enter">
                <Outlet />
              </div>
            )}
          </main>

          {/* Global Search Command Palette (Ctrl+K) */}
          <SearchCommand shop={shop} host={host} />

          {/* Product Tour — shows once after onboarding */}
          <ProductTour />
        </div>
      </PolarisProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const [recoveryShop, setRecoveryShop] = useState("");

  console.error("[ProfitRx Error Diagnostic]:", error);

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

  // Try to extract shop from URL search params for the re-auth button
  const currentShop = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("shop") : null;
  const currentHost = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("host") : null;

  const handleRecoverySubmit = () => {
    let domain = recoveryShop.trim().toLowerCase();
    if (!domain) return;
    if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
    window.location.href = `/auth/login?shop=${encodeURIComponent(domain)}`;
  };

  return (
    <PolarisProvider i18n={enTranslations}>
      <div style={{ padding: "40px 20px", maxWidth: "900px", margin: "0 auto" }}>
        <Page title="ProfitRx — Diagnostic & Recovery Portal">
          <Layout>
            {/* Recovery Form — shown prominently when session fails */}
            {isUnexpectedServerError && (
              <Layout.Section>
                <Banner tone="warning" title="🔑 Session Recovery Required">
                  <BlockStack gap="300">
                    <Text variant="bodySm" as="p">
                      Your Shopify session has expired or is missing. Enter your store domain below to re-authorize, or click the button if your shop is already detected.
                    </Text>
                    {currentShop ? (
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="info">{currentShop}</Badge>
                        <Button
                          variant="primary"
                          url={`/auth/login?shop=${encodeURIComponent(currentShop)}&host=${encodeURIComponent(currentHost || "")}`}
                          external
                        >
                          Re-Authorize {currentShop.replace(".myshopify.com", "")} →
                        </Button>
                      </InlineStack>
                    ) : (
                      <InlineStack gap="200" blockAlign="end">
                        <div style={{ flex: 1 }}>
                          <TextField
                            label="Store domain"
                            value={recoveryShop}
                            onChange={setRecoveryShop}
                            placeholder="your-store.myshopify.com"
                            autoComplete="off"
                            helpText="Enter your .myshopify.com domain or just the store name"
                          />
                        </div>
                        <Button variant="primary" onClick={handleRecoverySubmit}>
                          Re-Authorize →
                        </Button>
                      </InlineStack>
                    )}
                  </BlockStack>
                </Banner>
              </Layout.Section>
            )}

            <Layout.Section>
              <Banner tone="critical" title={`🚨 ${errorTitle}`}>
                <BlockStack gap="400">
                  <Text variant="bodyMd" as="p">
                    ProfitRx captured an exception while executing <code>{location.pathname}</code>:
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
                    <pre style={{ background: "#090d16", color: "#38bdf8", padding: "16px", borderRadius: "8px", overflowX: "auto", fontSize: "12px", fontFamily: "monospace", maxHeight: "300px", border: "1px solid rgba(56,189,248,0.2)" }}>
                      {detailsText || "No detailed error payload returned."}
                    </pre>
                  </div>

                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Choose a recovery action for your store session:
                    </Text>
                    <InlineStack gap="200">
                      <Button variant="secondary" onClick={() => window.location.reload()}>
                        Reload page
                      </Button>
                      <Button
                        variant="primary"
                        url={currentShop
                          ? `/auth/login?shop=${encodeURIComponent(currentShop)}&host=${encodeURIComponent(currentHost || "")}`
                          : "/auth/login"
                        }
                        external
                      >
                        Re-authorize session
                      </Button>
                      <Button variant="plain" url="/api/debug-env" external>
                        Check environment
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
