export default function TermsRoute() {
  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 24, fontFamily: "sans-serif", background: "#fff", borderRadius: 16 }}>
      <h1>Terms of Service — ProfitRx SaaS</h1>
      <p><strong>Effective Date:</strong> July 4, 2026</p>
      <p>By installing ProfitRx, you agree to these Terms of Service. ProfitRx provides automated COGS calculation, COD management, and GST tax reporting for Shopify merchants.</p>
      <h2>Data Protection Agreement (DPA)</h2>
      <p>Your use of ProfitRx is subject to our <a href="/dpa" style={{ color: "#008060", textDecoration: "underline" }}>Merchant Data Processing Agreement (DPA)</a>, which governs the processing of customer personal data under Shopify Level 2 Protected Customer Data standards and GDPR Article 28.</p>
      <h2>Subscription & Trial</h2>
      <p>Includes a 14-day free trial. Subscriptions are billed recursively via Shopify Billing API.</p>
      <h2>Governing Law</h2>
      <p>Governed by the laws of India under the jurisdiction of courts in Mumbai, Maharashtra.</p>
    </div>
  );
}
