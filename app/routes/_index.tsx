import { useState } from "react";
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

  const handleConnectShop = (e: React.FormEvent) => {
    e.preventDefault();
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

  if (isInstalled) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#09090b",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        `}</style>
        <div style={{
          background: "#ffffff",
          border: "1px solid #e4e4e7",
          borderRadius: "24px",
          padding: "48px",
          textAlign: "center",
          maxWidth: "480px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.06)"
        }}>
          <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "16px", color: "#09090b" }}>
            Welcome Back <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>⚡</span>
          </h1>
          <p style={{ color: "#71717a", marginBottom: "28px" }}>
            Your Shopify store is already authenticated.
          </p>
          <a
            href="/app/dashboard"
            style={{
              display: "inline-block",
              background: "#09090b",
              color: "#ffffff",
              padding: "14px 28px",
              borderRadius: "12px",
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 4px 14px rgba(0,0,0,0.15)"
            }}
          >
            Go to Profit Dashboard →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#ffffff",
      color: "#09090b",
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      overflowX: "hidden",
      position: "relative"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        
        .cursive-accent {
          font-family: 'Playfair Display', serif;
          font-style: italic;
          font-weight: 400;
        }

        .smooth-card {
          background: #ffffff;
          border: 1px solid #f1f5f9;
          border-radius: 24px;
          padding: 36px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.03), 0 1px 3px rgba(0, 0, 0, 0.02);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .smooth-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.07), 0 2px 8px rgba(0, 0, 0, 0.04);
          border-color: #e2e8f0;
        }

        .smooth-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          background: #f0fdf4;
          border: 1px solid #dcfce7;
          border-radius: 100px;
          color: #166534;
          font-size: 13px;
          font-weight: 600;
        }

        .smooth-btn {
          background: linear-gradient(135deg, #09090b 0%, #27272a 100%);
          color: #ffffff;
          border: none;
          border-radius: 12px;
          padding: 14px 28px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
        }

        .smooth-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
          background: #000000;
        }

        .smooth-input {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 18px;
          color: #09090b;
          font-size: 15px;
          outline: none;
          transition: all 0.2s ease;
        }

        .smooth-input:focus {
          background: #ffffff;
          border-color: #0284c7;
          box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.1);
        }

        .grid-mesh {
          background-size: 40px 40px;
          background-image: 
            linear-gradient(to right, rgba(0, 0, 0, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
        }
      `}</style>

      {/* Smooth Subtle Mesh Grid Background */}
      <div className="grid-mesh" style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0
      }} />

      {/* Soft Top Ambient Radial Light */}
      <div style={{
        position: "absolute",
        top: "-120px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "1000px",
        height: "500px",
        background: "radial-gradient(ellipse at center, rgba(56, 189, 248, 0.08) 0%, rgba(16, 185, 129, 0.04) 50%, transparent 80%)",
        pointerEvents: "none",
        zIndex: 0
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "1160px", margin: "0 auto", padding: "0 24px" }}>
        
        {/* Navigation Bar */}
        <nav style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "32px 0",
          borderBottom: "1px solid #f1f5f9"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "#09090b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              color: "#ffffff"
            }}>
              ⚡
            </div>
            <span style={{ fontSize: "21px", fontWeight: 800, letterSpacing: "-0.03em", color: "#09090b" }}>
              ProfitRx <span className="cursive-accent" style={{ fontSize: "15px", color: "#0284c7", marginLeft: "4px" }}>by Greek God</span>
            </span>
          </div>

          <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
            <a href="#features" style={{ color: "#64748b", textDecoration: "none", fontSize: "14px", fontWeight: 600 }}>Features</a>
            <a href="#moats" style={{ color: "#64748b", textDecoration: "none", fontSize: "14px", fontWeight: 600 }}>Automation</a>
            <a href="#pricing" style={{ color: "#64748b", textDecoration: "none", fontSize: "14px", fontWeight: 600 }}>Pricing</a>
            <a
              href="#login"
              style={{
                background: "#f1f5f9",
                color: "#09090b",
                padding: "9px 20px",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
                transition: "all 0.2s ease"
              }}
            >
              Sign In
            </a>
          </div>
        </nav>

        {/* Hero Section */}
        <header style={{ textAlign: "center", padding: "100px 0 70px 0", maxWidth: "900px", margin: "0 auto" }}>
          <div className="smooth-badge" style={{ marginBottom: "28px" }}>
            <span style={{ fontSize: "12px" }}>🟢</span>
            <span>Automated Profit & RTO Shield Engine</span>
          </div>

          <h1 style={{
            fontSize: "clamp(40px, 6vw, 68px)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.04em",
            marginBottom: "28px",
            color: "#09090b"
          }}>
            Master your store's profit with <br />
            <span className="cursive-accent" style={{ color: "#0284c7", fontSize: "1.1em" }}>effortless precision.</span>
          </h1>

          <p style={{
            fontSize: "19px",
            color: "#64748b",
            lineHeight: "1.6",
            marginBottom: "44px",
            maxWidth: "720px",
            marginInline: "auto",
            fontWeight: 400
          }}>
            Connect your Shopify store in 1 click. Automatically sync COGS, aggregate Meta/Google ad spend, and stop RTO revenue leaks in real time.
          </p>

          {/* Connect Store Form */}
          <div id="login" style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "20px",
            padding: "10px",
            maxWidth: "520px",
            margin: "0 auto 20px auto",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.04), 0 2px 6px rgba(0, 0, 0, 0.02)"
          }}>
            <form onSubmit={handleConnectShop} style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                placeholder="your-store-name.myshopify.com"
                value={shopInput}
                onChange={(e) => setShopInput(e.target.value)}
                className="smooth-input"
                style={{ flex: 1 }}
                required
              />
              <button type="submit" className="smooth-btn" style={{ whiteSpace: "nowrap" }}>
                Connect Store →
              </button>
            </form>
          </div>
          <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500 }}>
            🔒 Official Shopify OAuth • 14-Day Free Trial • Zero Setup Fees
          </span>
        </header>

        {/* Smooth Live Dashboard Preview Card */}
        <div style={{
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          border: "1px solid #e2e8f0",
          borderRadius: "28px",
          padding: "24px",
          boxShadow: "0 30px 60px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.02)",
          marginBottom: "100px",
          position: "relative"
        }}>
          {/* Mock Window Header Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ef4444" }} />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#f59e0b" }} />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#10b981" }} />
            </div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "4px 14px", borderRadius: "100px" }}>
              ProfitRx Live Executive Dashboard
            </div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} /> Live Sync Active
            </div>
          </div>

          {/* Mock Dashboard Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Total Revenue</div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#09090b", margin: "4px 0" }}>₹4,85,000</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#10b981" }}>▲ +18.4% vs last month</div>
            </div>

            <div style={{ background: "#f0fdf4", padding: "20px", borderRadius: "16px", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#166534" }}>Net Profit</div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#15803d", margin: "4px 0" }}>₹1,48,200</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#166534" }}>Net Margin 30.5%</div>
            </div>

            <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>COGS Auto-Sync</div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#09090b", margin: "4px 0" }}>Native ✅</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#0284c7" }}>Variant Costs Active</div>
            </div>

            <div style={{ background: "#fff7ed", padding: "20px", borderRadius: "16px", border: "1px solid #fed7aa" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#c2410c" }}>RTO Leak Shield</div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#ea580c", margin: "4px 0" }}>₹38,400 Saved</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#c2410c" }}>Pincode block active</div>
            </div>
          </div>
        </div>

        {/* Core Moats Section */}
        <section id="moats" style={{ padding: "40px 0 80px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "56px" }}>
            <span className="cursive-accent" style={{ color: "#0284c7", fontSize: "22px" }}>Why Greek God Wins</span>
            <h2 style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.03em", marginTop: "4px", color: "#09090b" }}>
              Built for Modern High-Volume Brands
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "28px" }}>
            <div className="smooth-card">
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", marginBottom: "20px" }}>
                📦
              </div>
              <h3 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "12px", color: "#09090b" }}>
                Automated Native COGS Sync
              </h3>
              <p style={{ color: "#64748b", lineHeight: "1.6", fontSize: "15px", marginBottom: "20px" }}>
                No tedious CSV uploads. ProfitRx automatically fetches native `Cost per item` fields directly from your Shopify variant catalog.
              </p>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}>
                ✓ Instant variant cost resolution
              </div>
            </div>

            <div className="smooth-card">
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", marginBottom: "20px" }}>
                🔗
              </div>
              <h3 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "12px", color: "#09090b" }}>
                Automated Ad Spend Auto-Sync
              </h3>
              <p style={{ color: "#64748b", lineHeight: "1.6", fontSize: "15px", marginBottom: "20px" }}>
                Connect Meta Ads, Google Ads, and TikTok Ads. We aggregate your daily ad spend automatically to show True ROAS and CAC.
              </p>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#0284c7", display: "flex", alignItems: "center", gap: "6px" }}>
                ✓ Blended ROAS & multi-channel attribution
              </div>
            </div>

            <div className="smooth-card">
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", marginBottom: "20px" }}>
                📍
              </div>
              <h3 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "12px", color: "#09090b" }}>
                Pincode-Level RTO Shield
              </h3>
              <p style={{ color: "#64748b", lineHeight: "1.6", fontSize: "15px", marginBottom: "20px" }}>
                Pinpoint exact high-risk delivery pincodes turning orders loss-making, and restrict COD before fulfilling.
              </p>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#d97706", display: "flex", alignItems: "center", gap: "6px" }}>
                ✓ Eliminates double-shipping return losses
              </div>
            </div>
          </div>
        </section>

        {/* Industrial Feature Grid */}
        <section id="features" style={{ padding: "60px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h2 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.02em" }}>Complete Financial Suite</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px" }}>
            <div style={{ background: "#ffffff", border: "1px solid #f1f5f9", padding: "28px", borderRadius: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>📊</div>
              <h4 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "#09090b" }}>LTV & Cohorts</h4>
              <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>30, 60, and 90-day repeat purchase retention curves per customer cohort.</p>
            </div>

            <div style={{ background: "#ffffff", border: "1px solid #f1f5f9", padding: "28px", borderRadius: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>🔔</div>
              <h4 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "#09090b" }}>Store Threshold Alerts</h4>
              <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>Automatic warnings for margin drops, RTO spikes, and low-margin products.</p>
            </div>

            <div style={{ background: "#ffffff", border: "1px solid #f1f5f9", padding: "28px", borderRadius: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>💬</div>
              <h4 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "#09090b" }}>WhatsApp Digest</h4>
              <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>Monday morning profit summary and top 3 fix recommendations.</p>
            </div>

            <div style={{ background: "#ffffff", border: "1px solid #f1f5f9", padding: "28px", borderRadius: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>⚡</div>
              <h4 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "#09090b" }}>Real Margin Engine</h4>
              <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>Net profit calculated after COGS, shipping, tax, and payment gateway fees.</p>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" style={{ padding: "60px 0 100px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "52px" }}>
            <h2 style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.03em" }}>Transparent Pricing</h2>
            <p style={{ color: "#0284c7", marginTop: "8px", fontWeight: 600, fontSize: "15px" }}>
              💡 Try any plan free for 14 days. No credit card required.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "24px" }}>
            {/* Free */}
            <div className="smooth-card" style={{ padding: "32px 24px" }}>
              <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#09090b" }}>Free</h3>
              <div style={{ fontSize: "36px", fontWeight: 800, margin: "16px 0 4px 0", color: "#09090b" }}>$0</div>
              <span style={{ fontSize: "13px", color: "#64748b" }}>New stores starting out</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "24px 0", fontSize: "14px", color: "#475569", lineHeight: "2" }}>
                <li>✓ Up to 50 orders/month</li>
                <li>✓ Real Profit Dashboard</li>
                <li>✓ Store Health Score</li>
                <li>✓ Basic alerts</li>
              </ul>
            </div>

            {/* Starter */}
            <div className="smooth-card" style={{ padding: "32px 24px" }}>
              <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#09090b" }}>Starter</h3>
              <div style={{ fontSize: "36px", fontWeight: 800, margin: "16px 0 4px 0", color: "#09090b" }}>$19 <span style={{ fontSize: "14px", color: "#94a3b8" }}>/mo</span></div>
              <span style={{ fontSize: "13px", color: "#64748b" }}>Growing stores</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "24px 0", fontSize: "14px", color: "#475569", lineHeight: "2" }}>
                <li>✓ Up to 500 orders/month</li>
                <li>✓ Native COGS Sync</li>
                <li>✓ COD/RTO Insights</li>
                <li>✓ Weekly WhatsApp report</li>
              </ul>
            </div>

            {/* Growth */}
            <div className="smooth-card" style={{ border: "2px solid #0284c7", padding: "32px 24px", position: "relative" }}>
              <div style={{ position: "absolute", top: "-12px", right: "20px", background: "#0284c7", color: "#ffffff", padding: "2px 12px", borderRadius: "100px", fontSize: "11px", fontWeight: 800 }}>MOST POPULAR</div>
              <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#0284c7" }}>Growth</h3>
              <div style={{ fontSize: "36px", fontWeight: 800, margin: "16px 0 4px 0", color: "#09090b" }}>$39 <span style={{ fontSize: "14px", color: "#94a3b8" }}>/mo</span></div>
              <span style={{ fontSize: "13px", color: "#64748b" }}>High-growth brands</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "24px 0", fontSize: "14px", color: "#475569", lineHeight: "2" }}>
                <li>✓ Up to 2,000 orders/month</li>
                <li>✓ Pincode Heatmap</li>
                <li>✓ COD Risk Scoring</li>
                <li>✓ Threshold Alerts</li>
              </ul>
            </div>

            {/* Pro */}
            <div className="smooth-card" style={{ padding: "32px 24px" }}>
              <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#09090b" }}>Pro</h3>
              <div style={{ fontSize: "36px", fontWeight: 800, margin: "16px 0 4px 0", color: "#09090b" }}>$79 <span style={{ fontSize: "14px", color: "#94a3b8" }}>/mo</span></div>
              <span style={{ fontSize: "13px", color: "#64748b" }}>Scale & Enterprise</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "24px 0", fontSize: "14px", color: "#475569", lineHeight: "2" }}>
                <li>✓ Unlimited orders</li>
                <li>✓ Meta/Google/TikTok Sync</li>
                <li>✓ LTV & Cohort Analytics</li>
                <li>✓ Priority Onboarding</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Smooth Footer */}
        <footer style={{ borderTop: "1px solid #f1f5f9", padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
          <p>© 2026 Greek God SaaS. <span className="cursive-accent" style={{ color: "#0284c7", fontSize: "16px" }}>Crafted for ambitious Shopify merchants.</span></p>
        </footer>

      </div>
    </div>
  );
}
