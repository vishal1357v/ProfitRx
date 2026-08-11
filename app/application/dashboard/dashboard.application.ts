import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import prisma from "../../db.server";
import { ProfitService } from "../../services/profit.service";
import { ShopifyService } from "../../services/shopify.service";
import { ProfitIntelligenceService } from "../../services/profit-intelligence.service";
import { normalizePlanName, PLAN_FEATURES } from "../../services/feature-access.service";
import { syncSubscriptionWithShopify } from "../../services/subscription-sync.service";
import { AdSpendService } from "../../services/ad-spend.service";

const isCodGateway = (gateway: string | null) => {
  if (!gateway) return false;
  const lower = gateway.toLowerCase();
  return lower.includes("cod") || lower.includes("cash") || lower.includes("manual");
};

export class DashboardApplicationService {
  /**
   * Extracted from legacy route.
   * This handles the complex data aggregation for the dashboard UI.
   */
  static async getDashboardData(request: Request) {
    
  let session: any;
  let billing: any;
  let admin: any;
  let shop = "";
  let host = "";

  try {
    const url = new URL(request.url);
    host = url.searchParams.get("host") || "";
    const shopParam = url.searchParams.get("shop") || "";

    if (!host && shopParam) {
      const storeHandle = shopParam.replace(".myshopify.com", "");
      host = Buffer.from(`admin.shopify.com/store/${storeHandle}`).toString("base64");
      url.searchParams.set("host", host);
      request = new Request(url.toString(), request);
    }

    const auth = await authenticate.admin(request);
    session = auth.session;
    billing = auth.billing;
    admin = auth.admin;
    shop = session.shop;
  } catch (authErr: any) {
    const url = new URL(request.url);
    const shopFallback = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "";
    const reauthFailed = url.searchParams.get("reauth_failed") === "true";

    if (authErr instanceof Response) {
      const status = authErr.status;
      const isRedirect = status >= 300 && status < 400;
      const isReauthHeader = authErr.headers?.has("X-Shopify-API-Request-Failure-Reauthorize") || authErr.headers?.has("X-Shopify-App-Redirect");

      if (isRedirect || isReauthHeader) {
        throw authErr;
      }

      if (shopFallback && !reauthFailed) {
        console.warn(`[dashboard.tsx] Session validation returned HTTP ${status}. Redirecting to re-auth for ${shopFallback}...`);
        throw redirect(`/auth/login?shop=${encodeURIComponent(shopFallback)}&host=${encodeURIComponent(host)}&reauth_failed=true`);
      }

      throw authErr;
    }

    console.error("[dashboard.tsx loader authenticate.admin FAILED]:", authErr);

    if (shopFallback && !reauthFailed) {
      throw redirect(`/auth/login?shop=${encodeURIComponent(shopFallback)}&host=${encodeURIComponent(host)}&reauth_failed=true`);
    }

    throw authErr;
  }

  const url = new URL(request.url);
  const forceSync = url.searchParams.get("plan_updated") === "true" || url.searchParams.get("sync") === "true";

  try {
    // Perform active subscription check with Shopify Billing API
    const subscription = await syncSubscriptionWithShopify(shop, billing, forceSync);
    const isFreeTier = (subscription?.plan || "FREE") === "FREE";
    const isBasicTier = isFreeTier || (subscription?.plan || "") === "STARTER";
    const planName = subscription?.plan === "PRO" ? "Pro" : subscription?.plan === "GROWTH" ? "Growth" : subscription?.plan === "STARTER" ? "Starter" : "Free";
    const ordersUsed = subscription?.ordersUsed || 0;
    const ordersLimit = subscription?.orderLimit ?? (subscription?.plan === "PRO" ? null : 50);
    const subStatus = subscription?.status || "ACTIVE";
    const trialEndsAt = subscription?.trialEndsAt ? subscription.trialEndsAt.toISOString() : null;

    const normalizedPlan = normalizePlanName(subscription.plan);
    const features: string[] = PLAN_FEATURES[normalizedPlan] || [];

    let orders = await prisma.order.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    const isDemoData = process.env.NODE_ENV === "development" && orders.length === 0;
    if (isDemoData) {
      // Seed mockup memory orders for new user preview
      const today = new Date();
      orders = Array.from({ length: 15 }).map((_, index) => {
        const date = new Date();
        date.setDate(today.getDate() - index);
        const isCOD = index % 2 === 0;
        const total = isCOD ? 1500 + (index * 150) : 1200 + (index * 100);
        return {
          id: `demo_${index}`,
          shop,
          orderNumber: 1000 + index,
          totalPrice: total,
          subtotalPrice: total * 0.85,
          totalTax: total * 0.18,
          shippingPrice: 100,
          discountAmount: index * 50,
          isCOD,
          createdAt: date,
          processedAt: date,
          financialStatus: isCOD ? "pending" : "paid",
          fulfillmentStatus: index === 3 || index === 7 ? "RTO" : "fulfilled",
          productId: "demo_prod",
          gateway: isCOD ? "cash_on_delivery" : "razorpay",
          channelType: index % 3 === 0 ? "AI_CHAT" : "WEBSITE",
          channelAttribution: index % 3 === 0 ? "ChatGPT" : "Website",
          customerId: `demo_cust_${index % 5}`,
          customerName: `Demo Customer ${index}`,
          customerEmail: `demo_${index}@example.com`,
          pincode: index === 3 ? "400001" : index === 7 ? "110001" : "560001",
          city: index === 3 ? "Mumbai" : index === 7 ? "Delhi" : "Bengaluru",
          province: index === 3 ? "Maharashtra" : index === 7 ? "Delhi" : "Karnataka",
          cogsAtTimeOfOrder: total * 0.4,
        } as any;
      });
    }

    const [
      cogsMap,
      rtoEvents,
      adSpendConnections,
      leaks,
      leakTrend,
      roasData,
      rawSettings,
      productsResponse
    ] = await Promise.all([
      ProfitService.getCOGS(shop),
      prisma.rTOEvent.findMany({ where: { shop } }),
      prisma.adSpend.findMany({ where: { shop } }),
      ProfitIntelligenceService.getProfitLeaks(shop),
      ProfitIntelligenceService.getLeakTrend(shop),
      ProfitIntelligenceService.getROAS(shop),
      prisma.storeSettings.findUnique({ where: { shop } }),
      ShopifyService.getProducts(admin).catch((err) => {
        console.error("[dashboard.tsx ShopifyService.getProducts FAILED]:", err);
        return [];
      })
    ]);
    
    const products = productsResponse;
    const adSpendDisconnected = adSpendConnections.some((c: any) => !c.isConnected && c.accessToken != null);
    const productMap = new Map(products.map((p: any) => [p.id, p.title]));
    const settings = await ProfitService.getSettings(rawSettings);
    if (!rawSettings?.onboardingCompleted) {
      throw redirect(`/app/onboarding?shop=${encodeURIComponent(session.shop)}&host=${encodeURIComponent(host)}`);
    }

    const revenue = orders.reduce((sum: number, o: any) => sum + (o.fulfillmentStatus === "RTO" ? 0 : o.totalPrice), 0);
    const orderCount = orders.length;

    let totalCOGS = 0;
    let totalFees = 0;
    let profitRevenue = 0;
    let excludedOrdersCount = 0;
    for (const o of orders) {
      const cleanId = o.productId || "";
      const hasCogs = cogsMap[cleanId] !== undefined;
      if (!hasCogs) {
        excludedOrdersCount++;
      }
      const fallbackCost = hasCogs ? cogsMap[cleanId] : (o.totalPrice * settings.defaultCOGSPct / 100);
      const orderCogs = (o.cogsAtTimeOfOrder !== null && o.cogsAtTimeOfOrder !== undefined && !isNaN(o.cogsAtTimeOfOrder))
        ? o.cogsAtTimeOfOrder
        : fallbackCost;

      const { fees } = ProfitService.calculateOrderProfit(o, orderCogs, settings);

      const isRto = o.fulfillmentStatus === "RTO";
      if (!isRto) {
        profitRevenue += o.totalPrice;
        totalCOGS += orderCogs;
        totalFees += fees;
      } else {
        totalFees += fees;
      }
    }

    const totalAdSpend = roasData.totalAdSpend || 0;
    const netProfit = profitRevenue - totalCOGS - totalFees - totalAdSpend;
    const netMargin = profitRevenue > 0 ? (netProfit / profitRevenue) * 100 : 0;

    const profit = netProfit;
    const margin = netMargin;

    const codOrders = orders.filter((o: any) => o.isCOD || isCodGateway(o.gateway));
    const codCount = codOrders.length;
    const codRate = orders.length > 0 ? (codCount / orders.length) * 100 : 0;

    const manualRtoIds = rtoEvents.filter((e: any) => e.eventType === "RTO").map((e: any) => e.orderId);
    const autoRtoIds = orders.filter((o: any) => o.fulfillmentStatus === "RTO").map((o: any) => o.id);
    const uniqueRtoIds = new Set([...manualRtoIds, ...autoRtoIds]);

    let codRtoCount = 0;
    for (const o of codOrders) {
      if (uniqueRtoIds.has(o.id)) codRtoCount++;
    }

    const rtoCount = uniqueRtoIds.size;
    const rtoRate = codCount > 0 ? (codRtoCount / codCount) * 100 : 0;

    const prepaidOrders = orders.filter((o: any) => !o.isCOD && !isCodGateway(o.gateway));
    const prepaidCount = prepaidOrders.length;
    let prepaidRevenue = 0;
    let codRevenue = 0;
    for (const o of prepaidOrders) {
      if (o.fulfillmentStatus !== "RTO") prepaidRevenue += o.totalPrice;
    }
    for (const o of codOrders) {
      if (o.fulfillmentStatus !== "RTO") codRevenue += o.totalPrice;
    }

    // Phase 3: Risk Intelligence Data
    const customerRisks = await prisma.customerRisk.findMany({ where: { shop }, orderBy: { riskScore: 'desc' }, take: 10 });
    const pincodeStats = await prisma.pincodeStats.findMany({ where: { shop }, orderBy: { rtoRate: 'desc' }, take: 10 }).catch(() => []);
    // Fallback if riskScore not strictly populated on pincodeStats yet
    const ordersNeedingReview = await prisma.order.findMany({
      where: { shop, riskLevel: { in: ["HIGH", "CRITICAL"] } },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    let healthScore = 100;
    if (margin < 25) healthScore -= 10;
    if (margin < 15) healthScore -= 15;
    if (margin < 5) healthScore -= 20;
    if (rtoRate > 10) healthScore -= 15;
    if (rtoRate > 15) healthScore -= 15;
    if (rtoRate > 20) healthScore -= 20;
    if (healthScore < 0) healthScore = 0;

    const alertsList: Array<{ id: string; message: string; severity: string; tone: "info" | "warning" | "critical" }> = [];
    if (rtoRate > 10) {
      alertsList.push({
        id: "rto-alert",
        message: `Return to Origin (RTO) rate is high (${rtoRate.toFixed(1)}%). Consider reviewing shipping providers.`,
        severity: "Warning",
        tone: "warning",
      });
    }
    if (margin < 15 && orders.length > 0) {
      alertsList.push({
        id: "margin-alert",
        message: `Your net profit margin is low (${margin.toFixed(1)}%). Try increasing product pricing or adding COGS.`,
        severity: "Critical",
        tone: "critical",
      });
    }

    const productMargins: Record<string, { title: string; revenue: number; profit: number; volume: number; rtoCount: number }> = {};
    for (const order of orders) {
      const productId = order.productId;
      if (productId) {
        const cleanId = productId.split("/").pop() || "";
        const hasCogs = cogsMap[cleanId] !== undefined;
        if (!hasCogs) continue; // Exclude orders missing COGS
        const title = productMap.get(productId) || `Product ID: ${productId}`;
        const existing = productMargins[productId] || { title, revenue: 0, profit: 0, volume: 0, rtoCount: 0 };
        existing.revenue += order.totalPrice;
        existing.volume += 1;

        const isRto = order.fulfillmentStatus === "RTO" || rtoEvents.some((e: any) => e.orderId === order.id && e.eventType === "RTO");
        if (isRto) {
          existing.rtoCount += 1;
        }

        const c = cogsMap[cleanId];
        const { profit } = ProfitService.calculateOrderProfit(order, c, settings);
        existing.profit += profit;
        productMargins[productId] = existing;
      }
    }

    const toxicAlerts: any[] = [];
    const topProducts = Object.values(productMargins)
      .map((p) => {
        const rtoRate = p.volume > 0 ? Math.round((p.rtoCount / p.volume) * 100) : 0;
        const trueMargin = p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0;
        const isToxic = trueMargin < 0;

        if (isToxic) {
          toxicAlerts.push({
            id: `toxic-product-${p.title.replace(/\s+/g, "-")}`,
            message: `Toxic Product Alert: "${p.title}" has a negative true profit (True margin: ${trueMargin}%, RTO rate: ${rtoRate}%). Recommended: Disable COD on this item.`,
            severity: "Critical",
            tone: "critical",
          });
        }

        return {
          name: p.title,
          revenue: p.revenue,
          profit: p.profit,
          volume: p.volume,
          rtoRate,
          margin: trueMargin,
          isToxic,
        };
      })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    alertsList.push(...toxicAlerts);

    const finalTopProducts = topProducts.length > 0 ? topProducts : [
      { name: "No products synced yet", revenue: 0, profit: 0, volume: 0, rtoRate: 0, margin: 0, isToxic: false },
    ];

    const aiChannels = ["Gemini", "ChatGPT", "Copilot", "Website"];
    const aiChannelMetrics: Record<string, {
      name: string; revenue: number; profit: number; orderCount: number;
      codCount: number; rtoCount: number; rtoRate: number; aov: number;
      repeatRate: number; ltv: number; newCount: number; returningCount: number;
    }> = {};
    const customerOrdersMap: Record<string, Record<string, number>> = {};
    const customerRevenueMap: Record<string, Record<string, number>> = {};

    aiChannels.forEach((c) => {
      aiChannelMetrics[c] = { name: c, revenue: 0, profit: 0, orderCount: 0, codCount: 0, rtoCount: 0, rtoRate: 0, aov: 0, repeatRate: 0, ltv: 0, newCount: 0, returningCount: 0 };
      customerOrdersMap[c] = {};
      customerRevenueMap[c] = {};
    });

    for (const order of orders) {
      const cleanId = order.productId || "";
      const cogs = cogsMap[cleanId];
      if (cogs === undefined) continue; // Exclude orders missing COGS from attribution metrics to keep margins exact

      const attr = (order as any).channelAttribution || "Website";
      if (!aiChannelMetrics[attr]) {
        aiChannelMetrics[attr] = { name: attr, revenue: 0, profit: 0, orderCount: 0, codCount: 0, rtoCount: 0, rtoRate: 0, aov: 0, repeatRate: 0, ltv: 0, newCount: 0, returningCount: 0 };
        customerOrdersMap[attr] = {};
        customerRevenueMap[attr] = {};
      }
      const metric = aiChannelMetrics[attr];
      metric.revenue += order.totalPrice;
      metric.orderCount += 1;
      const { profit } = ProfitService.calculateOrderProfit(order, cogs, settings);
      metric.profit += profit;
      if (isCodGateway(order.gateway)) metric.codCount += 1;
      const cId = (order as any).customerId || (order as any).customerEmail || `anon_${order.id}`;
      customerOrdersMap[attr][cId] = (customerOrdersMap[attr][cId] || 0) + 1;
      customerRevenueMap[attr][cId] = (customerRevenueMap[attr][cId] || 0) + order.totalPrice;
    }

    for (const event of rtoEvents) {
      const linkedOrder = orders.find((o: any) => o.id === event.orderId);
      const attr = (linkedOrder as any)?.channelAttribution || "Website";
      if (aiChannelMetrics[attr] && event.eventType === "RTO") aiChannelMetrics[attr].rtoCount += 1;
    }

    Object.values(aiChannelMetrics).forEach((m) => {
      const channel = m.name;
      const uniqueCustomers = Object.keys(customerOrdersMap[channel] || {});
      const totalCustomersCount = uniqueCustomers.length;
      let repeatCustomers = 0;
      uniqueCustomers.forEach((cId) => { if (customerOrdersMap[channel][cId] > 1) repeatCustomers++; });
      m.rtoRate = m.codCount > 0 ? Math.round((m.rtoCount / m.codCount) * 100 * 10) / 10 : 0;
      m.profit = Math.round(m.profit * 10) / 10;
      m.revenue = Math.round(m.revenue * 10) / 10;
      m.aov = m.orderCount > 0 ? Math.round((m.revenue / m.orderCount) * 10) / 10 : 0;
      m.repeatRate = totalCustomersCount > 0 ? Math.round((repeatCustomers / totalCustomersCount) * 100 * 10) / 10 : 0;
      m.ltv = totalCustomersCount > 0 ? Math.round((m.revenue / totalCustomersCount) * 10) / 10 : 0;
      m.newCount = totalCustomersCount;
      m.returningCount = m.orderCount - totalCustomersCount;
    });

    let aiProductScore = products.length > 0 ? 30 : 0;
    if (products.length > 0 && (Object.keys(cogsMap).length / products.length) >= 0.5) aiProductScore += 10;
    const aiPolicyScore = 30;
    const aiEnrollmentScore = orders.some((o: any) => (o as any).channelAttribution && (o as any).channelAttribution !== "Website") ? 30 : 10;
    const aiReadinessScore = aiProductScore + aiPolicyScore + aiEnrollmentScore;

    const dailyStats: Record<string, { date: string; revenue: number; profit: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      dailyStats[dateStr] = { date: dateStr.substring(8) + "/" + dateStr.substring(5, 7), revenue: 0, profit: 0 };
    }

    orders.forEach((o: any) => {
      const d = o.createdAt ? (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)) : new Date();
      const dateStr = d.toISOString().split("T")[0];
      if (dailyStats[dateStr]) {
        const totalPrice = Number(o.totalPrice) || 0;
        const totalTax = Number(o.totalTax) || 0;
        const shippingPrice = Number(o.shippingPrice) || 0;
        const c = (o.cogsAtTimeOfOrder ?? cogsMap[o.productId || ""]) ?? (totalPrice * 0.4);
        const f = totalTax + shippingPrice;
        const p = totalPrice - c - f;
        dailyStats[dateStr].revenue += totalPrice;
        dailyStats[dateStr].profit += p;
      }
    });

    const chartData = Object.values(dailyStats);

    const searchQueries = await (prisma as any).aISearchQuery.findMany({
      where: { shop },
      orderBy: { impressions: "desc" },
    });

    const mappedQueries = searchQueries.map((sq: any) => ({
      id: sq.id, query: sq.query, productName: sq.productName,
      rank: sq.rank, impressions: sq.impressions, clicks: sq.clicks,
      ctr: sq.ctr, channel: sq.channel,
    }));

    const aiOrdersCount = orders.filter((o: any) => o.channelType === "AI_CHAT").length;
    const isAttributionActive = aiOrdersCount >= 5 || process.env.NODE_ENV === "development";

    const missingCogsCount = products.filter((p: any) => {
      const cleanId = p.id.split("/").pop() || "";
      return cogsMap[cleanId] === undefined;
    }).length;

    const hasZeroLogisticsDefaults = settings.defaultForwardShipping === 0 || settings.defaultReturnShipping === 0 || settings.defaultPackaging === 0;
    const isColdStart = orders.length < 50;

    const configuredCogsCount = products.filter((p: any) => {
      const cleanId = p.id.split("/").pop() || "";
      return cogsMap[cleanId] !== undefined;
    }).length;

    const connectedAdPlatforms = await AdSpendService.getConnectedPlatforms(shop);
    const hasConnectedAdAccount = connectedAdPlatforms.some((p) => p.isConnected);
    const cogsRecords = await prisma.productCOGS.findMany({ where: { shop } });
    const nativeCogsCount = cogsRecords.filter((c: any) => c.source === "shopify_native" || c.shopifyNative != null).length;
    const manualCogsCount = cogsRecords.filter((c: any) => c.source === "manual_override" || c.manualOverride != null).length;

    const [feeBreakdown, gstSummary, recentDecisions, recentAlerts] = await Promise.all([
      ProfitService.getFeeBreakdown(shop),
      ProfitService.getGSTSummary(shop),
      prisma.executionLog.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { order: { select: { orderNumber: true, riskScore: true, riskLevel: true, customerName: true } } }
      }),
      prisma.alert.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 10
      })
    ]);

    const blockedCodCount = orders.filter((o: any) => o.isCOD && (o.fulfillmentStatus || "").toLowerCase().includes("block")).length;
    const avgRtoLoss = settings.defaultForwardShipping + settings.defaultReturnShipping;
    const totalRtoSavings = blockedCodCount * avgRtoLoss;
    const monthlySubscriptionCost = planName === "Pro" ? 6000 : planName === "Growth" ? 3000 : planName === "Starter" ? 1500 : 0;
    const netRoiSavings = totalRtoSavings - monthlySubscriptionCost;

    return {
      shop, host, revenue, profit, margin: Math.round(margin * 10) / 10,
      netProfit, netMargin: Math.round(netMargin * 10) / 10,
      healthScore, alertsList, orderCount, topProducts: finalTopProducts,
      rtoRate: Math.round(rtoRate * 10) / 10, codRate: Math.round(codRate * 10) / 10,
      aiChannelMetrics: [], aiReadinessScore: 85,
      isAttributionActive: isAttributionActive,
      chartData, searchQueries: mappedQueries,
      products: products.map((p) => ({ id: p.id, title: p.title })),
      leaks, leakTrend,
      features,
      prepaidCount, prepaidRevenue, codRevenue,
      customerRisks, pincodeStats, ordersNeedingReview,
      missingCogsCount,
      hasZeroLogisticsDefaults,
      isColdStart,
      excludedOrdersCount,
      syncCapped: settings.syncCapped,
      isBasicTier,
      planName,
      ordersUsed,
      ordersLimit,
      configuredCogsCount,
      connectedAdPlatforms,
      roasData,
      hasConnectedAdAccount,
      nativeCogsCount,
      manualCogsCount,
      feeBreakdown,
      gstSummary,
      totalRtoSavings,
      monthlySubscriptionCost,
      netRoiSavings,
      blockedCodCount,
      settings,
      isDemoData,
      adSpendDisconnected,
      subStatus,
      trialEndsAt,
      recentDecisions,
      recentAlerts,
    };
  } catch (err: any) {
    console.error("[Dashboard Loader Critical Error Caught]:", err);
    return {
      shop: shop || "", host: host || "", revenue: 0, profit: 0, margin: 0, netProfit: 0, netMargin: 0,
      healthScore: 100, alertsList: [], orderCount: 0, topProducts: [], rtoRate: 0, codRate: 0,
      aiChannelMetrics: [], aiReadinessScore: 0, isAttributionActive: false, chartData: [], searchQueries: [],
      products: [], leaks: { totalLeak: 0, rtoLoss: 0, lowMarginLoss: 0, shippingUndercharge: 0, unassignedCOGS: 0, shippingLoss: 0, discountLoss: 0, rtoTrend: 0, shippingTrend: 0, discountTrend: 0 },
      leakTrend: [], features: [], missingCogsCount: 0, hasZeroLogisticsDefaults: false, isColdStart: true,
      prepaidCount: 0, prepaidRevenue: 0, codRevenue: 0, customerRisks: [], pincodeStats: [], ordersNeedingReview: [],
      excludedOrdersCount: 0, syncCapped: false, isBasicTier: true, planName: "Free", ordersUsed: 0, ordersLimit: 50,
      configuredCogsCount: 0, connectedAdPlatforms: [], hasConnectedAdAccount: false, nativeCogsCount: 0, manualCogsCount: 0,
      feeBreakdown: { gatewayFees: 0, codHandlingFees: 0, forwardShipping: 0, returnShipping: 0, packagingCosts: 0, totalFees: 0 },
      gstSummary: { gstin: "", isGstRegistered: false, defaultGstRate: 18, totalTaxableSales: 0, totalGstCollected: 0, cgst: 0, sgst: 0, igst: 0, intraStateSales: 0, interStateSales: 0, hsnSummary: [] },
      totalRtoSavings: 0, monthlySubscriptionCost: 0, netRoiSavings: 0, blockedCodCount: 0,
      roasData: { totalRevenue: 0, totalAdSpend: 0, blendedROAS: 0, trueCACRaw: 0, profitAdjustedROAS: 0, cacPaybackOrders: 0, byChannel: [] },
      settings: {
        whatsappEnabled: false,
        whatsappPhone: "",
        syncCapped: false,
        defaultCOGSPct: 40,
        defaultForwardShipping: 60,
        defaultReturnShipping: 70,
        defaultCODHandling: 40,
        defaultPackaging: 10,
        defaultGatewayFeePct: 2,
        rtoDetectionPattern: "rto",
        alertEmail: "",
        rtoThreshold: 30,
        marginThreshold: 15,
        gstin: "",
        isGstRegistered: false,
        gstRate: 18,
      },
      isDemoData: false,
      adSpendDisconnected: false,
      subStatus: "ACTIVE",
      trialEndsAt: null,
      recentDecisions: [],
      recentAlerts: [],
    };
  }

  }
}
