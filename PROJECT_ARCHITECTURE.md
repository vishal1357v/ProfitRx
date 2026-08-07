# ProfitRx System Architecture

ProfitRx is a **Decision-Support System** designed to maximize expected profit (Expected Value) for e-commerce merchants. 

Unlike traditional risk engines that simply try to "minimize RTO (Return to Origin)", ProfitRx recognizes that aggressive RTO mitigation (e.g., blanket blocking COD orders) destroys conversion rates and ultimately harms net profit. The system operates entirely on the principle of **Expected Value (EV)**—mathematically modeling the financial outcome of every possible intervention and selecting the one that yields the highest net return.

---

## 1. The 8-Phase Architecture

The system is strictly layered to prevent business logic and responsibilities from bleeding across domains.

| Phase | Layer | Responsibility | Output |
|-------|-------|----------------|--------|
| **Phase 1** | **Order Feature Engine** | Deterministically extracts all relevant signals (Customer history, Pincode stats, Order financials) into a single, structured object. | `OrderFeatureResult` |
| **Phase 2** | **RTO Risk Engine** | Estimates the probability that a given order will result in an RTO, utilizing Bayesian smoothing and confidence weighting. No financial math allowed here. | `RTORiskResult` |
| **Phase 3** | **Expected Value Engine** | The absolute financial core. Calculates the actual monetary outcome of the order under both a `DeliveredScenario` and an `RTOScenario`. | `ExpectedValueResult` |
| **Phase 4** | **Decision Engine** | The "Brain". Simulates available interventions, recalculates EV for each, and ranks them to pick the mathematically optimal action. | `DecisionResult` |
| **Phase 5** | **Execution Layer** | *(Upcoming)* Safely executes the recommended action (e.g., sending an OTP via SMS, blocking via Shopify Functions). | Execution Logs |
| **Phase 6** | **Feedback Layer** | *(Upcoming)* Tracks the actual outcome (e.g., Did the OTP convert? Did the order RTO?) and feeds it back into the data warehouse. | Verified Outcomes |
| **Phase 7** | **Analytics & Dashboard** | *(Upcoming)* Visualizes the Expected Value generated vs. Baseline, proving ROI to the merchant. | UI/Dashboards |
| **Phase 8** | **AI Copilot** | *(Upcoming)* NLP interface for merchants to query why decisions were made and simulate rule changes. | Conversational UI |

---

## 2. Core Data Flow

The core pipeline is a pure, deterministic, functional chain. 

```text
[ Shopify Webhook ]
        │
        ▼
[ 1. Feature Extraction ] ──► Queries DB once to assemble `OrderFeatureResult`
        │
        ▼
[ 2. Risk Estimation ]    ──► Consumes Features ──► Produces `RTORiskResult`
        │
        ▼
[ 3. Financial Baseline ] ──► Consumes Features + Risk ──► Produces `ExpectedValueResult`
        │
        ▼
[ 4. Decision Engine ]    ──► Consumes Features + Risk + Baseline EV + Merchant Settings
        │                         │
        │                         ├──► Simulates Intervention Effects (Risk/Conversion/Cost)
        │                         ├──► Re-calls ExpectedValue Engine (Scenario Evaluator)
        │                         └──► Ranks results by EV
        ▼
[ 5. Execution Layer ]    ──► Consumes `DecisionResult` ──► Executes (e.g., Send WhatsApp)
```

---

## 3. Service Responsibilities

### The "One Place" Rule
A strict design principle of ProfitRx is that knowledge must reside in exactly one place.

*   **Financial Math:** Lives **only** in `ExpectedValueService`. If you need to know profit, you must call this service.
*   **Intervention Effects:** Live **only** in the Action plugins (e.g., `OTPAction`). They describe *how reality changes* (multipliers), not *what that costs in dollars*.
*   **Risk Logic:** Lives **only** in `RTORiskService`.

### The Decision Pipeline (Phase 4 Breakdown)

The Decision Engine is specifically designed to avoid lazy rules (e.g., `if risk > 50% block`).

1.  **Action Plugins (`Intervention`):** Purely declarative. They state: *"I am OTP. I cost ₹3, I reduce RTO risk by 25%, and I cause a 2% drop in conversion."*
2.  **`ScenarioEvaluator`:** Takes those multipliers, applies them to the baseline Risk and Features, and passes the simulated reality back to `ExpectedValueService` to get the financial impact.
3.  **`RankingService`:** Takes all simulated scenarios and ranks them. It enforces safety filters (`minConfidence`, `maxFriction`) and sorts by highest EV. It uses Friction and Confidence strictly as tie-breakers.

---

## 4. The Models

### Risk Model (Phase 2)
Currently deterministic. It aggregates features (Customer, Pincode, Merchant, Order) and applies weights. Critically, it utilizes **Bayesian Smoothing**—a pincode with 1 RTO out of 1 order does not yield a 100% risk probability. It scales based on `sampleSize` to produce a `confidence` score.

### Financial Model (Phase 3)
Calculates two explicit scenarios:
*   `DeliveredScenario`: Revenue - COGS - Forward Shipping - Payment Fees - COD Fees - Packaging - Ad Cost = `contributionProfit`
*   `RTOScenario`: Damaged Inventory - Forward Shipping - Return Shipping - Packaging = `totalLoss`

`Expected Value = (contributionProfit * deliveryProbability) - (totalLoss * rtoProbability)`

### Execution Flow (Phase 5 - Future)
The Execution layer will consume the `DecisionResult`. If the recommendation is `OTP_VERIFY`, it will pause the Shopify order fulfillment, trigger the SMS provider, and await the webhook response before releasing the hold.

### Feedback Loop (Phase 6 - Future)
Every `DecisionResult` is stored alongside the final Shopify order outcome (Delivered, RTO, Cancelled). This closes the loop, allowing us to measure the *actual* EV vs. *predicted* EV.

---

## 5. Future ML Interface (Phase 8 & Beyond)

ProfitRx is built so that the deterministic engines can be seamlessly swapped for Machine Learning models in the future, **without altering a single line of downstream code**.

### Enterprise ML Infrastructure
To achieve true enterprise-scale defensibility, the following infrastructure will be introduced:

1. **Feature Store:** Centralizes feature definitions so that offline training and online inference are perfectly synced, preventing prediction drift.
2. **Model Registry:** Models and EV assumptions are strictly versioned (e.g., `risk-engine-v2`, `ev-assumptions-v3`), allowing safe rollbacks.
3. **Shadow Mode Deployment:** New models run in parallel with the production Rule Engine for months, scoring orders invisibly to validate calibration before taking actual action.
4. **Offline Evaluation Framework:** Before any model hits production, it is evaluated against 100k historical orders to generate confusion matrices, calculate exact Profit Saved, and measure calibration error.
5. **Experiment Engine:** Allows merchants to run true A/B tests (e.g., 50% OTP vs. 50% WhatsApp) to discover optimal interventions rather than guessing.

---

> [!WARNING]
> **To Future Developers:** 
> Do not put financial calculations inside the Decision Engine. Do not put risk logic inside the Feature Engine. 
> The architecture explicitly separates **State** (Features), **Probability** (Risk), **Finance** (Expected Value), and **Action** (Decision). Respect the boundaries. The ultimate moat is the proprietary dataset of exact outcomes linked to specific features and decisions.
