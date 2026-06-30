import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ProfitService } from "../services/profit.service";
import { ShopifyService } from "../services/shopify.service";
import {
  checkRateLimit,
  getClientIp,
  withDbRetry,
} from "../utils/security.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // 1. IP Rate Limiting check
  const ip = getClientIp(request);
  const { allowed, resetIn } = checkRateLimit(ip);
  if (!allowed) {
    return Response.json(
      { error: `Too many requests. Please try again in ${resetIn} seconds.` },
      {
        status: 429,
        headers: {
          "Retry-After": resetIn.toString(),
        },
      }
    );
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "summary";

  // Fetch basic stats with retry
  const orders = (await withDbRetry(async () => {
    return await prisma.order.findMany({
      where: { shop },
    });
  })) as any[];

  const cogsMap = await withDbRetry(async () => {
    return await ProfitService.getCOGS(shop);
  });

  const rtoEvents = (await withDbRetry(async () => {
    return await prisma.rTOEvent.findMany({
      where: { shop },
    });
  })) as any[];

  const revenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  const totalCOGS = orders.reduce((sum, o) => sum + (cogsMap[o.productId || ""] ?? o.totalPrice * 0.4), 0);
  const totalFees = orders.reduce((sum, o) => sum + o.totalTax + o.shippingPrice, 0);
  const profit = revenue - totalCOGS - totalFees;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const codOrders = orders.filter((o: any) => {
    const gateway = o.gateway?.toLowerCase() || "";
    return gateway.includes("cod") || gateway.includes("cash") || gateway.includes("manual");
  });
  const codCount = codOrders.length;
  const rtoCount = rtoEvents.filter((e) => e.eventType === "RTO").length;
  const rtoRate = codCount > 0 ? (rtoCount / codCount) * 100 : 0;

  // AI Readiness calculation
  const mappedCogsCount = Object.keys(cogsMap).length;
  const aiProductScore = mappedCogsCount > 0 ? 40 : 10;
  const aiPolicyScore = 30;
  const aiEnrollmentScore = orders.some((o: any) => (o as any).channelAttribution && (o as any).channelAttribution !== "Website") ? 30 : 10;
  const aiReadinessScore = aiProductScore + aiPolicyScore + aiEnrollmentScore;

  // Fetch products to support advanced queries
  let products: any[] = [];
  try {
    products = await ShopifyService.getProducts(request);
  } catch (err) {
    console.error("Failed to fetch products for sidekick:", err);
  }

  const lowerQuery = query.toLowerCase();
  let responseText = "";

  // 1. Check for AI channel specific margin queries
  if ((lowerQuery.includes("margin") || lowerQuery.includes("profit") || lowerQuery.includes("revenue")) &&
      (lowerQuery.includes("chatgpt") || lowerQuery.includes("gemini") || lowerQuery.includes("copilot") || lowerQuery.includes("website"))) {
    
    let matchedChannel = "Website";
    if (lowerQuery.includes("chatgpt")) matchedChannel = "ChatGPT";
    else if (lowerQuery.includes("gemini")) matchedChannel = "Gemini";
    else if (lowerQuery.includes("copilot")) matchedChannel = "Copilot";

    const chOrders = orders.filter(o => ((o as any).channelAttribution || "Website") === matchedChannel);
    const chRev = chOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const chCOGS = chOrders.reduce((sum, o) => sum + (cogsMap[o.productId || ""] ?? o.totalPrice * 0.4), 0);
    const chFees = chOrders.reduce((sum, o) => sum + o.totalTax + o.shippingPrice, 0);
    const chProfit = chRev - chCOGS - chFees;
    const chMargin = chRev > 0 ? (chProfit / chRev) * 100 : 0;
    
    const uniqueCustomers = new Set(chOrders.map(o => (o as any).customerId || (o as any).customerEmail || `anon_${o.id}`)).size;
    const chLtv = uniqueCustomers > 0 ? chRev / uniqueCustomers : 0;
    const chAov = chOrders.length > 0 ? chRev / chOrders.length : 0;

    responseText = `Your net profit margin on ${matchedChannel} is ${chMargin.toFixed(1)}% (Total Revenue: ₹${chRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}, Net Profit: ₹${chProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}). The Average Order Value (AOV) is ₹${chAov.toFixed(1)} and estimated Customer Lifetime Value (LTV) is ₹${chLtv.toFixed(1)}.`;
  }
  // 2. Check for RTO/returns per channel queries
  else if (lowerQuery.includes("rto") || lowerQuery.includes("return")) {
    let matchedChannel = "";
    if (lowerQuery.includes("chatgpt")) matchedChannel = "ChatGPT";
    else if (lowerQuery.includes("gemini")) matchedChannel = "Gemini";
    else if (lowerQuery.includes("copilot")) matchedChannel = "Copilot";
    else if (lowerQuery.includes("website")) matchedChannel = "Website";

    if (matchedChannel) {
      const chOrders = orders.filter(o => ((o as any).channelAttribution || "Website") === matchedChannel);
      const chCodOrders = chOrders.filter(o => {
        const gw = o.gateway?.toLowerCase() || "";
        return gw.includes("cod") || gw.includes("cash") || gw.includes("manual");
      });
      const chRtoEvents = rtoEvents.filter(e => {
        const linkedOrder = orders.find(o => o.id === e.orderId);
        const attr = (linkedOrder as any)?.channelAttribution || "Website";
        return attr === matchedChannel && e.eventType === "RTO";
      });
      const chRtoRate = chCodOrders.length > 0 ? (chRtoEvents.length / chCodOrders.length) * 100 : 0;
      const chRtoLoss = chRtoEvents.reduce((sum, e) => sum + e.amount, 0);

      responseText = `On channel ${matchedChannel}, the Return to Origin (RTO) rate is ${chRtoRate.toFixed(1)}% with ${chRtoEvents.length} RTO events, causing an estimated logistics loss of ₹${chRtoLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`;
    } else {
      responseText = `Your overall Return to Origin (RTO) rate is ${rtoRate.toFixed(1)}% across ${codCount} Cash on Delivery (COD) orders, with ${rtoCount} events causing ₹${(revenue * rtoRate / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} in estimated losses. Proactive WhatsApp confirmations are recommended.`;
    }
  }
  // 3. AI Score increase recommendations query
  else if (lowerQuery.includes("recommend") || lowerQuery.includes("improve") || lowerQuery.includes("increase") || lowerQuery.includes("score") || lowerQuery.includes("ai")) {
    const missingCogsCount = products.length - Object.keys(cogsMap).length;
    const recs = [];
    if (missingCogsCount > 0) {
      recs.push(`1. Sync COGS costs for the remaining ${missingCogsCount} products in your catalog (+10 points).`);
    }
    if (aiEnrollmentScore < 30) {
      recs.push(`2. Route checkout link parameters with UTM variables (e.g. utm_source=chatgpt) to activate AI Channel Attribution (+20 points).`);
    }
    if (rtoRate > 10) {
      recs.push(`3. Reduce COD RTO rate below 10% by introducing shipping verification notifications.`);
    }
    
    if (recs.length === 0) {
      responseText = `Your store is fully optimized for Agentic AI Commerce (AI Readiness Score: ${aiReadinessScore}/100). Maintain high-quality descriptive product tags to stay catalog-indexed.`;
    } else {
      responseText = `To increase your AI Readiness Score (currently ${aiReadinessScore}/100), try these: \n\n` + recs.join("\n\n");
    }
  }
  // 4. Default summary fallback
  else {
    responseText = `Greek God SaaS Store Summary: Net profit is ₹${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })} (Margin: ${margin.toFixed(1)}%) on ₹${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} revenue. Return to Origin (RTO) rate is ${rtoRate.toFixed(1)}%. AI Readiness is rated at ${aiReadinessScore}/100.`;
  }

  return {
    shop,
    query,
    timestamp: new Date().toISOString(),
    responseText,
    metrics: {
      revenue: Math.round(revenue * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin: Math.round(margin * 10) / 10,
      rtoRate: Math.round(rtoRate * 10) / 10,
      aiReadinessScore,
    },
  };
};
