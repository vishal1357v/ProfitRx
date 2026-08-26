export const headers = () => ({
  "Cache-Control": "public, max-age=3600",
});

export default function DpaRoute() {
  return (
    <div style={{ maxWidth: 880, margin: "40px auto", padding: "32px 24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: "#1a1a1a", lineHeight: 1.6 }}>
      <div style={{ borderBottom: "2px solid #e1e3e5", paddingBottom: 20, marginBottom: 30 }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 8px 0" }}>Merchant Data Processing Agreement (DPA)</h1>
        <p style={{ color: "#6d7175", margin: 0 }}>
          <strong>Version:</strong> 1.0 &nbsp;|&nbsp; <strong>Effective Date:</strong> August 26, 2026 &nbsp;|&nbsp; <strong>Governing Product:</strong> ProfitRx SaaS
        </p>
      </div>

      <div style={{ background: "#f6f6f7", padding: "16px 20px", borderRadius: 8, marginBottom: 28, borderLeft: "4px solid #008060" }}>
        <p style={{ margin: 0, fontSize: "14px" }}>
          This Data Processing Agreement (&quot;DPA&quot;) forms an integral part of the service agreement between the Shopify merchant (&quot;Merchant&quot; or &quot;Data Controller&quot;) and ProfitRx SaaS (&quot;ProfitRx&quot;, &quot;Processor&quot;, &quot;we&quot;, or &quot;us&quot;). It establishes legally binding data protection commitments in compliance with Shopify&apos;s Level 2 Protected Customer Data requirements, the EU General Data Protection Regulation (GDPR), and applicable privacy legislation.
        </p>
      </div>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#202223" }}>1. Scope and Roles</h2>
        <p>
          <strong>1.1 Controller and Processor:</strong> The Merchant acts as the Data Controller with respect to all customer personal data retrieved via the Shopify API. ProfitRx acts as a Data Processor processing such data solely on behalf of and under the documented instructions of the Merchant.
        </p>
        <p>
          <strong>1.2 Processing Purposes:</strong> Personal data is processed strictly for:
        </p>
        <ul>
          <li>Assessing Return-to-Origin (RTO) and cash-on-delivery (COD) fraud risk for pending orders;</li>
          <li>Executing merchant-configured verification interventions (e.g., WhatsApp / SMS OTP verification);</li>
          <li>Calculating net profit, Cost of Goods Sold (COGS), and GST tax reconciliation;</li>
          <li>Providing historical Order Intelligence and customer risk profiles to the Merchant.</li>
        </ul>
        <p>
          <strong>1.3 Prohibition of Commercial Exploitation:</strong> ProfitRx shall never sell, rent, monetize, or disclose customer personal data to third parties, nor process customer personal data for independent advertising or cross-merchant profiling.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#202223" }}>2. Categories of Protected Customer Data</h2>
        <p>ProfitRx accesses and processes only the minimum data required to execute the stated purposes:</p>
        <ul>
          <li><strong>Identity & Contact:</strong> Customer display name, customer email address, and customer delivery phone number (utilized strictly for OTP verification and repeat-offender risk scoring).</li>
          <li><strong>Delivery Location:</strong> Shipping postal code (PIN code), city, and state/province (utilized for regional delivery failure heatmaps and COD restriction rules).</li>
          <li><strong>Order Details:</strong> Order numbers, line items, monetary totals, discounts, shipping fees, payment gateway (COD vs. prepaid), and fulfillment statuses.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#202223" }}>3. Technical and Organizational Security Controls</h2>
        <p>ProfitRx implements verified security controls adhering to industry standards and Shopify Level 2 requirements:</p>
        <ul>
          <li><strong>Encryption at Rest:</strong> All database storage (PostgreSQL) is encrypted at rest using AES-256 via our cloud infrastructure provider (Neon Inc., certified SOC 2 Type II, ISO 27001).</li>
          <li><strong>Encryption in Transit:</strong> All data transmissions between Shopify, the Merchant, and ProfitRx infrastructure require TLS 1.2 or TLS 1.3 with HTTPS enforcement and HTTP Strict Transport Security (HSTS).</li>
          <li><strong>Application Token Encryption:</strong> Shopify offline access tokens and external marketing API credentials are encrypted with AES-256-GCM using dedicated server-side encryption keys prior to database persistence.</li>
          <li><strong>Access Logging:</strong> Access to protected customer data (including individual order inspections, customer lists, and report exports) is systematically recorded in tamper-evident access logs retaining actor, resource ID, action, and timestamp for 180 days.</li>
          <li><strong>Data Loss Prevention (DLP):</strong> Application logs and error telemetry mask sensitive identifiers (e.g., masking phone numbers to <code>+91 ****1234</code> and emails to <code>j***@domain.com</code>). Plaintext authentication tokens, passwords, and OTPs are strictly excluded from logs.</li>
          <li><strong>Test / Production Separation:</strong> Development and testing environments operate on completely isolated databases with runtime guards prohibiting production connection strings and live merchant domains in seed scripts.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#202223" }}>4. Authorized Sub-Processors</h2>
        <p>The Merchant grants general authorization for ProfitRx to engage the following sub-processors for infrastructure delivery:</p>
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0", fontSize: "14px" }}>
          <thead>
            <tr style={{ background: "#f1f2f3", textAlign: "left" }}>
              <th style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Sub-processor</th>
              <th style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Role / Purpose</th>
              <th style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Location</th>
              <th style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Security Standard</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Neon Inc.</td>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Cloud PostgreSQL Database</td>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>USA (AWS us-east-1)</td>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>SOC 2 Type II, ISO 27001</td>
            </tr>
            <tr>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Vercel Inc.</td>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Serverless Hosting &amp; Edge Compute</td>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Global Edge Network</td>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>SOC 2 Type II, ISO 27001</td>
            </tr>
            <tr>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Twilio / Resend / Meta</td>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>Transactional SMS / Email / WhatsApp</td>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>USA / Global</td>
              <td style={{ padding: "10px 12px", border: "1px solid #d2d5d8" }}>SOC 2, ISO 27001, TLS 1.3</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#202223" }}>5. Data Retention, Redaction, and Deletion</h2>
        <p>
          <strong>5.1 Retention Schedule:</strong>
        </p>
        <ul>
          <li><strong>Verification OTP Codes:</strong> Erased immediately upon verification or purged automatically within 48 hours.</li>
          <li><strong>Execution Telemetry Logs:</strong> Automatically rotated and purged after 90 days.</li>
          <li><strong>Protected Customer Data Access Logs:</strong> Automatically purged after 180 days.</li>
          <li><strong>Order Financial &amp; Tax Records:</strong> Retained for the statutory tax compliance period (6 years under Section 36 of the CGST Act) with customer identifying fields pseudonymized.</li>
        </ul>
        <p>
          <strong>5.2 GDPR &amp; Mandatory Webhook Handling:</strong>
        </p>
        <ul>
          <li><code>customers/redact</code>: Upon receiving a customer redaction webhook from Shopify, all corresponding personal identifying records (name, email, phone) are permanently deleted or redacted within 48 hours.</li>
          <li><code>shop/redact</code>: Upon store uninstallation and receipt of a shop redaction webhook, all merchant settings, credentials, customer profiles, and session tokens are completely deleted from the database.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#202223" }}>6. Security Incident Notification</h2>
        <p>
          ProfitRx maintains a comprehensive Security Incident Response Policy. In the event of a confirmed personal data breach affecting Merchant data, ProfitRx shall notify the affected Merchant without undue delay and in all events within <strong>72 hours</strong> of becoming aware of the incident. The notification shall include the nature of the breach, affected data categories, estimated number of affected data subjects, and mitigating actions taken.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#202223" }}>7. Automated Decision-Making &amp; Human Review</h2>
        <p>
          ProfitRx provides algorithmic risk scoring to assist Merchants in managing COD orders. By default, ProfitRx operates in <strong>OBSERVE</strong> or <strong>REVIEW</strong> mode, ensuring human-in-the-loop merchant verification before any order cancellation or payment restriction occurs. Merchants retain complete authority to override any risk recommendation, whitelist individual customers, or configure custom thresholds.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#202223" }}>8. Acceptance and Verification</h2>
        <p>
          Merchants accept this DPA through explicit confirmation within the ProfitRx Settings dashboard. Acceptance is permanently timestamped and version-tracked against the Merchant&apos;s shop domain in the database.
        </p>
      </section>

      <div style={{ borderTop: "1px solid #e1e3e5", paddingTop: 16, marginTop: 40, fontSize: "13px", color: "#8c9196" }}>
        ProfitRx SaaS &bull; Support &amp; Compliance Inquiries: <a href="mailto:support@profitrx.app" style={{ color: "#008060" }}>support@profitrx.app</a>
      </div>
    </div>
  );
}
