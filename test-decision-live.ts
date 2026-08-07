import { DecisionService } from "./app/services/decision-engine/decision.service";
import { OrderFeatureResult } from "./app/services/order-features/types";
import { RTORiskResult } from "./app/services/rto-risk/types";
import { ExpectedValueResult, FinancialAssumptions } from "./app/services/expected-value/types";
import { MerchantDecisionSettings, MerchantInterventionSettings } from "./app/services/decision-engine/types";

const mockFeatures: OrderFeatureResult = {
  features: {
    orderId: "gid://shopify/Order/9999999999",
    shop: "profitrx-live.myshopify.com",
    orderDate: new Date(),
    grossOrderValue: 2499,
    netOrderValue: 2200,
    subtotal: 2200,
    shippingCharged: 0,
    tax: 299,
    discountAmount: 0,
    discountPercentage: 0,
    itemCount: 2,
    totalQuantity: 3,
    totalWeight: 1.5,
    isCOD: true,
    channel: "web",
    customerId: "gid://shopify/Customer/8888888888",
    customerOrderCount: 12,
    customerCodOrderCount: 8,
    customerPrepaidOrderCount: 4,
    customerDeliveredCount: 6,
    customerRtoCount: 2,
    customerCancellationCount: 1,
    customerRtoRate: 0.25,
    customerAov: 1500,
    customerLifetimeSpend: 18000,
    isNewCustomer: false,
    daysSinceLastOrder: 14,
    customerAgeDays: 300,
    repeatPurchaseGap: 45,
    pincode: "110001",
    pincodeOrderCount: 250,
    pincodeCodOrderCount: 200,
    pincodeSuccessfulDeliveries: 160,
    pincodeRtoCount: 40,
    pincodeRtoRate: 0.20,
    pincodeDeliveryRate: 0.80,
    pincodeSampleSize: 200,
    regionalOrderCount: 5000,
    regionalCodOrderCount: 4000,
    regionalRtoCount: 1000,
    regionalRtoRate: 0.25,
    regionalSampleSize: 4000,
    merchantHistoricalOrderCount: 10000,
    merchantCodOrderCount: 8000,
    merchantCodRtoCount: 2000,
    merchantCodRtoRate: 0.25,
    merchantAverageOrderValue: 1200,
    merchantAverageMargin: 0.45,
    merchantAverageRtoLoss: 180,
    cogs: 800,
    customerPaidShipping: 100, // They paid 100
    forwardShippingCost: 60,
    returnShippingCost: 60,
    packagingCost: 15,
    codFee: 50,
    paymentFee: 0,
    allocatedAdCost: 200,
    grossMarginBeforeShipping: 1400,
    grossMarginPct: 0.63,
    contributionMarginBeforeAds: 1215,
    estimatedRtoLossInputs: {
      forwardShipping: 60,
      returnShipping: 60,
      packaging: 15,
      codFee: 50,
      paymentFee: 0,
      cogs: 800,
      customerPaidShipping: 100
    },
    addressCompletenessScore: 0.9,
    province: "Delhi"
  },
  metadata: {
    featureVersion: "order-features-v1",
    dataConfidence: 0.95,
    warnings: [],
    sources: {
      cogs: "MERCHANT_DEFAULT",
      shipping: "WEIGHT_SLAB",
      adCost: "ATTRIBUTED",
      customerHistory: "TEMPORAL_QUERY",
      pincodeHistory: "AGGREGATE_TABLE"
    },
    generatedAt: new Date(),
    generatedFromOrderCreatedAt: new Date()
  }
};

const mockRisk: RTORiskResult = {
  probability: 0.21,
  riskLevel: "MEDIUM",
  confidence: 0.92,
  factors: [],
  warnings: [],
  modelVersion: "risk-engine-v1",
  weightsVersion: "weights-v1",
  confidenceVersion: "confidence-v1"
};

const mockFinancialAssumptions: FinancialAssumptions = {
  inventoryRecoveryRate: 0.95, // 5% damage
  refundsShippingOnRTO: false,
  chargesCodFeeOnRTO: false,
  includesAdCost: true
};

const mockEV: ExpectedValueResult = {
  expectedValue: 891.5,
  expectedROI: 0.36,
  expectedLoss: 36.75,
  deliveryProbability: 0.79,
  rtoProbability: 0.21,
  deliveredScenario: {
    revenue: 2200,
    shippingRevenue: 100,
    cogs: 800,
    forwardShippingCost: 60,
    paymentFee: 0,
    codFee: 50,
    packaging: 15,
    adCost: 200,
    contributionProfit: 1175
  },
  rtoScenario: {
    recoveredInventoryValue: 760,
    inventoryDamage: 40,
    forwardShipping: 60,
    returnShipping: 60,
    packaging: 15,
    customerShippingRefund: 0,
    codFee: 0,
    totalLoss: 175
  },
  assumptions: mockFinancialAssumptions,
  metadata: {
    serviceVersion: "expected-value-v1",
    formulaVersion: "formula-v1",
    assumptionsVersion: "assumptions-v1",
    calculationDate: new Date()
  }
};

const mockInterventions: MerchantInterventionSettings = {
  enabledActions: ["ALLOW_COD", "WHATSAPP_VERIFY", "OTP_VERIFY", "PARTIAL_PAYMENT", "PREPAID_ONLY", "BLOCK_COD"],
  preferredAdvanceAmount: 100,
  otpCost: 2.5,
  otpConversionMultiplier: 0.97, // 3% drop
  otpRiskMultiplier: 0.75,        // 25% risk reduction
  whatsappCost: 1.5,
  whatsappConversionMultiplier: 0.98,
  whatsappRiskMultiplier: 0.85,
  partialPaymentCost: 3.0,
  partialPaymentConversionMultiplier: 0.85, // 15% drop
  partialPaymentRiskMultiplier: 0.35 // 65% risk reduction
};

const mockDecisions: MerchantDecisionSettings = {
  maxFriction: 10,
  minConfidence: 0.5
};

async function run() {
  console.log("=== LIVE INTEGRATION TEST: DECISION ENGINE ===");
  console.log("Evaluating optimal action based on simulated Expected Value...\n");

  const startTime = performance.now();
  const result = DecisionService.evaluate(
    mockFeatures,
    mockRisk,
    mockEV,
    mockDecisions,
    mockInterventions,
    mockFinancialAssumptions
  );
  const endTime = performance.now();

  console.log(JSON.stringify(result, null, 2));
  console.log(`\nExecution time: ${(endTime - startTime).toFixed(3)}ms`);
}

run().catch(console.error);
