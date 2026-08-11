# Project Rules

- **Raw SQL Restrictions**:
  - Only use parameterized Prisma SQL.
  - Never concatenate SQL strings.
  - Never interpolate user input directly into any SQL queries.
  - Keep all financial data interactions fully secured against SQL injection vulnerabilities.

---

# Development Workflow: Vertical Slice Architecture

## Core Principle
Every feature is built **vertically**, not horizontally. A feature is not done until a merchant can click it, see it, change it, and verify it in the browser.

## Backend Freeze
Do NOT touch `app/services/*` unless fixing a confirmed bug. Focus all work on:
- `app/routes/`
- `app/components/`
- `app/application/`

## No Direct Prisma Access from UI
No React component or route loader/action may call `prisma.*` directly. Everything goes through an Application Service. This prevents architectural drift.

## Feature Completion Definition
A feature is NOT done unless ALL of these are true:
- [ ] UI exists and is visually polished
- [ ] Route exists with proper loader and action
- [ ] Loader fetches real data (no mocks, no hardcoded values)
- [ ] Action processes real mutations
- [ ] Application Service mediates between route and repository
- [ ] Repository handles persistence
- [ ] Database schema is correct and migrated
- [ ] Dashboard reflects the feature's data
- [ ] Error states are handled gracefully (ErrorBoundary)
- [ ] Empty states show meaningful UI (not blank screens)
- [ ] Mobile-responsive layout works
- [ ] Manual browser verification completed

## Development Order
Build features one at a time, fully vertically:
```
UI → Application Service → Repository → Database → Visible in browser → DONE
```
Then move to the next feature.

## Sprint Plan
1. **Sprint 1**: Order Intelligence (complete), remove ALL fake/hardcoded values, execution logs, learning record UI
2. **Sprint 2**: Dashboard polish, Billing flow, Onboarding flow
3. **Sprint 3**: Mobile responsiveness, Performance, Empty states, Error handling everywhere

## Zero new backend services until the frontend catches up.

---

# Canonical Product Definition

**ProfitRx = Shopify COD risk management + RTO prevention + profit protection.**

The central problem is **COD orders turning into RTO losses**. Everything else must support that.
You are competing in the **COD fraud / RTO prevention / COD verification** category.

## Core Loop
1. Customer places COD order
2. ProfitRx evaluates risk
3. ProfitRx decides whether the order should be trusted
4. ProfitRx intervenes if necessary
5. Merchant avoids unnecessary RTO loss
6. ProfitRx measures the financial impact

## Available Interventions
- **Allow COD** when risk is acceptable
- **OTP verification** when intent needs verification
- **Partial payment/deposit** when the merchant wants commitment
- **Force prepaid** for sufficiently risky/high-value orders
- **Block COD** for extreme cases
- **Pincode protection**
- **Repeat-offender protection**

## UI Hierarchy
The frontend must reflect a focused COD/RTO protection product, not a generic AI platform.

**PROFITRX**
- **Home**: Dashboard
- **Operations**: Orders, COD Verification, Activity
- **Protection**: COD Rules, Pincode Protection, Customer Risk
- **Analytics**: RTO Analytics, Profit Leaks, Customers, ROAS, Reports
- **Configuration**: COGS, Settings
- **Account**: Billing

*Order Intelligence* is not a top-level tab; it is the detail view reached from Orders or Activity.

## Primary Value Proposition (Economic Justification)
Do not just provide a risk score (e.g., "40% RTO risk").
Instead, frame the risk economically: "This order has a 40% RTO risk exposing you to ₹1,800 of expected loss. OTP costs ₹10 with an expected downside of ₹30. Therefore, OTP is economically justified."
