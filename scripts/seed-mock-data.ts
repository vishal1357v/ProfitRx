import prisma from "../app/db.server";

const DEFAULT_SHOP = process.env.TARGET_SHOP || "demo-profitrx.myshopify.com";

export async function seedAllFeaturesMockData(customShop?: string) {
  const SHOP = customShop || DEFAULT_SHOP;
  console.log("================================================================================");
  console.log(`SEEDING COMPREHENSIVE MOCK DATA FOR: ${SHOP}`);
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // 1. CLEAN EXISTING DATA FOR THIS SHOP
  // ---------------------------------------------------------------------------
  console.log("1. Cleaning old shop records...");
  await prisma.executionLog.deleteMany({ where: { shop: SHOP } });
  await prisma.learningRecord.deleteMany({ where: { shop: SHOP } });
  await prisma.refundLineItem.deleteMany({ where: { shop: SHOP } });
  await prisma.orderRefund.deleteMany({ where: { shop: SHOP } });
  await prisma.orderLineItem.deleteMany({ where: { shop: SHOP } });
  await prisma.order.deleteMany({ where: { shop: SHOP } });
  await prisma.cODOrder.deleteMany({ where: { shop: SHOP } });
  await prisma.rTOEvent.deleteMany({ where: { shop: SHOP } });
  await prisma.pincodeStats.deleteMany({ where: { shop: SHOP } });
  await prisma.customerRisk.deleteMany({ where: { shop: SHOP } });
  await prisma.customerProfile.deleteMany({ where: { shop: SHOP } });
  await prisma.productCOGS.deleteMany({ where: { shop: SHOP } });
  await prisma.adSpendDaily.deleteMany({ where: { shop: SHOP } });
  await prisma.adSpend.deleteMany({ where: { shop: SHOP } });
  await prisma.profitSnapshot.deleteMany({ where: { shop: SHOP } });
  await prisma.alert.deleteMany({ where: { shop: SHOP } });
  await prisma.subscription.deleteMany({ where: { shop: SHOP } });
  await prisma.session.deleteMany({ where: { shop: SHOP } });

  // ---------------------------------------------------------------------------
  // 1.1 UPSERT DEMO SESSION RECORD
  // ---------------------------------------------------------------------------
  console.log("1.1 Upserting Demo Session record...");
  await prisma.session.upsert({
    where: { id: `offline_${SHOP}` },
    create: {
      id: `offline_${SHOP}`,
      shop: SHOP,
      state: "active",
      isOnline: false,
      scope: "read_products,read_orders,write_orders,read_customers,read_fulfillments,write_metafields,read_metafields,write_payment_customizations",
      accessToken: "shpua_demo_synthetic_token_mock_audit_only",
    },
    update: {
      state: "active",
      isOnline: false,
      scope: "read_products,read_orders,write_orders,read_customers,read_fulfillments,write_metafields,read_metafields,write_payment_customizations",
      accessToken: "shpua_demo_synthetic_token_mock_audit_only",
    },
  });

  // ---------------------------------------------------------------------------
  // 2. STORE SETTINGS & PROTECTION RULES
  // ---------------------------------------------------------------------------
  console.log("2. Upserting Store Settings & Protection Policy...");
  await prisma.storeSettings.upsert({
    where: { shop: SHOP },
    create: {
      shop: SHOP,
      currency: "INR",
      timezone: "Asia/Kolkata",
      defaultCOGSPct: 38,
      defaultForwardShipping: 65,
      defaultReturnShipping: 75,
      defaultPackaging: 15,
      defaultCODHandling: 40,
      defaultGatewayFeePct: 2.0,
      gatewayFixedFee: 0,
      gstin: "07AAAAA0000A1Z5",
      merchantState: "Delhi",
      gstRate: 18,
      isGstRegistered: true,
      shopifyPlanName: "Shopify",
      protectionMode: "REVIEW",
      codBlockingEnabled: true,
      codBlockedPincodes: ["800001", "800002", "700001", "400001"],
      rulesDisableCodForPincodes: ["800001", "800002", "700001", "400001"],
      rulesRejectCodOver: 6000,
      rulesAutoRequireOtp: true,
      rulesAutoFlagRepeatOffenders: true,
      rulesRepeatOffenderThreshold: 2,
      rulesRepeatOffenderAction: "OTP",
      otpVerificationEnabled: true,
      partialPaymentEnabled: true,
      partialPaymentAmount: 100,
      codFeeEnabled: true,
      codFeeAmount: 40,
      codFeeType: "fixed",
      onboardingCompleted: true,
      onboardingStep: 4,
      shippingSlabs: [
        { maxWeightGrams: 500, forwardCost: 65, returnCost: 75 },
        { maxWeightGrams: 1000, forwardCost: 95, returnCost: 110 },
        { maxWeightGrams: 2000, forwardCost: 140, returnCost: 160 },
      ],
    },
    update: {
      defaultCOGSPct: 38,
      defaultForwardShipping: 65,
      defaultReturnShipping: 75,
      defaultPackaging: 15,
      defaultCODHandling: 40,
      defaultGatewayFeePct: 2.0,
      gatewayFixedFee: 0,
      gstin: "07AAAAA0000A1Z5",
      merchantState: "Delhi",
      gstRate: 18,
      isGstRegistered: true,
      protectionMode: "REVIEW",
      codBlockingEnabled: true,
      codBlockedPincodes: ["800001", "800002", "700001", "400001"],
      rulesDisableCodForPincodes: ["800001", "800002", "700001", "400001"],
      rulesRejectCodOver: 6000,
      rulesAutoRequireOtp: true,
      rulesAutoFlagRepeatOffenders: true,
      rulesRepeatOffenderThreshold: 2,
      rulesRepeatOffenderAction: "OTP",
      otpVerificationEnabled: true,
      partialPaymentEnabled: true,
      partialPaymentAmount: 100,
      codFeeEnabled: true,
      codFeeAmount: 40,
      onboardingCompleted: true,
    },
  });

  // ---------------------------------------------------------------------------
  // 3. PRODUCT COGS CATALOG
  // ---------------------------------------------------------------------------
  console.log("3. Seeding Product COGS Catalog...");
  const shopPrefix = SHOP.replace(/[^a-zA-Z0-9]/g, "_");
  const scopedOrderId = (id: string) => `${shopPrefix}_${id}`;
  const scopedCustId = (id: string) => `${shopPrefix}_${id}`;
  const scopedLineItemId = (id: string) => `${shopPrefix}_${id}`;
  const scopedProductId = (id: string) => `gid://shopify/Product/${shopPrefix}_${id}`;

  const products = [
    { id: "101", title: "Oversized Heavyweight Graphic Tee", cost: 320 },
    { id: "102", title: "Premium Fleece Pullover Hoodie", cost: 650 },
    { id: "103", title: "Tactical Cargo Utility Joggers", cost: 480 },
    { id: "104", title: "Classic Pure Linen Button-down Shirt", cost: 550 },
    { id: "105", title: "Handcrafted Leather Chelsea Boots", cost: 1200 },
    { id: "106", title: "Quilted Winter Bomber Jacket", cost: 850 },
  ];

  for (const p of products) {
    await prisma.productCOGS.create({
      data: {
        shop: SHOP,
        productId: scopedProductId(p.id),
        cost: p.cost,
        cogs: p.cost,
        source: "manual_override",
        manualOverride: p.cost,
        shopifyNative: p.cost * 0.9,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 4. CUSTOMER RISK PROFILES
  // ---------------------------------------------------------------------------
  console.log("4. Seeding Customer Risk Profiles...");
  const customers = [
    {
      id: "cust-101",
      name: "Vikram Malhotra",
      email: "vikram.m@example.com",
      phone: "+919876543210",
      totalOrders: 6,
      codOrders: 3,
      prepaidOrders: 3,
      successfulDeliveries: 6,
      rtoCount: 0,
      aov: 2450,
      lifetimeSpend: 14700,
      riskScore: 4,
      riskLevel: "LOW",
    },
    {
      id: "cust-102",
      name: "Ananya Sharma",
      email: "ananya.s@example.com",
      phone: "+919811223344",
      totalOrders: 4,
      codOrders: 2,
      prepaidOrders: 2,
      successfulDeliveries: 4,
      rtoCount: 0,
      aov: 1890,
      lifetimeSpend: 7560,
      riskScore: 8,
      riskLevel: "LOW",
    },
    {
      id: "cust-103",
      name: "Rahul Verma",
      email: "rahul.v@example.com",
      phone: "+919822334455",
      totalOrders: 2,
      codOrders: 2,
      prepaidOrders: 0,
      successfulDeliveries: 2,
      rtoCount: 0,
      aov: 1599,
      lifetimeSpend: 3198,
      riskScore: 18,
      riskLevel: "LOW",
    },
    {
      id: "cust-104",
      name: "Rohan Joshi",
      email: "rohan.j@example.com",
      phone: "+919833445566",
      totalOrders: 4,
      codOrders: 4,
      prepaidOrders: 0,
      successfulDeliveries: 1,
      rtoCount: 3,
      aov: 2800,
      lifetimeSpend: 2800,
      riskScore: 78,
      riskLevel: "HIGH",
    },
    {
      id: "cust-105",
      name: "Suresh Kumar",
      email: "suresh.k@example.com",
      phone: "+919844556677",
      totalOrders: 4,
      codOrders: 4,
      prepaidOrders: 0,
      successfulDeliveries: 0,
      rtoCount: 4,
      aov: 3200,
      lifetimeSpend: 0,
      riskScore: 95,
      riskLevel: "CRITICAL",
    },
    {
      id: "cust-106",
      name: "Pooja Mehta",
      email: "pooja.m@example.com",
      phone: "+919855667788",
      totalOrders: 3,
      codOrders: 1,
      prepaidOrders: 2,
      successfulDeliveries: 3,
      rtoCount: 0,
      aov: 2100,
      lifetimeSpend: 6300,
      riskScore: 12,
      riskLevel: "LOW",
    },
    {
      id: "cust-107",
      name: "Karan Singhania",
      email: "karan.s@example.com",
      phone: "+919866778899",
      totalOrders: 5,
      codOrders: 3,
      prepaidOrders: 2,
      successfulDeliveries: 3,
      rtoCount: 1,
      aov: 1950,
      lifetimeSpend: 7800,
      riskScore: 42,
      riskLevel: "MEDIUM",
    },
  ];

  for (const c of customers) {
    const cId = scopedCustId(c.id);
    await prisma.customerRisk.create({
      data: {
        shop: SHOP,
        customerId: cId,
        phone: c.phone,
        email: c.email,
        totalOrders: c.totalOrders,
        codOrders: c.codOrders,
        prepaidOrders: c.prepaidOrders,
        successfulDeliveries: c.successfulDeliveries,
        rtoCount: c.rtoCount,
        aov: c.aov,
        lifetimeSpend: c.lifetimeSpend,
        riskScore: c.riskScore,
        riskLevel: c.riskLevel,
        lastOrderDate: new Date(Date.now() - 86400000 * 2),
      },
    });

    await prisma.customerProfile.create({
      data: {
        shop: SHOP,
        customerId: cId,
        customerName: c.name,
        customerEmail: c.email,
        orderCount: c.totalOrders,
        totalRevenue: c.lifetimeSpend,
        totalProfit: c.lifetimeSpend * 0.45,
        ltv: c.lifetimeSpend,
        aov: c.aov,
        repeatRate: c.totalOrders > 1 ? 75 : 0,
        cohortMonth: "2026-01",
        channelSource: "Website",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 5. PINCODE STATS & HEATMAP
  // ---------------------------------------------------------------------------
  console.log("5. Seeding Pincode RTO Stats...");
  const pincodes = [
    { pincode: "110001", city: "New Delhi", province: "Delhi", total: 54, cod: 32, rto: 1, loss: 140, risk: "LOW" },
    { pincode: "400001", city: "Mumbai", province: "Maharashtra", total: 48, cod: 28, rto: 2, loss: 280, risk: "LOW" },
    { pincode: "560001", city: "Bengaluru", province: "Karnataka", total: 62, cod: 35, rto: 2, loss: 310, risk: "LOW" },
    { pincode: "500001", city: "Hyderabad", province: "Telangana", total: 40, cod: 25, rto: 3, loss: 420, risk: "LOW" },
    { pincode: "800001", city: "Patna", province: "Bihar", total: 28, cod: 24, rto: 11, loss: 2450, risk: "CRITICAL" },
    { pincode: "800002", city: "Patna", province: "Bihar", total: 18, cod: 16, rto: 7, loss: 1550, risk: "CRITICAL" },
    { pincode: "700001", city: "Kolkata", province: "West Bengal", total: 34, cod: 26, rto: 9, loss: 1980, risk: "HIGH" },
    { pincode: "208001", city: "Kanpur", province: "Uttar Pradesh", total: 22, cod: 18, rto: 5, loss: 920, risk: "MEDIUM" },
    { pincode: "302001", city: "Jaipur", province: "Rajasthan", total: 26, cod: 17, rto: 2, loss: 290, risk: "LOW" },
    { pincode: "600001", city: "Chennai", province: "Tamil Nadu", total: 36, cod: 19, rto: 1, loss: 150, risk: "LOW" },
  ];

  for (const p of pincodes) {
    const rtoRate = p.cod > 0 ? (p.rto / p.cod) * 100 : 0;
    const successful = p.total - p.rto;
    await prisma.pincodeStats.create({
      data: {
        shop: SHOP,
        pincode: p.pincode,
        city: p.city,
        province: p.province,
        totalOrders: p.total,
        codOrders: p.cod,
        rtoCount: p.rto,
        totalLoss: p.loss,
        rtoRate: Math.round(rtoRate * 10) / 10,
        riskLevel: p.risk,
        successfulDeliveries: successful,
        deliveryRate: Math.round((successful / p.total) * 1000) / 10,
        aov: 2150,
        revenue: p.total * 2150,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 6. ORDERS, LINE ITEMS, EXECUTION LOGS & COD VERIFICATIONS
  // ---------------------------------------------------------------------------
  console.log("6. Seeding Comprehensive Orders & Intelligence...");
  const mockOrders = [
    {
      id: "ord-1001",
      orderNumber: 1001,
      totalPrice: 1899,
      subtotalPrice: 1799,
      totalTax: 100,
      shippingPrice: 0,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      financialStatus: "pending",
      fulfillmentStatus: "fulfilled",
      productId: "102",
      totalWeight: 650,
      cogsAtTimeOfOrder: 650,
      customer: customers[0],
      pincode: "110001",
      city: "New Delhi",
      province: "Delhi",
      riskScore: 12,
      riskLevel: "LOW",
      rec: "ALLOW_COD",
      createdAt: new Date(Date.now() - 86400000 * 5),
      lineItems: [
        {
          id: "li-1001",
          productId: "102",
          title: "Premium Fleece Pullover Hoodie",
          variantTitle: "Heather Grey / L",
          quantity: 1,
          price: 1899,
        },
      ],
      execStatus: "SUCCESS",
      execLogs: [
        { step: "FEATURE_EXTRACTION", status: "SUCCESS", msg: "Extracted 14 order features (Confidence: 88%)" },
        { step: "RISK_CALCULATION", status: "SUCCESS", msg: "Evaluated RTO probability at 12% (LOW)" },
        { step: "DECISION", status: "SUCCESS", msg: "Positive expected value ₹1,040. Recommended ALLOW_COD" },
        { step: "EXECUTION", status: "SUCCESS", msg: "Order tagged [ProfitRx: Safe COD]" },
      ],
    },
    {
      id: "ord-1002",
      orderNumber: 1002,
      totalPrice: 3499,
      subtotalPrice: 3349,
      totalTax: 150,
      shippingPrice: 0,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      financialStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      productId: "105",
      totalWeight: 1200,
      cogsAtTimeOfOrder: 1200,
      customer: customers[4], // Suresh Kumar (Repeat Offender)
      pincode: "800001", // Blocked Pincode
      city: "Patna",
      province: "Bihar",
      riskScore: 88,
      riskLevel: "CRITICAL",
      rec: "BLOCK_COD",
      createdAt: new Date(Date.now() - 3600000 * 2), // 2h ago (Needs Attention!)
      lineItems: [
        {
          id: "li-1002",
          productId: "105",
          title: "Handcrafted Leather Chelsea Boots",
          variantTitle: "Tan Brown / 42",
          quantity: 1,
          price: 3499,
        },
      ],
      execStatus: "PENDING_MERCHANT_REVIEW",
      execLogs: [
        { step: "FEATURE_EXTRACTION", status: "SUCCESS", msg: "Extracted 14 order features (Confidence: 92%)" },
        { step: "RISK_CALCULATION", status: "SUCCESS", msg: "Critical risk: Blocked pincode 800001 & Customer 100% past RTO rate" },
        { step: "DECISION", status: "SUCCESS", msg: "Negative EV (-₹450). Recommended BLOCK_COD" },
        { step: "EXECUTION", status: "PENDING", msg: "Awaiting merchant approval under REVIEW mode" },
      ],
    },
    {
      id: "ord-1003",
      orderNumber: 1003,
      totalPrice: 4398,
      subtotalPrice: 4198,
      totalTax: 200,
      shippingPrice: 0,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      financialStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      productId: "106",
      totalWeight: 1400,
      cogsAtTimeOfOrder: 1700,
      customer: customers[6], // Karan Singhania
      pincode: "560001",
      city: "Bengaluru",
      province: "Karnataka",
      riskScore: 54,
      riskLevel: "HIGH",
      rec: "OTP_VERIFY",
      createdAt: new Date(Date.now() - 3600000 * 4), // 4h ago
      lineItems: [
        {
          id: "li-1003-1",
          productId: "106",
          title: "Quilted Winter Bomber Jacket",
          variantTitle: "Olive / XL",
          quantity: 1,
          price: 2499,
        },
        {
          id: "li-1003-2",
          productId: "102",
          title: "Premium Fleece Pullover Hoodie",
          variantTitle: "Black / XL",
          quantity: 1,
          price: 1899,
        },
      ],
      execStatus: "SUCCESS",
      execLogs: [
        { step: "FEATURE_EXTRACTION", status: "SUCCESS", msg: "Extracted features (Confidence: 85%)" },
        { step: "RISK_CALCULATION", status: "SUCCESS", msg: "High value COD order (₹4,398) with moderate buyer history" },
        { step: "DECISION", status: "SUCCESS", msg: "Recommended OTP_VERIFY to protect ₹380 freight exposure" },
        { step: "EXECUTION", status: "SUCCESS", msg: "WhatsApp OTP sent to +919866778899" },
      ],
      codOrder: {
        phone: "+919866778899",
        otp: "582910",
        otpAttempts: 1,
        otpVerified: false,
        status: "OTP_SENT",
      },
    },
    {
      id: "ord-1004",
      orderNumber: 1004,
      totalPrice: 2998,
      subtotalPrice: 2848,
      totalTax: 150,
      shippingPrice: 0,
      isCOD: false,
      gateway: "Razorpay / UPI",
      financialStatus: "paid",
      fulfillmentStatus: "fulfilled",
      productId: "103",
      totalWeight: 800,
      cogsAtTimeOfOrder: 960,
      customer: customers[1], // Ananya Sharma
      pincode: "400001",
      city: "Mumbai",
      province: "Maharashtra",
      riskScore: 5,
      riskLevel: "LOW",
      rec: "ALLOW_COD",
      createdAt: new Date(Date.now() - 86400000 * 2),
      lineItems: [
        {
          id: "li-1004",
          productId: "103",
          title: "Tactical Cargo Utility Joggers",
          variantTitle: "Khaki / M",
          quantity: 2,
          price: 1499,
        },
      ],
      execStatus: "SUCCESS",
      execLogs: [
        { step: "FEATURE_EXTRACTION", status: "SUCCESS", msg: "Extracted features for prepaid order" },
        { step: "RISK_CALCULATION", status: "SUCCESS", msg: "Prepaid order, negligible RTO risk (5%)" },
        { step: "DECISION", status: "SUCCESS", msg: "Prepaid confirmed. Full margin protection." },
      ],
    },
    {
      id: "ord-1005",
      orderNumber: 1005,
      totalPrice: 2499,
      subtotalPrice: 2349,
      totalTax: 150,
      shippingPrice: 0,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      financialStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      productId: "106",
      totalWeight: 850,
      cogsAtTimeOfOrder: 850,
      customer: customers[3], // Rohan Joshi (3 RTOs)
      pincode: "700001", // Kolkata
      city: "Kolkata",
      province: "West Bengal",
      riskScore: 82,
      riskLevel: "CRITICAL",
      rec: "BLOCK_COD",
      createdAt: new Date(Date.now() - 3600000 * 6),
      lineItems: [
        {
          id: "li-1005",
          productId: "106",
          title: "Quilted Winter Bomber Jacket",
          variantTitle: "Navy / L",
          quantity: 1,
          price: 2499,
        },
      ],
      execStatus: "SUCCESS",
      execLogs: [
        { step: "FEATURE_EXTRACTION", status: "SUCCESS", msg: "Identified repeat offender customer phone" },
        { step: "RISK_CALCULATION", status: "SUCCESS", msg: "Calculated 82% RTO risk based on 3 previous failed deliveries" },
        { step: "DECISION", status: "SUCCESS", msg: "Recommended BLOCK_COD / Require Prepaid Deposit" },
        {
          step: "MERCHANT_OVERRIDE",
          status: "SUCCESS",
          msg: "Merchant manually changed decision to ALLOW_COD. Reason: Customer confirmed over phone and sent ₹500 advance deposit via UPI",
          data: {
            previousAction: "BLOCK_COD",
            overriddenAction: "ALLOW_COD",
            actor: "MERCHANT",
            reason: "Customer confirmed over phone and sent ₹500 advance deposit via UPI",
            timestamp: new Date().toISOString(),
          },
        },
      ],
    },
    {
      id: "ord-1006",
      orderNumber: 1006,
      totalPrice: 1299,
      subtotalPrice: 1199,
      totalTax: 100,
      shippingPrice: 0,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      financialStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      productId: "999", // Missing SKU COGS
      totalWeight: 400,
      cogsAtTimeOfOrder: null, // Fallback to 38% estimated COGS
      customer: customers[2],
      pincode: "500001",
      city: "Hyderabad",
      province: "Telangana",
      riskScore: 28,
      riskLevel: "LOW",
      rec: "ALLOW_COD",
      createdAt: new Date(Date.now() - 3600000 * 8),
      lineItems: [
        {
          id: "li-1006",
          productId: "999",
          title: "Uncatalogued Summer Beach Shorts",
          variantTitle: "Floral / M",
          quantity: 1,
          price: 1299,
        },
      ],
      execStatus: "ADVISORY_ONLY",
      execLogs: [
        { step: "FEATURE_EXTRACTION", status: "SUCCESS", msg: "Missing SKU COGS: defaulted to store policy 38% (ESTIMATED)" },
        { step: "RISK_CALCULATION", status: "SUCCESS", msg: "RTO risk evaluated at 28% (LOW)" },
        { step: "DECISION", status: "SUCCESS", msg: "ALLOW_COD (Estimated profit: ₹580)" },
      ],
    },
    {
      id: "ord-1007",
      orderNumber: 1007,
      totalPrice: 1699,
      subtotalPrice: 1599,
      totalTax: 100,
      shippingPrice: 0,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      financialStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      productId: "104",
      totalWeight: 450,
      cogsAtTimeOfOrder: 550,
      customer: customers[5], // Pooja Mehta
      pincode: "302001",
      city: "Jaipur",
      province: "Rajasthan",
      riskScore: 15,
      riskLevel: "LOW",
      rec: "ALLOW_COD",
      createdAt: new Date(Date.now() - 3600000 * 12),
      lineItems: [
        {
          id: "li-1007",
          productId: "104",
          title: "Classic Pure Linen Button-down Shirt",
          variantTitle: "Sky Blue / M",
          quantity: 1,
          price: 1699,
        },
      ],
      execStatus: "SUCCESS",
      execLogs: [
        { step: "FEATURE_EXTRACTION", status: "SUCCESS", msg: "Extracted features (Confidence: 89%)" },
        { step: "RISK_CALCULATION", status: "SUCCESS", msg: "Low RTO risk (15%)" },
        { step: "DECISION", status: "SUCCESS", msg: "Positive EV ₹880. Recommended ALLOW_COD" },
      ],
      codOrder: {
        phone: "+919855667788",
        otp: "392014",
        otpAttempts: 1,
        otpVerified: true,
        status: "VERIFIED",
      },
    },
    {
      id: "ord-1008",
      orderNumber: 1008,
      totalPrice: 2699,
      subtotalPrice: 2549,
      totalTax: 150,
      shippingPrice: 0,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      financialStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      productId: "103",
      totalWeight: 900,
      cogsAtTimeOfOrder: 960,
      customer: customers[6],
      pincode: "208001",
      city: "Kanpur",
      province: "Uttar Pradesh",
      riskScore: 65,
      riskLevel: "HIGH",
      rec: "OTP_VERIFY",
      createdAt: new Date(Date.now() - 3600000 * 1), // 1h ago (Needs Attention: Failed!)
      lineItems: [
        {
          id: "li-1008",
          productId: "103",
          title: "Tactical Cargo Utility Joggers",
          variantTitle: "Black / XL",
          quantity: 1,
          price: 1499,
        },
        {
          id: "li-1008-2",
          productId: "101",
          title: "Oversized Heavyweight Graphic Tee",
          variantTitle: "White / XL",
          quantity: 1,
          price: 899,
        },
      ],
      execStatus: "FAILED",
      execLogs: [
        { step: "FEATURE_EXTRACTION", status: "SUCCESS", msg: "Extracted features (Confidence: 82%)" },
        { step: "RISK_CALCULATION", status: "SUCCESS", msg: "Elevated risk 65% in Kanpur" },
        { step: "DECISION", status: "SUCCESS", msg: "Recommended OTP_VERIFY" },
        {
          step: "EXECUTION",
          status: "FAILED",
          msg: "WhatsApp API Gateway Timeout (HTTP 504 Gateway Timeout). Retry queued.",
          data: { error: "ETIMEDOUT", provider: "META_WHATSAPP", retryable: true },
        },
      ],
      codOrder: {
        phone: "+919866778899",
        otp: "748192",
        otpAttempts: 0,
        otpVerified: false,
        status: "FAILED",
      },
    },
    {
      id: "ord-1009",
      orderNumber: 1009,
      totalPrice: 1798,
      subtotalPrice: 1698,
      totalTax: 100,
      shippingPrice: 0,
      isCOD: true,
      gateway: "Cash on Delivery (COD)",
      financialStatus: "pending",
      fulfillmentStatus: "rto", // Actual RTO Return
      productId: "101",
      totalWeight: 600,
      cogsAtTimeOfOrder: 640,
      customer: customers[3], // Rohan Joshi
      pincode: "800002",
      city: "Patna",
      province: "Bihar",
      riskScore: 75,
      riskLevel: "HIGH",
      rec: "BLOCK_COD",
      createdAt: new Date(Date.now() - 86400000 * 7),
      lineItems: [
        {
          id: "li-1009",
          productId: "101",
          title: "Oversized Heavyweight Graphic Tee",
          variantTitle: "Vintage Black / L",
          quantity: 2,
          price: 899,
        },
      ],
      execStatus: "SUCCESS",
      execLogs: [
        { step: "FEATURE_EXTRACTION", status: "SUCCESS", msg: "Extracted order signals" },
        { step: "RISK_CALCULATION", status: "SUCCESS", msg: "High RTO risk (75%)" },
        { step: "EXECUTION", status: "SUCCESS", msg: "Order flagged for RTO risk" },
      ],
    },
  ];

  for (const o of mockOrders) {
    const oId = scopedOrderId(o.id);
    const cId = scopedCustId(o.customer.id);
    const pId = o.productId ? scopedProductId(o.productId) : null;

    await prisma.order.create({
      data: {
        id: oId,
        shop: SHOP,
        orderNumber: o.orderNumber,
        totalPrice: o.totalPrice,
        subtotalPrice: o.subtotalPrice,
        totalTax: o.totalTax,
        shippingPrice: o.shippingPrice,
        isCOD: o.isCOD,
        gateway: o.gateway,
        financialStatus: o.financialStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        productId: pId,
        totalWeight: o.totalWeight,
        cogsAtTimeOfOrder: o.cogsAtTimeOfOrder,
        customerId: cId,
        customerName: o.customer.name,
        customerEmail: o.customer.email,
        pincode: o.pincode,
        city: o.city,
        province: o.province,
        riskScore: o.riskScore,
        riskLevel: o.riskLevel,
        merchantRecommendation: o.rec,
        createdAt: o.createdAt,
        processedAt: o.createdAt,
      },
    });

    // Insert line items
    for (const li of o.lineItems) {
      const liId = scopedLineItemId(li.id);
      const liProdId = li.productId ? scopedProductId(li.productId) : null;
      await prisma.orderLineItem.create({
        data: {
          id: liId,
          orderId: oId,
          shop: SHOP,
          shopifyLineItemId: liId,
          productId: liProdId,
          title: li.title,
          variantTitle: li.variantTitle,
          quantity: li.quantity,
          unitPrice: li.price,
          originalUnitPrice: li.price,
        },
      });
    }

    // Insert execution logs
    for (const log of o.execLogs) {
      await prisma.executionLog.create({
        data: {
          shop: SHOP,
          orderId: oId,
          step: log.step,
          status: log.status,
          message: log.msg,
          data: (log as any).data || undefined,
        },
      });
    }

    // Insert COD verification if applicable
    if (o.codOrder) {
      await prisma.cODOrder.create({
        data: {
          orderId: oId,
          shop: SHOP,
          phone: o.codOrder.phone,
          otp: o.codOrder.otp,
          otpAttempts: o.codOrder.otpAttempts,
          otpVerified: o.codOrder.otpVerified,
          status: o.codOrder.status,
          otpSentAt: new Date(Date.now() - 3600000 * 2),
          otpVerifiedAt: o.codOrder.otpVerified ? new Date() : null,
        },
      });
    }

    // Insert RTO event if status is rto
    if (o.fulfillmentStatus === "rto") {
      await prisma.rTOEvent.create({
        data: {
          shop: SHOP,
          orderId: oId,
          orderNumber: o.orderNumber,
          eventType: "RTO",
          reason: "Customer unavailable / Refused on delivery",
          amount: 220,
          status: "CONFIRMED",
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 7. DAILY PROFIT SNAPSHOTS (LAST 30 DAYS)
  // ---------------------------------------------------------------------------
  console.log("7. Seeding 30-Day Daily Financial Snapshots...");
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dayRevenue = Math.round(18000 + Math.sin(i) * 6000 + (30 - i) * 300);
    const dayCogs = Math.round(dayRevenue * 0.36);
    const dayFees = Math.round(dayRevenue * 0.08);
    const dayRtoLoss = Math.round(800 + Math.cos(i) * 400);
    const dayProfit = Math.round(dayRevenue - dayCogs - dayFees - dayRtoLoss);
    const margin = Math.round((dayProfit / dayRevenue) * 1000) / 10;

    await prisma.profitSnapshot.create({
      data: {
        shop: SHOP,
        date: new Date(d.toISOString().slice(0, 10)),
        revenue: dayRevenue,
        profit: dayProfit,
        margin,
        cogs: dayCogs,
        fees: dayFees,
        rtoLoss: dayRtoLoss,
        shippingOverage: Math.round(dayRtoLoss * 0.3),
        discountLoss: Math.round(dayRevenue * 0.05),
        totalLeak: Math.round(dayRtoLoss + dayRevenue * 0.05),
        rtoRate: Math.round((dayRtoLoss / dayRevenue) * 1000) / 10,
        codRate: 65.0,
        healthStatus: margin > 40 ? "HEALTHY" : margin > 25 ? "WARNING" : "CRITICAL",
        healthReasons: ["COD volume stable at 65%", "RTO loss well-contained below 8%"],
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 8. AD SPEND & DAILY ATTRIBUTION (META & GOOGLE)
  // ---------------------------------------------------------------------------
  console.log("8. Seeding Ad Spend Tracking & Daily Channel Attribution...");
  await prisma.adSpend.create({
    data: {
      shop: SHOP,
      platform: "meta",
      accountId: "act_4920194019",
      isConnected: true,
      lastSyncedAt: new Date(),
    },
  });

  await prisma.adSpend.create({
    data: {
      shop: SHOP,
      platform: "google",
      accountId: "839-291-0492",
      isConnected: true,
      lastSyncedAt: new Date(),
    },
  });

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const metaSpend = Math.round(2500 + Math.sin(i) * 800);
    const googleSpend = Math.round(1800 + Math.cos(i) * 500);

    await prisma.adSpendDaily.create({
      data: {
        shop: SHOP,
        platform: "meta",
        date: new Date(d.toISOString().slice(0, 10)),
        spend: metaSpend,
        clicks: Math.round(metaSpend / 14),
        impressions: Math.round((metaSpend / 14) * 85),
      },
    });

    await prisma.adSpendDaily.create({
      data: {
        shop: SHOP,
        platform: "google",
        date: new Date(d.toISOString().slice(0, 10)),
        spend: googleSpend,
        clicks: Math.round(googleSpend / 18),
        impressions: Math.round((googleSpend / 18) * 60),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 9. STORE HEALTH ALERTS
  // ---------------------------------------------------------------------------
  console.log("9. Seeding Store Intelligence Alerts...");
  await prisma.alert.create({
    data: {
      shop: SHOP,
      type: "HIGH_RTO",
      severity: "CRITICAL",
      message: "Elevated RTO rate in Patna (42% RTO across 28 COD orders). Pincode 800001 automatically blocked.",
      data: { pincode: "800001", rtoRate: 42.0, loss: 2450 },
      isRead: false,
    },
  });

  await prisma.alert.create({
    data: {
      shop: SHOP,
      type: "LOW_MARGIN",
      severity: "WARNING",
      message: "2 pending COD orders over ₹3,000 threshold awaiting merchant review or OTP verification.",
      data: { ordersCount: 2, totalValue: 7897 },
      isRead: false,
    },
  });

  await prisma.alert.create({
    data: {
      shop: SHOP,
      type: "PROFIT_DROP",
      severity: "INFO",
      message: "ProfitRx prevented an estimated ₹14,250 in freight & shrinkage loss over the last 30 days.",
      data: { savedLoss: 14250 },
      isRead: false,
    },
  });

  // ---------------------------------------------------------------------------
  // 10. ACTIVE SUBSCRIPTION
  // ---------------------------------------------------------------------------
  console.log("10. Seeding Active Subscription...");
  await prisma.subscription.create({
    data: {
      shop: SHOP,
      plan: "GROWTH",
      status: "ACTIVE",
      shopifyChargeId: "gid://shopify/AppSubscription/9920194",
      orderLimit: 2000,
      ordersUsed: 342,
      trialEndsAt: new Date(Date.now() + 86400000 * 14),
      expiresAt: new Date(Date.now() + 86400000 * 30),
    },
  });

  console.log("\n================================================================================");
  console.log("✅ ALL FEATURES MOCK DATA SUCCESSFULLY SEEDED!");
  console.log("================================================================================");
}

seedAllFeaturesMockData()
  .catch((err) => {
    console.error("Error seeding mock data:", err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
