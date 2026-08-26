# Data Retention and Automated Deletion Policy

**Document Version:** 1.0  
**Effective Date:** August 26, 2026  
**Product:** ProfitRx SaaS  

---

## 1. Principle of Purpose-Driven Retention

Shopify Level 1 and Level 2 requirements require that personal data must not be kept longer than necessary for the stated purpose. Blanket or arbitrary deletion rules (e.g., deleting all data after 90 days) risk violating statutory accounting laws and destroying legitimate merchant analytics.

ProfitRx adopts a **purpose-driven retention schedule**, carefully balancing:
1. The **business purpose** of the data (Order Intelligence, RTO risk scoring, COD verification, profit analysis).
2. **Statutory accounting & tax obligations** (Section 36 of the Central Goods and Services Tax Act, 2017).
3. **Data minimization** and user privacy rights under GDPR and Shopify policies.

---

## 2. Retention Schedule Matrix

| Data Category | Specific Fields | Business Purpose | Minimum Retention | Legal / Statutory Requirement | Anonymization Strategy | Scheduled Retention |
|---|---|---|---|---|---|---|
| **One-Time Verification Codes** | `CODOrder.otp` | SMS/WhatsApp OTP delivery to verify order intent | Up to 48 hours or until verified | None | Full deletion (`otp = null`) | **Immediate on verify or 48 hours** |
| **Pipeline Diagnostics** | `ExecutionLog` | Operational debugging and webhook error diagnosis | 60–90 days | None | Full record deletion | **90 days** |
| **PCD Access Logs** | `CustomerDataAccessLog` | Audit trail of protected data access | 180 days | Shopify Level 2 requirement | Full record deletion | **180 days** |
| **Customer Personal Identifiers** | `customerName`, `customerEmail`, `phone` | Order Intelligence detail, repeat-offender risk history | Active merchant subscription | None (Shopify is master system of record) | Redact to `null`, delete profile | **Subscription duration + 48h after GDPR redact webhook** |
| **Geographic Aggregates** | `PincodeStats`, `rtoCount`, `deliveryRate` | Community RTO heatmap and delivery feasibility scoring | Indefinite | None | Zero personal data (contains only aggregate postal code stats) | **Indefinite (Non-PII)** |
| **Financial & Tax Records** | Gross order value, line items, taxes (CGST/SGST/IGST), COGS | Profit & loss calculation, GSTR-1 tax compliance | 6 years | **CGST Act Section 36 (72 months)** | Keep financial figures with customer name/email nulled | **6 years (Statutory)** |

---

## 3. Automated Deletion & Maintenance Architecture

### A. Automated Daily Maintenance Cron
- **Endpoint:** `/api/cron/retention-cleanup`
- **Scheduler:** Vercel Cron (`0 3 * * *` — daily at 03:00 UTC)
- **Authentication:** Strict bearer token validation via `CRON_SECRET`. Fail closed if secret is missing or mismatched.
- **Actions Executed:**
  1. `purgeExpiredOtps()`: Clears all `CODOrder.otp` where verified or created > 48 hours ago.
  2. `purgeOldExecutionLogs(90)`: Deletes `ExecutionLog` records older than 90 days.
  3. `purgeOldAccessLogs(180)`: Deletes `CustomerDataAccessLog` records older than 180 days.

### B. Event-Driven Deletion (GDPR Webhooks)
- **`customers/redact` Webhook:**
  Executed within 48 hours of receipt. Deletes `CustomerProfile` records for the customer ID and sets `customerName: null`, `customerEmail: null` across all historical orders.
- **`shop/redact` Webhook:**
  Executed upon store uninstallation. Completely purges all store records (orders, settings, line items, sessions, and logs) within 30 days.
