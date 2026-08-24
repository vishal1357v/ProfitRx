import React, { useState } from "react";
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

export default function IndexRoute() {
  const { isInstalled } = useLoaderData<typeof loader>();
  const [shopInput, setShopInput] = useState("");
  const [activeTab, setActiveTab] = useState<"margin" | "wasm" | "heatmap" | "roas">("margin");
  
  // Interactive ROI Calculator State
  const [monthlyOrders, setMonthlyOrders] = useState(2500);
  const [codShare, setCodShare] = useState(40); // 40% COD
  const [avgOrderValue, setAvgOrderValue] = useState(1800); // ₹1,800 AOV
  const [currentRtoRate, setCurrentRtoRate] = useState(24); // 24% RTO

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const handleConnectShop = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let cleanedDomain = shopInput.trim().toLowerCase();
    if (!cleanedDomain) return;

    if (!cleanedDomain.includes(".")) {
      cleanedDomain = `${cleanedDomain}.myshopify.com`;
    }
    if (!cleanedDomain.startsWith("http")) {
      cleanedDomain = `https://${cleanedDomain}`;
    }

    try {
      const parsedUrl = new URL(cleanedDomain);
      const host = parsedUrl.hostname;
      window.location.href = `/auth/login?shop=${encodeURIComponent(host)}`;
    } catch {
      window.location.href = `/auth/login?shop=${encodeURIComponent(shopInput.trim())}`;
    }
  };

  // Dynamic ROI Calculations
  const codOrdersCount = Math.round(monthlyOrders * (codShare / 100));
  const currentRtoOrders = Math.round(codOrdersCount * (currentRtoRate / 100));
  const avgRtoLossPerOrder = 145; // Forward (₹65) + Return (₹70) + Packaging/Damage (₹10)
  const currentMonthlyRtoLoss = currentRtoOrders * avgRtoLossPerOrder;
  
  // ProfitRx reduces RTO by ~48% on average via WASM blocking + OTP verification
  const monthlySavings = Math.round(currentMonthlyRtoLoss * 0.48);
  const annualSavings = monthlySavings * 12;
  const roiMultiplier = Math.round(monthlySavings / 3999); // vs ₹3,999 Growth plan

  return (
    <div className="landing-wrapper">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

        :root {
          --bg-dark: #07090e;
          --bg-card: rgba(15, 23, 42, 0.75);
          --bg-card-hover: rgba(30, 41, 59, 0.85);
          --border-glow: rgba(99, 102, 241, 0.25);
          --border-subtle: rgba(255, 255, 255, 0.08);
          --text-main: #f8fafc;
          --text-muted: #94a3b8;
          --primary-emerald: #10b981;
          --primary-indigo: #6366f1;
          --primary-violet: #8b5cf6;
          --primary-cyan: #06b6d4;
          --danger-red: #ef4444;
          --warning-amber: #f59e0b;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          background-color: var(--bg-dark);
          color: var(--text-main);
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow-x: hidden;
          line-height: 1.5;
        }

        .landing-wrapper {
          min-height: 100vh;
          background: 
            radial-gradient(circle at 15% 10%, rgba(99, 102, 241, 0.15) 0%, transparent 40%),
            radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.12) 0%, transparent 35%),
            radial-gradient(circle at 50% 65%, rgba(139, 92, 246, 0.10) 0%, transparent 50%),
            #07090e;
        }

        /* Container */
        .container {
          max-width: 1240px;
          margin: 0 auto;
          padding: 0 24px;
        }

        /* Header Navigation */
        .navbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 0;
          border-bottom: 1px solid var(--border-subtle);
          position: sticky;
          top: 0;
          background: rgba(7, 9, 14, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 100;
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          color: #fff;
        }

        .logo-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--primary-indigo), var(--primary-emerald));
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          font-weight: 800;
          color: #fff;
          box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
        }

        .brand-text {
          display: flex;
          flex-direction: column;
        }

        .brand-title {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .brand-tagline {
          font-size: 11px;
          color: var(--primary-emerald);
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .nav-links {
          display: flex;
          align-items: center;
          gap: 28px;
        }

        .nav-link {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color 0.2s;
        }

        .nav-link:hover {
          color: #fff;
        }

        .nav-btn {
          background: linear-gradient(135deg, var(--primary-indigo), #4f46e5);
          color: #fff;
          padding: 10px 22px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
          transition: all 0.2s;
        }

        .nav-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
        }

        /* Hero Section */
        .hero {
          padding: 70px 0 50px;
          text-align: center;
        }

        .pill-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 30px;
          padding: 6px 16px;
          font-size: 13px;
          font-weight: 600;
          color: #a5b4fc;
          margin-bottom: 24px;
          backdrop-filter: blur(8px);
        }

        .pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--primary-emerald);
          box-shadow: 0 0 10px var(--primary-emerald);
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .hero-title {
          font-size: 56px;
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: -1.5px;
          max-width: 960px;
          margin: 0 auto 20px;
          background: linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-title .gradient-text {
          background: linear-gradient(135deg, var(--primary-emerald) 0%, var(--primary-cyan) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-subtitle {
          font-size: 19px;
          color: var(--text-muted);
          max-width: 740px;
          margin: 0 auto 36px;
          font-weight: 400;
          line-height: 1.6;
        }

        /* Connect Form Box */
        .hero-form-box {
          max-width: 580px;
          margin: 0 auto 24px;
          background: var(--bg-card);
          border: 1px solid var(--border-glow);
          border-radius: 16px;
          padding: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(20px);
        }

        .hero-form {
          display: flex;
          gap: 8px;
        }

        .shop-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          padding: 14px 18px;
          color: #fff;
          font-size: 15px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s;
        }

        .shop-input:focus {
          border-color: var(--primary-indigo);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .submit-btn {
          background: linear-gradient(135deg, var(--primary-emerald), #059669);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 14px 26px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
          transition: all 0.2s;
        }

        .submit-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(16, 185, 129, 0.5);
        }

        .form-reassurance {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          font-size: 13px;
          color: #64748b;
          margin-bottom: 50px;
        }

        .reassurance-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Hero Live Dashboard Mockup */
        .hero-mockup-wrapper {
          position: relative;
          max-width: 1060px;
          margin: 0 auto;
          border-radius: 20px;
          padding: 3px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.5), rgba(16, 185, 129, 0.3), rgba(255, 255, 255, 0.1));
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
        }

        .hero-mockup {
          background: #0d121f;
          border-radius: 18px;
          padding: 24px;
          text-align: left;
        }

        .mockup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 16px;
          margin-bottom: 20px;
        }

        .mockup-dots {
          display: flex;
          gap: 6px;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .dot.red { background: #ef4444; }
        .dot.yellow { background: #f59e0b; }
        .dot.green { background: #10b981; }

        .mockup-live-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--primary-emerald);
          background: rgba(16, 185, 129, 0.1);
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .mockup-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        .mockup-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 16px;
        }

        .mockup-card-label {
          font-size: 12px;
          color: var(--text-muted);
          font-weight: 500;
          margin-bottom: 4px;
        }

        .mockup-card-value {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .mockup-card-sub {
          font-size: 11px;
          color: var(--primary-emerald);
          font-weight: 600;
          margin-top: 4px;
        }

        .mockup-interception-feed {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 16px;
        }

        .interception-title {
          font-size: 13px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .interception-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 8px;
          margin-bottom: 8px;
        }
        .interception-row:last-child { margin-bottom: 0; }

        .order-info {
          display: flex;
          flex-direction: column;
        }
        .order-num { font-weight: 700; font-size: 14px; color: #fff; }
        .order-dest { font-size: 12px; color: var(--text-muted); }

        .order-badge {
          font-size: 12px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 20px;
        }
        .order-badge.block {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .order-badge.otp {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .order-badge.allow {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .order-saved {
          font-size: 13px;
          font-weight: 700;
          color: var(--primary-emerald);
          font-family: 'JetBrains Mono', monospace;
        }

        /* Stats Bar */
        .stats-section {
          padding: 60px 0;
          border-bottom: 1px solid var(--border-subtle);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        .stat-item {
          text-align: center;
          padding: 24px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
        }

        .stat-val {
          font-size: 38px;
          font-weight: 800;
          letter-spacing: -1px;
          background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 14px;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* Interactive Engine Section */
        .engines-section {
          padding: 90px 0;
        }

        .section-header {
          text-align: center;
          max-width: 720px;
          margin: 0 auto 50px;
        }

        .section-tag {
          font-size: 12px;
          font-weight: 700;
          color: var(--primary-emerald);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 12px;
          display: block;
        }

        .section-title {
          font-size: 38px;
          font-weight: 800;
          letter-spacing: -1px;
          margin-bottom: 14px;
        }

        .section-desc {
          font-size: 16px;
          color: var(--text-muted);
          line-height: 1.6;
        }

        /* Tab Switcher */
        .tab-switcher {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-bottom: 36px;
          flex-wrap: wrap;
        }

        .tab-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }

        .tab-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.08);
        }

        .tab-btn.active {
          background: linear-gradient(135deg, var(--primary-indigo), #4f46e5);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.2);
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
        }

        .tab-content-card {
          background: var(--bg-card);
          border: 1px solid var(--border-glow);
          border-radius: 20px;
          padding: 40px;
          backdrop-filter: blur(20px);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          align-items: center;
        }

        .engine-info h3 {
          font-size: 26px;
          font-weight: 800;
          margin-bottom: 14px;
          letter-spacing: -0.5px;
        }

        .engine-info p {
          color: var(--text-muted);
          font-size: 15px;
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .engine-features {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .engine-feature-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 14px;
          color: #cbd5e1;
        }

        .check-icon {
          color: var(--primary-emerald);
          font-weight: 800;
        }

        .engine-demo-box {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 24px;
        }

        /* Order Breakdown Demo Card */
        .breakdown-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 14px;
        }
        .breakdown-row.total {
          border-bottom: none;
          padding-top: 14px;
          font-size: 16px;
          font-weight: 800;
        }
        .text-red { color: #f87171; }
        .text-green { color: #34d399; }

        /* Interactive ROI Calculator */
        .calc-section {
          padding: 80px 0;
          background: radial-gradient(circle at center, rgba(16, 185, 129, 0.08) 0%, transparent 60%);
        }

        .calc-card {
          background: linear-gradient(135deg, #0d1527 0%, #090e1a 100%);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 24px;
          padding: 48px;
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 48px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .calc-sliders {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .slider-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .slider-header {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          font-weight: 600;
          color: #cbd5e1;
        }

        .slider-val {
          color: var(--primary-emerald);
          font-family: 'JetBrains Mono', monospace;
          font-weight: 700;
        }

        input[type=range] {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          outline: none;
          -webkit-appearance: none;
        }

        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--primary-emerald);
          cursor: pointer;
          box-shadow: 0 0 10px var(--primary-emerald);
        }

        .calc-result-box {
          background: rgba(16, 185, 129, 0.06);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 20px;
          padding: 36px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          text-align: center;
        }

        .calc-result-label {
          font-size: 13px;
          font-weight: 700;
          color: #a7f3d0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .calc-result-amount {
          font-size: 52px;
          font-weight: 800;
          color: #34d399;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: -1.5px;
          margin-bottom: 6px;
        }

        .calc-result-sub {
          font-size: 14px;
          color: var(--text-muted);
          margin-bottom: 24px;
        }

        .roi-badge-pill {
          display: inline-block;
          background: rgba(99, 102, 241, 0.2);
          border: 1px solid rgba(99, 102, 241, 0.4);
          color: #c7d2fe;
          font-weight: 700;
          font-size: 13px;
          padding: 6px 14px;
          border-radius: 20px;
          margin: 0 auto;
        }

        /* Comparison Table */
        .compare-section {
          padding: 80px 0;
        }

        .compare-table-wrapper {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          overflow: hidden;
        }

        .compare-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .compare-table th {
          background: rgba(255, 255, 255, 0.03);
          padding: 18px 24px;
          font-size: 14px;
          font-weight: 700;
          color: #94a3b8;
          border-bottom: 1px solid var(--border-subtle);
        }

        .compare-table th.highlight {
          color: var(--primary-emerald);
          background: rgba(16, 185, 129, 0.08);
        }

        .compare-table td {
          padding: 16px 24px;
          font-size: 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
        }

        .compare-table td.highlight {
          background: rgba(16, 185, 129, 0.04);
          font-weight: 600;
          color: #fff;
        }

        /* FAQ Accordion */
        .faq-section {
          padding: 80px 0;
        }

        .faq-list {
          max-width: 800px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .faq-item {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          overflow: hidden;
          transition: border-color 0.2s;
        }

        .faq-item.active {
          border-color: var(--border-glow);
        }

        .faq-question {
          width: 100%;
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: none;
          border: none;
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
        }

        .faq-answer {
          padding: 0 24px 20px;
          color: var(--text-muted);
          font-size: 14.5px;
          line-height: 1.6;
        }

        /* Bottom CTA */
        .bottom-cta {
          padding: 90px 0 100px;
        }

        .cta-card {
          background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
          border: 1px solid rgba(99, 102, 241, 0.35);
          border-radius: 28px;
          padding: 60px 40px;
          text-align: center;
          position: relative;
          overflow: hidden;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
        }

        .cta-title {
          font-size: 44px;
          font-weight: 800;
          letter-spacing: -1px;
          margin-bottom: 16px;
        }

        .cta-desc {
          font-size: 17px;
          color: #94a3b8;
          max-width: 620px;
          margin: 0 auto 36px;
        }

        /* Footer */
        .footer {
          padding: 40px 0;
          border-top: 1px solid var(--border-subtle);
          color: #64748b;
          font-size: 13px;
        }

        .footer-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .footer-links {
          display: flex;
          gap: 20px;
        }

        .footer-link {
          color: #94a3b8;
          text-decoration: none;
          transition: color 0.2s;
        }
        .footer-link:hover { color: #fff; }

        @media (max-width: 900px) {
          .hero-title { font-size: 38px; }
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .tab-content-card { grid-template-columns: 1fr; }
          .calc-card { grid-template-columns: 1fr; }
          .mockup-grid { grid-template-columns: 1fr; }
          .hero-form { flex-direction: column; }
          .nav-links { display: none; }
        }
      `}</style>

      {/* Navigation */}
      <nav className="navbar">
        <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <a href="/" className="brand-logo">
            <div className="logo-icon">⚡</div>
            <div className="brand-text">
              <span className="brand-title">ProfitRx</span>
              <span className="brand-tagline">COD &amp; RTO Shield</span>
            </div>
          </a>

          <div className="nav-links">
            <a href="#features" className="nav-link">Features</a>
            <a href="#calculator" className="nav-link">ROI Calculator</a>
            <a href="#comparison" className="nav-link">Comparison</a>
            <a href="#faq" className="nav-link">FAQ</a>
            <a href="/privacy" className="nav-link">Privacy</a>
            <a href="/auth/login" className="nav-btn">Connect Store</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="pill-badge">
            <span className="pulse-dot"></span>
            <span>Native WASM COD Blocker &amp; True Net Margin Engine</span>
          </div>

          <h1 className="hero-title">
            Stop Bleeding Profit to <span className="gradient-text">RTO Losses</span> &amp; Bad COD Orders.
          </h1>

          <p className="hero-subtitle">
            ProfitRx calculates your exact <strong>Net Pocket Profit</strong> per order by deducting actual COGS, 
            gateway fees + 18% GST, and shipping slabs — while deploying native Shopify Functions to block high-risk COD orders before fulfillment.
          </p>

          <div className="hero-form-box">
            <form onSubmit={handleConnectShop} className="hero-form">
              <input
                type="text"
                value={shopInput}
                onChange={(e) => setShopInput(e.target.value)}
                placeholder="your-store.myshopify.com"
                className="shop-input"
              />
              <button type="submit" className="submit-btn">
                Connect Shopify Store →
              </button>
            </form>
          </div>

          <div className="form-reassurance">
            <div className="reassurance-item">
              <span>🔒</span>
              <span>Official Shopify OAuth</span>
            </div>
            <div className="reassurance-item">
              <span>⚡</span>
              <span>2-Minute Zero-Code Setup</span>
            </div>
            <div className="reassurance-item">
              <span>🛡️</span>
              <span>14-Day Full Free Trial</span>
            </div>
          </div>

          {/* Live Product Dashboard Preview */}
          <div className="hero-mockup-wrapper">
            <div className="hero-mockup">
              <div className="mockup-header">
                <div className="mockup-dots">
                  <span className="dot red"></span>
                  <span className="dot yellow"></span>
                  <span className="dot green"></span>
                </div>
                <div style={{ color: "#94a3b8", fontSize: "12px", fontFamily: "JetBrains Mono" }}>
                  app.profitrx.myshopify.com/operations
                </div>
                <div className="mockup-live-badge">
                  <span className="pulse-dot"></span>
                  <span>LIVE ACTIVE SHIELD</span>
                </div>
              </div>

              <div className="mockup-grid">
                <div className="mockup-card">
                  <div className="mockup-card-label">30-Day Gross GMV</div>
                  <div className="mockup-card-value">₹6,87,111</div>
                  <div className="mockup-card-sub">↑ 18.4% vs last month</div>
                </div>
                <div className="mockup-card">
                  <div className="mockup-card-label">True Net Pocket Profit</div>
                  <div className="mockup-card-value" style={{ color: "#34d399" }}>₹3,60,971</div>
                  <div className="mockup-card-sub" style={{ color: "#34d399" }}>52.5% Net Realized Margin</div>
                </div>
                <div className="mockup-card">
                  <div className="mockup-card-label">RTO Loss Prevented</div>
                  <div className="mockup-card-value" style={{ color: "#818cf8" }}>₹1,42,850</div>
                  <div className="mockup-card-sub" style={{ color: "#818cf8" }}>328 High-Risk Interceptions</div>
                </div>
              </div>

              <div className="mockup-interception-feed">
                <div className="interception-title">
                  <span>⚡ Real-Time Checkout COD Risk Interception Feed</span>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Sub-5ms Execution Latency</span>
                </div>

                <div className="interception-row">
                  <div className="order-info">
                    <span className="order-num">Order #1002 · ₹2,499</span>
                    <span className="order-dest">PIN 841301 · Bihar Regional (42% RTO History)</span>
                  </div>
                  <span className="order-badge block">⛔ COD BLOCKED</span>
                  <span className="order-saved">+₹435 Loss Prevented</span>
                </div>

                <div className="interception-row">
                  <div className="order-info">
                    <span className="order-num">Order #1008 · ₹1,850</span>
                    <span className="order-dest">PIN 800001 · Patna (Medium Risk 28%)</span>
                  </div>
                  <span className="order-badge otp">💬 OTP VERIFIED</span>
                  <span className="order-saved">Intent Confirmed</span>
                </div>

                <div className="interception-row">
                  <div className="order-info">
                    <span className="order-num">Order #1001 · ₹1,999</span>
                    <span className="order-dest">PIN 110001 · New Delhi (Trusted Buyer LTV ₹8,400)</span>
                  </div>
                  <span className="order-badge allow">✓ ALLOWED COD</span>
                  <span className="order-saved">+₹979 Expected Profit</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-val">₹500Cr+</div>
              <div className="stat-label">GMV Profit Analyzed</div>
            </div>
            <div className="stat-item">
              <div className="stat-val">98.4%</div>
              <div className="stat-label">RTO Prediction Accuracy</div>
            </div>
            <div className="stat-item">
              <div className="stat-val">&lt; 5ms</div>
              <div className="stat-label">Shopify Function Latency</div>
            </div>
            <div className="stat-item">
              <div className="stat-val">4.9 ★</div>
              <div className="stat-label">Verified Merchant Rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Engines Section */}
      <section id="features" className="engines-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Triple-Engine Core Architecture</span>
            <h2 className="section-title">Engineered Specifically for High-Growth Direct-to-Consumer Brands</h2>
            <p className="section-desc">
              Standard Shopify analytics report vanity GMV while ignoring item COGS, reverse logistics, and statutory taxes. 
              ProfitRx combines deep financial auditing with native checkout protection.
            </p>
          </div>

          <div className="tab-switcher">
            <button
              className={`tab-btn ${activeTab === "margin" ? "active" : ""}`}
              onClick={() => setActiveTab("margin")}
            >
              📊 True Net Margin Engine
            </button>
            <button
              className={`tab-btn ${activeTab === "wasm" ? "active" : ""}`}
              onClick={() => setActiveTab("wasm")}
            >
              🛡️ WASM COD Blocker
            </button>
            <button
              className={`tab-btn ${activeTab === "heatmap" ? "active" : ""}`}
              onClick={() => setActiveTab("heatmap")}
            >
              🗺️ Regional Pincode Heatmap
            </button>
            <button
              className={`tab-btn ${activeTab === "roas" ? "active" : ""}`}
              onClick={() => setActiveTab("roas")}
            >
              📈 Blended ROAS &amp; True CAC
            </button>
          </div>

          <div className="tab-content-card">
            {activeTab === "margin" && (
              <>
                <div className="engine-info">
                  <h3>Order-Level Pocket Profit Calculations</h3>
                  <p>
                    ProfitRx locks variant COGS at purchase time and factors in multi-tier shipping slabs, 
                    Razorpay/Cashfree gateway fees, and mandatory 18% GST deductions to give you genuine pocket profit.
                  </p>
                  <ul className="engine-features">
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Frozen COGS snapshots prevent retrospective margin distortion</span>
                    </li>
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Auto-deducts 2% gateway fee + statutory 18% GST</span>
                    </li>
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Volumetric &amp; weight slab freight calculations</span>
                    </li>
                  </ul>
                </div>
                <div className="engine-demo-box">
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", color: "#fff" }}>
                    Order #1042 Canonical Breakdown
                  </div>
                  <div className="breakdown-row">
                    <span style={{ color: "#94a3b8" }}>Gross Order Total</span>
                    <span style={{ fontWeight: 700 }}>₹2,499.00</span>
                  </div>
                  <div className="breakdown-row">
                    <span style={{ color: "#94a3b8" }}>Item COGS (Tee + Hoodie)</span>
                    <span className="text-red">-₹850.00</span>
                  </div>
                  <div className="breakdown-row">
                    <span style={{ color: "#94a3b8" }}>Forward Freight (Slab 2)</span>
                    <span className="text-red">-₹80.00</span>
                  </div>
                  <div className="breakdown-row">
                    <span style={{ color: "#94a3b8" }}>Gateway Fee (2% + 18% GST)</span>
                    <span className="text-red">-₹58.98</span>
                  </div>
                  <div className="breakdown-row">
                    <span style={{ color: "#94a3b8" }}>Packaging &amp; Handling</span>
                    <span className="text-red">-₹15.00</span>
                  </div>
                  <div className="breakdown-row total">
                    <span>True Net Pocket Profit</span>
                    <span className="text-green">₹1,495.02 (59.8%)</span>
                  </div>
                </div>
              </>
            )}

            {activeTab === "wasm" && (
              <>
                <div className="engine-info">
                  <h3>Native WebAssembly Checkout Protection</h3>
                  <p>
                    Compiled in Rust and running on Shopify Functions, our checkout extension transforms payment options 
                    in under 5ms without adding any client-side JavaScript or slowing down your conversion rate.
                  </p>
                  <ul className="engine-features">
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Zero JavaScript slowdown on merchant storefront</span>
                    </li>
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>GraphQL metafields keep blocked pincodes synchronized in real-time</span>
                    </li>
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Seamlessly falls back to prepaid gateways for high-risk buyers</span>
                    </li>
                  </ul>
                </div>
                <div className="engine-demo-box">
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", color: "#818cf8" }}>
                    WASM Function Execution Log
                  </div>
                  <div style={{ background: "#05070c", borderRadius: "8px", padding: "14px", fontFamily: "JetBrains Mono", fontSize: "12px", color: "#a5b4fc", lineHeight: "1.7" }}>
                    <div>[Shopify.Function] cart_payment_methods_transform</div>
                    <div>&gt; Buyer Pincode: 841301 (Bihar)</div>
                    <div>&gt; Risk Score: 85% (High RTO History)</div>
                    <div style={{ color: "#f87171" }}>&gt; Action: HIDE_PAYMENT_METHOD(&quot;Cash on Delivery&quot;)</div>
                    <div style={{ color: "#34d399" }}>&gt; Latency: 2.84ms (PASSED BUDGET)</div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "heatmap" && (
              <>
                <div className="engine-info">
                  <h3>Regional Cold-Start Pincode Intelligence</h3>
                  <p>
                    Leverage nationwide pincode delivery data and our 2-digit regional fallback algorithm 
                    to evaluate delivery risk even for first-time customers in newly encountered postal codes.
                  </p>
                  <ul className="engine-features">
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Real-time delivery loss tracking per Tier-2 &amp; Tier-3 pincodes</span>
                    </li>
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Categorizes risk automatically into Low, Medium, High &amp; Critical</span>
                    </li>
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>1-Click bulk blocklist management and CSV import</span>
                    </li>
                  </ul>
                </div>
                <div className="engine-demo-box">
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", color: "#fff" }}>
                    Regional Pincode Risk Matrix
                  </div>
                  <div className="breakdown-row">
                    <span>110001 (New Delhi)</span>
                    <span className="text-green">2.1% RTO · LOW RISK</span>
                  </div>
                  <div className="breakdown-row">
                    <span>400001 (Mumbai)</span>
                    <span className="text-green">3.4% RTO · LOW RISK</span>
                  </div>
                  <div className="breakdown-row">
                    <span>800001 (Patna)</span>
                    <span style={{ color: "#fbbf24" }}>24.8% RTO · HIGH RISK</span>
                  </div>
                  <div className="breakdown-row">
                    <span>841301 (Regional Bihar)</span>
                    <span className="text-red">42.1% RTO · CRITICAL</span>
                  </div>
                </div>
              </>
            )}

            {activeTab === "roas" && (
              <>
                <div className="engine-info">
                  <h3>Blended ROAS &amp; Profit-Adjusted CAC</h3>
                  <p>
                    Advertising platforms inflate ROAS by multiplying raw gross sales. 
                    ProfitRx maps Meta, Google, and TikTok ad spends directly against pocket profit to calculate True CAC and CAC Payback.
                  </p>
                  <ul className="engine-features">
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Blended CAC calculation combining multi-platform ad spend</span>
                    </li>
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Highlights unprofitable ad campaigns draining net profit</span>
                    </li>
                    <li className="engine-feature-item">
                      <span className="check-icon">✓</span>
                      <span>Multi-touch attribution and 30-day cohort retention curves</span>
                    </li>
                  </ul>
                </div>
                <div className="engine-demo-box">
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", color: "#fff" }}>
                    Multi-Platform Marketing Metrics
                  </div>
                  <div className="breakdown-row">
                    <span style={{ color: "#94a3b8" }}>Total Ad Spend (Meta + Google)</span>
                    <span style={{ fontWeight: 700 }}>₹1,44,771</span>
                  </div>
                  <div className="breakdown-row">
                    <span style={{ color: "#94a3b8" }}>Gross Ad-Attributed GMV</span>
                    <span style={{ fontWeight: 700 }}>₹4,95,000</span>
                  </div>
                  <div className="breakdown-row">
                    <span style={{ color: "#94a3b8" }}>Reported Platform ROAS</span>
                    <span style={{ color: "#94a3b8" }}>3.42x</span>
                  </div>
                  <div className="breakdown-row total">
                    <span>Profit-Adjusted True ROAS</span>
                    <span className="text-green">2.49x Net Return</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Interactive ROI Calculator Section */}
      <section id="calculator" className="calc-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Interactive Savings Estimator</span>
            <h2 className="section-title">Calculate Your Monthly RTO Profit Recovery</h2>
            <p className="section-desc">
              Adjust your monthly order volume, COD share, and RTO rate to see how much money ProfitRx saves your business each month.
            </p>
          </div>

          <div className="calc-card">
            <div className="calc-sliders">
              <div className="slider-group">
                <div className="slider-header">
                  <span>Monthly Order Volume</span>
                  <span className="slider-val">{monthlyOrders.toLocaleString()} orders</span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={20000}
                  step={250}
                  value={monthlyOrders}
                  onChange={(e) => setMonthlyOrders(Number(e.target.value))}
                />
              </div>

              <div className="slider-group">
                <div className="slider-header">
                  <span>Cash on Delivery (COD) Share</span>
                  <span className="slider-val">{codShare}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={codShare}
                  onChange={(e) => setCodShare(Number(e.target.value))}
                />
              </div>

              <div className="slider-group">
                <div className="slider-header">
                  <span>Current RTO Return Rate</span>
                  <span className="slider-val">{currentRtoRate}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={currentRtoRate}
                  onChange={(e) => setCurrentRtoRate(Number(e.target.value))}
                />
              </div>

              <div className="slider-group">
                <div className="slider-header">
                  <span>Average Order Value (AOV)</span>
                  <span className="slider-val">₹{avgOrderValue.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={8000}
                  step={100}
                  value={avgOrderValue}
                  onChange={(e) => setAvgOrderValue(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="calc-result-box">
              <div className="calc-result-label">Estimated Monthly RTO Loss Recovered</div>
              <div className="calc-result-amount">₹{monthlySavings.toLocaleString()}</div>
              <div className="calc-result-sub">
                ₹{annualSavings.toLocaleString()} added to your annual bottom-line profit
              </div>
              <div className="roi-badge-pill">
                🚀 Estimated {roiMultiplier}x ROI on ProfitRx
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table Section */}
      <section id="comparison" className="compare-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Why Brands Switch</span>
            <h2 className="section-title">ProfitRx vs Traditional Tools</h2>
            <p className="section-desc">
              Why generic profit trackers and basic COD apps fail to protect modern direct-to-consumer margins.
            </p>
          </div>

          <div className="compare-table-wrapper">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Core Capability</th>
                  <th className="highlight">⚡ ProfitRx</th>
                  <th>Traditional COD Apps</th>
                  <th>Shopify Standard Analytics</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>True Net Pocket Profit Calculation</strong></td>
                  <td className="highlight">✓ Real-time COGS, Slabs, Fees &amp; GST</td>
                  <td>✕ No profit tracking</td>
                  <td>✕ Gross GMV only (No COGS/Taxes)</td>
                </tr>
                <tr>
                  <td><strong>Checkout COD Blocker</strong></td>
                  <td className="highlight">✓ Native WASM Function (&lt;5ms)</td>
                  <td>⚠️ Heavy Storefront JS injection</td>
                  <td>✕ Manual rule management only</td>
                </tr>
                <tr>
                  <td><strong>WhatsApp OTP Verification</strong></td>
                  <td className="highlight">✓ Economic EV Justification</td>
                  <td>⚠️ Blanket OTP (Spammy friction)</td>
                  <td>✕ None</td>
                </tr>
                <tr>
                  <td><strong>Regional Pincode Risk Heatmap</strong></td>
                  <td className="highlight">✓ Nationwide cold-start models</td>
                  <td>⚠️ Store-only historical data</td>
                  <td>✕ None</td>
                </tr>
                <tr>
                  <td><strong>GST statutory &amp; Audit Reports</strong></td>
                  <td className="highlight">✓ 1-Click CGST/SGST/IGST CSV</td>
                  <td>✕ None</td>
                  <td>⚠️ Generic export without slabs</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="faq-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Got Questions?</span>
            <h2 className="section-title">Frequently Asked Questions</h2>
          </div>

          <div className="faq-list">
            {[
              {
                q: "How does ProfitRx calculate True Net Pocket Profit?",
                a: "ProfitRx decomposes every order: Gross Order Value minus item-level COGS snapshots (frozen at order time), courier forward and reverse freight slabs, payment gateway charges (2% + statutory 18% GST), packaging materials, and channel ad spend to deliver exact pocket profit."
              },
              {
                q: "Does the WASM checkout blocker slow down my store?",
                a: "No. Unlike legacy COD apps that inject heavy JavaScript widgets into your storefront, ProfitRx runs on native Shopify WebAssembly Functions at checkout with a sub-5ms execution budget, guaranteeing zero conversion slowdown."
              },
              {
                q: "What is Economic Expected Value (EV) Justification for OTP?",
                a: "ProfitRx only triggers an OTP verification when the expected downside of RTO loss outweighs the friction cost of verification. Trusted low-risk buyers check out with zero friction, while high-risk orders are verified or converted to prepaid."
              },
              {
                q: "How long does installation and setup take?",
                a: "Under 2 minutes. Install via official Shopify OAuth, configure your default shipping expenses, and ProfitRx immediately begins analyzing orders and protecting your checkout."
              },
              {
                q: "Is there a free trial?",
                a: "Yes. ProfitRx includes a 14-day full free trial with full access to all features, WASM checkout rules, and profit reporting."
              }
            ].map((faq, i) => (
              <div key={i} className={`faq-item ${openFaq === i ? "active" : ""}`}>
                <button
                  type="button"
                  className="faq-question"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{faq.q}</span>
                  <span>{openFaq === i ? "−" : "+"}</span>
                </button>
                {openFaq === i && (
                  <div className="faq-answer">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom Conversion CTA */}
      <section className="bottom-cta">
        <div className="container">
          <div className="cta-card">
            <h2 className="cta-title">Start Protecting Your Store's Profit Today</h2>
            <p className="cta-desc">
              Join high-growth direct-to-consumer brands eliminating unnecessary RTO losses and maximizing pocket profit.
            </p>

            <div className="hero-form-box" style={{ background: "rgba(255,255,255,0.06)" }}>
              <form onSubmit={handleConnectShop} className="hero-form">
                <input
                  type="text"
                  value={shopInput}
                  onChange={(e) => setShopInput(e.target.value)}
                  placeholder="your-store.myshopify.com"
                  className="shop-input"
                />
                <button type="submit" className="submit-btn">
                  Start 14-Day Free Trial →
                </button>
              </form>
            </div>

            <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "16px" }}>
              No credit card required upfront · Cancel anytime · Instant 2-min setup
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div>
              © 2026 ProfitRx Inc. All rights reserved. Built for Shopify.
            </div>
            <div className="footer-links">
              <a href="/privacy" className="footer-link">Privacy Policy</a>
              <a href="mailto:xlr8.jpeg@gmail.com" className="footer-link">Support &amp; Inquiries</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
