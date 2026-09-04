export const headers = () => ({
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
});

export default function TermsRoute() {
  return (
    <div style={{ maxWidth: 850, margin: "40px auto", padding: "32px 40px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", background: "#ffffff", color: "#222222", lineHeight: 1.6, borderRadius: 16, border: "1px solid #e5e7eb" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px", color: "#222f3e" }}>Terms of Service — ProfitRx</h1>
      <p style={{ color: "#576574", fontSize: "14px", marginBottom: "24px" }}>
        <strong>Effective Date:</strong> August 24, 2026 | <strong>Last Updated:</strong> September 2026
      </p>

      <div style={{ background: "#f8fafc", padding: "16px 20px", borderRadius: 8, marginBottom: 24, borderLeft: "4px solid #008060" }}>
        <p style={{ margin: 0, fontSize: "14px", color: "#334155" }}>
          By installing, configuring, or using <strong>ProfitRx</strong> (&quot;the App&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) via the Shopify App Store, you (&quot;Merchant&quot; or &quot;User&quot;) agree to be bound by these Terms of Service. If you do not agree to these terms, you must uninstall the App immediately.
        </p>
      </div>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>1. Description of Service</h2>
        <p>
          ProfitRx is a SaaS profit intelligence and risk mitigation platform engineered for Shopify merchants. Core services include:
        </p>
        <ul style={{ paddingLeft: "20px" }}>
          <li>Real-time net pocket profit computation incorporating Cost of Goods Sold (COGS), shipping slabs, gateway charges, and tax deductions.</li>
          <li>Return-to-Origin (RTO) predictive risk scoring for Cash on Delivery (COD) orders.</li>
          <li>Checkout payment customization via Shopify WebAssembly Functions to restrict COD payment methods for high-risk postal codes.</li>
          <li>Merchant verification interventions including automated WhatsApp OTP delivery verification.</li>
          <li>GST compliance reports, financial analytics, and ad spend attribution synchronization.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>2. Data Protection &amp; Customer Privacy</h2>
        <p>
          Your use of ProfitRx is governed by our <a href="/privacy" style={{ color: "#008060", textDecoration: "underline", fontWeight: 500 }}>Privacy Policy</a> and legally binding <a href="/dpa" style={{ color: "#008060", textDecoration: "underline", fontWeight: 500 }}>Merchant Data Processing Agreement (DPA)</a>, compliant with Shopify Level 2 Protected Customer Data standards and GDPR Article 28.
        </p>
        <p>
          We act strictly as a Data Processor under documented merchant instruction and never sell, rent, monetize, or cross-profile customer personal data.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>3. Subscription Plans, Billing &amp; Free Trials</h2>
        <p>
          ProfitRx offers multiple subscription tiers (Starter, Growth, Pro) billed on a recurring monthly basis exclusively through the official <strong>Shopify Billing API</strong>:
        </p>
        <ul style={{ paddingLeft: "20px" }}>
          <li><strong>14-Day Free Trial:</strong> All paid plans include a 14-day free trial. You will not be billed if you cancel prior to trial expiry.</li>
          <li><strong>Currency &amp; Charges:</strong> All subscription fees are billed in US Dollars (USD) through your standard Shopify merchant invoice.</li>
          <li><strong>Order Sync Quotas:</strong> Plans include monthly order evaluation quotas. Upgrades take effect immediately upon merchant approval in Shopify Admin.</li>
          <li><strong>Cancellation &amp; Refunds:</strong> You may cancel your subscription at any time by selecting Cancel Subscription in the billing settings or by uninstalling the App from your Shopify Admin. All billing is governed by Shopify&apos;s standard App Store billing policies.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>4. Merchant Responsibilities</h2>
        <p>As a merchant utilizing ProfitRx, you agree to:</p>
        <ul style={{ paddingLeft: "20px" }}>
          <li>Maintain accurate COGS and operational cost parameters to ensure mathematical validity of calculated profit margins.</li>
          <li>Ensure your store&apos;s privacy policy informs end consumers of order risk assessment and transactional OTP verification practices.</li>
          <li>Comply with applicable local consumer protection, telecommunication, and privacy regulations when sending verification communications.</li>
          <li>Refrain from reverse engineering, modifying, or bypassing the App&apos;s security and tenant-isolation controls.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>5. Disclaimers &amp; Limitation of Liability</h2>
        <p>
          ProfitRx provides algorithmic predictions and automated checkout rules based on historical and regional delivery trends. While engineered to substantially minimize RTO losses, we do not warrant that all return attempts will be prevented or that third-party courier APIs will perform without interruption.
        </p>
        <p>
          To the maximum extent permitted by applicable law, ProfitRx and its operators shall not be liable for any indirect, incidental, consequential, or punitive damages arising from the use or inability to use the service.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>6. Termination &amp; Data Purging</h2>
        <p>
          Upon uninstallation of the App from your Shopify Admin, API access tokens are immediately revoked. All merchant records and customer personal data are purged in strict compliance with GDPR mandatory redaction protocols and our documented retention schedules.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>7. Governing Law &amp; Support</h2>
        <p>
          These Terms are governed by the laws of India. For inquiries, technical support, or compliance verification, please contact us at:
        </p>
        <p style={{ margin: "8px 0 0 0", fontWeight: 500, color: "#008060" }}>
          Email: <a href="mailto:xlr8.jpeg@gmail.com" style={{ color: "#008060", textDecoration: "underline" }}>xlr8.jpeg@gmail.com</a>
        </p>
      </section>
    </div>
  );
}
