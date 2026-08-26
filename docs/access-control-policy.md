# Staff Access Control & Credential Security Policy

**Document Version:** 1.0  
**Effective Date:** August 26, 2026  
**Product:** ProfitRx SaaS  

---

## 1. Principle of Least Privilege

ProfitRx enforces strict least-privilege principles across all administrative and technical interfaces. Staff members are granted only the minimum access required to perform their specific operational duties.

---

## 2. Authentication & Credential Hygiene

### A. Multi-Factor Authentication (MFA)
- Direct username/password authentication into ProfitRx is **intentionally non-existent**. ProfitRx does not maintain custom user password tables, eliminating password breach vectors.
- Production access is mediated entirely through enterprise identity providers requiring mandatory Multi-Factor Authentication (MFA / 2FA):
  1. **Shopify Partner Dashboard:** Enforces mandatory 2-Step Verification for all team members.
  2. **Vercel Deployment Console:** Enforces SSO / 2FA for infrastructure deployments.
  3. **Neon Cloud Database:** Enforces 2FA and strong 60-bit entropy password strings for database connection credentials.
  4. **GitHub Repository:** Enforces mandatory 2FA on organization accounts.

### B. Session Security
- In-app merchant sessions use Shopify App Bridge session tokens signed via HMAC-SHA256.
- Offline access tokens stored in `Session` are encrypted at rest using AES-256-GCM.

---

## 3. Database Access Controls

1. **Zero Default Developer Database Access:** Developers and engineers do not have default read or write credentials to the production database.
2. **Environment Variable Isolation:** Production connection strings (`DATABASE_URL`) are stored in secure Vercel environment variables and cannot be viewed in plaintext by non-administrative staff.
3. **Emergency Escalation (Break-Glass):** Any production database intervention requires:
   - Approval by the Technical Lead.
   - Time-limited credential generation.
   - Comprehensive query logging and review.

---

## 4. Protected Customer Data Access Logging

All server-side queries that retrieve customer personal identifying data (names, emails, phones) are systematically recorded in `CustomerDataAccessLog`:
- Records: `shop`, `actor`, `resource`, `resourceId` (sanitized), `action`, `ipAddress`, `userAgent`, `createdAt`.
- Strict Guarantee: No customer PII is stored in the access log.
- Retention: Maintained for 180 days for audit verification before automated rotation.
