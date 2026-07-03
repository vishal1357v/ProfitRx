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
        background: "#09090b",
        color: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Italiana&family=Playfair+Display:ital,wght@0,600;1,400;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        `}</style>
        <div style={{
          background: "#121215",
          border: "1px solid rgba(56, 189, 248, 0.2)",
          borderRadius: "16px",
          padding: "40px",
          textAlign: "center",
          maxWidth: "500px"
        }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "16px", color: "#38bdf8" }}>
            Welcome Back <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>⚡</span>
          </h1>
          <p style={{ color: "#94a3b8", marginBottom: "24px" }}>
            Your Shopify store is authenticated.
          </p>
          <a
            href="/app/dashboard"
            style={{
              display: "inline-block",
              background: "#0284c7",
              color: "#fff",
              padding: "14px 28px",
              borderRadius: "10px",
              fontWeight: 600,
              textDecoration: "none"
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
      background: "#09090b",
      color: "#f4f4f5",
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      overflowX: "hidden",
      position: "relative"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Italiana&family=Playfair+Display:ital,wght@0,600;1,400;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .cursive-accent {
          font-family: 'Playfair Display', 'Italiana', serif;
          font-style: italic;
          font-weight: 400;
        }
        .minimal-card {
          background: #121215;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 32px;
          transition: all 0.25s ease;
        }
        .minimal-card:hover {
          border-color: rgba(56, 189, 248, 0.3);
          transform: translateY(-2px);
        }
        .minimal-btn {
          background: #0284c7;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 14px 28px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .minimal-btn:hover {
          background: #0369a1;
        }
      `}</style>

      {/* Subtle Glow Background (Cyan / Sky Blue — NO Purple) */}
      <div style={{
        position: "absolute",
        top: "-80px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "900px",
        height: "400px",
        background: "radial-gradient(ellipse at center, rgba(56, 189, 248, 0.12) 0%, transparent 70%)",
        pointerEvents: "none",
        zIndex: 0
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "1140px", margin: "0 auto", padding: "0 24px" }}>
        
        {/* Navigation Bar */}
        <nav style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "28px 0",
          borderBottom: "1px solid rgba(255,255,255,0.06)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "#0284c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              color: "#fff"
            }}>
              ⚡
            </div>
            <span style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", color: "#f8fafc" }}>
              ProfitRx <span className="cursive-accent" style={{ fontSize: "14px", color: "#38bdf8", marginLeft: "4px" }}>by Greek God</span>
            </span>
          </div>

          <div style={{ display: "flex", gap: "28px", alignItems: "center" }}>
            <a href="#moats" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>Moats</a>
            <a href="#features" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>Features</a>
            <a href="#pricing" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>Pricing</a>
            <a
              href="#login"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#f4f4f5",
                padding: "8px 18px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              Sign In
            </a>
          </div>
        </nav>

        {/* Hero Header */}
        <header style={{ textAlign: "center", padding: "90px 0 60px 0", maxWidth: "860px", margin: "0 auto" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 16px",
            background: "rgba(56, 189, 248, 0.06)",
            border: "1px solid rgba(56, 189, 248, 0.2)",
            borderRadius: "20px",
            color: "#38bdf8",
            fontSize: "13px",
            fontWeight: 600,
            marginBottom: "24px"
          }}>
            <span>✨ Pure Profit Intelligence for Shopify</span>
          </div>

          <h1 style={{
            fontSize: "clamp(36px, 5.5vw, 62px)",
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: "-0.03em",
            marginBottom: "24px",
            color: "#ffffff"
          }}>
            Know your exact profit with <br />
            <span className="cursive-accent" style={{ color: "#38bdf8", fontSize: "1.08em" }}>effortless precision.</span>
          </h1>

          <p style={{
            fontSize: "18px",
            color: "#a1a1aa",
            lineHeight: "1.6",
            marginBottom: "40px",
            maxWidth: "700px",
            marginInline: "auto",
            fontWeight: 400
          }}>
            Automated Shopify COGS sync, Meta/Google/TikTok ad spend tracking, and RTO loss shielding in one minimal, high-impact workspace.
          </p>

          {/* 1-Click Connection Input */}
          <div id="login" style={{
            background: "#121215",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "14px",
            padding: "8px",
            maxWidth: "500px",
            margin: "0 auto 16px auto"
          }}>
            <form onSubmit={handleConnectShop} style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="store-name.myshopify.com"
                value={shopInput}
                onChange={(e) => setShopInput(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  padding: "12px 16px",
                  color: "#fff",
                  fontSize: "15px",
                  outline: "none"
                }}
                required
              />
              <button type="submit" className="minimal-btn">
                Connect Store →
              </button>
            </form>
          </div>
          <span style={{ fontSize: "13px", color: "#71717a" }}>
            🔒 Official Shopify OAuth • 14-Day Free Trial • No Credit Card
          </span>
        </header>

        {/* Core Moats */}
        <section id="moats" style={{ padding: "60px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <span className="cursive-accent" style={{ color: "#38bdf8", fontSize: "20px" }}>The Moats</span>
            <h2 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.02em", marginTop: "4px" }}>Why Top Brands Switch to ProfitRx</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
            <div className="minimal-card">
              <div style={{ fontSize: "32px", marginBottom: "16px" }}>📦</div>
              <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "10px", color: "#ffffff" }}>
                Native Shopify COGS Auto-Sync
              </h3>
              <p style={{ color: "#a1a1aa", lineHeight: "1.6", fontSize: "15px", marginBottom: "16px" }}>
                Zero manual cost entry. We automatically pull unit costs from your Shopify variant settings.
              </p>
              <div style={{ color: "#10b981", fontSize: "13px", fontWeight: 600 }}>
                ✓ Always in sync with inventory updates
              </div>
            </div>

            <div className="minimal-card">
              <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔗</div>
              <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "10px", color: "#ffffff" }}>
                Automated Multi-Channel Ad Spend
              </h3>
              <p style={{ color: "#a1a1aa", lineHeight: "1.6", fontSize: "15px", marginBottom: "16px" }}>
                Connect Meta, Google, and TikTok. ProfitRx calculates your true blended ROAS and CAC against real Shopify revenue.
              </p>
              <div style={{ color: "#0284c7", fontSize: "13px", fontWeight: 600 }}>
                ✓ Eliminates ad platform over-attribution
              </div>
            </div>

            <div className="minimal-card">
              <div style={{ fontSize: "32px", marginBottom: "16px" }}>📍</div>
              <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "10px", color: "#ffffff" }}>
                Pincode-Level RTO Shield
              </h3>
              <p style={{ color: "#a1a1aa", lineHeight: "1.6", fontSize: "15px", marginBottom: "16px" }}>
                Identify high-risk pincodes causing failed COD deliveries and block them before shipping out.
              </p>
              <div style={{ color: "#f59e0b", fontSize: "13px", fontWeight: 600 }}>
                ✓ Saves ~$300/mo on return logistics
              </div>
            </div>
          </div>
        </section>

        {/* Minimal Feature Grid */}
        <section id="features" style={{ padding: "60px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <h2 style={{ fontSize: "28px", fontWeight: 800 }}>Complete Financial Command</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "18px" }}>
            <div style={{ background: "#121215", border: "1px solid rgba(255,255,255,0.06)", padding: "24px", borderRadius: "12px" }}>
              <div style={{ fontSize: "22px", marginBottom: "8px" }}>📊</div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px", color: "#fff" }}>LTV & Cohort Retention</h4>
              <p style={{ color: "#71717a", fontSize: "13px", lineHeight: "1.5" }}>30, 60, and 90-day repeat purchase retention curves.</p>
            </div>

            <div style={{ background: "#121215", border: "1px solid rgba(255,255,255,0.06)", padding: "24px", borderRadius: "12px" }}>
              <div style={{ fontSize: "22px", marginBottom: "8px" }}>🔔</div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px", color: "#fff" }}>Automated Store Alerts</h4>
              <p style={{ color: "#71717a", fontSize: "13px", lineHeight: "1.5" }}>Margin drop, RTO spike, and low product margin triggers.</p>
            </div>

            <div style={{ background: "#121215", border: "1px solid rgba(255,255,255,0.06)", padding: "24px", borderRadius: "12px" }}>
              <div style={{ fontSize: "22px", marginBottom: "8px" }}>💬</div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px", color: "#fff" }}>WhatsApp Digest</h4>
              <p style={{ color: "#71717a", fontSize: "13px", lineHeight: "1.5" }}>Monday morning profit metrics sent to your phone.</p>
            </div>

            <div style={{ background: "#121215", border: "1px solid rgba(255,255,255,0.06)", padding: "24px", borderRadius: "12px" }}>
              <div style={{ fontSize: "22px", marginBottom: "8px" }}>⚡</div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px", color: "#fff" }}>Real Margin Engine</h4>
              <p style={{ color: "#71717a", fontSize: "13px", lineHeight: "1.5" }}>Net profit after COGS, shipping overage, tax, and gateway fees.</p>
            </div>
          </div>
        </section>

        {/* Minimal Pricing */}
        <section id="pricing" style={{ padding: "60px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <h2 style={{ fontSize: "32px", fontWeight: 800 }}>Transparent Pricing</h2>
            <p style={{ color: "#38bdf8", marginTop: "6px", fontSize: "14px" }}>Try any plan free for 14 days</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
            <div className="minimal-card">
              <h3 style={{ fontSize: "18px", fontWeight: 700 }}>Free</h3>
              <div style={{ fontSize: "32px", fontWeight: 800, margin: "12px 0 4px 0", color: "#ffffff" }}>$0</div>
              <span style={{ fontSize: "12px", color: "#71717a" }}>Up to 50 orders/mo</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", fontSize: "13px", color: "#a1a1aa", lineHeight: "2" }}>
                <li>✓ Real Profit Dashboard</li>
                <li>✓ Basic Store Health</li>
              </ul>
            </div>

            <div className="minimal-card">
              <h3 style={{ fontSize: "18px", fontWeight: 700 }}>Starter</h3>
              <div style={{ fontSize: "32px", fontWeight: 800, margin: "12px 0 4px 0", color: "#ffffff" }}>$19 <span style={{ fontSize: "13px", color: "#71717a" }}>/mo</span></div>
              <span style={{ fontSize: "12px", color: "#71717a" }}>Up to 500 orders/mo</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", fontSize: "13px", color: "#a1a1aa", lineHeight: "2" }}>
                <li>✓ Native COGS Sync</li>
                <li>✓ COD/RTO Analytics</li>
              </ul>
            </div>

            <div className="minimal-card" style={{ border: "1px solid #0284c7" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#38bdf8", marginBottom: "4px" }}>POPULAR</div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#38bdf8" }}>Growth</h3>
              <div style={{ fontSize: "32px", fontWeight: 800, margin: "8px 0 4px 0", color: "#ffffff" }}>$39 <span style={{ fontSize: "13px", color: "#71717a" }}>/mo</span></div>
              <span style={{ fontSize: "12px", color: "#71717a" }}>Up to 2,000 orders/mo</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", fontSize: "13px", color: "#a1a1aa", lineHeight: "2" }}>
                <li>✓ Pincode Heatmap</li>
                <li>✓ COD Risk Scoring</li>
                <li>✓ Automated Alerts</li>
              </ul>
            </div>

            <div className="minimal-card">
              <h3 style={{ fontSize: "18px", fontWeight: 700 }}>Pro</h3>
              <div style={{ fontSize: "32px", fontWeight: 800, margin: "12px 0 4px 0", color: "#ffffff" }}>$79 <span style={{ fontSize: "13px", color: "#71717a" }}>/mo</span></div>
              <span style={{ fontSize: "12px", color: "#71717a" }}>Unlimited orders</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", fontSize: "13px", color: "#a1a1aa", lineHeight: "2" }}>
                <li>✓ Meta/Google/TikTok Sync</li>
                <li>✓ LTV & Cohort Analytics</li>
                <li>✓ Priority Support</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Minimal Footer */}
        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "36px 0", textAlign: "center", color: "#71717a", fontSize: "13px" }}>
          <p>© 2026 Greek God SaaS. <span className="cursive-accent" style={{ color: "#38bdf8" }}>Crafted for Shopify merchants.</span></p>
        </footer>

      </div>
    </div>
  );
}
