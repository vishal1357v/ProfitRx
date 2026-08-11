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
  if (external || !url || /^https?:\/\//.test(url)) {
    return (
      <a href={url} target="_top" {...props}>
        {children}
      </a>
    );
  }

  // Auto-append shop and host params if missing from relative URL
  let targetUrl = url;
  if (typeof window !== "undefined" && url.startsWith("/")) {
    const currentParams = new URLSearchParams(window.location.search);
    const shopParam = currentParams.get("shop");
    const hostParam = currentParams.get("host");

    if (shopParam || hostParam) {
      const [path, existingQuery] = url.split("?");
      const targetParams = new URLSearchParams(existingQuery || "");
      if (shopParam && !targetParams.has("shop")) targetParams.set("shop", shopParam);
      if (hostParam && !targetParams.has("host")) targetParams.set("host", hostParam);
      targetUrl = `${path}?${targetParams.toString()}`;
    }
  }

  return (
    <ReactRouterLink to={targetUrl} {...props}>
      {children}
    </ReactRouterLink>
  );
}

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getFeatureList, getSubscription, normalizePlanName, PLAN_FEATURES } from "../services/feature-access.service";
import { syncSubscriptionWithShopify } from "../services/subscription-sync.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let url = new URL(request.url);
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

  const forceSync = url.searchParams.get("plan_updated") === "true" || url.searchParams.get("sync") === "true";

  // ── Step 2: Sync billing with Shopify (sequential to avoid stale reads) ────
  let localSub: { plan: string; status: string; orderLimit: number | null; ordersUsed: number };

  try {
    localSub = await syncSubscriptionWithShopify(session.shop, billing, forceSync);
  } catch (syncErr: any) {
    console.error("[app.tsx syncSubscriptionWithShopify FAILED]:", syncErr);
    localSub = { plan: "FREE", status: "ACTIVE", orderLimit: 50, ordersUsed: 0 };
  }

  // ── Step 3: Derive features from the SYNCED plan (no stale DB read) ────────
  const normalizedPlan = normalizePlanName(localSub.plan);
  const features: string[] = PLAN_FEATURES[normalizedPlan] || [];

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


export default function App() {
  const { apiKey, shop, host, features = [], billingStatus } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== "idle";

  const isDunningActive = ["FROZEN", "DECLINED", "FAILED", "CANCELED"].includes((billingStatus || "").toUpperCase());

  // Popover Group States
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const togglePopover = (group: string) => {
    setActivePopover(activePopover === group ? null : group);
  };

  const isDashboardActive = location.pathname === "/app/dashboard" || location.pathname === "/app" || location.pathname === "/app/";
  const isCodRulesActive = location.pathname === "/app/cod-rules";

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("profitrx-theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

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

  const isOperationsActive = location.pathname === "/app/operations" || location.pathname.startsWith("/app/orders");
  const isProtectionActive = ["/app/cod-rules", "/app/rto-heatmap"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );
  const isProfitActive = ["/app/profit-leaks", "/app/cogs"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );
  const isAnalyticsActive = ["/app/rto", "/app/customers", "/app/roas", "/app/reports", "/app/cod-dashboard"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );
  const isSystemActive = ["/app/health", "/app/alerts", "/app/billing", "/app/settings", "/app/pricing"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );

  return (
    <AppProvider apiKey={apiKey} embedded>
      <NavMenu>
        <a href="/app/dashboard" rel="home">Dashboard</a>
        <a href="/app/operations">Operations</a>
        <a href="/app/cod-rules">COD Rules</a>
        <a href="/app/rto-heatmap">Pincode Risk</a>
        <a href="/app/profit-leaks">Profit Leaks</a>
        <a href="/app/cogs">COGS Catalog</a>
        <a href="/app/rto">RTO Analytics</a>
        <a href="/app/customers">Customers</a>
        <a href="/app/roas">Marketing ROAS</a>
        <a href="/app/reports">Reports</a>
        <a href="/app/health">Store Health</a>
        <a href="/app/alerts">Alerts</a>
        <a href="/app/billing">Billing</a>
        <a href="/app/settings">Settings</a>
      </NavMenu>
      <PolarisProvider i18n={enTranslations} linkComponent={RemixLink}>
        {/* Top Dunning Banner for RBI Mandate Failures — Simple Warning */}
        {isDunningActive && (
          <div style={{ padding: "12px 20px 0 20px" }}>
            <Banner tone="warning" title="⚠️ Payment Action Required — RBI Mandate Notice">
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
          {/* Top Navigation Bar */}
          <header style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            backgroundColor: "var(--gg-header-bg)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom: "1px solid var(--gg-header-border)",
            padding: "8px 20px",
            transition: "background-color 0.4s ease, border-color 0.4s ease",
          }}>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <InlineStack gap="150" blockAlign="center">
                  <span style={{ fontSize: "20px" }}>⚡</span>
                  <Text variant="headingMd" as="span" fontWeight="bold">
                    ProfitRx <span style={{ color: "#38bdf8", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", marginLeft: "4px" }}>India COD</span>
                  </Text>
                </InlineStack>
              </InlineStack>

              {/* Header Right Area: Search, Notifications, Theme Toggle, Shop Badge, and Mobile Menu Toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* Notifications Bell */}
                <NotificationCenter shop={shop} host={host} />

                <button
                  onClick={toggleTheme}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "8px",
                    color: "var(--gg-text-primary)",
                    transition: "background-color 0.2s ease",
                  }}
                  title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                  aria-label={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                  <span style={{ fontSize: "18px" }}>{isDarkMode ? "☀️" : "🌙"}</span>
                </button>
                <div className="gg-desktop-only">
                  <Badge tone="success">{shop.replace(".myshopify.com", "")}</Badge>
                </div>
                <button
                  className="gg-mobile-menu-toggle"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle Menu"
                  style={{ display: isEmbedded ? "none" : undefined }}
                >
                  <span style={{ fontSize: "20px" }}>{mobileMenuOpen ? "✕" : "☰"}</span>
                </button>
              </div>
            </InlineStack>

            {/* Main Navigation Component */}
            <nav className={`gg-main-nav ${!isEmbedded && mobileMenuOpen ? "open" : ""}`}>
              {/* DESKTOP-ONLY NAVIGATION (POPOVERS) */}
              <div className="gg-desktop-only" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {/* Direct Link 1: Dashboard */}
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
                  <span>Dashboard</span>
                </ReactRouterLink>

                {/* Direct Link 2: Operations */}
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
                  <span>Operations</span>
                </ReactRouterLink>

                {/* Popover Group 1: Protection */}
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
                        content: "COD Rules & Risk Shield",
                        url: `/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ShieldCheckMarkIcon,
                      },
                      {
                        content: "Pincode Risk Heatmap",
                        url: `/app/rto-heatmap?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: LocationIcon,
                      },
                    ].map(i => ({ ...i, onAction: () => setActivePopover(null) }))}
                  />
                </Popover>

                {/* Popover Group 2: Profit */}
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
                      <Icon source={SearchIcon} tone={isProfitActive ? "primary" : "subdued"} />
                      <span>Profit</span>
                      <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>▼</span>
                    </button>
                  }
                  onClose={() => setActivePopover(null)}
                >
                  <ActionList
                    items={[
                      {
                        content: "Profit Leaks Diagnostic",
                        url: `/app/profit-leaks?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: SearchIcon,
                      },
                      {
                        content: "COGS Catalog",
                        url: `/app/cogs?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ProductIcon,
                      },
                    ].map(i => ({ ...i, onAction: () => setActivePopover(null) }))}
                  />
                </Popover>

                {/* Popover Group 3: Analytics */}
                <Popover
                  active={activePopover === "analytics"}
                  activator={
                    <button
                      onClick={() => togglePopover("analytics")}
                      className={`gg-nav-link ${isAnalyticsActive ? "active" : ""}`}
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
                      <Icon source={ChartVerticalIcon} tone={isAnalyticsActive ? "primary" : "subdued"} />
                      <span>Analytics</span>
                      <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>▼</span>
                    </button>
                  }
                  onClose={() => setActivePopover(null)}
                >
                  <ActionList
                    items={[
                      {
                        content: "RTO Analytics",
                        url: `/app/rto?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: DeliveryIcon,
                      },
                      {
                        content: "Customer Intelligence (LTV)",
                        url: `/app/customers?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: PersonIcon,
                      },
                      {
                        content: "Marketing ROAS (Ad Spend)",
                        url: `/app/roas?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ChartLineIcon,
                      },
                      {
                        content: "Reports Suite",
                        url: `/app/reports?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ExportIcon,
                      },
                    ].map(i => ({ ...i, onAction: () => setActivePopover(null) }))}
                  />
                </Popover>

                {/* Popover Group 4: System & Settings */}
                <Popover
                  active={activePopover === "system"}
                  activator={
                    <button
                      onClick={() => togglePopover("system")}
                      className={`gg-nav-link ${isSystemActive ? "active" : ""}`}
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
                      <Icon source={SettingsIcon} tone={isSystemActive ? "primary" : "subdued"} />
                      <span>System</span>
                      <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>▼</span>
                    </button>
                  }
                  onClose={() => setActivePopover(null)}
                >
                  <ActionList
                    items={[
                      {
                        content: "Store Health",
                        url: `/app/health?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: HeartIcon,
                      },
                      {
                        content: "Alert Center",
                        url: `/app/alerts?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: NotificationIcon,
                      },
                      {
                        content: "General Settings",
                        url: `/app/settings?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: SettingsIcon,
                      },
                      {
                        content: "Plans & Billing",
                        url: `/app/billing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: PaymentIcon,
                      },
                    ].map(i => ({ ...i, onAction: () => setActivePopover(null) }))}
                  />
                </Popover>
              </div>

              {/* MOBILE-ONLY SIDEBAR / COLLAPSIBLE PANEL */}
              <div className="gg-mobile-only" style={{ display: "none", width: "high" }}>
                <BlockStack gap="100">
                  {/* Store Badge on Mobile Header */}
                  <div style={{ padding: "0 8px 10px 8px", borderBottom: "1px solid var(--gg-border)" }}>
                    <Badge tone="success">{shop.replace(".myshopify.com", "")}</Badge>
                  </div>

                  {/* Direct links */}
                  <ReactRouterLink
                    to={`/app/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={HomeIcon} />
                    <span>Dashboard</span>
                  </ReactRouterLink>

                  <ReactRouterLink
                    to={`/app/operations?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ProductIcon} />
                    <span>Operations Center</span>
                  </ReactRouterLink>

                  {/* Protection Category */}
                  <span className="gg-mobile-category-title">Protection</span>
                  <ReactRouterLink
                    to={`/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ShieldCheckMarkIcon} />
                    <span>COD Rules & Risk Shield</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/rto-heatmap?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={LocationIcon} />
                    <span>Pincode Risk Heatmap</span>
                  </ReactRouterLink>

                  {/* Profit Category */}
                  <span className="gg-mobile-category-title">Profit</span>
                  <ReactRouterLink
                    to={`/app/profit-leaks?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={SearchIcon} />
                    <span>Profit Leaks Diagnostic</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/cogs?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ProductIcon} />
                    <span>COGS Catalog</span>
                  </ReactRouterLink>

                  {/* Analytics Category */}
                  <span className="gg-mobile-category-title">Analytics</span>
                  <ReactRouterLink
                    to={`/app/rto?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={DeliveryIcon} />
                    <span>RTO Analytics</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/customers?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={PersonIcon} />
                    <span>Customer Intelligence</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/roas?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ChartLineIcon} />
                    <span>Marketing ROAS</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/reports?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ExportIcon} />
                    <span>Reports Suite</span>
                  </ReactRouterLink>

                  {/* System & Settings Category */}
                  <span className="gg-mobile-category-title">System</span>
                  <ReactRouterLink
                    to={`/app/health?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={HeartIcon} />
                    <span>Store Health</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/alerts?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={NotificationIcon} />
                    <span>Alert Center</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/settings?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={SettingsIcon} />
                    <span>General Settings</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/billing?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={PaymentIcon} />
                    <span>Plans & Billing</span>
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
                        Reload Page 🔄
                      </Button>
                      <Button
                        variant="primary"
                        url={currentShop
                          ? `/auth/login?shop=${encodeURIComponent(currentShop)}&host=${encodeURIComponent(currentHost || "")}`
                          : "/auth/login"
                        }
                        external
                      >
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
