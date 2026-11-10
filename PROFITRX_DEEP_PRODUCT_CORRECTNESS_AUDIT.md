# ProfitRx — Deep User-Centric Product Correctness & Adversarial Audit Report

**Date of Audit:** November 9, 2026  
**Auditor:** Independent Production Reliability & Financial Correctness Audit Agent  
**Target Application:** ProfitRx (Shopify App for Indian D2C Merchants)  
**Repository Working Directory:** `c:\Users\xlr8j\Desktop\shopify-apps\greek-god-saas`  
**Git Commit Audited:** `1d6d834` (Deployed Version: `profitrx-rto-profit-17`)  
**Methodology:** Adversarial Static Code Analysis, Mathematical Recalculation, Multi-Tenant Boundary Review, Real Merchant Persona Simulation, Shopify GraphQL & Function Verification.

---

## 1. Executive Summary & Verdict

### 1.1 Overall Verdict: **CONDITIONAL PILOT PASS (WITH IMMEDIATE REMEDIATIONS REQUIRED)**

ProfitRx has evolved significantly from a generic AI search prototype into an architecture built around **COD risk management, RTO prevention, and profit protection**. The foundational domain layer—including the `CanonicalEconomicsCalculator`, the piecewise monotonic risk calibration curve, the Shopify checkout payment customization Function (`cod-blocker`), and tenant isolation via parameterized Prisma queries—is fundamentally solid and passes 358 automated tests (335 application tests + 23 extension tests).

**However, the application is NOT ready for unmonitored commercial deployment.**

A merchant installing ProfitRx today will encounter **three P0 blockers** and **eight P1 critical defects** where the UI communicates misleading numbers, customer OTP messages misroute to the merchant, financial charts use mathematically broken formulas, refunds are completely ignored, and subscription order limits are never enforced.

| Perspective | Assessment | Status |
| :--- | :--- | :--- |
| **Real Merchant Perspective** | Core Operations Queue and Order Decision card provide clear economic justifications. However, OTP setup fails silently, and high-risk orders are falsely claimed as "RTO Savings" on the dashboard even when delivered. | **NEEDS FIXES** |
| **Adversarial QA Perspective** | Webhook idempotency and concurrency locks succeed. However, missing customer phones cause customer OTPs to be sent to the merchant's personal phone number, and ad platform connections fail with raw 503 errors. | **VERIFIED FAILURE** |
| **Financial Auditor Perspective** | `CanonicalEconomicsCalculator` is mathematically sound, but Dashboard 30-day profit charts subtract customer-paid shipping as a fee (`f = tax + shipping`), refunds are omitted from all revenue/profit totals, and realized RTO loss ignores weight slabs. | **VERIFIED FAILURE** |
| **Security & Privacy Perspective** | Multi-tenant database queries strictly isolate by `where: { shop }`. Zero raw SQL injection risk. However, GDPR customer redaction deletes profile records but leaves customer phone/email in `CustomerRisk` and `CODOrder`. | **PARTIAL PASS** |
| **Production Reliability Perspective** | Error boundaries exist on routes; DB connection retries are implemented. However, `ordersUsed` is never incremented, making billing limits completely non-functional. | **PARTIAL PASS** |

---

## 2. Complete Feature Inventory & Reality Check

| Route / Feature | UI Promise | Backend Reality | Persistence State | External Dependencies | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **App Shell & Nav** (`app.tsx`) | Single unified app header with categorized Polaris navigation. | Implements App Bridge `NavMenu` and desktop popovers. Syncs subscription state. | `Session`, `Subscription` | Shopify Admin App Bridge | **VERIFIED PASS** |
| **Main Dashboard** (`app.dashboard.tsx`) | Real-time profit, net margin, RTO rate, leaks, and 30-day daily profit chart. | **Broken chart formula**: `dailyStats` subtracts `tax + shippingPrice` as fee. Counts delivered high-risk orders as "totalRtoSavings". | `orders`, `product_cogs`, `rto_events` | None | **VERIFIED FAILURE (P0)** |
| **Operations Queue** (`app.operations.tsx`) | Real-time queue of incoming COD orders with recommended actions & bulk execution. | Reads `Order` table, filters by risk/decision. Actions apply Shopify tags (`ProfitRx-COD-Blocked`, `ProfitRx-Prepaid-Required`). | `orders`, `execution_logs` | Shopify Admin GraphQL | **VERIFIED PASS** |
| **Order Detail** (`app.orders.$id.tsx`) | Deep economic analysis, EV payoff breakdown, risk factor attribution, and audit timeline. | Calls `CanonicalEconomicsCalculator`, resolves COGS, explains OTP cost vs expected loss. Honest timeline. | `orders`, `order_line_items`, `execution_logs` | Shopify Admin GraphQL | **VERIFIED PASS** |
| **COD Rules** (`app.cod-rules.tsx`) | Configure checkout COD blocking thresholds, pincode blocking, and repeat-offender rules. | Calls `CODManagementService.syncCODRulesToShopify`. Successfully syncs JSON to Shopify Function metafield. | `store_settings`, `pincode_stats` | Shopify Function `cod-blocker` | **VERIFIED PASS** |
| **Pincode Heatmap** (`app.rto-heatmap.tsx`) | Visual and tabular risk analytics by pincode, delivery success rates, and 1-click blocking. | Reads `PincodeStats`, calculates RTO rate, allows toggling block state synced to checkout. | `pincode_stats`, `store_settings` | Shopify Function `cod-blocker` | **VERIFIED PASS** |
| **Customer Risk** (`app.customer-risk.tsx`) | Tracks repeat RTO offenders, serial cancellers, customer lifetime spend, and risk bands. | Reads `CustomerRisk` table. Aggregates delivered vs RTO history. | `customer_risk` | None | **VERIFIED PASS** |
| **RTO Analytics** (`app.rto.tsx`) | RTO loss trends, delivery failure reasons, courier comparison, and recovery metrics. | Reads `RTOEvent` and `Order` tables. Uses `ProfitService.calculateRTOLoss`. | `rto_events`, `orders` | None | **PARTIALLY VERIFIED** |
| **COD Dashboard** (`app.cod-dashboard.tsx`) | Separate COD profit breakdown and verification stats. | Redundant with main Dashboard. Duplicates loss calculations. | `cod_orders`, `orders` | None | **DEPRECATE / MERGE** |
| **Profit Leaks** (`app.profit-leaks.tsx`) | Identifies 4 leak categories: RTO freight, shipping overages, discounts, COD handling fees. | Calls `ProfitIntelligenceService.getProfitLeaks`. Accurate heuristic calculations. | `orders`, `store_settings` | None | **VERIFIED PASS** |
| **Customer LTV** (`app.customers.tsx`) | Customer cohort analysis, repeat purchase rates, and lifetime value. | Reads `CustomerProfile`. Useful for retail intelligence, but secondary to COD protection. | `customer_profiles` | None | **KEEP (SECONDARY)** |
| **Marketing ROAS** (`app.roas.tsx`) | Blended CAC, ROAS, and 1-click Meta/Google Ads sync. | **Broken**: Connection modal does not persist tokens; Google Ads hardcodes 83x multiplier; returns 503 if unconfigured. | `ad_spend`, `ad_spend_daily` | Meta / Google Ads APIs | **CUT / DEPRECATE (P1)** |
| **Product COGS** (`app.cogs.tsx`) | Edit SKU costs, bulk CSV upload, sync native Shopify costs. | Reads and writes `ProductCOGS`. Supports manual override and native Shopify cost sync. | `product_cogs`, `variant_cogs` | Shopify Admin GraphQL | **VERIFIED PASS** |
| **Store Settings** (`app.settings.tsx`) | Configure shipping costs, packaging, COD fees, GST rates, and notification channels. | Saves settings to `StoreSettings`. Has test OTP button. | `store_settings` | Twilio / Meta API | **PARTIALLY VERIFIED** |
| **Store Health** (`app.health.tsx`) | System diagnostics, COGS coverage score, webhook latency check. | Reads store data quality metrics. | Multi-table read | None | **VERIFIED PASS** |
| **Alert Center** (`app.alerts.tsx`) | In-app alerts for profit drops, toxic products, high RTO spikes. | Reads `Alert` table. | `alerts` | None | **VERIFIED PASS** |
| **Billing / Pricing** (`app.billing.tsx`, `app.pricing.tsx`) | Subscribe to Starter ($19), Growth ($39), Pro ($79) plans via Shopify Billing API. | Syncs with Shopify Partner API. Displays usage bars. **Limit enforcement missing**. | `subscriptions` | Shopify Billing API | **PARTIALLY VERIFIED (P1)** |
| **Onboarding** (`app.onboarding.tsx`) | 4-step wizard: Store Settings → COGS → Rules → Activation. | Steps 1-4 update `onboardingStep` and `onboardingCompleted`. | `store_settings` | None | **VERIFIED PASS** |
| **Customer OTP Portal** (`verify-cod.tsx`) | Public landing page where customer enters OTP to verify COD order. | Validates HMAC token, verifies OTP in `CODOrder`, removes `ProfitRx-COD-Blocked` tag. | `cod_orders`, `orders` | Shopify Admin GraphQL | **VERIFIED PASS** |

---

## 3. Real Merchant Journey Simulations

### 3.1 Persona A: Small Indian D2C Store (Organic Food / Snacks)
- **Profile:** 150 orders/month, 85% COD, ₹1,200 AOV, 2 out of 10 products have COGS entered, default shipping costs (₹60 forward, ₹70 return).
- **Journey Evaluation:**
  1. **Install & Onboarding:** Wizard completes smoothly. When Merchant A skips COGS for 8 products, ProfitRx applies `defaultCOGSPct: 40%`. If their real food product margin is 65% (COGS 35%), reported profit is slightly conservative.
  2. **Order Sync & Dashboard:** Orders sync correctly. However, on the 30-day profit chart, customer-paid shipping is subtracted as a fee, causing the daily profit chart to show lower profit than the top-level cards.
  3. **Order Evaluation:** Orders to serviceable pincodes receive `ALLOW_COD`. High-risk orders correctly show `VERIFY` with honest economic payoff explanation.
  4. **The Critical Failure Point:** Merchant A enables OTP verification. When an order arrives without a customer phone, ProfitRx falls back to `storeSettings.whatsappPhone` and **sends the customer verification OTP to Merchant A's personal mobile phone**. Merchant A receives an alert on their own phone asking them to confirm their customer's order!
  5. **Verdict for Persona A:** **FAIL** until OTP fallback is fixed.

### 3.2 Persona B: Growing Apparel Brand
- **Profile:** 2,500 orders/month, ₹2,800 AOV, multiple variant sizes/costs, weight slabs (0.5kg: ₹50, 1kg: ₹80, 2kg: ₹140), 22% COD RTO rate.
- **Journey Evaluation:**
  1. **Cost Setup:** Merchant B enters weight slabs into Settings. `CanonicalEconomicsCalculator` uses these slabs when calculating expected contribution for incoming orders.
  2. **Variant Costs:** Merchant B has higher fabric costs for XXL variants. However, `syncOrderPayload` only looks up `cogsDict[product_id]`, ignoring `variant_id`. XXL orders are evaluated with the base size cost.
  3. **RTO Realization Failure:** When a 2kg jacket order returns via courier, `webhooks.orders.updated.tsx` creates an `RTOEvent`. Instead of using the configured 2kg return slab (₹140 + ₹150 = ₹290), it calls `ProfitService.calculateRTOLoss` which uses the hardcoded fallback ₹60 + ₹70 = ₹130! Realized logistics loss is underreported by ₹160 (55% error).
  4. **Dashboard Deception:** The dashboard counts all high-risk apparel orders as "Blocked COD Orders" and multiplies by ₹130, claiming ₹52,000 in "RTO Savings" even though Merchant B was in `OBSERVE` mode and never blocked the orders.
  5. **Verdict for Persona B:** **FAIL** due to realized RTO weight slab bypass and misleading dashboard savings.

### 3.3 Persona C: Beauty / Personal-Care Store
- **Profile:** High gross margins (75%), repeat customers, significant returns/refunds for opened or leaked packages.
- **Journey Evaluation:**
  1. **Repeat Customer Recognition:** When a loyal customer orders, `hasDeliveryTrackRecord` activates (risk score drops by 20, recommendation is `ALLOW_COD`).
  2. **The Refund Black Hole:** A customer complains of a broken serum bottle. Merchant C issues a ₹1,500 refund in Shopify Admin. The `orders/updated` webhook fires. In ProfitRx:
     - The `OrderRefund` table is never updated.
     - `order.totalPrice` remains ₹1,500.
     - ProfitRx calculates delivered profit on the full ₹1,500.
     - Result: The refunded order continues to show +₹850 profit instead of -₹150 loss!
  3. **Verdict for Persona C:** **FAIL** due to complete omission of refund deduction.

### 3.4 Persona D: Store with Messy Data
- **Profile:** Missing SKUs, missing phone numbers, foreign currency orders ($45 from an overseas buyer), duplicate webhook arrivals.
- **Journey Evaluation:**
  1. **Concurrency & Idempotency:** Duplicate webhooks delivered 500ms apart trigger the in-flight mutex locks in `OrderApplicationService` and `DecisionRecordRepository`. Only one execution succeeds.
  2. **Multi-Currency Trap:** An international tourist buys a product for $45. ProfitRx reads `totalPrice: 45`. It subtracts ₹60 forward shipping, ₹70 return shipping, and ₹10 packaging (treating them as $60, $70, $10). The order shows -$95.00 loss, rendered with a rupee symbol: `₹-95.00`.
  3. **Retroactive COGS Mutation:** If Merchant D updates product COGS, and a webhook arrives later for a past order, `syncOrderPayload`'s `update` clause overwrites `cogsAtTimeOfOrder` with the new COGS, altering historical accounting.
  4. **Verdict for Persona D:** **FAIL** due to currency contamination and historical snapshot overwrite.

---

## 4. Financial Correctness & Accounting Audit

### 4.1 Authoritative Formula vs Implementation Review

$$\text{Delivered Profit} = (\text{Gross Revenue} - \text{Taxes}) - \text{COGS} - \text{Forward Shipping} - \text{Packaging} - \text{Gateway Fee} - \text{COD Handling Fee} - \text{Allocated Ad Cost}$$

$$\text{RTO Loss Exposure} = \text{Forward Freight} + \text{Return Freight} + \text{Packaging} + (\text{COGS} \times \text{Damage \%}) + \text{Refunded Shipping} + \text{Carrier COD Fee}$$

$$\text{Expected Value (EV)} = (\text{Delivered Profit} \times P_{\text{delivery}}) - (\text{RTO Loss Exposure} \times P_{\text{rto}})$$

### 4.2 Independent Recalculation of Representative Test Cases

#### Case 1: Standard COD Order (₹2,000 Order Value)
- **Inputs:** Gross: ₹2,000, Tax: ₹305 (18% inclusive GST), COGS: ₹600, Forward Shipping: ₹60, Packaging: ₹10, COD Handling: ₹40, Return Shipping: ₹70, Damage: 10% (₹60).
- **Calculated Delivered Profit:**
  $$\text{Net Revenue} = 2000 - 305 = 1695$$
  $$\text{Total Delivered Costs} = 600 + 60 + 10 + 0 (\text{gateway}) + 40 (\text{cod}) = 710$$
  $$\text{Delivered Profit} = 1695 - 710 = ₹985$$
- **Calculated RTO Loss Exposure:**
  $$\text{RTO Loss} = 60 (\text{forward}) + 70 (\text{return}) + 10 (\text{packaging}) + 60 (\text{damage}) = ₹200$$
- **Implementation Check:**
  - `CanonicalEconomicsCalculator.calculate()` returns: Delivered Profit = ₹985, RTO Loss Exposure = ₹200. **MATCHES EXACTLY (VERIFIED PASS).**

#### Case 2: Daily Chart Breakdown (`dashboard.application.ts` lines 309-310)
- **Inputs:** Gross: ₹2,000, Tax: ₹305, Customer Shipping: ₹100, COGS: ₹600.
- **Code Execution:**
  `const f = totalTax + shippingPrice;` $\rightarrow 305 + 100 = 405$.
  `const p = totalPrice - c - f;` $\rightarrow 2000 - 600 - 405 = ₹995$.
- **Error:** Forward shipping (₹60), packaging (₹10), and COD fee (₹40) were completely omitted, while customer-paid shipping (revenue) was subtracted as a fee!
- **Discrepancy:** Chart shows ₹995; canonical engine evaluates ₹985. **VERIFIED FAILURE (P0).**

#### Case 3: Realized RTO Loss (`ProfitService.calculateRTOLoss`)
- **Inputs:** Forward: ₹60, Return: ₹70, Packaging: ₹10, COGS: ₹600, Damage: 10% (₹60).
- **Code Execution:**
  `const rawLoss = addMoney(forward, returnShip, packaging);` $\rightarrow 60 + 70 + 10 = ₹140$.
- **Discrepancy:** Realized RTO loss in DB and Dashboard reports ₹140, completely dropping the ₹60 inventory damage loss that was estimated in the Order Detail card (₹200). **VERIFIED FAILURE (P1).**

### 4.3 GST & Tax Treatment Audit
- **Intra-State vs Inter-State:** `normalizeIndianState()` correctly normalizes state aliases (`DL` $\rightarrow$ `DELHI`, `MH` $\rightarrow$ `MAHARASHTRA`, `TN` $\rightarrow$ `TAMIL NADU`). Correctly splits into CGST (50%) + SGST (50%) for intra-state, and IGST (100%) for inter-state sales.
- **Gateway GST:** Prepaid gateway fee formula: `((orderTotal * rate) + surcharge + fixedFee) * 1.18`. Correctly accounts for 18% GST charged by payment aggregators (Razorpay, Cashfree, PayU) in India. **VERIFIED PASS.**

---

## 5. Decision Engine & Risk Intelligence Audit

### 5.1 Probability Calibration Verification
- **Score vs Probability:** A raw risk score of 70 is calibrated via `calibrateRiskScoreToProbability(70, isCOD = true)` to **0.42** (42% empirical RTO probability), preventing catastrophic over-estimation of risk.
- **Monotonicity:** Verified across all bounds:
  - Score 0 $\rightarrow$ 8% COD prior
  - Score 30 $\rightarrow$ 18%
  - Score 50 $\rightarrow$ 30%
  - Score 70 $\rightarrow$ 42%
  - Score 85 $\rightarrow$ 58%
  - Score 100 $\rightarrow$ 78%
- **Status:** **VERIFIED PASS.**

### 5.2 Economic Justification Honest Copy
- **Decision Rule:** When recommendation is `VERIFY`, the justification states:
  > *"Elevated RTO risk (42%) creates ₹84 expected loss. Low-cost OTP verification (~₹10 estimated cost) is economically justified to confirm buyer intent."*
- **Math Verification:** Expected loss ($₹200 \times 0.42 = ₹84$) accurately matches the numbers displayed on the card.
- **Flaw Found:** `~₹10 estimated cost` is hardcoded as a string constant in `decision-engine.application.ts` (line 345) rather than reading `storeSettings.otpCost`. **VERIFIED MINOR DEFECT (P3).**

### 5.3 Override Persistence & Outcome Lifecycle
- **Override Action:** When a merchant clicks "Allow COD" on a blocked order, `overrideDecision` updates `Order.merchantRecommendation`, removes Shopify tags, and logs a `MERCHANT_OVERRIDE` in `ExecutionLog`.
- **Subsequent Webhooks:** When `orders/updated` webhook fires later, `ShopifyService.syncOrderPayload` updates order metadata but **does not touch `merchantRecommendation`**. The merchant override is permanently respected. **VERIFIED PASS.**
- **Verified Savings Over-Claim:** In `processOrderOutcome`, if an order with `riskScore >= 50` is cancelled, it credits 100% of the RTO loss exposure as `verifiedSavings`. Since calibrated risk for score 50 is only 30%, assuming 100% of cancellations were saved RTOs is aggressive. It should be classified as "Attributed Savings (Estimated)". **VERIFIED FAILURE (P2).**

---

## 6. Shopify Integration & Enforcement Verification

### 6.1 Action Executors & Tagging Semantics
- **Payment Method Immutability:** In Shopify, once an order is created, its payment gateway is immutable via Admin API. ProfitRx correctly clarifies in execution log messages:
  > *"Order tagged as ProfitRx-COD-Blocked on Shopify Admin (fulfillment hold flag; order payment gateway is immutable after creation)."*
- **Merchant Transparency:** Operations Queue clearly explains to merchants that order tags serve as fulfillment holds for warehouse teams (e.g., Shiprocket, Delhivery, Unicommerce), not checkout payment changes. **VERIFIED PASS.**

### 6.2 Shopify Function (`cod-blocker`)
- **Checkout Enforcement:** The Function targets `cart.payment-methods.transform.run`. It parses `$app:cod-blocker:function-configuration` and hides COD payment methods if:
  1. Customer shipping zip is in `blockedPincodes`.
  2. Cart amount exceeds `rejectCodOver`.
  3. Cart amount exceeds `requirePrepaidAbove`.
- **WASM Status:** Compiled WASM binary exists (`dist/function.wasm`, 3,271 bytes). All 23 integration tests pass under official Shopify Function runner.
- **Activation Sync:** `CodRulesApplicationService.saveMerchantRules` calls GraphQL `paymentCustomizationCreate` or `paymentCustomizationUpdate`. If extension is not deployed, UI warns the merchant. **VERIFIED PASS.**

---

## 7. Webhook, Sync & Background Job Audit

### 7.1 Webhook Idempotency & Mutex Locks
- **In-Flight Mutex:** `OrderApplicationService` has an in-memory 30s lock map (`${shopId}:${orderId}:PROCESS_ORDER`). Duplicate webhooks arriving concurrently are dropped with `Skipping concurrent execution`.
- **Database Lock:** `DecisionRecordRepository` enforces `acquireLock` on decision and outcome snapshots. Duplicate deliveries cannot create duplicate records. **VERIFIED PASS.**

### 7.2 Webhook Signature Authentication
- All incoming webhooks (`orders/create`, `orders/updated`, `app/uninstalled`, GDPR) call `await authenticate.webhook(request)`. Unauthorized HMAC signatures receive HTTP 401. **VERIFIED PASS.**

### 7.3 Auto-Sync & Retention Cleanup
- **Retention Cron:** `api.cron.retention-cleanup.ts` exists for GDPR compliance and data pruning.
- **Auto-Sync Cron:** `api.auto-sync.ts` runs hourly. It checks `syncCapped` and handles batching.
- **Failure Mode:** On the 1st of each month, `api.auto-sync.ts` resets `ordersUsed: 0`. But because `ordersUsed` is never incremented anywhere in the app, this cron job resets a number that was already 0. **VERIFIED DEFECT (P1).**

---

## 8. Security, Privacy & Multi-Tenancy Audit

### 8.1 Multi-Tenant Isolation
- **Repository Audit:** Every repository in `app/infrastructure/repositories/` enforces tenant scoping:
  - `OrderRepository`: `where: { shop, id: { in: [...] } }`
  - `CustomerRepository`: `where: { shop }`
  - `PincodeRepository`: `where: { shop }`
  - `CogsRepository`: `where: { shop }`
  - `SettingsRepository`: `where: { shop }`
  - `RtoRepository`: `where: { shop }`
- **Result:** No cross-store data leakage is possible through the repository layer. **VERIFIED PASS.**

### 8.2 SQL Injection Check
- **Scan Result:** Zero instances of `$queryRaw` or `$executeRaw` in the codebase. All queries use Prisma ORM with parameterized inputs. **VERIFIED PASS.**

### 8.3 Token Encryption & PII
- **Tokens:** Access tokens for ad platforms and Shopify sessions are encrypted using AES-256-GCM via `app/services/token-encryption.server.ts`.
- **GDPR Redaction Flaw:** In `webhooks.customers.redact.tsx`, the code deletes from `customerProfile` and nullifies customer name in `Order`. However, it leaves customer phone and email in `CustomerRisk` and customer phone in `CODOrder`! This fails GDPR / DPDP right-to-erasure. **VERIFIED FAILURE (P1).**

---

## 9. UX Honesty, Copy & Merchant Mental Model Audit

### 9.1 Deceptive Dashboard Metrics
1. **"Total RTO Savings":** Multiplies `blockedCodCount * avgRtoLoss`. Any order with high risk is counted as a blocked order and 100% saved, even if never blocked and successfully delivered.
2. **"Net ROI Savings":** Displays `Total RTO Savings - Monthly Subscription Cost`. Creates an inflated, unrealistic impression of app ROI.
3. **Hardcoded Currency Symbols:** 133 instances of hardcoded `₹` throughout UI routes regardless of store currency.

### 9.2 Broken / Misleading UI Actions
1. **Connect Ad Platforms Modal:** Modal in `app.roas.tsx` closes after entering account ID, but nothing connects or saves. Reloading shows "Not Connected".
2. **Customer Phone Missing Fallback:** When merchant clicks "Verify", customer OTP is sent to the merchant's personal phone number.
3. **Unconfigured Messaging Alert:** UI lets merchants turn on OTP verification, but gives them no fields to configure SMS/WhatsApp API credentials, resulting in silent failures.

---

## 10. Performance, Reliability & Failure Modes Audit

### 10.1 Neon Postgres Cold Starts & Connection Pooling
- `db.server.ts` uses `@neondatabase/serverless` with connection retry wrapper `withDbRetry()`. Handles transient WebSocket and HTTP reconnects cleanly.
- Error boundaries (`ErrorBoundary`) are implemented on every route using Polaris `Banner` and `Layout`. Blank screens do not occur on route failures.

### 10.2 Empty States
- When a new merchant installs the app:
  - Operations Queue displays an empty state banner with guidance.
  - COGS catalog displays an empty state prompt to sync products from Shopify.
  - Pincode heatmap renders clean zero-state tables.

---

## 11. Complete Categorized Findings Table

| ID | Severity | Category | Finding Description | Business / Technical Impact | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FIN-01** | **P0** | Financial Accuracy | 30-day profit chart calculates fees as `f = tax + shippingPrice` and profit as `revenue - cogs - f`. Customer shipping is subtracted as a fee, while courier shipping, packaging, and gateway fees are omitted. | Daily profit chart shows fabricated numbers that contradict the main dashboard KPIs. | **VERIFIED FAILURE** |
| **UX-01** | **P0** | UX Honesty | Dashboard labels any order with high risk as "Blocked COD" and calculates `totalRtoSavings = count * 130`, claiming savings for delivered or un-intervened orders. | Deceptive reporting that undermines merchant trust. | **VERIFIED FAILURE** |
| **OPS-01** | **P0** | Operations / OTP | In `overrideDecision`, if customer phone is missing, it falls back to `storeSettings.whatsappPhone` and sends the customer OTP challenge to the merchant's own mobile phone. | Customer never receives OTP; merchant is confused and annoyed by receiving customer verification messages. | **VERIFIED FAILURE** |
| **BILL-01** | **P1** | Commercial / Billing | `subscription.ordersUsed` is never incremented anywhere in the application. Usage limits (50, 500, 2000) are never enforced. | Free tier stores can process unlimited orders forever without paying. Zero upgrade pressure. | **VERIFIED FAILURE** |
| **FIN-02** | **P1** | Accounting Correctness | Refunds are completely ignored. `OrderRefund` and `RefundLineItem` models are unused. Full profit is reported on refunded orders. | Overreports gross revenue and profit for stores with returns and refunds. | **VERIFIED FAILURE** |
| **DATA-01** | **P1** | Data Integrity | `syncOrderPayload` updates `cogsAtTimeOfOrder` unconditionally on webhook update, overwriting historical COGS snapshots with current costs. | Historical monthly profit figures change retroactively when SKU costs are edited. | **VERIFIED FAILURE** |
| **OPS-02** | **P1** | Integrations | Store Settings allows enabling OTP verification, but has no fields to input Twilio or Meta WhatsApp API keys. Fails with `unconfigured` error unless platform `.env` is set. | Merchants believe OTP verification is active when it is completely dead. | **VERIFIED FAILURE** |
| **FIN-03** | **P1** | Accounting Correctness | `ProfitService.calculateRTOLoss` ignores weight slabs and `order.totalWeight`, using flat ₹60 + ₹70 = ₹130 for all RTO events. | Heavy apparel/footwear packages underreport actual logistics losses by 50-70%. | **VERIFIED FAILURE** |
| **FIN-04** | **P1** | Accounting Correctness | Expected RTO loss includes 10% inventory damage, but realized RTO loss in DB and Dashboard omits inventory damage. | Expected loss exposure on Order Detail (₹200) does not match realized loss on RTO reports (₹140). | **VERIFIED FAILURE** |
| **INT-01** | **P1** | Ad Spend / ROAS | Google Ads spend hardcodes `* 83` currency conversion. Ad connect modal in `app.roas.tsx` fails to persist account ID. | 83x ad spend inflation for INR Google Ads accounts; non-functional OAuth connection. | **VERIFIED FAILURE** |
| **SEC-01** | **P1** | Privacy / GDPR | `webhooks.customers.redact.tsx` fails to delete or anonymize PII in `CustomerRisk` (phone, email) and `CODOrder` (phone). | Non-compliance with Shopify App Store GDPR requirements and India DPDP Act. | **VERIFIED FAILURE** |
| **I18N-01** | **P2** | Multi-Currency | 133 hardcoded `₹` symbols in UI routes; USD stores have ₹60 shipping ($60) deducted from orders. | International/USD stores see corrupted negative margins and mismatched rupee symbols. | **VERIFIED FAILURE** |
| **UX-02** | **P2** | Accounting Claims | Cancelled orders with risk score >= 50 automatically credit 100% of RTO loss exposure as "Verified Savings". | Overclaims counterfactual savings; should be labeled "Attributed Savings (Estimate)". | **VERIFIED FAILURE** |
| **ARCH-01**| **P2** | Clean Architecture | Legacy `AISearchQuery` table and dev mock channels ("Gemini", "ChatGPT") pollute order syncing and domain model. | Dead code, schema clutter, confusing database migrations. | **VERIFIED FAILURE** |
| **NAV-01** | **P2** | UX / Navigation | Redundant duplicate routes: `app.cod-dashboard.tsx` vs `app.dashboard.tsx`, `app.customer-risk.tsx` vs `app.customers.tsx`. | Confuses merchant navigation hierarchy. | **VERIFIED FAILURE** |
| **COPY-01**| **P3** | Honest Copy | Hardcoded `~₹10 estimated cost` in recommendation string instead of interpolating `policy.otpCost`. | Cosmetic copy discrepancy when merchant customizes OTP cost. | **VERIFIED FAILURE** |
| **SEC-02** | **PASS**| Security | Multi-tenant queries strictly enforce `where: { shop }`; zero raw SQL queries; HMAC webhook auth verified. | High security posture against data leakage and injection attacks. | **VERIFIED PASS** |
| **FUNC-01**| **PASS**| Shopify Extensions | `cod-blocker` Shopify Function compiles to WASM and passes 23 unit/integration tests for payment method hiding. | Checkout payment customization functions correctly on Shopify. | **VERIFIED PASS** |

---

## 12. Feature Triage & Deprecation Recommendations

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             PROFITRX FEATURE TRIAGE                              │
├─────────────────────────┬────────────────────────────┬───────────────────────────┤
│       KEEP (CORE)       │         FIX (P0/P1)        │      CUT / DEPRECATE      │
├─────────────────────────┼────────────────────────────┼───────────────────────────┤
│ • Operations Queue      │ • Main Dashboard (Chart &  │ • Ad Spend OAuth & ROAS   │
│ • Order Detail / Intel  │   Savings formulas)        │   (Meta/Google sync)      │
│ • COD Rules & Blocker   │ • OTP Fallback Logic       │ • AISearchQuery table     │
│ • Pincode Heatmap       │ • Billing Limit Counter    │ • AI Chat Channel tags    │
│ • Customer Risk History │ • Refund Accounting        │ • COD Dashboard (Merge    │
│ • COGS Catalog          │ • Historical COGS Snapshot │   into Main Dashboard)    │
│ • Shopify Function      │ • Weight Slab RTO Loss     │ • Customer LTV Cohorts    │
│ • Store Settings        │ • GDPR Customer Redact     │   (Hide from top nav)     │
└─────────────────────────┴────────────────────────────┴───────────────────────────┘
```

### Justification for Deprecations:
1. **Cut Marketing ROAS / Ad Spend OAuth:** Connecting to Meta Graph API and Google Ads API is an entirely separate SaaS category (Triple Whale / Northbeam). It requires ongoing token refreshes, app review permissions from Meta/Google, and currency conversions that distract from ProfitRx's core value proposition: **stopping COD RTO losses**. Manual ad spend logging can remain, but automated ad sync should be deprecated.
2. **Cut Legacy AI Search Clutter:** `AISearchQuery` and "ChatGPT/Gemini" channel attribution were artifacts of an early pivot. Removing them clarifies the product focus.
3. **Merge COD Dashboard into Main Dashboard:** Having two dashboards (`app.dashboard.tsx` and `app.cod-dashboard.tsx`) confuses merchants. All vital COD metrics belong on the primary dashboard.

---

## 13. Prioritized Remediation Roadmap

### Phase 1: Immediate Blockers (Before Any Merchant Pilot)
- [ ] **Fix FIN-01 (Dashboard Chart):** Replace `f = totalTax + shippingPrice` in `dashboard.application.ts` with `CanonicalEconomicsCalculator.calculate()` to ensure daily chart reflects real delivered profit.
- [ ] **Fix UX-01 (Honest Dashboard Savings):** Stop classifying un-intervened high-risk orders as blocked orders. Calculate verified savings **only** from orders that were actually blocked or held and subsequently cancelled.
- [ ] **Fix OPS-01 (OTP Fallback):** In `decision-engine.application.ts` line 577, remove the fallback to `storeSettings.whatsappPhone`. If customer phone is missing, fail gracefully with `"Customer phone number missing; cannot send OTP"` instead of messaging the merchant.
- [ ] **Fix BILL-01 (Order Limit Counter):** Add `subscription.ordersUsed: { increment: 1 }` to `OrderApplicationService.processOrder` and block incoming evaluations when usage limit is reached.
- [ ] **Fix SEC-01 (GDPR Redaction):** In `webhooks.customers.redact.tsx`, delete or anonymize customer records in `CustomerRisk` and `CODOrder`.

### Phase 2: Pre-Merchant Launch Polishing
- [ ] **Fix FIN-02 (Refund Deductions):** Add `totalRefundedAmount` deduction to `CanonicalEconomicsCalculator` and `ProfitService.calculateOrderProfit`.
- [ ] **Fix DATA-01 (Historical COGS Snapshot):** In `shopify.service.ts` line 1481, do not overwrite `cogsAtTimeOfOrder` if it already exists on the order record.
- [ ] **Fix FIN-03 (Weight Slab RTO Loss):** Update `ProfitService.calculateRTOLoss` to accept weight slabs and `order.totalWeight`.
- [ ] **Fix FIN-04 (RTO Damage Consistency):** Include configurable `inventoryDamageLoss` in `calculateRTOLoss` so realized loss matches expected loss exposure.
- [ ] **Fix I18N-01 (Multi-Currency UI):** Replace hardcoded `₹` with dynamic `formatCurrency(amount, currency)` helper.

### Phase 3: Scale & Architecture Cleanup
- [ ] Remove `AISearchQuery` table from Prisma schema and drop the table.
- [ ] Remove dev channel attribution generator in `shopify.service.ts`.
- [ ] Deprecate `app.cod-dashboard.tsx` and consolidate unique widgets into `app.dashboard.tsx`.

---

## 14. Merchant Pilot Readiness Assessment

### Current Status: **NO-GO FOR UNATTENDED PRODUCTION**  
### Conditional Status: **GO FOR SUPERVISED 3-MERCHANT PILOT** (Subject to Phase 1 Fixes)

ProfitRx should **NOT** be launched to the public App Store in its current state. However, it is ready for a **supervised pilot with 3 friendly Indian D2C merchants** provided:
1. **Mode Restriction:** Pilot merchants must start in **OBSERVE** or **REVIEW** mode (never automated blocking).
2. **Phase 1 Fixes Applied:** The 5 Phase 1 blocker fixes must be implemented before the first pilot merchant connects.
3. **Personal Onboarding:** The founder must personally inspect the Operations Queue alongside the merchant during the first 50 orders to verify recommendation alignment.

---

## 15. Verification Methodology & Audit Trail

### Files Inspected:
- **Core Domain & Services:**
  - `app/services/economics/canonical-economics.calculator.ts`
  - `app/services/economics/types.ts`
  - `app/services/profit.service.ts`
  - `app/services/cod-management.service.ts`
  - `app/services/whatsapp.service.ts`
  - `app/services/shopify.service.ts`
  - `app/services/ad-spend.service.ts`
  - `app/utils/fulfillment.ts`
  - `app/utils/risk-calibration.ts`
  - `app/utils/money.ts`
  - `app/utils/currency.ts`
- **Application Services:**
  - `app/application/order/order.application.ts`
  - `app/application/order/steps/feature.step.ts`
  - `app/application/order/steps/risk.step.ts`
  - `app/application/order/steps/expected-value.step.ts`
  - `app/application/order/steps/decision.step.ts`
  - `app/application/order/steps/execution.step.ts`
  - `app/application/decision/decision-engine.application.ts`
  - `app/application/operations/operations.application.ts`
  - `app/application/dashboard/dashboard.application.ts`
  - `app/application/protection/cod-rules.application.ts`
  - `app/application/settings/settings.application.ts`
- **Repositories & Database:**
  - `prisma/schema.prisma`
  - `app/infrastructure/repositories/*.ts` (all 15 repositories)
- **Routes & UI:**
  - `app/routes/app.tsx`
  - `app/routes/app.dashboard.tsx`
  - `app/routes/app.operations.tsx`
  - `app/routes/app.orders.$id.tsx`
  - `app/routes/app.cod-rules.tsx`
  - `app/routes/app.rto.tsx`
  - `app/routes/app.roas.tsx`
  - `app/routes/app.settings.tsx`
  - `app/routes/app.billing.tsx`
  - `app/routes/app.pricing.tsx`
  - `app/routes/webhooks.*.tsx`
- **Shopify Function:**
  - `extensions/cod-blocker/src/run.ts`
  - `extensions/cod-blocker/shopify.extension.toml`
  - `extensions/cod-blocker/dist/function.wasm`

### Test Executions:
1. `vitest run app/`: **26 test files passed, 335 tests passed, 0 failures**.
2. `extensions/cod-blocker npm test`: **2 test files passed, 23 tests passed (16 unit + 7 WASM integration), 0 failures**.
3. **Total Verified Automated Tests:** **358 passed**.

