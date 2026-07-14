# ProfitRx ⚡ — The Actionable Profit & RTO Shield Platform for Shopify

ProfitRx is a production-grade, headless **Profit Intelligence & Automated Cash on Delivery (COD) Risk Management Platform** built for high-volume Shopify merchants navigating the Indian e-commerce market. 

By combining advanced profit analytics with automated pre-shipment logistics control, it bridges the gap between financial intelligence (True Profit, native COGS sync, GST compliance) and operational risk control (Pincode-level RTO heatmap tracking, automated COD blocking via Shopify WebAssembly Functions, and WhatsApp OTP verification).

---

## 🏛️ System Architecture

ProfitRx separates the presentation layer, business logic container, data persistence layer, and Shopify edge extensions:

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
        DB[(Neon PostgreSQL Serverless Database)]
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

---

## 🛠️ Advanced Technical Moats

### 1. WebAssembly-powered Payment Customization (`cod-blocker`)
Built as a native **Shopify Function** running on Shopify's edge servers. It intercepts checkout requests and dynamically hides Cash on Delivery (COD) payment methods based on:
* Pincodes marked as high-risk by the merchant.
* Dynamic rules (e.g. order value exceeding a threshold or specific tags).
This prevents high-volume checkout drops and completely bypasses slow theme script injections.

### 2. High-Performance Serverless Architecture (TTFB < 100ms)
Fully compliant with Shopify's strict App Store performance budgets:
* **TTFB Optimization**: Implemented a 1-hour database cache layer for active subscriptions and a 15-minute static cache for products to bypass slow Shopify GraphQL catalog lookups. TTFB dropped from **7,567ms** to **under 100ms**.
* **Zero-Waterfall Rendering**: Inlined custom dark-mode CSS directly into the HTML payload via server-side loaders and asynchronous font styling. This reduces blocking header files to exactly **1 external file** (Polaris CSS), passing the `<head>` budget constraints.
* **Non-Blocking GDPR Webhooks**: Handled database purges asynchronously via deferred background threads (`setTimeout`/`Promise.all`), preventing cold-start timeouts and returning a `200 OK` under 10ms.

### 3. Automated Pincode Risk Scoring
Instead of relying on manual lists, the `ShopifyService` aggregates order metrics to auto-calculate and update local pincode risks:
$$\text{RTO Rate} = \frac{\text{Returned Orders}}{\text{Total COD Orders}} \times 100$$
Calculates localized metrics and generates a color-coded interactive heatmap (Low, Medium, High, Critical) with 1-click bulk-blocking rules.

---

## 📊 Database Schema (Prisma ORM)

ProfitRx utilizes a serverless **Neon PostgreSQL** database configured with optimized indexes for fast spatial/pincode aggregates:

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

---

## 📦 Features & Capabilities

* **True Profit Intelligence**: Aggregates product catalog variant costs (`unitCost` and metafields) to deduce real COGS, calculates payment gateway fees, and applies India-specific **18% GST** splits (CGST/SGST vs. IGST).
* **AI Search Query Tracker**: Measures store product visibility, CTR, impressions, and rank in AI search search engines (ChatGPT Search, Gemini, Microsoft Copilot).
* **WhatsApp OTP Verification & Digests**: Triggers customer-facing OTP confirmation codes on COD checkouts to reduce dummy/incorrect numbers, and sends weekly digests to the merchant's business WhatsApp.
* **GST Accountant Report Export**: Exports 1-click GSTR-1 compliant spreadsheets with transaction splits, taxable values, and SGST/CGST/IGST breakdown.

---

## 🚀 Local Development Setup

### Prerequisites
* **Node.js** (v20.19+ recommended)
* **Shopify Partners account** and a development store
* **Neon PostgreSQL** database connection URL

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

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
