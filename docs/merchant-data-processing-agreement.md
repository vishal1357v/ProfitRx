# Merchant Data Processing Agreement (DPA)

**Document Version:** 1.0  
**Effective Date:** August 26, 2026  
**Governing SaaS Application:** ProfitRx  
**Public Online Reference:** `https://greek-god-saas.vercel.app/dpa`  

---

## Parties

1. **The Merchant** (Data Controller), installing and operating ProfitRx on a Shopify store.
2. **ProfitRx SaaS** (Data Processor), providing COD fraud protection, RTO risk scoring, profit intelligence, and COGS tracking.

---

## 1. Scope, Purpose, and Processing Instructions

- **Controller & Processor:** The Merchant is the Controller of protected customer data; ProfitRx is the Processor.
- **Documented Instructions:** ProfitRx processes customer data strictly to fulfill the functional features configured by the Merchant:
  - Evaluation of order delivery risk and COD fraud probability.
  - Dispatch of OTP challenges via SMS or WhatsApp to verify order authenticity.
  - Aggregation of cost of goods sold (COGS), net profit, and GST reconciliation.
- **Prohibition on Commercial Use:** ProfitRx will never sell, rent, monetize, or use customer personal data for independent commercial or advertising purposes.

---

## 2. Categories of Protected Customer Data Processed

- **Customer Identifiers:** Customer name, email address, and phone number (utilized strictly for OTP delivery and customer-level RTO risk profiles).
- **Shipping Location:** Delivery postal code (PIN code), city, and state/province (utilized for regional delivery risk evaluation and COD blocking rules).
- **Order Attributes:** Order IDs, line items, monetary totals, discounts, shipping fees, payment gateway method, and fulfillment status.

---

## 3. Sub-Processors

The Merchant grants general written authorization for ProfitRx to utilize the following vetted sub-processors:

| Sub-Processor | Role / Function | Data Center Location | Security Standards |
|---|---|---|---|
| **Neon Inc.** | Managed Cloud PostgreSQL Database | USA (AWS us-east-1) | SOC 2 Type II, ISO 27001, AES-256 |
| **Vercel Inc.** | Serverless Application Hosting & Edge Compute | Global Edge Network | SOC 2 Type II, ISO 27001, TLS 1.3 |
| **Twilio / Resend / Meta** | Transactional SMS, Email & WhatsApp APIs | USA / Global | SOC 2, ISO 27001, TLS 1.3 |

---

## 4. Technical and Organizational Measures (TOMs)

- **Encryption at Rest:** All data at rest is encrypted with AES-256 block ciphers by managed infrastructure.
- **Encryption in Transit:** All communications enforce TLS 1.2 or TLS 1.3 with HSTS headers.
- **Application Token Encryption:** Access tokens are encrypted at the application layer with AES-256-GCM prior to storage.
- **Data Loss Prevention:** Application logs systematically mask phone numbers (`+91 ****1234`) and emails (`j***@domain.com`). Raw PII is excluded from error logs and diagnostic telemetry.
- **Access Audit Logs:** All views, searches, and exports of customer data are recorded in an audit trail retained for 180 days.

---

## 5. Data Subject Rights & Deletion

- **Assistance:** ProfitRx supports the Merchant in responding to data subject requests via Shopify's mandatory GDPR webhooks.
- **Erasure Requests (`customers/redact`):** Processed within 48 hours.
- **Store Uninstallation (`shop/redact`):** Complete deletion of all store records, settings, and customer profiles within 30 days.

---

## 6. Security Incident Notification

In the event of a confirmed personal data breach affecting Merchant customer data, ProfitRx will notify the Merchant without undue delay and in all events within **72 hours** of becoming aware of the breach.

---

## 7. Governing Law

This Agreement is governed by the laws of India, under the jurisdiction of courts in Mumbai, Maharashtra, without prejudice to mandatory provisions of applicable data protection law (including GDPR).
