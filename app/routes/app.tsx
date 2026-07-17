import { useState, useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, redirect, useLocation, useNavigation, Link as ReactRouterLink, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisProvider, Banner, Page, Layout, BlockStack, InlineStack, Text, Button, Badge, Icon, Popover, ActionList } from "@shopify/polaris";
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
    // Automatically re-throw Response objects — these are intentional SDK redirects
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
  let host = url.searchParams.get("host") || "";

  // Auto-generate base64 host parameter if missing from query string
  if (!host && session?.shop) {
    const storeHandle = session.shop.replace(".myshopify.com", "");
    host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
  }

  // ── Step 2 + 4: Sync billing and load features in parallel ─────────────────
  let localSub: { plan: string; status: string; orderLimit: number | null; ordersUsed: number };
  let features: string[] = [];

  try {
    [localSub, features] = await Promise.all([
      syncSubscriptionWithShopify(session.shop, billing).catch((syncErr: any) => {
        console.error("[app.tsx syncSubscriptionWithShopify FAILED]:", syncErr);
        return { plan: "FREE", status: "ACTIVE", orderLimit: 50, ordersUsed: 0 };
      }),
      getFeatureList(session.shop).catch((featErr: any) => {
        console.error("[app.tsx getFeatureList FAILED]:", featErr);
        return [] as string[];
      }),
    ]);
  } catch (err: any) {
    console.error("[app.tsx parallel load failed]:", err);
    localSub = { plan: "FREE", status: "ACTIVE", orderLimit: 50, ordersUsed: 0 };
    features = [];
  }

  const isFreePlan = localSub.plan === "FREE";

  // ── Step 3: Require billing for paid plans ─────────────────────────────────
  if (!isFreePlan && !url.pathname.includes("/app/pricing") && !url.pathname.includes("/app/billing")) {
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

  const isOperationsActive = ["/app/cogs", "/app/roas", "/app/profit-leaks"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );
  const isAnalyticsActive = ["/app/cod-dashboard", "/app/rto", "/app/rto-heatmap", "/app/customers"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );
  const isSystemActive = ["/app/health", "/app/alerts", "/app/billing", "/app/settings"].some(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/")
  );

  return (
    <AppProvider apiKey={apiKey} embedded>
      <NavMenu>
        <a href="/app/dashboard" rel="home">Dashboard</a>
        <a href="/app/cogs">COGS Catalog</a>
        <a href="/app/cod-rules">COD Risk Shield</a>
        <a href="/app/cod-dashboard">COD Analytics</a>
        <a href="/app/rto">RTO Analytics</a>
        <a href="/app/rto-heatmap">Pincode Heatmap</a>
        <a href="/app/profit-leaks">Profit Leaks</a>
        <a href="/app/customers">Customer LTV</a>
        <a href="/app/roas">Ad Spend Sync</a>
        <a href="/app/alerts">Alerts</a>
        <a href="/app/health">Store Health</a>
        <a href="/app/billing">Plans & Billing</a>
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

              {/* Header Right Area: Theme Toggle, Shop Badge, and Mobile Menu Toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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

                {/* Direct Link 2: COD Risk Shield */}
                <ReactRouterLink
                  to={`/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                  className={`gg-nav-link ${isCodRulesActive ? "active" : ""}`}
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
                  <Icon source={ShieldCheckMarkIcon} tone={isCodRulesActive ? "primary" : "subdued"} />
                  <span>COD Risk Shield</span>
                  <span style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: "4px",
                    backgroundColor: "rgba(16, 185, 129, 0.2)",
                    color: "#34d399",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}>
                    India
                  </span>
                </ReactRouterLink>

                {/* Popover Group 1: Operations */}
                <Popover
                  active={activePopover === "operations"}
                  activator={
                    <button
                      onClick={() => togglePopover("operations")}
                      className={`gg-nav-link ${isOperationsActive ? "active" : ""}`}
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
                      <Icon source={ProductIcon} tone={isOperationsActive ? "primary" : "subdued"} />
                      <span>Operations</span>
                      <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>▼</span>
                    </button>
                  }
                  onClose={() => setActivePopover(null)}
                >
                  <ActionList
                    items={[
                      {
                        content: "COGS Catalog",
                        url: `/app/cogs?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ProductIcon,
                      },
                      {
                        content: "Ad Spend Sync (ROAS)",
                        url: `/app/roas?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ChartLineIcon,
                      },
                      {
                        content: "Profit Leaks",
                        url: `/app/profit-leaks?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: SearchIcon,
                      },
                    ].map(i => ({ ...i, onAction: () => setActivePopover(null) }))}
                  />
                </Popover>

                {/* Popover Group 2: Analytics */}
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
                        content: "COD Analytics",
                        url: `/app/cod-dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: ChartVerticalIcon,
                      },
                      {
                        content: "RTO Analytics",
                        url: `/app/rto?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: DeliveryIcon,
                      },
                      {
                        content: "Pincode Heatmap",
                        url: `/app/rto-heatmap?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: LocationIcon,
                      },
                      {
                        content: "Customer LTV",
                        url: `/app/customers?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: PersonIcon,
                      },
                    ].map(i => ({ ...i, onAction: () => setActivePopover(null) }))}
                  />
                </Popover>

                {/* Popover Group 3: Settings & System */}
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
                      <span>System & Settings</span>
                      <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>▼</span>
                    </button>
                  }
                  onClose={() => setActivePopover(null)}
                >
                  <ActionList
                    items={[
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
                      {
                        content: "Alerts Setup",
                        url: `/app/alerts?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: NotificationIcon,
                      },
                      {
                        content: "Store Health",
                        url: `/app/health?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`,
                        icon: HeartIcon,
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
                    to={`/app/cod-rules?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ShieldCheckMarkIcon} />
                    <span>COD Risk Shield</span>
                  </ReactRouterLink>

                  {/* Operations Category */}
                  <span className="gg-mobile-category-title">Operations</span>
                  <ReactRouterLink
                    to={`/app/cogs?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ProductIcon} />
                    <span>COGS Catalog</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/roas?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ChartLineIcon} />
                    <span>Ad Spend Sync (ROAS)</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/profit-leaks?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={SearchIcon} />
                    <span>Profit Leaks</span>
                  </ReactRouterLink>

                  {/* Analytics Category */}
                  <span className="gg-mobile-category-title">Analytics</span>
                  <ReactRouterLink
                    to={`/app/cod-dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={ChartVerticalIcon} />
                    <span>COD Analytics</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/rto?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={DeliveryIcon} />
                    <span>RTO Analytics</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/rto-heatmap?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={LocationIcon} />
                    <span>Pincode Heatmap</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/customers?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={PersonIcon} />
                    <span>Customer LTV</span>
                  </ReactRouterLink>

                  {/* System & Settings Category */}
                  <span className="gg-mobile-category-title">System & Settings</span>
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
                  <ReactRouterLink
                    to={`/app/alerts?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={NotificationIcon} />
                    <span>Alerts Setup</span>
                  </ReactRouterLink>
                  <ReactRouterLink
                    to={`/app/health?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="gg-mobile-sublink"
                  >
                    <Icon source={HeartIcon} />
                    <span>Store Health</span>
                  </ReactRouterLink>
                </BlockStack>
              </div>
            </nav>
          </header>

          {/* Main Content Area */}
          <main style={{ padding: "0 0 40px 0" }}>
            {isNavigating ? (
              <div className="skeleton-container" style={{ padding: "24px" }}>
                <div className="skeleton-pulse skeleton-card" style={{ height: "40px", marginBottom: "16px" }} />
                <div className="skeleton-row" style={{ gap: "16px" }}>
                  <div className="skeleton-pulse skeleton-card" style={{ height: "120px" }} />
                  <div className="skeleton-pulse skeleton-card" style={{ height: "120px" }} />
                  <div className="skeleton-pulse skeleton-card" style={{ height: "120px" }} />
                </div>
                <div className="skeleton-pulse skeleton-chart" style={{ height: "240px", marginTop: "16px" }} />
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

  return (
    <PolarisProvider i18n={enTranslations}>
      <div style={{ padding: "40px 20px", maxWidth: "900px", margin: "0 auto" }}>
        <Page title="ProfitRx — Diagnostic & Recovery Portal">
          <Layout>
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
                    <pre style={{ background: "#090d16", color: "#38bdf8", padding: "16px", borderRadius: "8px", overflowX: "auto", fontSize: "12px", fontFamily: "monospace", maxHeight: "300px", border: "1px solid top-ratede293b" }}>
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
