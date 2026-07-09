import { describe, it, expect } from "vitest";
import { ProfitService } from "./profit.service";

describe("ProfitService — Trust the Math Suite", () => {
  const defaultSettings = {
    defaultGatewayFeePct: 2, // 2% Razorpay / Gateway
    defaultCODHandling: 50,  // ₹50 COD Remittance Fee
    defaultForwardShipping: 60,
    defaultReturnShipping: 70,
    gatewayFixedFee: 0,
    defaultPackaging: 10,
    shopifyPlanName: "Basic", // 2% Shopify Surcharge
  };

  it("1) Prepaid Order with 2% Razorpay fee AND 1% Shopify fee (plus 18% GST)", () => {
    const settings = {
      ...defaultSettings,
      defaultGatewayFeePct: 2,
      shopifyPlanName: "Shopify", // 1% Shopify fee -> Total rate = 3%
    };

    const order = {
      totalPrice: 1000,
      isCOD: false,
      gateway: "Razorpay / Prepaid",
      totalTax: 180,
      shippingPrice: 60,
    };

    const cogs = 400;

    // Surcharge calculation:
    // Razorpay = 2%, Shopify Grow = 1% => Total = 3% = 0.03
    // Raw gateway fee = 1000 * 0.03 = 30
    // Fee with 18% GST = 30 * 1.18 = 35.4
    // Total fees = tax(180) + forwardShipping(60) + gatewayFee(35.4) + codFee(0) + packaging(10) = 285.4
    // Expected Profit = 1000 - 400 - 285.4 = 314.6

    const result = ProfitService.calculateOrderProfit(order, cogs, settings);

    expect(result.fees).toBeCloseTo(285.4, 2);
    expect(result.profit).toBeCloseTo(314.6, 2);
    expect(result.margin).toBeCloseTo(31.46, 2);
  });

  it("2) COD Order with flat ₹50 COD remittance fee (0% payment gateway fee)", () => {
    const order = {
      totalPrice: 1000,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      totalTax: 180,
      shippingPrice: 60,
    };

    const cogs = 400;

    // Gateway fee must be strictly 0
    // Total fees = tax(180) + forwardShipping(60) + gatewayFee(0) + codHandling(50) + packaging(10) = 300
    // Expected Profit = 1000 - 400 - 300 = 300

    const result = ProfitService.calculateOrderProfit(order, cogs, defaultSettings);

    expect(result.fees).toEqual(300);
    expect(result.profit).toEqual(300);
    expect(result.margin).toEqual(30);
  });

  it("3) RTO Order with ₹100 partial payment collected upfront (offsets RTO loss)", () => {
    const rtoOrder = {
      isCOD: true,
      fulfillmentStatus: "RTO-Initiated",
      partialDepositCollected: 100, // ₹100 deposit collected upfront
    };

    const settings = {
      defaultForwardShipping: 60,
      defaultReturnShipping: 70,
    };

    // Raw RTO freight loss = forward(60) + return(70) = 130
    // Net RTO Loss after ₹100 deposit offset = 130 - 100 = 30

    const netLoss = ProfitService.calculateRTOLoss(rtoOrder, settings);
    expect(netLoss).toEqual(30);
  });

  it("4) 18% GST calculation on payment fees", () => {
    const settings = {
      ...defaultSettings,
      defaultGatewayFeePct: 2,
      shopifyPlanName: "Plus", // 0.15% surcharge -> Total = 2.15% = 0.0215
    };

    const order = {
      totalPrice: 2000,
      isCOD: false,
      gateway: "Card",
      totalTax: 360,
      shippingPrice: 60,
    };

    // Raw gateway fee = 2000 * 0.0215 = 43
    // Fee with 18% GST = 43 * 1.18 = 50.74

    const result = ProfitService.calculateOrderProfit(order, 800, settings);
    const expectedFees = 360 + 60 + 50.74 + 10; // tax + shipping + gatewayWithGST + packaging = 480.74
    expect(result.fees).toBeCloseTo(expectedFees, 2);
  });

  it("5) RTO Profit Calculation matches: Revenue = 0, COGS = 0, fees include returnShipping", () => {
    const settings = {
      ...defaultSettings,
      defaultReturnShipping: 70,
      defaultForwardShipping: 60,
      defaultPackaging: 10,
    };

    const order = {
      totalPrice: 1500,
      isCOD: true,
      gateway: "COD",
      totalTax: 270,
      fulfillmentStatus: "RTO",
    };

    // Since it's RTO:
    // Revenue = 0
    // COGS = 0
    // Fees = totalTax(0) + forwardShipping(60) + returnShipping(70) + packaging(10) + gateway(0) + cod(0) = 140
    // Expected profit = 0 - 0 - 140 = -140
    const result = ProfitService.calculateOrderProfit(order, 600, settings);
    expect(result.profit).toEqual(-140);
    expect(result.fees).toEqual(140);
  });
});
