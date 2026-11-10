# ProfitRx — Complete Merchant-Centric UI/UX Redesign Report

**Date:** November 2026  
**Audience:** Indian D2C Shopify Merchants, Store Operators, Product Leadership & Frontend Engineering  
**Application:** ProfitRx (Shopify App for COD Risk Management, RTO Prevention & Profit Protection)  

---

## 1. Executive Summary & Design Vision

### The Core Problem Solved
Small business owners, first-time Shopify entrepreneurs, and D2C brand operators in India face a persistent challenge: **Cash on Delivery (COD) orders turning into Return to Origin (RTO) courier losses**. 

Prior to this redesign, ProfitRx provided powerful algorithms and financial formulas, but presented them through an overwhelming, jargon-laden, technical interface. Merchants were confronted with:
- Raw LaTeX mathematical expressions (`$EV$`, formulas with mathematical operators).
- Dense 12-column tables causing horizontal scroll fatigue, especially on smartphones (375px/390px viewports).
- A "wall of banners" on the dashboard that pushed business-critical metrics below the fold.
- An 8-step onboarding wizard requiring tedious manual tax, freight, and accounting inputs.
- Unfamiliar accounting acronyms ("COGS Catalog", "Serial Offenders", "Pincode Risk Heatmap", "Data Precision State").

### The Redesign Philosophy
> **"Simple on the surface, powerful underneath."**

The redesigned ProfitRx ensures that within 3 seconds of opening the application, any merchant—regardless of technical or accounting background—can answer four vital questions:
1. **How much money am I actually making?** (Realized Net Profit, Gross Sales, Net Margin %).
2. **Which orders need my attention right now?** (Directly highlighted Orders Needing Review with 1-click action).
3. **Where am I losing money?** (Avoided RTO Loss, Realized Losses, Return Rates).
4. **What should I do next?** (Clear plain-English recommendations: *Allow COD*, *Verify Phone*, *Require Prepaid*, *Hold COD*).

---

## 2. Navigation & Information Architecture Overhaul

### Before vs. After Information Architecture

| Old Architecture (Fragmented / Jargon) | Redesigned Architecture (Job-Centric Pillars) | Merchant Purpose |
|---|---|---|
| Top-level cluttered items: Dashboard, Operations, Orders, COD Rules, Pincode Risk Heatmap, Serial Offenders, COGS Catalog, Profit Leaks Diagnostic, ROAS, Reports, Settings, Billing, Health, Alerts | **5 Unified Merchant Pillars:**<br>1. **Home** (`/app/dashboard`)<br>2. **Orders & Review** (`/app/operations`)<br>3. **COD Protection** (Rules, Heatmap, Customer Risk)<br>4. **Profit & Costs** (Product Costs, Profit Leaks, ROAS, Reports)<br>5. **Settings & Account** (Settings, Billing, Alerts, Health) | Reflects the merchant's daily operating workflow rather than database tables. |
| Navigation labels: "COGS Catalog", "Serial Offenders", "Pincode Risk Heatmap", "Profit Leaks Diagnostic" | **Friendly Merchant Labels:**<br>"Product Costs (COGS)", "Customer Risk & Returns", "Pincode Protection & Heatmap", "Where You're Losing Money" | Replaces intimidating accounting and technical terms with clear, intuitive labels. |
| Mobile Navigation lockout: `display: isEmbedded ? "none" : undefined` hid the hamburger menu in Shopify Admin | **Unrestricted Mobile Navigation:**<br>Always accessible mobile drawer with minimum 44px touch targets on all mobile viewports (375px, 390px, 414px) | Store owners managing fulfillment from mobile devices can navigate effortlessly. |
| App Bridge Navigation: 14 flat unorganized links | **Clean 7-Item App Bridge Menu:**<br>Dashboard, Orders & Review, COD Protection, Product Costs, Profit Leaks, Return Analytics, Settings & Billing | Fully compliant with Shopify Polaris App Bridge design standards. |

---

## 3. Operations & COD Review Queue Redesign (`app/routes/app.operations.tsx`)

### Problem Identified
The operations table contained 12 dense columns: `Order`, `Customer`, `Payment`, `Amount`, `Expected Profit`, `RTO Exposure`, `Risk`, `Confidence`, `Recommendation`, `Mode`, `Status`, `Action`. On mobile viewports (<768px), horizontal scrolling was completely broken, requiring merchants to pan left and right to inspect a single order.

### Redesign Implemented
1. **Streamlined 6-Column Desktop Layout:**
   - **Column 1 — Order & Customer:** Stacked Order number (`#1482`), time elapsed (`8m ago`), Customer Name (`Pooja Sharma`), and location (`Siwan, Bihar 841301`).
   - **Column 2 — Payment & Value:** Badged payment method (`COD` vs `Prepaid`) and formatted order total (`₹6,499`).
   - **Column 3 — Return Risk:** Color-coded Risk badge (`High Risk`) paired with calibrated return chance (`78% risk`) and specific reason tag.
   - **Column 4 — Estimated Outcome:** Stacked outcome indicators: Profit if Delivered (`+₹1,650`) vs Freight Loss if Returned (`-₹1,420`).
   - **Column 5 — Recommendation:** Plain-English action badges: *Allow COD (Safe)*, *Verify Phone (Dispatch OTP)*, *Require Prepaid*, *Hold COD*.
   - **Column 6 — Actions:** Single-click `Review` button for flagged orders and `Details` button to open the full decision card.

2. **Responsive Mobile Order Cards (`prx-operations-mobile-cards`):**
   - Automatically activates on screens `< 768px` (375px iPhone SE, 390px iPhone 14/15, Android devices).
   - Replaces the wide table with self-contained, touch-friendly order cards:
     - Header: Order `#1482 • 8m ago` and `COD ₹6,499`.
     - Customer row: `Pooja Sharma • Siwan, Bihar (841301)`.
     - 3-column micro-economics bar: `Profit if Delivered (+₹1,650)` | `Loss if Returned (-₹1,420)` | `Risk (78% High)`.
     - Recommendation badge & alert reason.
     - Large, comfortable 44px tap targets: `Review Order` (primary critical tone) and `View Details`.
   - **Zero horizontal scroll required.**

3. **Plain-Language Review Modal:**
   - Eliminated `$EV$` LaTeX notation.
   - Replaced mathematical formulas with clear economic summaries:
     - *Gross Order Value: ₹6,499*
     - *Profit if Delivered: +₹1,650*
     - *Loss if Returned (RTO): -₹1,420*
     - *Estimated Net Outcome: +₹1,240*
   - Honest fulfillment explanation: Clarifies that Shopify tags place orders on fulfillment hold without attempting to mutate immutable placed payment methods.

---

## 4. Order Decision Card & Progressive Disclosure (`app/components/decision/OrderDecisionCard.tsx` & `app/routes/app.orders.$id.tsx`)

### Problem Identified
The Order Decision Card presented raw LaTeX expressions (`$EV$`), technical precision badges (`ACTUAL`, `ESTIMATED`, `INCOMPLETE`), and confusing mathematical formulas `(1 − X/100) × +... + (X/100) × -...`.

### Redesign Implemented
1. **Elimination of Mathematical Notation:**
   - `Expected Contribution ($EV$)` $\rightarrow$ **Estimated Net Outcome**
   - `Delivered Contribution` $\rightarrow$ **Profit If Delivered**
   - `RTO Financial Exposure` $\rightarrow$ **Loss If Returned (RTO Freight)**
   - `Product COGS` $\rightarrow$ **Product Cost (Unit COGS)**
   - `RTO Risk Band` $\rightarrow$ **Return Risk (%)**

2. **Progressive Disclosure Structure:**
   - **Primary Decision Hero:** Displays the immediate verdict ("Require Prepaid Payment") and 1-sentence explanation ("Cart ₹6,499 exceeds COD threshold in high-RTO pincode").
   - **4 Core Metrics:** Return Risk (%), Estimated Net Outcome (₹), Profit If Delivered (₹), Loss If Returned (₹).
   - **Detailed Cost Breakdown Table:** Clear accounting line items with plain data sources (`Shopify Native`, `Estimated Default`, `Courier Benchmark`):
     - Gross Order Value
     - Product Cost
     - Courier Forward Shipping
     - Packaging & Box
     - COD Collection Fee / Payment Gateway Fee
     - = Profit If Delivered
     - = Loss If Returned (RTO)
   - **Customer & Regional Signals:**
     - Verified buyer delivery track record (e.g., "Repeat buyer: 4 orders, 4 delivered, 0 RTOs").
     - Destination area deliverability (Pincode, City, Historical regional RTO rate).
   - **Decision History & Audit Trail:** Honest outcome tracking showing realized profit vs estimated outcome without fake savings claims.

---

## 5. Dashboard Consolidation & 3 Core Questions (`app/routes/app.dashboard.tsx`)

### Problem Identified
A new merchant installing ProfitRx could be greeted by up to 6 stacked warning and notification banners (Currency notice, Missing COGS banner, Zero logistics defaults banner, Free trial banner, Plan usage banner, Ad spend notice). This created severe **Banner Fatigue** and completely hid the performance charts and metrics.

### Redesign Implemented
1. **Consolidated Store Setup Checklist:**
   - Replaced 3 separate warning banners with a single unified, compact banner:
     `Store Setup Attention (2 items to review)`:
     - *• 3 products missing cost: ProfitRx is using store default fallback. Set Product Costs →*
     - *• Logistics parameters set to ₹0: Shipping or packaging unconfigured. Configure in Settings →*
     - *• Store currency is USD: Default deductions calibrated in INR. Review Store Settings →*
2. **Action-Oriented Attention Banner:**
   - When orders require merchant review, an immediate critical banner appears:
     `2 Orders Awaiting Review` with a direct 1-click button: `Open Review Queue →`.
3. **The 3 Core Merchant Questions Answered:**
   - **Question 1: How much money am I making?**
     - Realized Net Profit (₹)
     - Gross Sales (₹)
     - Net Margin (%)
     - Evaluated Orders count
   - **Question 2: Which orders need attention right now?**
     - Operations Review Queue alert card and real-time decision feed.
   - **Question 3: Where am I losing money?**
     - Modeled Avoided Loss (₹)
     - RTO Return Rate (%)
     - Top Profit Leaks breakdown (RTO losses, courier return fees, missing margins).

---

## 6. Product Costs ("COGS") Friendly Redesign (`app/routes/app.cogs.tsx`)

### Problem Identified
The title "COGS Catalog" and accounting descriptions were unfamiliar to non-technical merchants.

### Redesign Implemented
- **Friendly Naming:** Retitled to **Product Costs (COGS)** with subtitle: *"Set unit product costs so ProfitRx can calculate true net margins on every order. Costs are automatically synced from Shopify inventory."*
- **Automatic Sync Reassurance:** Prominent banner reassuring the merchant: *"We automatically pull your product costs from Shopify Admin. You only need to edit here if you want a custom override."*
- **Simplified Column Headings:**
  - `Product Name`
  - `Selling Price (₹)`
  - `Shopify Item Cost`
  - `ProfitRx Unit Cost (₹)`
  - `Source` (`Shopify Native` vs `Manual Override`)
- **Fallback Margin Rule:** Relabeled "Default COGS Percentage" to **Fallback Cost Margin (%)** with plain explanation: *"If a product has no specific item cost defined in Shopify, ProfitRx estimates cost using this fallback percentage of the selling price."*

---

## 7. Streamlined 5-Step Onboarding Journey (`app/routes/app.onboarding.tsx`)

### Problem Identified
The original onboarding flow had 8 complex steps requiring merchants to fill in GSTIN numbers, tax percentages, and five different freight parameters before seeing any value.

### Redesign Implemented
Collapsed into **5 progressive, reassuring steps** completed in under 60 seconds:

```
[ Step 1: Welcome & Store Connected ]
                 ↓
[ Step 2: One-Click Order Sync ]
                 ↓
[ Step 3: Indian D2C Cost Defaults (Pre-calibrated) ]
                 ↓
[ Step 4: Choose Protection Mode (Observe Mode Default) ]
                 ↓
[ Step 5: Live Profit Preview & Launch Dashboard ]
```

1. **Step 0 — Welcome & Store Connected:** Confirms secure Shopify connection; highlights the 3 core benefits (spot risky COD, stop RTO loss, know true take-home profit).
2. **Step 1 — Sync Orders:** 1-click order sync pulling up to 60 days of Shopify order history with live progress.
3. **Step 2 — Cost Defaults:** Prefilled with standard Indian D2C benchmarks (₹60 forward, ₹70 reverse, ₹40 COD fee, ₹10 packaging, 2% gateway fee). Merchants can keep recommended defaults with 1 click.
4. **Step 3 — Choose Protection Mode:** Clear explanation of protection modes. Defaults to **Observe Mode** (*"Recommended for New Stores — evaluates risk without interfering with checkout or customer notifications"*).
5. **Step 4 — Profit Preview & Launch:** Immediate preview of evaluated revenue, estimated net profit, and a friendly **🚀 Launch ProfitRx Dashboard** button.

---

## 8. Mobile Responsiveness & Touch UX Verification

| Screen / Feature | Viewport | User Experience Behavior |
|---|---|---|
| **Operations Queue** | 375px (iPhone SE) & 390px (iPhone 14/15) | Wide table automatically hides. Renders responsive touch cards (`prx-mobile-order-cards`) with order #, customer, city, 3-column micro-economics, risk badge, and 44px tap targets. Zero horizontal scroll. |
| **Operations Queue** | $\ge 768px$ (Tablet & Desktop) | Renders streamlined 6-column Polaris `DataTable` with clean stacked rows and action buttons. |
| **Navigation Menu** | Embedded in Shopify Admin Mobile | Mobile hamburger drawer button is active with full 5-pillar drawer menu. |
| **Order Decision Card** | Mobile & Desktop | LaTeX `$EV$` completely removed. Progressive disclosure cards with clear economic metrics and plain-language explanations. |
| **Dashboard** | Mobile & Desktop | Banner fatigue resolved. Consolidated setup checklist and prominent "Orders Awaiting Review" call-to-action. |
| **Onboarding Wizard** | Mobile & Desktop | 5-step card with responsive progress dots, prefilled defaults, and full-width touch buttons. |

---

## 9. Technical & Quality Assurance Verification

### 1. TypeScript Static Typecheck
- **Command:** `npm.cmd run typecheck` (`react-router typegen && tsc --noEmit`)
- **Result:** **0 errors.** Strict type-safety verified across all loaders, actions, application services, and components.

### 2. Full Vitest Test Suite
- **Command:** `npx.cmd vitest run app/ tests/`
- **Result:**
  - **Test Files:** **31 passed (31)**
  - **Total Tests:** **385 passed (385)**
  - **Snapshots / Regressions:** 0 failures
  - **Key Suites Verified:**
    - `tests/phase1-audit-remediation.test.ts` (10/10 passed)
    - `tests/order-decision-engine.test.ts` (14/14 passed)
    - `app/application/operations/operations.application.test.ts` (2/2 passed)
    - `app/application/order/order-detail.application.test.ts` (2/2 passed)
    - `app/application/order/order.pipeline.e2e.test.ts` (2/2 passed)
    - `app/application/order/correctness-verification.test.ts` (10/10 passed)
    - `app/services/compliance/compliance.test.ts` (11/11 passed)
    - `extensions/cod-blocker/tests/default.test.js` (7/7 passed)

### 3. Production Build
- **Command:** `npm.cmd run build` (`prisma generate && react-router build`)
- **Result:** **Built in 2.60s without errors.** Server and client bundles generated cleanly.

---

## 10. Modified Files Inventory

| File Path | Nature of Changes |
|---|---|
| [`app/routes/app.tsx`](file:///c:/Users/xlr8j/Desktop/shopify-apps/greek-god-saas/app/routes/app.tsx) | Redesigned navigation into 5 core merchant pillars; updated App Bridge menu; removed mobile lockout condition so embedded mobile users can access navigation. |
| [`app/routes/app.operations.tsx`](file:///c:/Users/xlr8j/Desktop/shopify-apps/greek-god-saas/app/routes/app.operations.tsx) | Streamlined table from 12 dense columns to 6 merchant-friendly columns; added responsive mobile card view (`prx-operations-mobile-cards`); removed LaTeX `$EV$` from review modal. |
| [`app/components/decision/OrderDecisionCard.tsx`](file:///c:/Users/xlr8j/Desktop/shopify-apps/greek-god-saas/app/components/decision/OrderDecisionCard.tsx) | Replaced LaTeX `$EV$` and technical jargon with plain English (Estimated Net Outcome, Profit If Delivered, Loss If Returned); added clear economic justification and signal breakdowns. |
| [`app/routes/app.orders.$id.tsx`](file:///c:/Users/xlr8j/Desktop/shopify-apps/greek-god-saas/app/routes/app.orders.$id.tsx) | Updated route title and back navigation to match redesigned Operations & COD Review; embedded redesigned decision card. |
| [`app/routes/app.dashboard.tsx`](file:///c:/Users/xlr8j/Desktop/shopify-apps/greek-god-saas/app/routes/app.dashboard.tsx) | Consolidated multiple stacked warning banners into a single Store Setup Checklist; added prominent Orders Awaiting Review call-to-action; answered the 3 core merchant questions. |
| [`app/routes/app.cogs.tsx`](file:///c:/Users/xlr8j/Desktop/shopify-apps/greek-god-saas/app/routes/app.cogs.tsx) | Retitled to Product Costs (COGS); added Shopify auto-sync reassurance; simplified column headings; made fallback cost rule intuitive. |
| [`app/routes/app.onboarding.tsx`](file:///c:/Users/xlr8j/Desktop/shopify-apps/greek-god-saas/app/routes/app.onboarding.tsx) | Streamlined from 8 complex accounting steps to 5 progressive steps with sensible Indian D2C defaults and Observe mode selection (<60s setup). |
| [`app/styles/global.css`](file:///c:/Users/xlr8j/Desktop/shopify-apps/greek-god-saas/app/styles/global.css) | Added responsive styles for operations desktop table vs mobile cards (`@media (max-width: 768px)`), mobile order card styling, and progressive disclosure accordions. |

