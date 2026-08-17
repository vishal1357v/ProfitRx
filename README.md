# ProfitRx  — Real-Time Profit Intelligence & RTO Risk Shield for Shopify

<div align="center">

![ProfitRx Banner](https://img.shields.io/badge/Shopify-App_Bridge_v4-95BF47?style=for-the-badge&logo=shopify&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-v7_SSR-E0234E?style=for-the-badge&logo=reactrouter&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM_v6-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![WebAssembly](https://img.shields.io/badge/Shopify_Function-WASM_/_Rust-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)
![Polaris](https://img.shields.io/badge/Design-Shopify_Polaris_v13-008060?style=for-the-badge&logo=shopify&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**A high-throughput, production-hardened Shopify application engineered to eliminate Return-to-Origin (RTO) losses and compute True Net Pocket Profit in real time.**

[Architecture](#-system-architecture) • [Engineering Moats](#-deep-dive-technical-moats) • [Decision Engine](#-rto-decision--expected-loss-engine) • [Database Schema](#-database-schema--domain-model) • [Setup Guide](#-local-development--setup)

</div>

---

## 🎯 Executive Summary & The Problem

In high-growth e-commerce markets dominated by **Cash on Delivery (COD)** (e.g., India, Southeast Asia, LATAM), direct-to-consumer (D2C) brands face severe operational margin erosion:

1. **The RTO Cash Drain:** 20% to 40% of COD orders result in Return-to-Origin (failed/rejected deliveries). For every RTO, merchants bleed forward freight (₹60–₹120), reverse logistics (₹70–₹140), packaging, and inventory deadweight.
2. **The "Vanity Profit" Illusion:** Standard Shopify analytics report gross GMV without factoring in:
   - Dynamic variant-level **Cost of Goods Sold (COGS)** snapshots at the exact time of order.
   - Payment gateway fees (e.g., 2% Razorpay/Cashfree/Stripe) and statutory **18% GST on processing fees**.
   - Multi-tier volumetric shipping weight slabs.
   - Channel-attributed paid ad spends (Meta, Google, TikTok) mapped to net realized margins.

### The ProfitRx Solution
**ProfitRx** bridges this critical gap through a dual-engine architecture:
- **Financial Precision Engine:** Reconstructs the exact unit economics of every transaction to compute **True Net Pocket Profit**, Blended ROAS, and CAC Payback per order.
- **RTO Protection & Decision Shield:** Executes low-latency checkout interventions via **WASM-compiled Shopify Functions**, cold-start pincode heuristics, and **risk-gated WhatsApp OTP verification** powered by an Expected Value (EV) economic decision model.

---

## 🏛️ System Architecture

ProfitRx is built following **Vertical Slice Architecture** and **Domain-Driven Design (DDD)** principles, guaranteeing strict separation of concerns across presentation, domain logic, edge computation, and persistence.

```mermaid
graph TD
    %% Presentation Layer
    subgraph Presentation ["1. Presentation Layer (React Router v7 SSR)"]
        UI["Shopify Polaris v13 + App Bridge UI"]
        SSR["Zero-Waterfall SSR Handlers"]
        Theme["Server-Inlined CSS Dark Mode System"]
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
        ALERT["Profit Leak & Anomaly Engine"]
    end

    %% Background & Sync Layer
    subgraph Sync ["4. Real-time Ingestion & Cron Layer"]
        WH["HMAC SHA-256 Webhook Ingestion"]
        Cron["Vercel Cron (api.auto-sync)"]
        OAuth["AES-256 Encrypted Session Store"]
    end

    %% Persistence Layer
    subgraph Persistence ["5. Persistence Layer (PostgreSQL)"]
        Prisma["Prisma ORM v6 (Connection Pooling)"]
        DB[(PostgreSQL / Neon Serverless DB)]
    end

    %% External APIs
    subgraph External ["6. External Ecosystem Integrations"]
        ShopifyAPI["Shopify Admin GraphQL API (2026-04)"]
        MetaAPI["Meta Marketing API"]
        GoogleAPI["Google Ads API"]
        WhatsAppAPI["Meta WhatsApp Cloud API"]
    end

    %% Connections
    UI --> SSR
    SSR --> Core
    WASM -->|Reads cached list| Metafield
    WH -->|orders/create, update| Core
    Cron -->|Scheduled aggregations| Core
    Core --> Prisma
    Prisma --> DB
    Core --> ShopifyAPI
    ADS --> MetaAPI
    ADS --> GoogleAPI
    WA --> WhatsAppAPI
    Core --> OAuth
```

---

## ⚡ Deep-Dive Technical Moats

### 1. Sub-5ms Checkout Intervention via WebAssembly (Shopify Function)
Rather than relying on brittle client-side JavaScript script tags that execute after page render (and can be bypassed via DevTools), ProfitRx compiles native payment customization logic into **WebAssembly (`cart_payment_methods_transform`)**.
- Runs directly inside Shopify's checkout infrastructure at the edge with **execution times under 5 milliseconds**.
- Evaluates cart shipping addresses against high-risk pincode lists synchronized into `$app:cod-blocker` merchant metafields via GraphQL.
- Dynamically hides or disables COD options for blacklisted zones before the payment method list is rendered to the customer.

### 2. Economic Expected Value (EV) Decision Model
Traditional fraud filters apply rigid, arbitrary thresholds (e.g., "block all orders > ₹2,000"). ProfitRx evaluates order risk through an **Expected Loss vs. Intervention Friction** economic model:

$$\mathbb{E}[\text{Net Benefit}] = \Big(P(\text{RTO}) \times \text{Loss}_{\text{RTO}}\Big) - \Big(\text{Cost}_{\text{OTP}} + P(\text{Dropoff}) \times \text{Margin}\Big)$$

- **Low Risk:** Verification is silently bypassed—zero friction, preserving checkout conversion rates.
- **Medium / High / Critical Risk:** Triggers automated 6-digit cryptographic OTP verification dispatched over WhatsApp Meta Cloud API or Twilio.
- Once verified, the order is tagged `COD_Verified` in Shopify Admin via GraphQL mutation.

### 3. Cold-Start Pincode Fallback Algorithm
New merchants frequently lack historical order volume across all 19,000+ Indian postal codes. ProfitRx resolves the cold-start data sparsity problem using a **hierarchical prefix resolution tree**:
```
Exact 6-Digit Pincode (e.g., 560034) 
    └── If historical orders < 5
         └── Fallback: 3-Digit Sorting District (560xxx)
              └── If insufficient
                   └── Fallback: 2-Digit Regional Circle (56xxxx - Karnataka)
                        └── Global Store Risk Baseline
```

### 4. Immutable Historical COGS Snapshotting
When raw material costs or supplier prices change, recalculating past orders with new COGS distorts historical financial records.
- ProfitRx snapshots product and variant costs at the exact millisecond of purchase into `cogsAtTimeOfOrder` and `OrderLineItem.cogsPerUnitAtOrder`.
- Full dual-priority resolution: `Manual Override` $\rightarrow$ `Native Shopify Cost` $\rightarrow$ `Store Category Default`.
- Guarantees that historical P&L, GST reports, and monthly accounting logs remain **mathematically immutable**.

### 5. Multi-Tenant Security & Token Encryption at Rest
- **AES-256-GCM Encryption:** Merchant access tokens and ad platform OAuth credentials are encrypted with authenticated AES-256-GCM before database insertion.
- **Strict Tenant Isolation:** All database read/write queries enforce mandatory compound indexing and tenant scoping (`where: { shop }`).
- **SQL Injection Defense:** Strict adherence to parameterized Prisma queries with zero raw string concatenations.
- **Cryptographic Webhook Verification:** Mandatory HMAC SHA-256 header validation on all inbound Shopify webhooks with a 2-second fast-acknowledgement loop to prevent Shopify retry storms.

---

## 🔄 End-to-End Operational Flows

### A. Webhook Ingestion & Real-Time Margin Pipeline
```mermaid
sequenceDiagram
    autonumber
    participant Shopify as Shopify Webhook Dispatcher
    participant Ingest as /webhooks/orders/create
    participant Auth as HMAC Verifier
    participant SS as ShopifyService
    participant PS as ProfitService
    participant DB as PostgreSQL (Prisma)

    Shopify->>Ingest: POST /webhooks/orders/create (Payload + HMAC Header)
    Ingest->>Auth: Verify HMAC SHA-256 Signature
    alt Invalid Signature
        Auth-->>Ingest: 401 Unauthorized
    else Signature Valid
        Auth-->>Ingest: Authorized (shop verified)
        Ingest->>SS: Ingest Order & Snapshot Variant COGS
        SS->>DB: Upsert Order (with cogsAtTimeOfOrder)
        SS->>DB: Update PincodeStats & CustomerProfile (LTV, AOV)
        Ingest->>PS: Compute Net Profit, GST, Shipping, Gateway Fees
        PS->>DB: Update Daily ProfitSnapshot
        Ingest-->>Shopify: 200 OK (Acknowledged in <200ms)
    end
```

### B. Risk Evaluation & Dynamic OTP Verification Loop
```mermaid
sequenceDiagram
    autonumber
    participant Buyer as Customer Browser
    participant Store as Shopify Storefront
    participant Func as WASM Shopify Function
    participant COD as CODManagementService
    participant WA as Meta WhatsApp API
    participant Admin as Shopify Admin GraphQL

    Buyer->>Store: Enters Shipping Address & Pincode
    Store->>Func: cart_payment_methods_transform
    Func->>Func: Lookup Pincode in Metafield
    alt Pincode in Blocked List
        Func-->>Store: Filter out COD (Display Prepaid Only)
    else Pincode Allowed
        Func-->>Store: Allow COD Selection
        Buyer->>Store: Completes COD Order
        Store->>COD: evaluateRisk(orderId, customerHistory, pincode)
        alt Risk Score == LOW
            COD->>Admin: Tag Order: "COD_Trusted_AutoBypass"
        else Risk Score >= MEDIUM
            COD->>COD: Generate 6-Digit Secure OTP
            COD->>WA: Dispatch WhatsApp Interactive OTP Template
            WA-->>Buyer: WhatsApp message with 1-tap verification link
            Buyer->>COD: Submits 6-digit OTP code
            COD->>Admin: Tag Order: "COD_Verified" & Update Financial Status
        end
    end
```

---

## 📊 Database Schema & Domain Model

The persistence layer is modeled in PostgreSQL using Prisma 6 ORM, fully indexed for fast time-series analytical queries:

```mermaid
erDiagram
    Session ||--o{ Order : processes
    StoreSettings ||--o{ Subscription : configures
    Order ||--|{ OrderLineItem : contains
    Order ||--o{ OrderRefund : has
    Order ||--o{ ExecutionLog : tracks
    OrderLineItem }|--|| ProductCOGS : snapshots
    PincodeStats }|--|| StoreSettings : aggregates
    CustomerProfile ||--o{ Order : places
    AdSpendDaily }|--|| StoreSettings : aggregates

    Session {
        string id PK
        string shop UK
        string accessToken "Encrypted AES-256"
        datetime expiresAt
    }
    Order {
        string id PK
        string shop
        float totalPrice
        float subtotalPrice
        float totalTax
        float shippingPrice
        boolean isCOD
        float cogsAtTimeOfOrder
        int riskScore
        string riskLevel
        string pincode
        string channelAttribution
    }
    OrderLineItem {
        string id PK
        string shopifyLineItemId UK
        string title
        int quantity
        float unitPrice
        float cogsPerUnitAtOrder
        float totalCOGSAtOrder
    }
    PincodeStats {
        string id PK
        string pincode
        int totalOrders
        int rtoCount
        float rtoRate
        string riskLevel
    }
    CustomerProfile {
        string id PK
        string customerId
        float ltv
        float aov
        int totalOrders
        float personalRtoRate
    }
    Subscription {
        string id PK
        string shop UK
        string plan
        string status
        int orderLimit
        int ordersUsed
    }
```

---

## 🛠️ Tech Stack & Engineering Specifications

| Domain | Technology / Library | Architectural Role |
| :--- | :--- | :--- |
| **Framework & SSR** | [React Router v7](https://reactrouter.com/) (SSR) + Node.js | Full-stack server-side rendering, loader/action data pipeline |
| **UI Design System** | [Shopify Polaris v13](https://polaris.shopify.com/) + Polaris Icons | Native Shopify Admin merchant interface aesthetics |
| **Shopify Integration**| [@shopify/app-bridge-react](https://shopify.dev/docs/api/app-bridge-library) v4 | Iframe session tokens, modal dialogs, contextual navigation |
| **Checkout Extensions**| Rust / WebAssembly (`cart_payment_methods_transform`) | Real-time payment method customization at Shopify Checkout |
| **ORM & Database** | [Prisma v6](https://www.prisma.io/) + PostgreSQL | Multi-tenant relational persistence with connection pooling |
| **Security & Crypto** | Node.js `crypto` (AES-256-GCM, HMAC SHA-256) | Encrypted OAuth session tokens and secure webhook signatures |
| **Messaging & OTP** | WhatsApp Meta Cloud API + Twilio SDK | Risk-gated automated customer verification workflows |
| **Email Dispatch** | Resend SDK | Critical profit leak alerts and automated weekly performance digests |
| **Ad Integrations** | Meta Marketing API, Google Ads API, TikTok API | Blended ROAS, ad spend ingestion, and True CAC mapping |
| **Testing & Quality** | Vitest + TypeScript + Custom Verification Suites | High-coverage unit tests, billing loop and RTO simulation scripts |

---

## 🚀 Local Development & Setup

### Prerequisites
- **Node.js**: `v20.19.0` or higher (`v22+` supported)
- **Shopify Partner Account** with a development store
- **PostgreSQL Database** instance (local or hosted via Neon / Supabase)
- **Shopify CLI**: `npm install -g @shopify/cli`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/vishal1357v/greek-god-saas.git
   cd greek-god-saas
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```env
   # App & Server Configuration
   PORT=3000
   NODE_ENV="development"
   SHOPIFY_API_KEY="your-shopify-client-id"
   SHOPIFY_API_SECRET="your-shopify-client-secret"
   SHOPIFY_APP_URL="https://your-tunnel-url.ngrok.io"
   SCOPES="read_products,read_orders,write_orders,read_customers,read_fulfillments,write_metafields,read_metafields,write_payment_customizations"

   # Database (PostgreSQL / Neon)
   DATABASE_URL="postgresql://user:password@localhost:5432/profitrx?sslmode=prefer"

   # Security & Verification
   TOKEN_ENCRYPTION_KEY="32-character-random-secret-key-for-aes-256"
   CRON_SECRET="your-secure-cron-trigger-token"
   BYPASS_BILLING="true"

   # Notifications & APIs (Optional for local testing)
   RESEND_API_KEY="re_123456789"
   WHATSAPP_TOKEN="your-meta-cloud-token"
   WHATSAPP_PHONE_NUMBER_ID="your-phone-id"
   ```

4. **Initialize database schema & run seed data:**
   ```bash
   npx prisma db push
   npx prisma db seed
   ```

5. **Start local development server:**
   ```bash
   npm run dev
   ```

---

## 🧪 Testing & Runtime Verification

The repository includes a comprehensive automated verification suite validating risk algorithms, billing state machines, and webhook lifecycles:

```bash
# Run unit test suite
npm run test

# Run complete TypeScript compilation & typecheck
npm run typecheck

# Run end-to-end RTO protection simulation audit
npx tsx scripts/verify-real-rto-protection.ts

# Run billing lifecycle and retry propagation audit
npx tsx scripts/verify-real-billing-loop.ts

# Run master runtime audit suite
npx tsx scripts/audit-master-suite.ts
```

---

## 💡 Key Engineering Decisions & Trade-Offs

| Decision | Alternative Considered | Why ProfitRx Chose This Approach |
| :--- | :--- | :--- |
| **WASM Shopify Function** | ScriptTag / Checkout UI Extension | WebAssembly runs natively on Shopify's checkout engine in $<5\text{ms}$ with zero reliance on client-side JS execution, preventing bypassing. |
| **Vertical Slice Architecture** | Traditional Layered Architecture | Colocating route loaders, application services, and domain repositories prevents architectural drift and simplifies feature testing. |
| **Dual-Priority COGS** | Single Native Cost Field | Shopify's native unit cost does not handle tiered supplier discounts or offline overrides; dual-priority ensures exact margin modeling. |
| **2-Digit Pincode Heuristics** | Naive 6-Digit Lookup | Prevents false negatives on cold-start postal codes where a single failed delivery could otherwise bias an entire pincode. |

---

## 📄 License & Attribution

Distributed under the **MIT License**. Created by [xlr8j](https://github.com/vishal1357v). Built with precision for the modern e-commerce engineering ecosystem.

