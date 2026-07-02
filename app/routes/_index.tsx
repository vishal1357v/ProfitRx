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
    } catch (err) {
      window.location.href = `/auth/login?shop=${encodeURIComponent(shopInput.trim())}`;
    }
  };

  if (isInstalled) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#080b11",
        color: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{
          background: "rgba(15, 23, 42, 0.8)",
          border: "1px solid rgba(56, 189, 248, 0.2)",
          borderRadius: "16px",
          padding: "40px",
          textAlign: "center",
          maxWidth: "500px",
          backdropFilter: "blur(12px)"
        }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "16px", color: "#38bdf8" }}>
            Welcome Back ⚡
          </h1>
          <p style={{ color: "#94a3b8", marginBottom: "24px" }}>
            Your Shopify store is already authenticated.
          </p>
          <a
            href="/app/dashboard"
            style={{
              display: "inline-block",
              background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
              color: "#fff",
              padding: "14px 28px",
              borderRadius: "10px",
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 0 20px rgba(14, 165, 233, 0.4)"
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
      background: "#070a12",
      color: "#f1f5f9",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflowX: "hidden",
      position: "relative"
    }}>
      {/* Dynamic Background Effects */}
      <div style={{
        position: "absolute",
        top: "-100px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "1000px",
        height: "500px",
        background: "radial-gradient(ellipse at center, rgba(14, 165, 233, 0.18) 0%, rgba(99, 102, 241, 0.05) 50%, transparent 80%)",
        pointerEvents: "none",
        zIndex: 0
      }} />

      {/* Grid Pattern Overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        pointerEvents: "none",
        zIndex: 0
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "1240px", margin: "0 auto", padding: "0 24px" }}>
        {/* Navigation Bar */}
        <nav style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px 0",
          borderBottom: "1px solid rgba(255,255,255,0.08)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #38bdf8, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: 800,
              color: "#fff"
            }}>
              ⚡
            </div>
            <span style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", color: "#f8fafc" }}>
              GREEK GOD <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: 600, padding: "2px 8px", background: "rgba(56, 189, 248, 0.1)", borderRadius: "12px", border: "1px solid rgba(56, 189, 248, 0.2)" }}>SAAS</span>
            </span>
          </div>

          <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
            <a href="#superpowers" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>Superpowers</a>
            <a href="#features" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>Features</a>
            <a href="#pricing" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>Pricing</a>
            <a
              href="#login"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#f8fafc",
                padding: "8px 18px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              Log In
            </a>
          </div>
        </nav>

        {/* Hero Section */}
        <header style={{ textAlign: "center", padding: "80px 0 60px 0", maxWidth: "900px", margin: "0 auto" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 16px",
            background: "rgba(56, 189, 248, 0.08)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            borderRadius: "20px",
            color: "#38bdf8",
            fontSize: "13px",
            fontWeight: 600,
            marginBottom: "24px"
          }}>
            <span>🔥 Industrial-Grade E-Commerce Intelligence</span>
          </div>

          <h1 style={{
            fontSize: "clamp(36px, 5.5vw, 62px)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            marginBottom: "24px",
            background: "linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}>
            Stop Losing Profit to RTO <br />
            <span style={{
              background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>Before You Ship.</span>
          </h1>

          <p style={{
            fontSize: "18px",
            color: "#94a3b8",
            lineHeight: "1.6",
            marginBottom: "40px",
            maxWidth: "720px",
            marginInline: "auto"
          }}>
            The only Shopify app combining <strong style={{ color: "#f1f5f9" }}>True Profit Calculation</strong> with <strong style={{ color: "#38bdf8" }}>Pincode-Level Logistics Tracking</strong> and <strong style={{ color: "#818cf8" }}>Pre-Shipment COD Risk Scoring</strong>.
          </p>

          {/* 1-Click Shopify Connect Box */}
          <div id="login" style={{
            background: "rgba(15, 23, 42, 0.75)",
            border: "1px solid rgba(56, 189, 248, 0.3)",
            borderRadius: "16px",
            padding: "12px",
            maxWidth: "540px",
            margin: "0 auto 16px auto",
            backdropFilter: "blur(12px)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5), 0 0 30px rgba(56,189,248,0.15)"
          }}>
            <form onSubmit={handleConnectShop} style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                placeholder="your-store-name.myshopify.com"
                value={shopInput}
                onChange={(e) => setShopInput(e.target.value)}
                style={{
                  flex: 1,
                  background: "rgba(8, 12, 20, 0.9)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "10px",
                  padding: "14px 18px",
                  color: "#fff",
                  fontSize: "15px",
                  outline: "none"
                }}
                required
              />
              <button
                type="submit"
                style={{
                  background: "linear-gradient(135deg, #0284c7 0%, #4f46e5 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "14px 24px",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 14px rgba(14, 165, 233, 0.4)"
                }}
              >
                Connect Store →
              </button>
            </form>
          </div>
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            🔒 Official Shopify OAuth Connection • 14-Day Free Trial • No Credit Card Required
          </span>
        </header>

        {/* The 2 Core Superpowers Section */}
        <section id="superpowers" style={{ padding: "60px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <span style={{ color: "#38bdf8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Market Moats</span>
            <h2 style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em", marginTop: "8px" }}>Why Greek God Wins</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "28px" }}>
            {/* Superpower 1 */}
            <div style={{
              background: "linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(8, 12, 20, 0.9) 100%)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              borderRadius: "20px",
              padding: "36px",
              position: "relative",
              overflow: "hidden"
            }}>
              <div style={{
                position: "absolute", top: "0", right: "0", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8",
                padding: "6px 16px", borderRadius: "0 0 0 14px", fontSize: "12px", fontWeight: 700
              }}>
                SUPERPOWER #1
              </div>

              <div style={{ fontSize: "36px", marginBottom: "16px" }}>📍</div>
              <h3 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "#f8fafc" }}>
                Pincode-Level RTO Tracking
              </h3>
              <p style={{ color: "#94a3b8", lineHeight: "1.6", fontSize: "15px", marginBottom: "20px" }}>
                Competitors like <em>TrueProfit</em> show product margins and LTV, but miss exact location loss. Apps like <em>OrderPulse</em> show city analytics without true profit math.
              </p>
              <div style={{
                background: "rgba(56, 189, 248, 0.05)",
                border: "1px solid rgba(56, 189, 248, 0.15)",
                borderRadius: "12px",
                padding: "16px",
                color: "#38bdf8",
                fontSize: "14px",
                lineHeight: "1.5"
              }}>
                💡 <strong>The Edge:</strong> Greek God pairs pincode logistics data directly with COGS math — alerting you: <em>“You lost ₹8,400 to RTO in pincode 110053 this month.”</em>
              </div>
            </div>

            {/* Superpower 2 */}
            <div style={{
              background: "linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(8, 12, 20, 0.9) 100%)",
              border: "1px solid rgba(129, 140, 248, 0.25)",
              borderRadius: "20px",
              padding: "36px",
              position: "relative",
              overflow: "hidden"
            }}>
              <div style={{
                position: "absolute", top: "0", right: "0", background: "rgba(129, 140, 248, 0.15)", color: "#818cf8",
                padding: "6px 16px", borderRadius: "0 0 0 14px", fontSize: "12px", fontWeight: 700
              }}>
                SUPERPOWER #2
              </div>

              <div style={{ fontSize: "36px", marginBottom: "16px" }}>🎯</div>
              <h3 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "#f8fafc" }}>
                Actionable Pre-Shipment COD Risk Score
              </h3>
              <p style={{ color: "#94a3b8", lineHeight: "1.6", fontSize: "15px", marginBottom: "20px" }}>
                Apps like <em>Profit Calc ($29/mo)</em> calculate COD costs after the fact. But after fulfillment happens, the money is already lost.
              </p>
              <div style={{
                background: "rgba(129, 140, 248, 0.05)",
                border: "1px solid rgba(129, 140, 248, 0.15)",
                borderRadius: "12px",
                padding: "16px",
                color: "#818cf8",
                fontSize: "14px",
                lineHeight: "1.5"
              }}>
                💡 <strong>The Edge:</strong> We predict before shipping: <em>“Order #4912 has a 60% RTO risk — call customer to confirm before shipping out.”</em>
              </div>
            </div>
          </div>
        </section>

        {/* Industrial Feature Grid */}
        <section id="features" style={{ padding: "60px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h2 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.02em" }}>Full Suite Industrial Tools</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
            <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.08)", padding: "24px", borderRadius: "14px" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>💬</div>
              <h4 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Weekly WhatsApp Digest</h4>
              <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.5" }}>Monday morning profit metrics and 3 exact action steps delivered directly to your WhatsApp.</p>
            </div>

            <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.08)", padding: "24px", borderRadius: "14px" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>🎯</div>
              <h4 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Data Accuracy Score</h4>
              <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.5" }}>Gamified setup meter showing how entering COGS and courier costs improves accuracy in rupees.</p>
            </div>

            <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.08)", padding: "24px", borderRadius: "14px" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>🚨</div>
              <h4 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Toxic Product Alerts</h4>
              <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.5" }}>Automatic alerts fired when high return rates turn product sales loss-making after logistics costs.</p>
            </div>

            <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.08)", padding: "24px", borderRadius: "14px" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>⚡</div>
              <h4 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Real Profit Dashboard</h4>
              <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.5" }}>Revenue minus COGS, shipping overages, tax, gateway fees, and RTO leaks in one live view.</p>
            </div>
          </div>
        </section>

        {/* Pricing Section (USD Only) */}
        <section id="pricing" style={{ padding: "60px 0" }}>
          <div style={{ textAlign: "center", marginBottom: "36px" }}>
            <h2 style={{ fontSize: "36px", fontWeight: 800 }}>Simple, Transparent Pricing</h2>
            <p style={{ color: "#38bdf8", marginTop: "8px", fontWeight: 500 }}>💡 Try any paid plan free for 14 days. No credit card required.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
            {/* Free */}
            <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "28px" }}>
              <h3 style={{ fontSize: "20px", fontWeight: 700 }}>Free</h3>
              <div style={{ fontSize: "36px", fontWeight: 800, margin: "16px 0 4px 0" }}>$0</div>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>New stores starting out</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "24px 0", fontSize: "14px", color: "#cbd5e1", lineHeight: "2" }}>
                <li>✓ Up to 50 orders/month</li>
                <li>✓ Real Profit Dashboard</li>
                <li>✓ Store Health Score</li>
                <li>✓ Basic alerts</li>
              </ul>
            </div>

            {/* Starter */}
            <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "28px" }}>
              <h3 style={{ fontSize: "20px", fontWeight: 700 }}>Starter</h3>
              <div style={{ fontSize: "36px", fontWeight: 800, margin: "16px 0 4px 0" }}>$12 <span style={{ fontSize: "14px", color: "#64748b" }}>/mo</span></div>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>Small stores</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "24px 0", fontSize: "14px", color: "#cbd5e1", lineHeight: "2" }}>
                <li>✓ Up to 500 orders</li>
                <li>✓ Profit calculations</li>
                <li>✓ Product cost tracking</li>
                <li>✓ Basic COD/RTO insights</li>
                <li>✓ Weekly WhatsApp report</li>
              </ul>
            </div>

            {/* Growth */}
            <div style={{
              background: "linear-gradient(180deg, rgba(14, 165, 233, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)",
              border: "2px solid #38bdf8",
              borderRadius: "16px",
              padding: "28px",
              position: "relative"
            }}>
              <div style={{ position: "absolute", top: "-12px", right: "20px", background: "#38bdf8", color: "#080c14", padding: "2px 12px", borderRadius: "10px", fontSize: "11px", fontWeight: 800 }}>MOST POPULAR</div>
              <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#38bdf8" }}>Growth</h3>
              <div style={{ fontSize: "36px", fontWeight: 800, margin: "16px 0 4px 0" }}>$29 <span style={{ fontSize: "14px", color: "#64748b" }}>/mo</span></div>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>Best for stores losing to RTO</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "24px 0", fontSize: "14px", color: "#cbd5e1", lineHeight: "2" }}>
                <li>✓ Up to 2,000 orders</li>
                <li>✓ COD Risk Score</li>
                <li>✓ High-Risk COD Areas</li>
                <li>✓ AI Profit Recommendations</li>
                <li>✓ Advanced alerts</li>
              </ul>
            </div>

            {/* Pro */}
            <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "28px" }}>
              <h3 style={{ fontSize: "20px", fontWeight: 700 }}>Pro</h3>
              <div style={{ fontSize: "36px", fontWeight: 800, margin: "16px 0 4px 0" }}>$59 <span style={{ fontSize: "14px", color: "#64748b" }}>/mo</span></div>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>High-volume brands</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "24px 0", fontSize: "14px", color: "#cbd5e1", lineHeight: "2" }}>
                <li>✓ Unlimited orders</li>
                <li>✓ LTV & Cohort Analysis</li>
                <li>✓ ROAS & Ad Spend</li>
                <li>✓ Multi-store support</li>
                <li>✓ Dedicated onboarding</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "40px 0", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
          <p>© 2026 Greek God SaaS. Built for high-volume Shopify storefronts.</p>
        </footer>
      </div>
    </div>
  );
}
