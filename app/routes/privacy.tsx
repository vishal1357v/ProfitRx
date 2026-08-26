export const headers = () => ({
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
});

export default function PrivacyRoute() {
  return (
    <div style={{ maxWidth: 850, margin: "40px auto", padding: "32px 40px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", background: "#ffffff", color: "#222222", lineHeight: 1.6, borderRadius: 16, border: "1px solid #e5e7eb" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px", color: "#222f3e" }}>Privacy Policy — ProfitRx</h1>
      <p style={{ color: "#576574", fontSize: "14px", marginBottom: "24px" }}>
        <strong>Effective Date:</strong> August 24, 2026 | <strong>Last Updated:</strong> August 24, 2026
      </p>

      <section style={{ marginBottom: "24px" }}>
        <p>
          <strong>ProfitRx</strong> (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides real-time profit analytics, Cash on Delivery (COD) fraud protection, and Return-to-Origin (RTO) risk management solutions for Shopify merchants. We are committed to protecting the privacy of merchants and their customers in strict compliance with the European General Data Protection Regulation (GDPR), California Consumer Privacy Act (CCPA), and India Information Technology Act 2000.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Section 1: Information We Collect</h2>
        <p>When you install and use ProfitRx, we access and process data strictly necessary to provide our services:</p>
        <ul style={{ paddingLeft: "20px" }}>
          <li><strong>Merchant &amp; Store Data:</strong> Store domain, merchant email, shop currency, primary location state, and active Shopify subscription plan.</li>
          <li><strong>Order &amp; Transaction Data:</strong> Order IDs, gross order values, item line item titles/variants, quantities, shipping fee paid, tax breakdown (CGST/SGST/IGST), fulfillment status, and payment gateway method (COD vs. Prepaid).</li>
          <li><strong>Customer Contact &amp; Shipping Data:</strong> Customer name, masked phone number, delivery city, province, and pincode/postal code (utilized exclusively for regional RTO risk scoring and OTP delivery verification).</li>
          <li><strong>Product Cost of Goods Sold (COGS):</strong> SKU identifiers and unit costs configured manually or synced from Shopify inventory.</li>
          <li><strong>Advertising Metadata (Optional):</strong> Aggregated daily campaign ad spend totals from connected Meta Ads or Google Ads accounts.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Section 2: Purpose of Processing</h2>
        <p>We process collected information solely for the following legitimate business purposes:</p>
        <ul style={{ paddingLeft: "20px" }}>
          <li>Calculating True Net Pocket Profit, blended ROAS, and SKU margin contributions per order.</li>
          <li>Evaluating probabilistic RTO risk scores based on regional pincode delivery performance.</li>
          <li>Delivering automated WhatsApp/SMS OTP challenges to customers to confirm high-risk COD orders.</li>
          <li>Generating statutory GST and financial audit reports for merchant accounting.</li>
          <li>Enforcing merchant-configured COD protection policies via Shopify WebAssembly Functions.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Section 3: Data Storage, Encryption &amp; Retention</h2>
        <p>
          All data processed by ProfitRx is stored in secured, encrypted-at-rest PostgreSQL databases with strict multi-tenant schema isolation. All network transmissions are strictly encrypted via TLS 1.2 and TLS 1.3 (HTTPS) with HSTS enforcement. Access tokens and external API credentials are encrypted with AES-256-GCM at the application layer.
        </p>
        <p><strong>Retention Periods:</strong></p>
        <ul style={{ paddingLeft: "20px" }}>
          <li><strong>Verification OTP Codes:</strong> Erased immediately upon verification or permanently purged within 48 hours.</li>
          <li><strong>Pipeline Execution Logs:</strong> Automatically rotated and purged after 90 days.</li>
          <li><strong>Customer Data Access Logs:</strong> Automatically purged after 180 days.</li>
          <li><strong>Customer Personal Identifying Data (Name, Email):</strong> Retained only during the merchant&apos;s active subscription period to maintain historical Order Intelligence and customer risk profiles, and permanently purged upon GDPR redact webhooks or uninstallation.</li>
          <li><strong>Order Financial &amp; Tax Totals:</strong> Retained for 6 years to satisfy statutory accounting obligations under Section 36 of the CGST Act with customer identifiers pseudonymized.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Section 4: Merchant Data Processing Agreement (DPA)</h2>
        <p>
          Our processing of customer personal data on behalf of Shopify merchants is governed by our formal <a href="/dpa" style={{ color: "#008060", fontWeight: 600, textDecoration: "underline" }}>Merchant Data Processing Agreement (DPA)</a>, which satisfies GDPR Article 28 and Shopify Level 2 Protected Customer Data standards. Merchants can review and record agreement within the ProfitRx Settings dashboard.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Section 5: Automated Decision-Making &amp; Transparency</h2>
        <p>
          ProfitRx provides algorithmic risk scoring to assist merchants in identifying high-risk Cash on Delivery (COD) orders. ProfitRx defaults to <strong>OBSERVE</strong> and <strong>REVIEW</strong> modes where recommendations are presented to merchants for human decision-making. Merchants retain full authority to configure thresholds, override AI recommendations, or whitelist specific customers. End-customers who wish to dispute an order review or payment method decision may contact the merchant directly for manual review.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Section 6: GDPR &amp; Data Subject Rights (Access &amp; Erasure)</h2>
        <p>
          We fully implement Shopify&#39;s mandatory privacy compliance webhooks:
        </p>
        <ul style={{ paddingLeft: "20px" }}>
          <li><strong>Customer Data Request (<code>customers/data_request</code>):</strong> Upon receipt of a verified request, we compile and deliver all stored data associated with the requested customer ID.</li>
          <li><strong>Customer Data Erasure (<code>customers/redact</code>):</strong> We permanently delete or pseudonymize customer personal identifying details (name, email, phone) within 48 hours of notice.</li>
          <li><strong>Shop Data Erasure (<code>shop/redact</code>):</strong> When an app is uninstalled and a store redact webhook is received, all associated store records, settings, and historical logs are permanently purged from our databases within 30 days.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Section 5: Third-Party Service Providers</h2>
        <p>ProfitRx integrates with the following vetted infrastructure sub-processors:</p>
        <ul style={{ paddingLeft: "20px" }}>
          <li><strong>Shopify API:</strong> Platform runtime, authentication, and order synchronization.</li>
          <li><strong>PostgreSQL (Neon):</strong> Managed encrypted database infrastructure.</li>
          <li><strong>Resend / Twilio / Meta Cloud API:</strong> Transactional email alerts and customer OTP delivery.</li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#222f3e", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Section 6: Contact Us</h2>
        <p>
          If you have questions regarding this Privacy Policy, wish to exercise your data rights, or need technical support, please contact our Data Protection Officer:
        </p>
        <p style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <strong>ProfitRx Support &amp; Privacy Team</strong><br />
          Email: <a href="mailto:xlr8.jpeg@gmail.com" style={{ color: "#2563eb", textDecoration: "none" }}>xlr8.jpeg@gmail.com</a><br />
          Website: <a href="https://greek-god-saas.vercel.app" style={{ color: "#2563eb", textDecoration: "none" }}>https://greek-god-saas.vercel.app</a>
        </p>
      </section>
    </div>
  );
}
