# ProfitRx ⚡ — The Actionable Profit & RTO Shield Platform for Shopify

ProfitRx is a production-grade, commercial Shopify application designed for modern e-commerce merchants (specifically D2C brands operating in high-COD markets like India and LATAM). It functions as a dual **Profit Intelligence Engine** and **Return-to-Origin (RTO) Risk Shield**.

Unlike standard Shopify analytics tools that display superficial gross sales, ProfitRx calculates a merchant's **True Net Pocket Profit** in real-time by ingesting item-level Cost of Goods Sold (COGS), shipping weight slabs, payment gateway fees, Cash on Delivery (COD) charges, and ad platform spends. Additionally, it deploys custom **Shopify Functions** and **WhatsApp OTP verification workflows** to block high-risk COD orders.

---

## 🎯 The Problem It Solves

E-commerce merchants frequently operate under the illusion of profitability because traditional dashboards display gross revenue without accounting for operational profit drains:
1. **RTO (Return to Origin) Drain:** In markets like India, 20% to 40% of COD orders are returned or rejected at delivery. Merchants lose forward and return freight costs plus packaging and handling fees.
2. **Hidden Payment Gateway & Tax Overhead:** Payment gateways charge transaction fees that are subject to GST. Shopify also imposes plan-based transaction surcharges.
3. **Inaccurate COGS:** Merchants lack a unified view when COGS is partially recorded in Shopify and partially managed via manual overrides.
4. **Blended CAC vs. True Margin:** Paid marketing dashboards display channel-specific ROAS based on gross revenue, leading merchants to scale campaigns that are actually net-unprofitable after COGS and return costs.

---

## 🌟 Main Differentiators & Features

- **Triple-Engine Profit Calculation:** Order-level profit calculations with historical COGS snapshotting (`cogsAtTimeOfOrder`), preventing past order profit distortion when product costs change.
- **Checkout Payment Customization (Shopify Function):** Native WASM-compiled payment customization function (`cod-blocker`) that dynamically hides COD payment methods at Shopify Checkout based on real-time pincode risk lists synced via GraphQL metafields.
- **Dynamic OTP Verification:** Risk-gated OTP verification (via WhatsApp Meta Cloud API or Twilio) triggered only for Medium/High/Critical risk orders or buyers with personal RTO history > 20%, bypassing Low-risk buyers to preserve checkout conversion.
- **Regional Cold-Start Pincode Analytics:** Aggregated pincode RTO heatmaps with a 2-digit regional prefix fallback algorithm to estimate risk for newly encountered pincodes.
- **Blended & Profit-Adjusted ROAS:** Multi-platform ad spend aggregation (Meta, Google, TikTok) mapped against true net profit to calculate True CAC and CAC Payback per order.
- **GST Accountant Report Export:** Exports 1-click GSTR-1 compliant spreadsheets with transaction splits, taxable values, and SGST/CGST/IGST breakdown.
- **AI Search Query Tracker:** Measures store product visibility, CTR, impressions, and rank in AI search engines (ChatGPT Search, Gemini, Microsoft Copilot).

---

## 🏛️ System Architecture

ProfitRx employs a hybrid serverless architecture utilizing React Router 7 SSR endpoints hosted on Vercel, connected to a PostgreSQL database via Prisma ORM, and integrated into Shopify via Shopify App Bridge, Admin GraphQL API, Webhooks, and Shopify Functions.

```mermaid
graph TD
    %% Presentation Layer
    subgraph Presentation ["Presentation Layer (Remix App)"]
        UI["React Router v7 + Shopify Polaris"]
        CSS["Inlined global.css Dark Mode Styles"]
    end

    %% Edge Extension Layer
    subgraph Extension ["Shopify Checkout Extension Layer"]
        Func["cod-blocker (WebAssembly Shopify Function)"]
    end

    %% Core Application Layer
    subgraph Core ["Core Business Logic (Service Container)"]
        SS["ShopifyService (Order Sync & Pincode Stats)"]
        PS["ProfitService (Order Profitability & COGS)"]
        CODS["CODManagementService (Rules & Blocks)"]
        CIS["CustomerIntelligenceService (LTV & Cohort Retention)"]
        Alerts["AlertService (AI Profit Leaks & Weekly Digest)"]
        Ads["AdSpendService (Meta/Google OAuth Daily Spend)"]
        WA["WhatsappService (Twilio/Meta OTP & Digests)"]
    end

    %% Data & Infrastructure
    subgraph Data ["Data Persistence Layer"]
        Prisma["Prisma ORM Client v6"]
        DB[(PostgreSQL Serverless Database)]
    end

    %% Webhook & Sync Layer
    subgraph Webhook ["Real-time Sync & Cron Layer"]
        SyncAPI["api/auto-sync (Vercel Cron)"]
        OrderWH["webhooks/orders/updated"]
        GDPRWH["webhooks/shop/redact"]
    end

    %% Flow lines
    UI --> Core
    Core --> Prisma
    Prisma --> DB
    Func --> Core
    OrderWH --> SS
    GDPRWH --> DB
    SyncAPI --> SS
```

### Advanced Technical Moats

1. **High-Performance Serverless Architecture (TTFB < 100ms)**
   - **TTFB Optimization:** Implemented a 1-hour database cache layer for active subscriptions and a 15-minute static cache for products to bypass slow Shopify GraphQL catalog lookups. 
   - **Zero-Waterfall Rendering:** Inlined custom dark-mode CSS directly into the HTML payload via server-side loaders and asynchronous font styling.
2. **Production-Hardened Resilience**
   - **Billing Propagation Protections:** 1.5s retry delay on billing checks and a 5-minute `PENDING` protection prevent premature downgrades while checkout propagates through Shopify.
   - **Security:** Strict isolated multi-tenant operations (`where: { shop }`) and completely parameterized SQL execution through Prisma, defending against SQL Injection vulnerabilities. HMAC verification for all Shopify webhooks.

---

## 📊 Database Schema Overview (Prisma ORM)

| Model | Purpose | Primary Fields |
| :--- | :--- | :--- |
| **`Session`** | Auth store for merchant offline/online sessions | `shop`, `accessToken`, `scope`, `expiresAt` |
| **`Order`** | Sync cache of Shopify orders | `id`, `shop`, `totalPrice`, `isCOD`, `pincode`, `fulfillmentStatus` |
| **`ProductCOGS`** | COGS and Variant cost tracking | `shop`, `productId`, `cost`, `source` |
| **`RTOEvent`** | Custom logs of courier returns | `shop`, `orderId`, `eventType`, `amount` (estimated loss) |
| **`PincodeStats`**| Aggregated RTO rates per pincode | `shop`, `pincode`, `rtoRate`, `riskLevel` (Indexed) |
| **`CustomerProfile`**| Customer cohort and LTV metrics | `shop`, `customerId`, `ltv`, `aov`, `cohortMonth` |
| **`AdSpend`** | OAuth keys for Meta/Google connections | `shop`, `platform`, `accessToken`, `isConnected` |
| **`AdSpendDaily`** | Synced daily spend | `shop`, `platform`, `date`, `spend` |
| **`ProfitSnapshot`**| Daily profit snapshots | `shop`, `date`, `revenue`, `profit`, `totalLeak` |
| **`Alert`** | Automated profit leak alerts | `shop`, `type`, `severity`, `isRead` |
| **`Subscription`**| Plan verification cache | `shop`, `plan`, `status`, `orderLimit`, `ordersUsed` |
| **`StoreSettings`**| Logistics cost and feature configurations | `shop`, `defaultForwardShipping`, `whatsappEnabled` |
| **`CODOrder`**| OTP verification and state management | `orderId`, `shop`, `otp`, `status` |

---

## 🚀 Local Development Setup

### Prerequisites
* **Node.js** (v20.19+ recommended)
* **Shopify Partners account** and a development store
* **PostgreSQL** database connection URL

### Installation

1. **Clone the repo**
   ```bash
   git clone https://github.com/vishal1357v/greek-god-saas.git
   cd greek-god-saas
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   SHOPIFY_API_KEY="your-shopify-api-key"
   SHOPIFY_API_SECRET="your-shopify-api-secret"
   SHOPIFY_APP_URL="https://your-public-url.vercel.app"
   SCOPES="read_products,read_orders,write_orders,read_customers,read_fulfillments,write_metafields,read_metafields,write_payment_customizations"
   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
   BYPASS_BILLING="true"
   SUPPORT_EMAIL="support@yourdomain.com"
   CRON_SECRET="your-vercel-cron-secret"
   ```

4. **Initialize database & Prisma client**
   ```bash
   npx prisma db push
   npx prisma db seed
   ```

5. **Start the local development server**
   ```bash
   npm run dev
   ```

---

## 📖 Complete Engineering Handbook
For an in-depth understanding of the system's runtime architecture, webhook lifecycles, and feature gating matrix, please refer to the [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) handbook located in the repository root.

---

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
