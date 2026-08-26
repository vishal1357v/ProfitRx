# Data Loss Prevention (DLP) Strategy & Policy

**Document Version:** 1.0  
**Effective Date:** August 26, 2026  
**Product:** ProfitRx SaaS  

---

## 1. Purpose & Scope

This Data Loss Prevention (DLP) Policy defines the technical controls, architectural patterns, and operational practices employed by ProfitRx to prevent unauthorized extraction, leakage, or unintended exposure of protected customer data and secrets.

---

## 2. Technical Masking Controls

ProfitRx enforces systematic PII and secret masking via a central utility (`app/utils/dlp.ts`):

### A. Phone Number Masking (`maskPhone`)
Customer phone numbers processed for OTP verification are masked across all user-facing interfaces, operational tables, and execution logs:
- `+919876543210` &rarr; `+91 ****3210`
- `9876543210` &rarr; `****3210`
Full unmasked phone numbers exist only ephemerally in memory during active API calls to SMS/WhatsApp providers and are never emitted in logs.

### B. Email Address Masking (`maskEmail`)
Customer email addresses are masked in logs and shared views:
- `customer@example.com` &rarr; `c***@example.com`

### C. Log Sanitization (`sanitizeLogData`)
Telemetry payloads written to `ExecutionLog` or application logs automatically redact high-risk fields:
- `accessToken` &rarr; `[REDACTED]`
- `refreshToken` &rarr; `[REDACTED]`
- `otp` &rarr; `[REDACTED]`
- `secret` &rarr; `[REDACTED]`
- `customerName` &rarr; `[REDACTED]`

---

## 3. Application Logging Standards

1. **Zero Raw Payload Logging:** Webhook handlers (`webhooks.customers.redact.tsx`, `webhooks.customers.data_request.tsx`, `webhooks.shop.redact.tsx`) are prohibited from invoking `console.log(JSON.stringify(payload))`. Instead, they invoke `safeGdprLogSummary(payload)` which extracts solely non-PII identifiers (`shop_domain`, `customer_id`, `orders_requested_count`).
2. **Error Boundary Sanitization:** React Router error boundaries sanitize stack traces and server errors to ensure customer records or API responses are not rendered in browser client logs.
3. **Audit Log Isolation:** Audit log entries (`CustomerDataAccessLog`) track actions, resource IDs, and actors, but **strictly never store the customer personal data itself**.

---

## 4. Repository & Codebase Safeguards

1. **Environment File Exclusion:** `.env` and `.env.local` files are specified in `.gitignore` to prevent secret commits.
2. **Secret Scanning in Git:** Regular audits check Git commit history for API secret tokens (`shpat_`, `shpca_`, AWS keys, or connection strings).
3. **Development Script Sanitization:** Diagnostic scripts located in `scripts/` are guarded with runtime checks preventing execution against live credentials.

---

## 5. Export Controls

1. **Authenticated Endpoints Only:** Report exports (such as GST summary CSVs via `/api/gst-report`) require authenticated Shopify Admin sessions with matching shop domain verification.
2. **Export Audit Trail:** Every export action is logged to `CustomerDataAccessLog` recording the merchant actor, timestamp, client IP, and export format.
3. **Download Protections:** Exported CSVs avoid including unnecessary customer PII; GST tax summaries export HSN tax lines and aggregate taxable values.
