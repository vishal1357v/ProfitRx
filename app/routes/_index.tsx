import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { isInstalled: false };
};

/* ─── Animated Counter Hook ─── */
function useCounter(end: number, duration = 2000, start = 0) {
  const [value, setValue] = useState(start);
  const [hasStarted, setHasStarted] = useState(false);

  const trigger = useCallback(() => {
    if (hasStarted) return;
    setHasStarted(true);
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [end, duration, start, hasStarted]);

  return { value, trigger };
}

export default function IndexRoute() {
  const { isInstalled } = useLoaderData<typeof loader>();
  const [shopInput, setShopInput] = useState("");
  const [activeEngine, setActiveEngine] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [scrollY, setScrollY] = useState(0);
  const [mounted, setMounted] = useState(false);

  const counter1 = useCounter(52, 2500);
  const counter2 = useCounter(142850, 2500);
  const counter3 = useCounter(328, 2500);

  useEffect(() => {
    setMounted(true);
    counter1.trigger();
    counter2.trigger();
    counter3.trigger();

    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleConnect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let d = shopInput.trim().toLowerCase();
    if (!d) return;
    if (!d.includes(".")) d = `${d}.myshopify.com`;
    if (!d.startsWith("http")) d = `https://${d}`;
    try {
      window.location.href = `/auth/login?shop=${encodeURIComponent(new URL(d).hostname)}`;
    } catch {
      window.location.href = `/auth/login?shop=${encodeURIComponent(shopInput.trim())}`;
    }
  };

  const engines = [
    {
      icon: "📊",
      title: "True Net Margin Engine",
      subtitle: "Order-level unit economics",
      description:
        "Decomposes every order into COGS snapshots frozen at purchase, multi-slab courier freight, 2% gateway fee + 18% GST, and packaging to reveal your real pocket profit.",
      features: [
        "COGS locked at order time — no retrospective distortion",
        "Tiered weight-slab forward & reverse freight",
        "Auto-deducts Razorpay/Cashfree 2% + statutory 18% GST",
        "Per-SKU margin contribution waterfall",
      ],
      demo: {
        title: "Order #1042 Breakdown",
        rows: [
          { label: "Gross Order", value: "₹2,499.00", color: "#e2e8f0" },
          { label: "Product COGS", value: "−₹850.00", color: "#f87171" },
          { label: "Forward Freight", value: "−₹80.00", color: "#f87171" },
          { label: "Gateway + GST", value: "−₹58.98", color: "#f87171" },
          { label: "Packaging", value: "−₹15.00", color: "#f87171" },
        ],
        total: { label: "Net Pocket Profit", value: "₹1,495.02", pct: "59.8%" },
      },
      gradient: "linear-gradient(135deg, #10b981, #059669)",
      glow: "rgba(16, 185, 129, 0.3)",
    },
    {
      icon: "🛡️",
      title: "WASM COD Blocker",
      subtitle: "Shopify Functions checkout protection",
      description:
        "Compiled to WebAssembly and deployed on Shopify Functions, the checkout extension hides COD for high-risk postal codes in under 5ms with zero storefront JavaScript.",
      features: [
        "Native Shopify Function — zero client-side JS",
        "Sub-5ms execution budget on Shopify edge",
        "GraphQL metafield sync for pincode blocklists",
        "Automatic prepaid fallback for blocked buyers",
      ],
      demo: {
        title: "Checkout Execution Log",
        rows: [
          { label: "Function", value: "cart_payment_methods_transform", color: "#a5b4fc" },
          { label: "Buyer PIN", value: "841301 (Bihar)", color: "#e2e8f0" },
          { label: "Risk Score", value: "85% — High RTO History", color: "#fbbf24" },
          { label: "Action", value: 'HIDE("Cash on Delivery")', color: "#f87171" },
          { label: "Latency", value: "2.84ms ✓ PASSED", color: "#34d399" },
        ],
        total: { label: "Result", value: "COD Hidden", pct: "Prepaid Only" },
      },
      gradient: "linear-gradient(135deg, #6366f1, #4f46e5)",
      glow: "rgba(99, 102, 241, 0.3)",
    },
    {
      icon: "🗺️",
      title: "Pincode Risk Heatmap",
      subtitle: "Regional delivery intelligence",
      description:
        "Nationwide postal code delivery analytics with 2-digit regional cold-start fallback. Tracks RTO rates per pincode and categorizes into risk tiers for checkout rule automation.",
      features: [
        "Per-pincode delivery success and RTO tracking",
        "Automatic Low / Medium / High / Critical classification",
        "2-digit prefix fallback for unseen postal codes",
        "1-click bulk blocklist and CSV import/export",
      ],
      demo: {
        title: "Regional Risk Matrix",
        rows: [
          { label: "110001 New Delhi", value: "2.1% RTO — Low", color: "#34d399" },
          { label: "400001 Mumbai", value: "3.4% RTO — Low", color: "#34d399" },
          { label: "800001 Patna", value: "24.8% RTO — High", color: "#fbbf24" },
          { label: "841301 Bihar", value: "42.1% RTO — Critical", color: "#f87171" },
          { label: "560001 Bangalore", value: "5.2% RTO — Low", color: "#34d399" },
        ],
        total: { label: "Coverage", value: "19,101 PINs", pct: "Nationwide" },
      },
      gradient: "linear-gradient(135deg, #f59e0b, #d97706)",
      glow: "rgba(245, 158, 11, 0.3)",
    },
    {
      icon: "📈",
      title: "Blended ROAS & CAC",
      subtitle: "Marketing profitability analytics",
      description:
        "Maps Meta, Google, and TikTok ad spend against realized net profit instead of gross GMV. Surfaces true customer acquisition cost and profit-adjusted return on ad spend.",
      features: [
        "Blended multi-platform CAC against pocket profit",
        "Highlights unprofitable campaigns draining margin",
        "30-day cohort retention and payback curves",
        "Monthly marketing P&L export",
      ],
      demo: {
        title: "Marketing Attribution",
        rows: [
          { label: "Total Ad Spend", value: "₹1,44,771", color: "#e2e8f0" },
          { label: "Attributed GMV", value: "₹4,95,000", color: "#e2e8f0" },
          { label: "Platform ROAS", value: "3.42x (inflated)", color: "#94a3b8" },
          { label: "True ROAS", value: "2.49x (net profit)", color: "#34d399" },
          { label: "True CAC", value: "₹289/customer", color: "#a5b4fc" },
        ],
        total: { label: "Profit ROAS", value: "2.49x", pct: "Net Adjusted" },
      },
      gradient: "linear-gradient(135deg, #ec4899, #be185d)",
      glow: "rgba(236, 72, 153, 0.3)",
    },
  ];

  const plans = [
    {
      name: "Starter",
      price: "₹1,500",
      orders: "500 orders/mo",
      color: "#10b981",
      features: ["Net profit dashboard", "Variant COGS tracking", "RTO reports", "GSTR tax export"],
    },
    {
      name: "Growth",
      price: "₹3,999",
      orders: "2,000 orders/mo",
      color: "#6366f1",
      features: [
        "Everything in Starter",
        "Shopify Function COD blocker",
        "Pincode RTO heatmap",
        "Ad spend sync (Meta & Google)",
        "WhatsApp OTP verification",
      ],
      popular: true,
    },
    {
      name: "Scale",
      price: "₹7,999",
      orders: "Unlimited orders",
      color: "#ec4899",
      features: [
        "Everything in Growth",
        "Custom risk model weighting",
        "Multi-channel API access",
        "Priority support",
      ],
    },
  ];

  const faqs = [
    {
      q: "How does ProfitRx calculate net profit?",
      a: "ProfitRx deducts product COGS (frozen at order time), forward and reverse courier freight slabs, payment gateway charges (2% + 18% GST), and packaging from gross order value.",
    },
    {
      q: "How does the checkout COD blocker work?",
      a: "A Shopify Function compiled to WebAssembly targets cart_payment_methods_transform to hide Cash on Delivery for configured high-risk postal codes, running on Shopify's edge in under 5ms.",
    },
    {
      q: "What store data does ProfitRx access?",
      a: "Orders, line items, shipping addresses (postal codes for risk evaluation), and fulfillment statuses. Full details are in our Privacy Policy.",
    },
    {
      q: "How does the 14-day trial work?",
      a: "Full feature access on your selected plan for 14 days. Billing via Shopify Billing API begins after the trial ends. Cancel anytime from Shopify admin.",
    },
  ];

  const currentEngine = engines[activeEngine];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-void: #030712;
          --bg-deep: #0a0f1e;
          --bg-surface: rgba(15, 23, 42, 0.6);
          --bg-card: rgba(15, 23, 42, 0.45);
          --bg-elevated: rgba(30, 41, 59, 0.5);
          --border-dim: rgba(148, 163, 184, 0.08);
          --border-glow: rgba(99, 102, 241, 0.2);
          --border-active: rgba(99, 102, 241, 0.5);
          --text-primary: #f1f5f9;
          --text-secondary: #94a3b8;
          --text-tertiary: #64748b;
          --emerald: #10b981;
          --emerald-bright: #34d399;
          --indigo: #6366f1;
          --indigo-bright: #818cf8;
          --violet: #8b5cf6;
          --pink: #ec4899;
          --amber: #f59e0b;
          --cyan: #06b6d4;
          --red: #ef4444;
          --radius-sm: 10px;
          --radius-md: 16px;
          --radius-lg: 24px;
          --radius-xl: 32px;
        }

        html { scroll-behavior: smooth; }

        body {
          background: var(--bg-void);
          color: var(--text-primary);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          line-height: 1.6;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* ═══ SCROLLBAR ═══ */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: var(--bg-void); }
        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, var(--indigo), var(--violet));
          border-radius: 4px;
        }

        /* ═══ BACKGROUND CANVAS ═══ */
        .bg-canvas {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          background:
            radial-gradient(ellipse 80% 60% at 10% 10%, rgba(99, 102, 241, 0.12) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 90% 15%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse 70% 50% at 50% 60%, rgba(139, 92, 246, 0.06) 0%, transparent 50%),
            radial-gradient(ellipse 50% 40% at 80% 80%, rgba(236, 72, 153, 0.06) 0%, transparent 50%),
            var(--bg-void);
        }

        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.4;
          animation: orbFloat 20s ease-in-out infinite;
        }
        .orb-1 {
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.25), transparent 70%);
          top: -10%; left: -5%;
          animation-delay: 0s;
        }
        .orb-2 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.2), transparent 70%);
          top: 20%; right: -10%;
          animation-delay: -7s;
          animation-duration: 25s;
        }
        .orb-3 {
          width: 450px; height: 450px;
          background: radial-gradient(circle, rgba(236, 72, 153, 0.15), transparent 70%);
          bottom: 10%; left: 20%;
          animation-delay: -14s;
          animation-duration: 30s;
        }
        .orb-4 {
          width: 350px; height: 350px;
          background: radial-gradient(circle, rgba(245, 158, 11, 0.15), transparent 70%);
          top: 50%; right: 15%;
          animation-delay: -5s;
          animation-duration: 22s;
        }

        @keyframes orbFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(40px, -30px) scale(1.05); }
          50% { transform: translate(-20px, 40px) scale(0.95); }
          75% { transform: translate(30px, 20px) scale(1.02); }
        }

        /* ═══ GRID OVERLAY ═══ */
        .grid-overlay {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(148, 163, 184, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 20%, transparent 70%);
        }

        /* ═══ MAIN WRAPPER ═══ */
        .landing {
          position: relative;
          z-index: 1;
          min-height: 100vh;
        }

        .container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 28px;
        }

        /* ═══ NAVBAR ═══ */
        .navbar {
          position: sticky;
          top: 0;
          z-index: 1000;
          padding: 0 28px;
          backdrop-filter: blur(20px) saturate(1.5);
          -webkit-backdrop-filter: blur(20px) saturate(1.5);
          background: rgba(3, 7, 18, 0.7);
          border-bottom: 1px solid var(--border-dim);
        }
        .navbar-inner {
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 72px;
        }
        .nav-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          text-decoration: none;
        }
        .nav-logo {
          width: 44px; height: 44px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--indigo) 0%, var(--emerald) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          font-weight: 900;
          color: #fff;
          box-shadow: 0 0 24px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
          transition: transform 0.3s, box-shadow 0.3s;
        }
        .nav-brand:hover .nav-logo {
          transform: rotate(-8deg) scale(1.08);
          box-shadow: 0 0 36px rgba(99, 102, 241, 0.6), inset 0 1px 0 rgba(255,255,255,0.3);
        }
        .nav-brand-text { display: flex; flex-direction: column; }
        .nav-brand-name {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #fff 30%, var(--indigo-bright) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .nav-brand-sub {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--emerald);
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .nav-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          padding: 8px 16px;
          border-radius: var(--radius-sm);
          transition: all 0.25s;
          position: relative;
        }
        .nav-link:hover {
          color: #fff;
          background: rgba(255,255,255,0.05);
        }
        .nav-cta {
          background: linear-gradient(135deg, var(--indigo), var(--violet));
          color: #fff;
          padding: 10px 24px;
          border-radius: var(--radius-sm);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid rgba(255,255,255,0.15);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255,255,255,0.15);
          transition: all 0.3s;
          margin-left: 8px;
        }
        .nav-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(99, 102, 241, 0.5), inset 0 1px 0 rgba(255,255,255,0.2);
        }

        /* ═══ HERO ═══ */
        .hero {
          padding: 100px 0 80px;
          text-align: center;
          position: relative;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.25);
          border-radius: 100px;
          padding: 8px 20px 8px 12px;
          font-size: 13px;
          font-weight: 600;
          color: var(--indigo-bright);
          margin-bottom: 32px;
          backdrop-filter: blur(8px);
          animation: fadeSlideUp 0.8s ease-out both;
        }
        .badge-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--emerald);
          box-shadow: 0 0 12px var(--emerald);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .hero-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: clamp(40px, 6vw, 72px);
          font-weight: 800;
          line-height: 1.08;
          letter-spacing: -2px;
          max-width: 900px;
          margin: 0 auto 24px;
          animation: fadeSlideUp 0.8s ease-out 0.15s both;
        }
        .hero-title .grad-emerald {
          background: linear-gradient(135deg, var(--emerald-bright), var(--cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-title .grad-indigo {
          background: linear-gradient(135deg, var(--indigo-bright), var(--violet));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-desc {
          font-size: 18px;
          color: var(--text-secondary);
          max-width: 680px;
          margin: 0 auto 44px;
          line-height: 1.7;
          animation: fadeSlideUp 0.8s ease-out 0.3s both;
        }

        /* ═══ HERO FORM ═══ */
        .hero-form-wrap {
          max-width: 560px;
          margin: 0 auto 28px;
          animation: fadeSlideUp 0.8s ease-out 0.45s both;
        }
        .hero-form-card {
          background: var(--bg-card);
          border: 1px solid var(--border-glow);
          border-radius: var(--radius-lg);
          padding: 8px;
          backdrop-filter: blur(20px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03);
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .hero-form-card:focus-within {
          border-color: var(--border-active);
          box-shadow: 0 16px 48px rgba(0,0,0,0.4), 0 0 40px rgba(99, 102, 241, 0.15);
        }
        .hero-form {
          display: flex;
          gap: 8px;
        }
        .hero-input {
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-md);
          padding: 16px 20px;
          color: #fff;
          font-size: 15px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.3s, background 0.3s;
        }
        .hero-input:focus {
          border-color: var(--indigo);
          background: rgba(99, 102, 241, 0.06);
        }
        .hero-input::placeholder { color: var(--text-tertiary); }
        .hero-submit {
          background: linear-gradient(135deg, var(--emerald), #059669);
          color: #fff;
          border: none;
          border-radius: var(--radius-md);
          padding: 16px 28px;
          font-size: 15px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 4px 20px rgba(16, 185, 129, 0.35), inset 0 1px 0 rgba(255,255,255,0.15);
          transition: all 0.3s;
        }
        .hero-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(16, 185, 129, 0.5), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .hero-submit:active { transform: translateY(0); }

        .hero-trust {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          font-size: 13px;
          color: var(--text-tertiary);
          animation: fadeSlideUp 0.8s ease-out 0.6s both;
        }
        .trust-item { display: flex; align-items: center; gap: 6px; }

        /* ═══ HERO METRICS BAR ═══ */
        .metrics-bar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          max-width: 800px;
          margin: 60px auto 0;
          animation: fadeSlideUp 0.8s ease-out 0.75s both;
        }
        .metric-card {
          background: var(--bg-card);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-lg);
          padding: 28px 24px;
          text-align: center;
          backdrop-filter: blur(16px);
          transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
          position: relative;
          overflow: hidden;
        }
        .metric-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, transparent 40%, rgba(99, 102, 241, 0.05) 100%);
          opacity: 0;
          transition: opacity 0.4s;
        }
        .metric-card:hover {
          transform: translateY(-6px);
          border-color: var(--border-glow);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .metric-card:hover::before { opacity: 1; }
        .metric-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 36px;
          font-weight: 800;
          letter-spacing: -1px;
          margin-bottom: 4px;
        }
        .metric-label {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 500;
        }

        /* ═══ SECTION HEADERS ═══ */
        .section-header {
          text-align: center;
          max-width: 700px;
          margin: 0 auto 56px;
        }
        .section-tag {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 16px;
          padding: 6px 14px;
          border-radius: 100px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          color: var(--indigo-bright);
        }
        .section-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: clamp(28px, 4vw, 44px);
          font-weight: 800;
          letter-spacing: -1px;
          line-height: 1.15;
          margin-bottom: 16px;
        }
        .section-desc {
          font-size: 17px;
          color: var(--text-secondary);
          line-height: 1.7;
        }

        /* ═══ ENGINES SECTION ═══ */
        .engines-section { padding: 100px 0; }

        .engine-tabs {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-bottom: 48px;
          flex-wrap: wrap;
        }
        .engine-tab {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--bg-card);
          border: 1.5px solid var(--border-dim);
          color: var(--text-secondary);
          padding: 14px 24px;
          border-radius: var(--radius-md);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.35s cubic-bezier(0.23, 1, 0.32, 1);
          backdrop-filter: blur(8px);
        }
        .engine-tab:hover {
          color: #fff;
          background: var(--bg-elevated);
          border-color: var(--border-glow);
          transform: translateY(-2px);
        }
        .engine-tab.active {
          color: #fff;
          border-color: var(--border-active);
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.25), 0 0 0 1px rgba(99, 102, 241, 0.3);
          transform: translateY(-2px);
        }
        .engine-tab-icon { font-size: 20px; }

        .engine-content {
          background: var(--bg-card);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-xl);
          padding: 48px;
          backdrop-filter: blur(20px);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          align-items: start;
          box-shadow: 0 24px 64px rgba(0,0,0,0.3);
          position: relative;
          overflow: hidden;
          animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .engine-content::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          border-radius: 3px 3px 0 0;
        }
        .engine-info-block {}
        .engine-icon-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          padding: 8px 16px;
          border-radius: 100px;
          margin-bottom: 20px;
          color: #fff;
        }
        .engine-info-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin-bottom: 16px;
          line-height: 1.2;
        }
        .engine-info-desc {
          color: var(--text-secondary);
          font-size: 15px;
          line-height: 1.7;
          margin-bottom: 28px;
        }
        .engine-features-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .engine-feature-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .feature-check {
          width: 22px; height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* engine demo card */
        .engine-demo {
          background: rgba(0,0,0,0.35);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-lg);
          padding: 28px;
          position: relative;
          overflow: hidden;
        }
        .engine-demo::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
        }
        .demo-header {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .demo-header-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        .demo-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          margin-bottom: 6px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.03);
          transition: all 0.25s;
        }
        .demo-row:hover {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.06);
          transform: translateX(4px);
        }
        .demo-row-label {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .demo-row-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 600;
        }
        .demo-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          margin-top: 12px;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .demo-total-label {
          font-size: 14px;
          font-weight: 700;
          color: #fff;
        }
        .demo-total-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .demo-total-pct {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
          margin-left: 8px;
        }

        /* ═══ PLANS ═══ */
        .plans-section {
          padding: 100px 0;
          position: relative;
        }
        .plans-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          max-width: 1000px;
          margin: 0 auto;
        }
        .plan-card {
          background: var(--bg-card);
          border: 1.5px solid var(--border-dim);
          border-radius: var(--radius-xl);
          padding: 36px 32px;
          backdrop-filter: blur(16px);
          transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .plan-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
        }
        .plan-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 24px 56px rgba(0,0,0,0.4);
        }
        .plan-card.popular {
          border-color: rgba(99, 102, 241, 0.4);
          box-shadow: 0 0 48px rgba(99, 102, 241, 0.1);
          transform: scale(1.03);
        }
        .plan-card.popular:hover {
          transform: scale(1.03) translateY(-8px);
        }
        .plan-popular-badge {
          position: absolute;
          top: 16px; right: 16px;
          background: linear-gradient(135deg, var(--indigo), var(--violet));
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          padding: 4px 12px;
          border-radius: 100px;
          text-transform: uppercase;
        }
        .plan-name {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .plan-price {
          font-family: 'JetBrains Mono', monospace;
          font-size: 42px;
          font-weight: 800;
          letter-spacing: -1.5px;
          margin-bottom: 4px;
        }
        .plan-price-period {
          font-size: 16px;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .plan-orders {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 600;
          padding: 6px 14px;
          background: rgba(255,255,255,0.04);
          border-radius: 100px;
          display: inline-block;
          margin: 12px 0 24px;
        }
        .plan-divider {
          height: 1px;
          background: var(--border-dim);
          margin-bottom: 24px;
        }
        .plan-features {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 28px;
          flex: 1;
        }
        .plan-feature {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          color: var(--text-secondary);
        }
        .plan-feature-check {
          width: 18px; height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
        }
        .plan-cta {
          display: block;
          width: 100%;
          text-align: center;
          padding: 14px;
          border-radius: var(--radius-md);
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          border: 1.5px solid var(--border-dim);
          color: #fff;
          background: rgba(255,255,255,0.04);
          transition: all 0.3s;
        }
        .plan-cta:hover {
          background: rgba(255,255,255,0.08);
          border-color: var(--border-glow);
          transform: translateY(-2px);
        }
        .plan-cta.primary {
          background: linear-gradient(135deg, var(--indigo), var(--violet));
          border-color: rgba(255,255,255,0.15);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
        }
        .plan-cta.primary:hover {
          box-shadow: 0 8px 32px rgba(99, 102, 241, 0.5);
        }

        /* ═══ FAQ ═══ */
        .faq-section { padding: 100px 0; }
        .faq-list {
          max-width: 760px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .faq-item {
          background: var(--bg-card);
          border: 1.5px solid var(--border-dim);
          border-radius: var(--radius-md);
          overflow: hidden;
          backdrop-filter: blur(12px);
          transition: all 0.3s;
        }
        .faq-item.open {
          border-color: var(--border-glow);
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .faq-trigger {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 22px 28px;
          background: none;
          border: none;
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          transition: color 0.2s;
        }
        .faq-trigger:hover { color: var(--indigo-bright); }
        .faq-chevron {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.3s;
          flex-shrink: 0;
        }
        .faq-item.open .faq-chevron {
          background: rgba(99, 102, 241, 0.2);
          transform: rotate(180deg);
        }
        .faq-body {
          padding: 0 28px 24px;
          color: var(--text-secondary);
          font-size: 15px;
          line-height: 1.7;
          animation: fadeIn 0.3s ease-out;
        }

        /* ═══ CTA SECTION ═══ */
        .cta-section { padding: 80px 0 120px; }
        .cta-card {
          background: linear-gradient(135deg, rgba(30, 27, 75, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%);
          border: 1.5px solid rgba(99, 102, 241, 0.3);
          border-radius: var(--radius-xl);
          padding: 72px 48px;
          text-align: center;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(20px);
          box-shadow: 0 32px 72px rgba(0,0,0,0.5);
        }
        .cta-card::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          background: linear-gradient(135deg, var(--indigo), var(--violet), var(--emerald), var(--pink));
          opacity: 0.1;
          z-index: -1;
          animation: borderRotate 8s linear infinite;
        }
        @keyframes borderRotate {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }
        .cta-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: clamp(28px, 4vw, 44px);
          font-weight: 800;
          letter-spacing: -1px;
          margin-bottom: 16px;
        }
        .cta-desc {
          font-size: 17px;
          color: var(--text-secondary);
          max-width: 560px;
          margin: 0 auto 40px;
          line-height: 1.7;
        }
        .cta-form {
          max-width: 480px;
          margin: 0 auto;
        }

        /* ═══ FOOTER ═══ */
        .footer {
          padding: 40px 0;
          border-top: 1px solid var(--border-dim);
        }
        .footer-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .footer-copy {
          font-size: 13px;
          color: var(--text-tertiary);
        }
        .footer-links {
          display: flex;
          gap: 20px;
        }
        .footer-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: color 0.2s;
        }
        .footer-link:hover { color: #fff; }

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 900px) {
          .nav-links { display: none; }
          .engine-content { grid-template-columns: 1fr; padding: 32px 24px; }
          .plans-grid { grid-template-columns: 1fr; max-width: 400px; }
          .plan-card.popular { transform: none; }
          .plan-card.popular:hover { transform: translateY(-8px); }
          .metrics-bar { grid-template-columns: 1fr; max-width: 320px; }
          .hero-form { flex-direction: column; }
          .hero-trust { flex-direction: column; gap: 8px; }
          .cta-card { padding: 48px 24px; }
          .footer-inner { flex-direction: column; gap: 16px; text-align: center; }
        }
      `}</style>

      {/* Background */}
      <div className="bg-canvas">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
      </div>
      <div className="grid-overlay" />

      <div className="landing">
        {/* ═══ NAVBAR ═══ */}
        <nav className="navbar">
          <div className="navbar-inner">
            <a href="/" className="nav-brand">
              <div className="nav-logo">P</div>
              <div className="nav-brand-text">
                <span className="nav-brand-name">ProfitRx</span>
                <span className="nav-brand-sub">COD · RTO · Profit</span>
              </div>
            </a>
            <div className="nav-links">
              <a href="#features" className="nav-link">Features</a>
              <a href="#pricing" className="nav-link">Pricing</a>
              <a href="#faq" className="nav-link">FAQ</a>
              <a href="/privacy" className="nav-link">Privacy</a>
              <a href="/auth/login" className="nav-cta">Install App</a>
            </div>
          </div>
        </nav>

        {/* ═══ HERO ═══ */}
        <section className="hero">
          <div className="container">
            <div className="hero-badge">
              <span className="badge-dot" />
              Shopify Functions · Order Analytics · COD Protection
            </div>

            <h1 className="hero-title">
              Know your <span className="grad-emerald">real profit.</span>{" "}
              Block <span className="grad-indigo">risky COD.</span>
            </h1>

            <p className="hero-desc">
              ProfitRx deducts COGS, shipping slabs, gateway fees, and GST from every order
              to show net pocket profit — while Shopify Functions block COD for high-risk postal codes at checkout.
            </p>

            <div className="hero-form-wrap">
              <div className="hero-form-card">
                <form onSubmit={handleConnect} className="hero-form">
                  <input
                    className="hero-input"
                    type="text"
                    value={shopInput}
                    onChange={(e) => setShopInput(e.target.value)}
                    placeholder="your-store.myshopify.com"
                  />
                  <button type="submit" className="hero-submit">
                    Connect Store →
                  </button>
                </form>
              </div>
            </div>

            <div className="hero-trust">
              <span className="trust-item">🔒 Shopify OAuth</span>
              <span className="trust-item">⚡ 2-min setup</span>
              <span className="trust-item">🛡️ 14-day free trial</span>
            </div>

            {/* Metrics Bar */}
            <div className="metrics-bar">
              <div className="metric-card">
                <div className="metric-value" style={{ color: "var(--emerald-bright)" }}>
                  {counter1.value}.5%
                </div>
                <div className="metric-label">Avg. net margin visibility</div>
              </div>
              <div className="metric-card">
                <div className="metric-value" style={{ color: "var(--indigo-bright)" }}>
                  ₹{counter2.value.toLocaleString()}
                </div>
                <div className="metric-label">Sample RTO loss surfaced</div>
              </div>
              <div className="metric-card">
                <div className="metric-value" style={{ color: "var(--violet)" }}>
                  {counter3.value}
                </div>
                <div className="metric-label">Checkout decisions (demo)</div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ ENGINES ═══ */}
        <section id="features" className="engines-section">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">Core Capabilities</span>
              <h2 className="section-title">
                Four integrated modules for COD risk and profitability
              </h2>
              <p className="section-desc">
                Each module addresses a specific part of the COD order lifecycle —
                from cost calculation to checkout control to regional analytics.
              </p>
            </div>

            <div className="engine-tabs">
              {engines.map((eng, i) => (
                <button
                  key={i}
                  className={`engine-tab ${activeEngine === i ? "active" : ""}`}
                  onClick={() => setActiveEngine(i)}
                  style={
                    activeEngine === i
                      ? { background: currentEngine.gradient, borderColor: "transparent" }
                      : undefined
                  }
                >
                  <span className="engine-tab-icon">{eng.icon}</span>
                  {eng.title}
                </button>
              ))}
            </div>

            <div
              className="engine-content"
              key={activeEngine}
              style={{ "--engine-gradient": currentEngine.gradient } as React.CSSProperties}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "3px",
                  background: currentEngine.gradient,
                  borderRadius: "3px 3px 0 0",
                }}
              />

              <div className="engine-info-block">
                <div
                  className="engine-icon-badge"
                  style={{ background: currentEngine.gradient }}
                >
                  <span>{currentEngine.icon}</span>
                  {currentEngine.subtitle}
                </div>
                <h3 className="engine-info-title">{currentEngine.title}</h3>
                <p className="engine-info-desc">{currentEngine.description}</p>
                <ul className="engine-features-list">
                  {currentEngine.features.map((f, i) => (
                    <li key={i} className="engine-feature-item">
                      <span
                        className="feature-check"
                        style={{ background: currentEngine.gradient }}
                      >
                        ✓
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="engine-demo">
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "2px",
                    background: currentEngine.gradient,
                  }}
                />
                <div className="demo-header">
                  <span>{currentEngine.demo.title}</span>
                  <span
                    className="demo-header-dot"
                    style={{ background: currentEngine.glow.replace("0.3", "1") }}
                  />
                </div>
                {currentEngine.demo.rows.map((row, i) => (
                  <div className="demo-row" key={i}>
                    <span className="demo-row-label">{row.label}</span>
                    <span className="demo-row-value" style={{ color: row.color }}>
                      {row.value}
                    </span>
                  </div>
                ))}
                <div
                  className="demo-total"
                  style={{ background: currentEngine.glow.replace("0.3", "0.08") }}
                >
                  <span className="demo-total-label">{currentEngine.demo.total.label}</span>
                  <span>
                    <span
                      className="demo-total-value"
                      style={{ color: currentEngine.glow.replace("0.3", "1") }}
                    >
                      {currentEngine.demo.total.value}
                    </span>
                    <span className="demo-total-pct">{currentEngine.demo.total.pct}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ PLANS ═══ */}
        <section id="pricing" className="plans-section">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">Pricing</span>
              <h2 className="section-title">Subscription plans</h2>
              <p className="section-desc">
                All plans include a 14-day free trial. Billed through the Shopify Billing API.
              </p>
            </div>

            <div className="plans-grid">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`plan-card ${plan.popular ? "popular" : ""}`}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "3px",
                      background: `linear-gradient(135deg, ${plan.color}, ${plan.color}88)`,
                    }}
                  />
                  {plan.popular && <div className="plan-popular-badge">Popular</div>}
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price" style={{ color: plan.color }}>
                    {plan.price}
                    <span className="plan-price-period">/mo</span>
                  </div>
                  <span className="plan-orders">{plan.orders}</span>
                  <div className="plan-divider" />
                  <ul className="plan-features">
                    {plan.features.map((f, i) => (
                      <li key={i} className="plan-feature">
                        <span
                          className="plan-feature-check"
                          style={{ background: plan.color }}
                        >
                          ✓
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="/auth/login"
                    className={`plan-cta ${plan.popular ? "primary" : ""}`}
                  >
                    Start Free Trial
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        <section id="faq" className="faq-section">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">FAQ</span>
              <h2 className="section-title">Common questions</h2>
            </div>

            <div className="faq-list">
              {faqs.map((faq, i) => (
                <div key={i} className={`faq-item ${openFaq === i ? "open" : ""}`}>
                  <button
                    className="faq-trigger"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    <span>{faq.q}</span>
                    <span className="faq-chevron">▾</span>
                  </button>
                  {openFaq === i && <div className="faq-body">{faq.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ BOTTOM CTA ═══ */}
        <section className="cta-section">
          <div className="container">
            <div className="cta-card">
              <h2 className="cta-title">
                Start tracking real profit today
              </h2>
              <p className="cta-desc">
                Connect your store and see order-level net margins, COD risk scoring,
                and pincode delivery analytics within minutes.
              </p>
              <div className="cta-form">
                <div className="hero-form-card">
                  <form onSubmit={handleConnect} className="hero-form">
                    <input
                      className="hero-input"
                      type="text"
                      value={shopInput}
                      onChange={(e) => setShopInput(e.target.value)}
                      placeholder="your-store.myshopify.com"
                    />
                    <button type="submit" className="hero-submit">
                      Connect →
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ FOOTER ═══ */}
        <footer className="footer">
          <div className="container">
            <div className="footer-inner">
              <span className="footer-copy">© 2026 ProfitRx Inc. Built for Shopify.</span>
              <div className="footer-links">
                <a href="/privacy" className="footer-link">Privacy Policy</a>
                <a href="mailto:xlr8.jpeg@gmail.com" className="footer-link">Support</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
