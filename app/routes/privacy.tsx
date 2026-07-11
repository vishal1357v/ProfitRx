export const headers = () => ({
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
});

export default function PrivacyRoute() {
  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 24, fontFamily: "sans-serif", background: "#fff", borderRadius: 16 }}>
      <h1>Privacy Policy — ProfitRx SaaS</h1>
      <p><strong>Effective Date:</strong> July 4, 2026</p>
      <p>ProfitRx provides profit tracking, COD rules, and GST compliance reporting for Shopify merchants. We comply with the Indian Information Technology Act 2000 and GDPR.</p>
      <h2>Data We Collect</h2>
      <p>Store orders, line item COGS, shipping zip codes for RTO detection, and account owner emails.</p>
      <h2>Data Protection</h2>
      <p>All data is stored in encrypted PostgreSQL database clusters. For requests or data deletion, contact support@profitrx.app.</p>
    </div>
  );
}
