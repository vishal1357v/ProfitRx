import { useState, useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, redirect, useLocation, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { getFeatureList, getSubscription } from "../services/feature-access.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session, redirect: shopifyRedirect } = await authenticate.admin(request);
  const url = new URL(request.url);

  // Bypass billing checks in development to allow testing dashboard, COGS, and RTO features
  const isDev = process.env.NODE_ENV === "development";
  const host = url.searchParams.get("host") || "";

  if (!isDev && !url.pathname.includes("/app/pricing")) {
    await billing.require({
      plans: ["Starter", "Growth", "Pro"],
      isTest: true,
      onFailure: async () => {
        throw shopifyRedirect(`/app/pricing?shop=${session.shop}&host=${host}`);
      },
    });
  }

  const features = await getFeatureList(session.shop);
  const subscription = await getSubscription(session.shop);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    host,
    features,
    plan: subscription.plan,
  };
};

const NAV_ITEMS = [
  { href: "/app/dashboard",    label: "Dashboard",     icon: "⚡" },
  { href: "/app/profit-leaks",  label: "Profit Leaks",   icon: "💸" },
  { href: "/app/rto-heatmap",   label: "RTO & COD",      icon: "📦", feature: "rto_heatmap" },
  { href: "/app/customers",     label: "Customers",     icon: "👥", feature: "ltv_cohort" },
  { href: "/app/roas",          label: "ROAS & Spend",   icon: "📈", feature: "blended_roas" },
  { href: "/app/cogs",          label: "Product Costs", icon: "💰" },
  { href: "/app/alerts",        label: "Alerts",        icon: "🔔" },
  { href: "/app/billing",       label: "Billing",       icon: "💳" },
  { href: "/app/pricing",       label: "Plans",         icon: "🚀" },
];

export default function App() {
  const { apiKey, shop, host, features, plan } = useLoaderData<typeof loader>();
  const [darkMode, setDarkMode] = useState(false);
  const location = useLocation();
  const navigation = useNavigation();

  const searchParams = new URLSearchParams();
  if (shop) searchParams.set("shop", shop);
  if (host) searchParams.set("host", host);
  const searchStr = `?${searchParams.toString()}`;

  useEffect(() => {
    const saved = localStorage.getItem("greek-god-dark-mode") === "true";
    setDarkMode(saved);
    if (saved) {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
  }, []);

  const toggleDarkMode = () => {
    const nextMode = !darkMode;
    setDarkMode(nextMode);
    localStorage.setItem("greek-god-dark-mode", String(nextMode));
    if (nextMode) {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname === `${path}/`;

  return (
    <AppProvider embedded apiKey={apiKey}>
      {/* ── Premium Nav ───────────────────────────────────── */}
      <s-app-nav>
        {/* Brand wordmark */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginRight: 16,
          paddingRight: 16,
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <span style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize: 14,
            background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.02em",
          }}>
            Greek God
          </span>
        </div>

        {NAV_ITEMS.filter((item) => !item.feature || features.includes(item.feature)).map((item) => (
          <s-link
            key={item.href}
            href={`${item.href}${searchStr}`}
            {...(isActive(item.href) ? { "active": "true" } : {})}
          >
            <span style={{ marginRight: 5, fontSize: 13 }}>{item.icon}</span>
            {item.label}
          </s-link>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 12 }}>
          <div className="gg-pulse" />
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--gg-text-muted)", fontFamily: "'Inter', sans-serif" }}>
            Live
          </span>
        </div>

        {/* Dark mode toggle */}
        <button
          className="gg-dark-toggle"
          onClick={toggleDarkMode}
          aria-label="Toggle dark mode"
          title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {darkMode ? "☀️" : "🌙"}
        </button>
      </s-app-nav>

      {/* ── Page Content ──────────────────────────────────── */}
      <div style={{ minHeight: "calc(100vh - 56px)", padding: "20px 16px" }}>
        {navigation.state === "loading" ? (
          <div className="skeleton-container" style={{ marginTop: 8 }}>
            <div className="skeleton-row" style={{ marginBottom: 8 }}>
              <div className="skeleton-pulse skeleton-card" />
              <div className="skeleton-pulse skeleton-card" />
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
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
