import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { RtoRepository } from "../../infrastructure/repositories/rto.repository";
import { AdSpendRepository } from "../../infrastructure/repositories/ad-spend.repository";
import { SettingsRepository } from "../../infrastructure/repositories/settings.repository";
import { CustomerRepository } from "../../infrastructure/repositories/customer.repository";
import { PincodeRepository } from "../../infrastructure/repositories/pincode.repository";
import { CogsRepository } from "../../infrastructure/repositories/cogs.repository";
import { ExecutionLogRepository } from "../../infrastructure/repositories/execution-log.repository";
import { AlertRepository } from "../../infrastructure/repositories/alert.repository";
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
  const planHandle = url.searchParams.get("plan_handle");
  const forceSync = url.searchParams.get("plan_updated") === "true" || url.searchParams.get("sync") === "true" || Boolean(planHandle);

  try {
    // Perform active subscription check with Shopify App Pricing (Partner API)
    const subscription = await syncSubscriptionWithShopify(shop, billing, forceSync, planHandle);
    const isFreeTier = (subscription?.plan || "FREE") === "FREE";
    const isBasicTier = isFreeTier || (subscription?.plan || "") === "STARTER";
    const planName = subscription?.plan === "PRO" ? "Pro" : subscription?.plan === "GROWTH" ? "Growth" : subscription?.plan === "STARTER" ? "Starter" : "Free";
    const ordersUsed = subscription?.ordersUsed || 0;
    const ordersLimit = subscription?.orderLimit ?? (subscription?.plan === "PRO" ? null : 50);
    const subStatus = subscription?.status || "ACTIVE";
    const trialEndsAt = subscription?.trialEndsAt ? subscription.trialEndsAt.toISOString() : null;

    const normalizedPlan = normalizePlanName(subscription.plan);
    const features: string[] = PLAN_FEATURES[normalizedPlan] || [];

    let orders = await OrderRepository.findByShop(shop);

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
      RtoRepository.findByShop(shop),
      AdSpendRepository.findByShop(shop),
      ProfitIntelligenceService.getProfitLeaks(shop),
      ProfitIntelligenceService.getLeakTrend(shop),
      ProfitIntelligenceService.getROAS(shop),
      SettingsRepository.getByShop(shop),
      ShopifyService.getProducts(admin).catch((err) => {
        console.error("[dashboard.tsx ShopifyService.getProducts FAILED]:", err);
        return [];
      })
    ]);
    
    const products = productsResponse;
    const adSpendDisconnected = adSpendConnections.some((c: any) => !c.isConnected && c.accessToken != null);
    const productMap = new Map(products.map((p: any) => [p.id, p.title]));
    const settings = await ProfitService.getSettings(rawSettings);
    const onboardingCompleted = Boolean(rawSettings?.onboardingCompleted);

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
    const customerRisks = await CustomerRepository.findTopRiskCustomers(shop, 10);
    const pincodeStats = await PincodeRepository.findTopRiskPincodes(shop, 10).catch(() => []);
    const ordersNeedingReview = await OrderRepository.findOrdersNeedingReview(shop, 10);

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
        const cleanId = o.productId || "";
        const hasCogs = cogsMap[cleanId] !== undefined;
        const fallbackCost = hasCogs ? cogsMap[cleanId] : ((Number(o.totalPrice) || 0) * (settings.defaultCOGSPct / 100));
        const orderCogs = (o.cogsAtTimeOfOrder !== null && o.cogsAtTimeOfOrder !== undefined && !isNaN(o.cogsAtTimeOfOrder))
          ? o.cogsAtTimeOfOrder
          : fallbackCost;

        const { profit } = ProfitService.calculateOrderProfit(o, orderCogs, settings);

        const isRto = o.fulfillmentStatus === "RTO";
        if (!isRto) {
          dailyStats[dateStr].revenue += Number(o.totalPrice) || 0;
        }
        dailyStats[dateStr].profit += profit;
      }
    });

    for (const key of Object.keys(dailyStats)) {
      dailyStats[key].revenue = Math.round(dailyStats[key].revenue * 100) / 100;
      dailyStats[key].profit = Math.round(dailyStats[key].profit * 100) / 100;
    }

    const chartData = Object.values(dailyStats);

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
    const cogsRecords = await CogsRepository.findManyByShop(shop);
    const nativeCogsCount = cogsRecords.filter((c: any) => c.source === "shopify_native" || c.shopifyNative != null).length;
    const manualCogsCount = cogsRecords.filter((c: any) => c.source === "manual_override" || c.manualOverride != null).length;

    const [feeBreakdown, gstSummary, rawRecentDecisions, recentAlerts] = await Promise.all([
      ProfitService.getFeeBreakdown(shop),
      ProfitService.getGSTSummary(shop),
      ExecutionLogRepository.findByShop(shop, 20),
      AlertRepository.findManyByShop(shop, 10),
    ]);

    // Fallback: If execution logs are empty but orders exist, synthesize decision items from recent orders
    let recentDecisions = rawRecentDecisions;
    if (recentDecisions.length === 0 && orders.length > 0) {
      recentDecisions = orders.slice(0, 10).map((o: any) => ({
        id: `auto-log-${o.id}`,
        shop,
        orderId: o.id,
        step: "DECISION",
        status: "SUCCESS",
        message: `Order #${o.orderNumber} evaluated. Risk: ${o.riskLevel || 'LOW'}.`,
        createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
        order: {
          orderNumber: o.orderNumber,
          riskScore: o.riskScore ?? 0,
          riskLevel: o.riskLevel || "LOW",
          customerName: o.customerName || "Customer",
        }
      })) as any;
    }

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateStr = sixtyDaysAgo.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];
    const syncWindow = {
      from: dateStr,
      to: todayStr,
      days: 60,
    };
    const lastSyncTime = orders.length > 0 ? (orders[0].createdAt ? new Date(orders[0].createdAt).toISOString() : new Date().toISOString()) : null;

    // Honest avoided loss tracking:
    // Only count orders where ProfitRx or merchant actually restricted COD (BLOCK_COD, PREPAID_ONLY, or blocked fulfillment)
    // AND the order was actually stopped (cancelled, voided, restocked) before dispatch.
    // Delivered orders or orders fulfilled normally CANNOT be claimed as RTO savings.
    const actuallyBlockedOrders = orders.filter((o: any) => {
      const isCod = o.isCOD || isCodGateway(o.gateway);
      if (!isCod) return false;

      const rec = (o.merchantRecommendation || "").toUpperCase();
      const status = (o.fulfillmentStatus || "").toLowerCase();
      const finStatus = (o.financialStatus || "").toLowerCase();

      const wasRestricted =
        rec.includes("BLOCK") ||
        rec.includes("PREPAID") ||
        status.includes("block");

      if (!wasRestricted) return false;

      // Must NOT be delivered or fulfilled
      const isDelivered = status === "delivered" || finStatus === "paid";
      if (isDelivered) return false;

      // Must be held, cancelled, voided, or restocked
      const isCancelledOrHeld =
        finStatus === "voided" ||
        status.includes("cancel") ||
        status.includes("restock") ||
        status.includes("block");

      return isCancelledOrHeld;
    });

    const blockedCodCount = actuallyBlockedOrders.length;
    const avgRtoFreightPackaging = settings.defaultForwardShipping + settings.defaultReturnShipping + (settings.defaultPackaging || 10);
    const totalRtoSavings = blockedCodCount * avgRtoFreightPackaging;

    // Actual plan monthly cost in INR (using canonical exchange rate ₹96 = $1 USD: Starter $19 = ₹1824, Growth $39 = ₹3744, Pro $79 = ₹7584)
    const monthlySubscriptionCost = planName === "Pro" ? 7584 : planName === "Growth" ? 3744 : planName === "Starter" ? 1824 : 0;
    const netRoiSavings = totalRtoSavings > 0 ? Math.max(0, totalRtoSavings - monthlySubscriptionCost) : 0;

    return {
      shop, host, revenue, profit, margin: Math.round(margin * 10) / 10,
      netProfit, netMargin: Math.round(netMargin * 10) / 10,
      healthScore, alertsList, orderCount, topProducts: finalTopProducts,
      rtoRate: Math.round(rtoRate * 10) / 10, codRate: Math.round(codRate * 10) / 10,
      chartData,
      products: products.map((p: any) => ({ id: p.id, title: p.title })),
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
      isDemoData: false,
      adSpendDisconnected,
      subStatus,
      trialEndsAt,
      recentDecisions,
      recentAlerts,
      syncWindow,
      lastSyncTime,
      onboardingCompleted,
    };
  } catch (err: any) {
    if (err instanceof Response) {
      throw err;
    }
    console.error("[Dashboard Loader Critical Error Caught]:", err);
    return {
      shop: shop || "", host: host || "", revenue: 0, profit: 0, margin: 0, netProfit: 0, netMargin: 0,
      healthScore: 100, alertsList: [], orderCount: 0, topProducts: [], rtoRate: 0, codRate: 0,
      chartData: [],
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
        currency: "INR",
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
      syncWindow: { from: "", to: "", days: 60 },
      lastSyncTime: null,
      onboardingCompleted: false,
    };
  }

  }
}
