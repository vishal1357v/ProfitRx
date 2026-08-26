# Shopify Partner Dashboard Questionnaire Evidence Matrix

**Application:** ProfitRx (Shopify App Store Submission)  
**Compliance Level:** Shopify Level 2 Protected Customer Data (PCD)  
**Evaluation Date:** August 26, 2026  
**Final Status:** **READY FOR SHOPIFY PCD REVIEW** (Pending Production Deployment & Partner Dashboard Form Submission)  

---

## Matrix Status Definitions
- **IMPLEMENTED:** Technical logic, routes, schema models, or services exist in the codebase.
- **VERIFIED:** Validated through automated unit/integration tests (`vitest run app/`) and TypeScript typecheck (`tsc --noEmit`).
- **DOCUMENTED:** Formal policy or specification document exists in `docs/` or public application routes.
- **PARTNER-DASHBOARD ACTION:** Action the merchant/partner must take directly inside Shopify Partner Dashboard.
- **EXTERNAL EVIDENCE REQUIRED:** Third-party compliance documentation or certification (e.g., Neon SOC 2, AWS KMS).

---

## 1. Level 1 Requirements Matrix

| Requirement | Question Summary | Target Answer | Status | Implementation & Verifiable Evidence |
|---|---|---|---|---|
| **L1-1: Minimum Personal Data** | Do you process only the minimum personal data required to provide app functionality? | **Yes** | `IMPLEMENTED` `VERIFIED` `DOCUMENTED` | **Code:** GraphQL queries in `app/services/shopify.service.ts` query solely `customerName`, `customerEmail`, `phone`, and shipping `pincode/city/province` needed for COD fraud scoring and OTP verification.<br>**Verification:** 100% passed unit tests in `order-feature.service.test.ts`.<br>**Docs:** `docs/data-retention-policy.md` |
| **L1-2: Transparency to Merchants** | Do you inform merchants what personal data you process and your reason for processing it? | **Yes** | `IMPLEMENTED` `VERIFIED` `DOCUMENTED` | **Code:** Public Privacy Policy at `/privacy` (`app/routes/privacy.tsx`) and public Merchant DPA at `/dpa` (`app/routes/dpa.tsx`).<br>**In-App UI:** Dedicated "🛡️ Data Protection (DPA)" tab in Store Settings (`app/routes/app.settings.tsx`). |
| **L1-3: Purpose Limitation** | Do you limit your processing of personal data to the stated purposes? | **Yes** | `IMPLEMENTED` `DOCUMENTED` | **Code:** Processing is strictly limited to RTO risk scoring, OTP intent delivery, net profit calculation, and statutory GST reporting. Zero cross-store profiling.<br>**Docs:** DPA Section 1.2 and Privacy Policy Section 2. |
| **L1-4: Customer Consent** | Where applicable, do you respect and apply customer consent decisions? | **N/A** | `DOCUMENTED` | **Reasoning:** ProfitRx acts as a Data Processor on behalf of the Merchant (Data Controller). Data processing is conducted under the Merchant's legitimate interest (fraud prevention) and contract performance. ProfitRx supports merchant compliance by strictly processing Shopify's mandatory GDPR privacy webhooks within 48 hours.<br>**Docs:** `docs/merchant-data-processing-agreement.md` |
| **L1-5: Data-Sale Opt-Out** | Do you respect and apply customer decisions to opt out of data sharing / data sale? | **N/A** | `DOCUMENTED` | **Reasoning:** ProfitRx does not sell, rent, monetize, or disclose customer personal data to third parties under any circumstances.<br>**Docs:** DPA Section 1.3 and Privacy Policy Section 3. |
| **L1-6: Automated Decisions** | If you use personal data for automated decision-making that might have legal or significant effects, do you allow customer opt-out? | **N/A** | `DOCUMENTED` `IMPLEMENTED` | **Reasoning:** ProfitRx algorithms evaluate delivery and fraud risk for COD orders. Restricting an optional payment method (COD) does not produce a "legal or significant effect" under GDPR Art. 22 (prepaid payment remains available). Furthermore, ProfitRx defaults to `OBSERVE` and `REVIEW` modes where the merchant is the human decision-maker and can override or whitelist any customer.<br>**Docs:** Privacy Policy Section 5 and DPA Section 7. |
| **L1-7: Merchant DPA** | Do you make privacy and data protection agreements with your merchants? | **Yes** | `IMPLEMENTED` `VERIFIED` `DOCUMENTED` `PARTNER-DASHBOARD ACTION` | **Code:** Dedicated public DPA route `/dpa` (`app/routes/dpa.tsx`). Persistent in-app acceptance flow in `app/routes/app.settings.tsx` records `dpaAcceptedAt`, `dpaAcceptedVersion`, and `shop` to `StoreSettings`.<br>**Verification:** Verified by `compliance.test.ts`.<br>**Docs:** `docs/merchant-data-processing-agreement.md` |
| **L1-8: Retention Periods** | Do you apply retention periods to make sure personal data isn't kept longer than needed? | **Yes** | `IMPLEMENTED` `VERIFIED` `DOCUMENTED` | **Code:** Retention cleanup routine in `app/services/compliance/retention-cleanup.service.ts` automated via Vercel Cron (`/api/cron/retention-cleanup`). Purges OTPs within 48h, rotates execution logs at 90d, and access logs at 180d.<br>**Verification:** 11 unit tests in `compliance.test.ts`.<br>**Docs:** `docs/data-retention-policy.md` |
| **L1-9: Encryption** | Do you encrypt data at rest and in transit? | **Yes** | `IMPLEMENTED` `VERIFIED` `DOCUMENTED` `EXTERNAL EVIDENCE REQUIRED` | **Transit:** TLS 1.2/1.3 enforced by Vercel and Neon; HSTS in `vercel.json`.<br>**At Rest:** Managed PostgreSQL AES-256 on NVMe and S3 (Neon SOC 2 Type II certified).<br>**Application:** AES-256-GCM token encryption in `app/services/token-encryption.server.ts`.<br>**Docs:** `docs/encryption-evidence.md` |

---

## 2. Level 2 Requirements Matrix

| Requirement | Question Summary | Target Answer | Status | Implementation & Verifiable Evidence |
|---|---|---|---|---|
| **L2-1: Encrypted Backups** | Do you encrypt your data backups? | **Yes** | `DOCUMENTED` `EXTERNAL EVIDENCE REQUIRED` | **Evidence:** Neon continuous WAL archiving and daily base snapshots are stored in AWS S3 buckets encrypted with AES-256 (`SSE-S3`). ProfitRx creates zero unmanaged/unencrypted manual database dumps.<br>**Verification:** [Neon Trust Center](https://neon.tech/trust-center) & [Security Docs](https://neon.tech/docs/security/security-overview).<br>**Docs:** `docs/encryption-evidence.md` |
| **L2-2: Test/Prod Separation** | Do you keep test and production data separate? | **Yes** | `IMPLEMENTED` `VERIFIED` `DOCUMENTED` | **Code:** Seeding and mock data scripts (`prisma/seed.ts`, `scripts/seed-mock-data.ts`) enforce hard runtime environment and tenant guards: abort immediately if `NODE_ENV=production`, `VERCEL_ENV=production`, or if the target store is not a recognized sandbox tenant.<br>**Verification:** Verified by `compliance.test.ts`.<br>**Docs:** `docs/test-production-separation.md` |
| **L2-3: Data Loss Prevention** | Do you have a data loss prevention strategy? | **Yes** | `IMPLEMENTED` `VERIFIED` `DOCUMENTED` | **Code:** Masking utilities in `app/utils/dlp.ts` (`maskPhone`, `maskEmail`, `sanitizeLogData`, `safeGdprLogSummary`). All 3 GDPR webhooks refactored to eliminate raw PII dumps.<br>**Git History Audit:** Clean (0 `.env` files, 0 real Shopify tokens committed).<br>**Docs:** `docs/dlp-policy.md` |
| **L2-4: Limit Staff Access** | Do you limit staff access to protected customer data? | **Yes** | `IMPLEMENTED` `DOCUMENTED` | **Code:** Multi-tenant query isolation strictly partitions records by `shop`. Zero default developer database access.<br>**Docs:** `docs/access-control-policy.md` |
| **L2-5: Strong Passwords / MFA** | Do you require strong passwords for staff accounts? | **Yes** | `IMPLEMENTED` `DOCUMENTED` | **Evidence:** ProfitRx maintains zero internal password tables. Administrative access is mediated entirely through enterprise identity providers requiring mandatory MFA (Shopify Partner Dashboard MFA, Vercel SSO/2FA, GitHub 2FA). Neon enforces 60-bit entropy passwords.<br>**Docs:** `docs/access-control-policy.md` |
| **L2-6: Access Logging** | Do you keep an access log to protected customer data? | **Yes** | `IMPLEMENTED` `VERIFIED` `DOCUMENTED` | **Code:** `CustomerDataAccessLog` table in Prisma schema. `AuditLogService` logs all server-side paths accessing customer data across 11 routes (orders, customers, operations, dashboard, RTO, reports, search, GST export, COD rules, customer API, GDPR request).<br>**PII Protection:** Log strictly stores zero customer PII.<br>**Verification:** Verified by `compliance.test.ts`. |
| **L2-7: Incident Response Policy** | Do you have a security incident response policy? | **Yes** | `DOCUMENTED` | **Evidence:** Formal policy in `docs/security-incident-response.md`. Establishes 4-tier severity matrix, 5-stage lifecycle, and legally binding **72-hour notification commitment** to notify affected merchants and Shopify upon confirmation of any personal data breach. |

---

## 3. Partner Action Checklist Before Form Submission

1. **Deploy latest code to Vercel:**
   ```bash
   git add .
   git commit -m "feat(compliance): implement Shopify Level 2 PCD controls"
   git push origin master
   ```
2. **Apply schema changes to Neon production database:**
   In your CI/CD or deployment environment with direct access to Neon:
   ```bash
   npx prisma db push
   ```
3. **Verify Environment Variables in Vercel:**
   - `CRON_SECRET`: Set to a strong 32-byte secret (matches `vercel.json` cron calls).
   - `TOKEN_ENCRYPTION_KEY`: Set to 32-byte base64 string.
4. **Complete Partner Dashboard Questionnaire:**
   Fill in the answers exactly as specified in the Target Answers table above, referencing the evidence and documentation links provided.
