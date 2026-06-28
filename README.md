# 🏛️ Greek God — Profit Intelligence for Shopify

> **Stop guessing. Start profiting.**

Greek God is a **Profit Intelligence Platform** built specifically for Indian D2C Shopify merchants. It auto-syncs with your Shopify store to reveal your **true profit**, track **AI channel attribution**, and plug **profit leaks** like RTO losses—all in one dashboard.

---

## 🚀 The Problem We Solve

| Problem | Greek God Solution |
| :--- | :--- |
| "I don't know my real profit" | True Profit calculation with COGS tracking |
| "Which AI channel makes me money?" | AI Attribution (ChatGPT, Gemini, Copilot) |
| "I'm losing ₹20,000/month to RTO" | Pincode-level RTO Heatmap + COD Risk Score |
| "Where is money leaking?" | Profit Leak Detector (RTO, Shipping, Discounts, COD) |
| "Do my customers come back?" | LTV/Cohort Retention |
| "Meta says 4x ROAS but I'm not profitable" | Blended ROAS / True CAC |
| "Is my store healthy or dying?" | Profit Health AI (🟢/🟡/🔴) |

---

## 🧠 How It Works
┌─────────────────────────────────────────────────────────────┐
│ SHOPIFY STORE │
│ Products → Orders → Customers → Pincodes │
└─────────────────────┬───────────────────────────────────────┘
│
▼ (Auto-Sync via Shopify API)
┌─────────────────────────────────────────────────────────────┐
│ GREEK GOD SAAS │
│ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ DASHBOARD │ │
│ │ Revenue: ₹21,000 Profit: ₹10,000 Margin: 47% │ │
│ └─────────────────────────────────────────────────────┘ │
│ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ AI CHANNEL ATTRIBUTION │ │
│ │ ChatGPT: ₹8,000 (40% margin) │ │
│ │ Gemini: ₹4,500 (55% margin) │ │
│ └─────────────────────────────────────────────────────┘ │
│ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ RTO HEATMAP │ │
│ │ Pincode 635109 → 60% RTO risk 🔴 │ │
│ │ Pincode 400001 → 10% RTO risk 🟢 │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘


---

## 🛠️ Tech Stack

| Layer | Technology | Why |
| :--- | :--- | :--- |
| **Frontend** | React Router v7 + Shopify Polaris | Shopify's official UI framework |
| **Backend** | React Router (Remix) | SSR + API routes |
| **Database** | Neon PostgreSQL | Serverless, free tier |
| **ORM** | Prisma v6 | Type-safe database access |
| **Auth** | Shopify OAuth | Secure merchant login |
| **Hosting** | Vercel | Serverless deployment |
| **AI Engine** | Custom pattern recognition | Profit Leak + Health Score |

---

## 📦 Features

### ✅ Core Features (Fully Built)
- [x] True Profit Dashboard
- [x] AI Channel Attribution (ChatGPT, Gemini, Copilot)
- [x] RTO/COD Intelligence (Pincode Heatmap)
- [x] Profit Leak Detector
- [x] LTV/Cohort Retention
- [x] Blended ROAS / True CAC
- [x] Profit Health AI (🟢/🟡/🔴)

### 🚧 In Progress
- [ ] Email/Slack alerts for profit leaks
- [ ] Automated RTO risk blocking (COD disable)
- [ ] Multi-store support

---

## 🚀 Getting Started (Development)

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Shopify Partners account (for dev store)
- Neon PostgreSQL account (free)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/greek-god-saas.git
cd greek-god-saas
