# Test and Production Environment Separation Policy

**Document Version:** 1.0  
**Effective Date:** August 26, 2026  
**Applicability:** ProfitRx SaaS Engineering, QA, and CI/CD  

---

## 1. Objective

Shopify Level 2 Protected Customer Data requirements mandate the strict separation of test and production environments. Real merchant and customer personal data from production must never leak into development, staging, or testing environments, and synthetic testing scripts must never run against production tenants or production databases.

---

## 2. Environment Architecture

ProfitRx enforces isolation across three distinct infrastructure layers:

| Tier | Purpose | Database | Host / Domain | Allowed Data |
|---|---|---|---|---|
| **Development** | Local engineering & unit tests | SQLite (`prisma/dev.sqlite`) or local PG | `localhost:3000` | 100% Synthetic mock data |
| **Sandbox / Staging** | Integration tests, Partner review demo | Isolated Neon Dev branch / test DB | Dedicated staging endpoint | Dedicated test store (`demo-sandbox`) |
| **Production** | Live merchant operations | Primary Neon PostgreSQL (AWS us-east-1) | `greek-god-saas.vercel.app` | Real merchant & customer data under DPA |

---

## 3. Hard Runtime Safety Guards

To eliminate human error or accidental invocation of test scripts against production infrastructure, ProfitRx has embedded **hard runtime guards** directly into test/seed scripts:

### A. Environment Check Guard
All seeding and synthetic generation scripts (`prisma/seed.ts`, `scripts/seed-mock-data.ts`) enforce:
```typescript
if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" || process.env.VERCEL === "1") {
  throw new Error("[SECURITY FATAL] Cannot execute synthetic data seeding in production environment.");
}
```

### B. Tenant Isolation Guard
Seeding scripts strictly evaluate the target shop identifier before executing any database mutation:
```typescript
const isDemoOrSandbox = 
  SHOP.startsWith("demo-") || 
  SHOP.includes("-test-") || 
  SHOP.endsWith("-test.myshopify.com") || 
  SHOP.includes("-mock") || 
  SHOP.includes("-sandbox");

if (!isDemoOrSandbox) {
  throw new Error(
    `[SECURITY FATAL] Tenant guard violation: Target store '${SHOP}' is not a recognized demo or sandbox tenant. Mock data seeding is strictly prohibited on real stores.`
  );
}
```

### C. Direct Token Introspection Guard
Scripts that decrypt tokens for development diagnostics (`scripts/test-orders-gql.ts`, `scripts/verify-real-*.ts`) fail immediately in production unless explicitly authorized:
```typescript
if (process.env.NODE_ENV === "production" && process.env.ALLOW_VERIFICATION_SCRIPT !== "true") {
  throw new Error("[SECURITY FATAL] Direct token introspection scripts cannot be executed in production environment without explicit ALLOW_VERIFICATION_SCRIPT=true.");
}
```

---

## 4. Multi-Tenant Application Isolation

In the production database, all data queries and mutations are strictly partitioned by the Shopify merchant shop domain (`shop`):
- All database queries across all Prisma models include `where: { shop }`.
- Cross-tenant data leakage is prevented at the application layer through session verification:
  ```typescript
  if (session.shop !== requestedShop) {
    return Response.json({ error: "Unauthorized cross-shop access" }, { status: 403 });
  }
  ```
- GDPR deletion routines (`shop/redact`) execute strictly scoped deletes: `deleteMany({ where: { shop: shopName } })`.

---

## 5. Deployment & Secret Isolation

1. **No Shared Credentials:** Production database credentials (`DATABASE_URL`) and encryption keys (`TOKEN_ENCRYPTION_KEY`) exist exclusively within Vercel Production Environment Variables.
2. **Local Development Exclusion:** The `.env` file is permanently excluded from version control via `.gitignore`.
3. **CI/CD Pipeline Isolation:** Automated test runners execute unit tests with mocked Prisma adapters or in-memory repositories; production database connection strings are never exposed to test workflows.
