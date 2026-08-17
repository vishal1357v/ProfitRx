# ProfitRx — Shopify Profit Analytics & RTO Protection SaaS

<div align="center">

![Shopify App Bridge](https://img.shields.io/badge/Shopify-App_Bridge_v4-95BF47?style=for-the-badge&logo=shopify&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-v7_SSR-E0234E?style=for-the-badge&logo=reactrouter&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM_v6-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![WebAssembly](https://img.shields.io/badge/Shopify_Function-WASM_/_Rust-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)
![Polaris](https://img.shields.io/badge/UI_Design-Shopify_Polaris_v13-008060?style=for-the-badge&logo=shopify&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**A high-throughput, production-hardened Shopify SaaS engineered to calculate True Net Pocket Profit in real-time and prevent Cash on Delivery (COD) Return-to-Origin (RTO) losses.**

[What it does](#-what-it-does) • [Features](#-features) • [Tech Stack](#-tech-stack) • [Architecture](#-architecture) • [Shopify Integration](#-shopify-integration) • [Setup](#-setup-instructions) • [Roadmap](#-future-roadmap)

</div>

---

## 🎯 What it does

In e-commerce markets heavily reliant on **Cash on Delivery (COD)** (e.g., India, Southeast Asia, LATAM), direct-to-consumer (D2C) brands face two critical financial blindspots:

1. **The RTO Cash Drain:** 20% to 40% of COD orders result in Return-to-Origin (buyer refusal or failed delivery). Merchants lose forward shipping (₹60–₹120), reverse logistics (₹70–₹140), packaging, and inventory holding costs on every failed shipment.
2. **The "Vanity Profit" Illusion:** Standard Shopify analytics report gross GMV without accounting for:
   - Dynamic variant-level **Cost of Goods Sold (COGS)** snapshots at the time of purchase.
   - Payment gateway transaction fees and statutory **18% GST on processing fees**.
   - Multi-tier volumetric shipping weight slabs.
   - Channel-attributed ad spends (Meta, Google, TikTok) mapped to net realized margins.

### The Solution:
**ProfitRx** operates as a dual **Profit Intelligence Engine** and **RTO Decision Shield**:
- Computes **True Net Pocket Profit**, Blended ROAS, and CAC Payback per order in real-time.
- Executes sub-5ms checkout payment customizations via **WebAssembly (WASM) Shopify Functions** to block high-risk COD zones.
- Deploys an **Economic Expected Value (EV) Decision Engine** that triggers automated WhatsApp OTP verification only when the expected loss of RTO outweighs the friction cost of verification.

---

## 📸 Screenshots & UI Preview

| Dashboard & Margin Command Center | Order Intelligence & Decision Engine |
| :---: | :---: |
| *Real-time True Pocket Profit, Net Margin %, COGS deductions, and RTO loss breakdown* | *Deep-dive order evaluation showing EV calculation, risk factors, and recommended action* |
| **Pincode Risk Heatmap** | **COGS & Variant Catalog** |
| *Regional high-risk delivery zones with 2-digit fallback analytics* | *Dual-priority cost mapping (Manual Override $\to$ Native Shopify $\to$ Default %)* |

---

## 🌟 Features

### 1. Financial Intelligence & Real-Time Net Profit
- **Atomic COGS Snapshotting:** Snapshots `cogsAtTimeOfOrder` down to the SKU/variant level, ensuring past P&L remains mathematically immutable when supplier costs change.
- **Dual-Priority Cost Resolution:** Priority order: `Manual Variant Override` $\rightarrow$ `Native Shopify Cost` $\rightarrow$ `Store Category Default %`.
- **Statutory Indian GST Accounting:** Automatically deducts payment gateway processing fees (Razorpay, Cashfree, Stripe) plus 18% GST on fees.
- **Blended & Channel ROAS:** Aggregates daily Meta, Google, and TikTok ad spend to compute True CAC and CAC Payback against net profit.
- **1-Click GSTR-1 Compliance Reports:** Exports accountant-ready spreadsheets with SGST, CGST, and IGST breakdowns.

### 2. RTO Prevention & Economic Decision Shield
- **WASM-Compiled Checkout Customization:** Intercepts Shopify Checkout via `cart_payment_methods_transform` to dynamically hide or disable COD payment options in under 5ms.
- **Expected Value (EV) Intervention Model:** Dynamically balances:
  $$\mathbb{E}[\text{Benefit}] = \big(P(\text{RTO}) \times \text{Loss}_{\text{RTO}}\big) - \big(\text{Cost}_{\text{OTP}} + P(\text{Dropoff}) \times \text{Margin}\big)$$
- **Risk-Gated WhatsApp OTP Verification:** Auto-bypasses low-risk buyers for maximum checkout conversion, while triggering 6-digit cryptographic OTPs via Meta Cloud API/Twilio for Medium, High, or Critical risk orders.
- **Cold-Start Pincode Fallback Algorithm:** Resolves regional data sparsity across 19,000+ Indian postal codes via a hierarchical prefix resolution tree (6-digit $\to$ 3-digit district $\to$ 2-digit circle).
- **Automated Shopify Admin Tagging:** Tags verified orders as `COD_Verified` or `COD_Trusted_AutoBypass` via GraphQL Admin mutations.

---

## 🛠️ Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PROFITRX TECH STACK                           │
├───────────────────┬────────────────────────────────────────────────────┤
│ Framework & SSR   │ React Router v7 (SSR) + React 18 + Node.js 20+     │
│ UI & Design       │ Shopify Polaris v13 + Polaris Icons + Dark Theme   │
│ Shopify Extension │ WebAssembly (WASM) / Rust (Shopify Functions)      │
│ Shopify SDK       │ @shopify/shopify-app-react-router + App Bridge v4   │
│ ORM & Database    │ Prisma ORM v6 + PostgreSQL 16 (Neon Serverless)    │
│ Security & Crypto │ AES-256-GCM Token Encryption + HMAC SHA-256 Auth   │
│ External APIs     │ WhatsApp Meta Cloud API, Twilio, Resend, Meta/Goog │
│ Quality & Testing │ Vitest + TypeScript 5.9 + Custom Audit Suites      │
└───────────────────┴────────────────────────────────────────────────────┘
```

---

## 🏛️ Architecture

ProfitRx is engineered following **Vertical Slice Architecture** and **Domain-Driven Design (DDD)** principles to ensure strict separation between presentation, domain rules, edge functions, and persistence.

```mermaid
graph TD
    %% Presentation Layer
    subgraph Presentation ["1. Presentation Layer (React Router v7 SSR)"]
        UI["Shopify Polaris v13 + App Bridge UI"]
        SSR["Zero-Waterfall SSR Handlers"]
    end

    %% Edge Extension Layer
    subgraph Extension ["2. Edge Checkout Extension Layer"]
        WASM["cod-blocker (WebAssembly Shopify Function)"]
        Metafield["$app:cod-blocker GraphQL Metafields"]
    end

    %% Core Application Layer
    subgraph Core ["3. Domain & Application Services"]
        direction TB
        DE["Decision & Expected Value Engine"]
        PS["Profit & Tax Engine (GST & COGS)"]
        COD["COD Management & Rules Service"]
        CI["Customer Intelligence (LTV & Cohorts)"]
        ADS["Multi-Platform Ad Spend Aggregator"]
        WA["WhatsApp / Twilio OTP Dispatcher"]
    end

    %% Sync & Persistence Layer
    subgraph Persistence ["4. Sync, Webhooks & Storage Layer"]
        WH["HMAC SHA-256 Webhook Ingestion"]
        Cron["Vercel Cron (api.auto-sync)"]
        Prisma["Prisma ORM Client v6"]
        DB[(PostgreSQL Database)]
    end

    %% External Ecosystem
    subgraph External ["5. External Ecosystem Integrations"]
        ShopifyAPI["Shopify Admin GraphQL API (2026-04)"]
        WhatsAppAPI["Meta WhatsApp Cloud API"]
        AdAPIs["Meta & Google Ads APIs"]
    end

    %% Connections
    UI --> SSR
    SSR --> Core
    WASM -->|Reads cached blocklist| Metafield
    WH -->|orders/create, update| Core
    Cron -->|Daily sync| Core
    Core --> Prisma
    Prisma --> DB
    Core --> ShopifyAPI
    WA --> WhatsAppAPI
    ADS --> AdAPIs
```

### End-to-End Decision & Verification Flow
```mermaid
sequenceDiagram
    autonumber
    participant Buyer as Customer Checkout
    participant Func as WASM Shopify Function
    participant COD as COD Decision Engine
    participant WA as Meta WhatsApp API
    participant Admin as Shopify Admin GraphQL

    Buyer->>Func: Enters Shipping Pincode at Checkout
    alt Pincode in Blocked Metafield List
        Func-->>Buyer: Hide COD (Display Prepaid Only)
    else Pincode Allowed
        Func-->>Buyer: Show COD Option
        Buyer->>COD: Order Created Webhook Dispatched
        COD->>COD: Compute EV & Risk Score
        alt Risk == LOW (EV Positive)
            COD->>Admin: Tag Order: "COD_Trusted_AutoBypass"
        else Risk >= MEDIUM
            COD->>WA: Dispatch 6-Digit WhatsApp OTP Link
            Buyer->>COD: Enters OTP on /verify-cod
            COD->>Admin: Tag Order: "COD_Verified"
        end
    end
```

---

## 🔗 Shopify Integration

ProfitRx integrates deeply into the modern Shopify App ecosystem:

- **Shopify Functions (`cart_payment_methods_transform`):** High-speed, edge-compiled WebAssembly function running in $<5\text{ms}$ during customer checkout.
- **Shopify Admin GraphQL API (`2026-04`):** Cursor-based order ingestion, product catalog sync, customer tags, and metafield synchronizations (`$app:cod-blocker`).
- **Shopify App Bridge v4:** Clean embedded iframe experience with session token exchange, contextual modal dialogs, and native top navigation.
- **HMAC-Verified Webhooks:** Real-time listeners for `orders/create`, `orders/updated`, `app/uninstalled`, and GDPR mandatory redaction endpoints with 2-second fast acknowledgement.
- **Shopify Billing API:** Automated subscription state machines (`STARTER`, `GROWTH`, `PRO`) with 1.5s propagation retry logic and dunning recovery banners for Indian RBI recurring mandate compliance.

---

## 🚀 Setup Instructions

### Prerequisites
- **Node.js**: `v20.19.0` or higher (`v22+` supported)
- **Shopify Partner Account** and a development store
- **PostgreSQL Database** (local instance or hosted via Neon / Supabase)
- **Shopify CLI**: `npm install -g @shopify/cli`

### Installation & Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/vishal1357v/greek-god-saas.git
   cd greek-god-saas
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the project root:
   ```env
   # Shopify App Credentials
   PORT=3000
   NODE_ENV="development"
   SHOPIFY_API_KEY="your-shopify-client-id"
   SHOPIFY_API_SECRET="your-shopify-client-secret"
   SHOPIFY_APP_URL="https://your-tunnel-url.ngrok.io"
   SCOPES="read_products,read_orders,write_orders,read_customers,read_fulfillments,write_metafields,read_metafields,write_payment_customizations"

   # Database (PostgreSQL)
   DATABASE_URL="postgresql://user:password@localhost:5432/profitrx?sslmode=prefer"

   # Security & Verification
   TOKEN_ENCRYPTION_KEY="32-character-random-secret-key-for-aes-256"
   CRON_SECRET="your-secure-cron-trigger-token"
   BYPASS_BILLING="true"

   # Optional Third-Party APIs
   RESEND_API_KEY="re_your_api_key"
   WHATSAPP_TOKEN="your-meta-cloud-token"
   WHATSAPP_PHONE_NUMBER_ID="your-phone-id"
   ```

4. **Initialize database schema & seed initial data:**
   ```bash
   npx prisma db push
   npx prisma db seed
   ```

5. **Start local development server:**
   ```bash
   npm run dev
   ```

6. **Run test and audit suites:**
   ```bash
   npm test
   npx tsx scripts/audit-master-suite.ts
   ```

---

## 📈 Current Status

- **Stage:** **Production-Hardened Commercial Release (v1.0.0)**
- **Architecture:** 100% Vertical Slice Architecture across all routes and services.
- **Audit Suite:** 19/19 master end-to-end integration tests passing (`100% success rate`).
- **Security:** Multi-tenant isolated, AES-256 encrypted OAuth credentials, parameterized queries.

---

## 🗺️ Future Roadmap

- [ ] **Courier NDR Webhook Ingestion:** Direct webhooks with logistics couriers (Delhivery, Shiprocket, BlueDart, NimbusPost) for real-time Non-Delivery Report (NDR) re-attempt triggers.
- [ ] **Automated Partial COD Deposits:** Allowing high-risk buyers to pay a small commitment deposit (e.g. ₹99 via UPI) before dispatching the balance as COD.
- [ ] **Multi-Armed Bandit Decision Optimization:** Continuous online learning updating risk factor weights using real RTO delivery outcomes.
- [ ] **Global Tax Matrices:** Multi-currency support and automated VAT/sales tax calculations for US/EU/LATAM cross-border Shopify stores.

---

## 📄 License & Attribution

Distributed under the **MIT License**. Engineered by [xlr8j](https://github.com/vishal1357v).

