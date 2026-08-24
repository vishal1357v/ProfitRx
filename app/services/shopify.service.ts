/* eslint-disable @typescript-eslint/no-explicit-any */
import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import { getSubscription } from "./feature-access.service";
import { CustomerIntelligenceService } from "./customer-intelligence.service";
import { AlertService } from "./alerts.service";
import { ProfitService } from "./profit.service";
import { CODManagementService } from "./cod-management.service";
import { resolveEffectiveCOGS } from "../utils/cogs";
import { determineFulfillmentStatus } from "../utils/fulfillment";
import { RiskEngineService } from "./risk-engine.service";

type GraphqlError = { message: string };
type GraphqlResponse<T> = { data: T; errors?: GraphqlError[] };

export interface ShopifyOrder {
  id: string;
  name: string;
  totalPrice: number;
  subtotalPrice: number;
  totalTax: number;
  shippingPrice: number;
  discountAmount: number;
  isCOD: boolean;
  createdAt: Date;
  financialStatus: string;
  fulfillmentStatus: string;
  gateway?: string | null;
  lineItems?: any[];
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  pincode?: string | null;
  city?: string | null;
  province?: string | null;
  channelType?: string | null;
  channelAttribution?: string | null;
}

const COD_GATEWAYS = ["cod", "cash", "cash on delivery", "manual"];

function isCodGateway(gateway: string | null | undefined): boolean {
  if (!gateway) return false;
  const lower = gateway.toLowerCase();
  return COD_GATEWAYS.some((g) => lower.includes(g));
}

// Detect channel from UTM / channelInformation
function detectChannel(node: any): { channelType: string; channelAttribution: string } {
  // Real Shopify channelInformation (Agentic Storefronts)
  const handle = node.channelInformation?.channelDefinition?.handle?.toLowerCase() || "";
  if (handle.includes("chatgpt") || handle.includes("openai")) return { channelType: "AI_CHAT", channelAttribution: "ChatGPT" };
  if (handle.includes("gemini") || handle.includes("google-ai")) return { channelType: "AI_CHAT", channelAttribution: "Gemini" };
  if (handle.includes("copilot") || handle.includes("bing")) return { channelType: "AI_CHAT", channelAttribution: "Copilot" };
  if (handle.includes("perplexity")) return { channelType: "AI_CHAT", channelAttribution: "Perplexity" };
  if (handle.includes("claude")) return { channelType: "AI_CHAT", channelAttribution: "Claude" };

  // UTM source fallback
  const lastVisit = node.customerJourneySummary?.lastVisit;
  const landingPage = (lastVisit?.landingPage || "").toLowerCase();
  const referringSite = (lastVisit?.referrerUrl || "").toLowerCase();
  const combined = landingPage + " " + referringSite;
  if (combined.includes("utm_source=chatgpt") || combined.includes("chat.openai")) return { channelType: "AI_CHAT", channelAttribution: "ChatGPT" };
  if (combined.includes("utm_source=gemini") || combined.includes("gemini.google")) return { channelType: "AI_CHAT", channelAttribution: "Gemini" };
  if (combined.includes("utm_source=copilot") || combined.includes("bing.com/chat")) return { channelType: "AI_CHAT", channelAttribution: "Copilot" };
  if (combined.includes("utm_source=perplexity") || combined.includes("perplexity.ai")) return { channelType: "AI_CHAT", channelAttribution: "Perplexity" };
  if (combined.includes("utm_source=claude") || combined.includes("claude.ai")) return { channelType: "AI_CHAT", channelAttribution: "Claude" };

  // Deterministic demo attribution based on order id (ONLY for dev mode)
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    const DEMO_CHANNELS = [
      { channelType: "AI_CHAT", channelAttribution: "Gemini" },
      { channelType: "AI_CHAT", channelAttribution: "ChatGPT" },
      { channelType: "AI_CHAT", channelAttribution: "Copilot" },
      { channelType: "WEBSITE", channelAttribution: "Website" },
      { channelType: "WEBSITE", channelAttribution: "Website" },
    ];
    const charCodeSum = (node.id || "").split("").reduce((s: number, c: string) => s + c.charCodeAt(0), 0);
    return DEMO_CHANNELS[charCodeSum % DEMO_CHANNELS.length];
  }

  // Production default: Standard Website channel
  return { channelType: "WEBSITE", channelAttribution: "Website" };
}

export class ShopifyService {
  private static productsCache = new Map<string, { data: any[]; timestamp: number }>();

  // ── Orders ───────────────────────────────────────────────
  static async getOrders(requestOrAdmin: Request | any, limit: number = 250, shopName: string = "") {
    let admin: any;
    let shop = shopName;
    if (requestOrAdmin instanceof Request) {
      const auth = await authenticate.admin(requestOrAdmin);
      admin = auth.admin;
      if (!shop) shop = auth.session.shop;
    } else {
      admin = requestOrAdmin;
    }

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateStr = sixtyDaysAgo.toISOString().split("T")[0];
    const query = `updated_at:>=${dateStr}`;

    console.log(`[ShopifyService.getOrders] Fetching orders with query: "${query}" for shop: ${shop}`);

    const settings = shop ? (await prisma.storeSettings.findUnique({ where: { shop } })) : null;
    const pattern = settings?.rtoDetectionPattern || "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender";

    const allOrders: any[] = [];
    let hasNextPage = true;
    let endCursor: string | null = null;
    let pageCount = 0;
    const maxPages = 4; // Cap manual/background sync at 1000 orders total to prevent timeouts

    const graphQlQuery = `
      query GetOrders($limit: Int!, $query: String, $cursor: String) {
        orders(first: $limit, query: $query, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              totalPriceSet { presentmentMoney { amount } }
              subtotalPriceSet { presentmentMoney { amount } }
              totalTaxSet { presentmentMoney { amount } }
              totalDiscountsSet { presentmentMoney { amount } }
              shippingLines(first: 1) {
                edges { node { originalPriceSet { presentmentMoney { amount } } } }
              }
              createdAt
              displayFinancialStatus
              displayFulfillmentStatus
              paymentGatewayNames
              tags
              fulfillments(first: 5) {
                status
                events(first: 10) {
                  edges {
                    node {
                      status
                      message
                    }
                  }
                }
              }
              customerJourneySummary {
                lastVisit {
                  landingPage
                  referrerUrl
                }
              }
              shippingAddress {
                city
                province
                provinceCode
                countryCode
              }
              customer {
                id
              }
              lineItems(first: 250) {
                edges {
                  node {
                    id
                    title
                    product {
                      id
                    }
                    quantity
                    discountedTotalSet { presentmentMoney { amount } }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    while (hasNextPage && pageCount < maxPages) {
      const response = await admin.graphql(graphQlQuery, {
        variables: { limit: Math.min(limit, 250), query, cursor: endCursor },
      });

      const data = await response.json() as any;
      if (data.errors?.length) throw new Error(data.errors[0].message);

      const edges = data.data.orders.edges || [];
      
      // Handle lineItems pagination for each order
      for (const edge of edges) {
        let liHasNext = edge.node.lineItems.pageInfo?.hasNextPage;
        let liCursor = edge.node.lineItems.pageInfo?.endCursor;
        while (liHasNext) {
          const liResp = await admin.graphql(`
            query GetLineItems($orderId: ID!, $cursor: String) {
              order(id: $orderId) {
                lineItems(first: 250, after: $cursor) {
                  edges {
                    node {
                      id title product { id } quantity discountedTotalSet { presentmentMoney { amount } }
                    }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          `, { variables: { orderId: edge.node.id, cursor: liCursor } });
          const liData = await liResp.json() as any;
          if (liData.data?.order?.lineItems) {
            edge.node.lineItems.edges.push(...liData.data.order.lineItems.edges);
            liHasNext = liData.data.order.lineItems.pageInfo.hasNextPage;
            liCursor = liData.data.order.lineItems.pageInfo.endCursor;
          } else {
            liHasNext = false;
          }
        }
      }

      allOrders.push(...edges.map((edge: any) => this.mapOrder(edge.node, pattern)));

      const pageInfo = data.data.orders.pageInfo || {};
      hasNextPage = pageInfo.hasNextPage || false;
      endCursor = pageInfo.endCursor || null;
      pageCount++;

      // ⚡ GraphQL Leaky Bucket Rate Limiting backoff logic
      const cost = data.extensions?.cost;
      if (cost) {
        const currentlyAvailable = Number(cost.throttleStatus?.currentlyAvailable) || 2000;
        if (currentlyAvailable < 1000) {
          console.log(`[ShopifyService] Rate limit points low (${currentlyAvailable}/1000). Backing off for 2000ms.`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (edges.length === 0) break;
    }

    const isSyncCapped = hasNextPage && pageCount >= maxPages;
    if (shop) {
      try {
        await (prisma as any).storeSettings.update({
          where: { shop },
          data: { syncCapped: isSyncCapped }
        });
      } catch (err: any) {
        console.warn(`[ShopifyService.getOrders] Failed to update syncCapped status: ${err.message}`);
      }
    }

    return allOrders;
  }

  // ── Products ─────────────────────────────────────────────
  static async getProducts(requestOrAdmin: Request | any) {
    let admin: any;
    let shop = "";
    if (requestOrAdmin instanceof Request) {
      const auth = await authenticate.admin(requestOrAdmin);
      admin = auth.admin;
      shop = auth.session.shop;
    } else if (typeof requestOrAdmin === "string") {
      shop = requestOrAdmin;
      const auth = await unauthenticated.admin(shop);
      admin = auth.admin;
    } else {
      admin = requestOrAdmin;
      shop = admin?.rest?.session?.shop || admin?.session?.shop || "default_shop";
    }

    // ⚡ Cache hit check (TTL of 15 minutes = 15 * 60 * 1000 ms)
    if (shop) {
      // Periodic cleanup to prevent memory leak on long-running node servers
      for (const [key, value] of ShopifyService.productsCache.entries()) {
        if (Date.now() - value.timestamp >= 15 * 60 * 1000) {
          ShopifyService.productsCache.delete(key);
        }
      }

      const cached = ShopifyService.productsCache.get(shop);
      if (cached) {
        console.log(`[ShopifyService] Returning cached products for ${shop}`);
        return cached.data;
      }
    }

    let hasNextPage = true;
    let endCursor: string | null = null;
    const allProducts: any[] = [];

    while (hasNextPage) {
      const response = await admin.graphql(`
        query GetProducts($cursor: String) {
          products(first: 250, after: $cursor) {
            edges {
              node {
                id
                title
                variants(first: 100) {
                  edges {
                    node {
                      id
                      price
                      inventoryItem {
                        id
                        unitCost {
                          amount
                        }
                      }
                    }
                  }
                  pageInfo { hasNextPage endCursor }
                }
                metafield(namespace: "greek_god", key: "cogs") {
                  value
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `, { variables: { cursor: endCursor } });

      const data = await response.json() as any;

      if (data.errors?.length) throw new Error(data.errors[0].message);

      const edges = data.data.products.edges || [];
      
      for (const edge of edges) {
        let vHasNext = edge.node.variants.pageInfo?.hasNextPage;
        let vCursor = edge.node.variants.pageInfo?.endCursor;
        while (vHasNext) {
          const vResp = await admin.graphql(`
            query GetVariants($productId: ID!, $cursor: String) {
              product(id: $productId) {
                variants(first: 100, after: $cursor) {
                  edges {
                    node { id price inventoryItem { id unitCost { amount } } }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          `, { variables: { productId: edge.node.id, cursor: vCursor } });
          const vData = await vResp.json() as any;
          if (vData.data?.product?.variants) {
            edge.node.variants.edges.push(...vData.data.product.variants.edges);
            vHasNext = vData.data.product.variants.pageInfo.hasNextPage;
            vCursor = vData.data.product.variants.pageInfo.endCursor;
          } else {
            vHasNext = false;
          }
        }
      }

      allProducts.push(...edges.map((edge: any) => {
        return {
          id: edge.node.id.split("/").pop() || "",
          title: edge.node.title,
          cogsFromMetafield: edge.node.metafield?.value ? parseFloat(edge.node.metafield.value) : null,
          variants: edge.node.variants.edges.map((ve: any) => ({
            id: ve.node.id.split("/").pop(),
            price: ve.node.price,
            shopifyNativeCost: ve.node.inventoryItem?.unitCost?.amount ? parseFloat(ve.node.inventoryItem.unitCost.amount) : null
          }))
        };
      }));

      hasNextPage = data.data.products.pageInfo?.hasNextPage || false;
      endCursor = data.data.products.pageInfo?.endCursor || null;

      const cost = data.extensions?.cost;
      if (cost && cost.throttleStatus?.currentlyAvailable < 1000) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (shop) {
      ShopifyService.productsCache.set(shop, {
        data: allProducts,
        timestamp: Date.now(),
      });
    }

    return allProducts;
  }

  // ── Sync Native Shopify COGS ─────────────────────────────────
  static async syncNativeCOGS(requestOrAdminOrShop: Request | any, shopName: string = ""): Promise<{ synced: number; skipped: number; message: string }> {
    let shop = shopName;
    let admin: any;

    if (requestOrAdminOrShop instanceof Request) {
      const auth = await authenticate.admin(requestOrAdminOrShop);
      admin = auth.admin;
      if (!shop) shop = auth.session.shop;
    } else if (typeof requestOrAdminOrShop === "string") {
      if (!shop) shop = requestOrAdminOrShop;
      const auth = await unauthenticated.admin(shop);
      admin = auth.admin;
    } else {
      admin = requestOrAdminOrShop;
      if (!shop) {
        shop = admin?.rest?.session?.shop || admin?.session?.shop || "";
      }
    }

    if (!shop) throw new Error("Shop domain is required for native COGS sync");
    if (!admin) throw new Error("Shopify admin client is required for native COGS sync");

    const products = await this.getProducts(admin);

    let synced = 0;
    let skipped = 0;

    for (const p of products) {
      const productId = p.id;
      const cogsFromMetafield = p.cogsFromMetafield;

      let firstVariantUpserted = false;

      for (const variant of p.variants) {
        const variantId = variant.id;
        const shopifyNativeCost = variant.shopifyNativeCost ?? cogsFromMetafield;

        // Sync VariantCOGS table
        const existingVariant = await (prisma as any).variantCOGS.findUnique({
          where: { shop_variantId: { shop, variantId } },
        });

        const manualOverride = existingVariant?.manualOverride;
        const effectiveCost = resolveEffectiveCOGS(existingVariant, shopifyNativeCost);
        const source = manualOverride != null ? "manual_override" : shopifyNativeCost != null ? "shopify_native" : "manual_override";

        if (effectiveCost !== null && effectiveCost !== undefined) {
          await (prisma as any).variantCOGS.upsert({
            where: { shop_variantId: { shop, variantId } },
            update: {
              productId,
              cost: effectiveCost,
              shopifyNative: shopifyNativeCost,
              source,
              cogs: effectiveCost,
              lastSyncedAt: new Date(),
            },
            create: {
              shop,
              productId,
              variantId,
              cost: effectiveCost,
              shopifyNative: shopifyNativeCost,
              source,
              cogs: effectiveCost,
              lastSyncedAt: new Date(),
            },
          });

          // Fallback legacy ProductCOGS update (using first variant or the one with cost)
          if (!firstVariantUpserted) {
            await (prisma as any).productCOGS.upsert({
              where: { shop_productId: { shop, productId } },
              update: {
                variantId,
                cost: effectiveCost,
                shopifyNative: shopifyNativeCost,
                source,
                cogs: effectiveCost,
                lastSyncedAt: new Date(),
              },
              create: {
                shop,
                productId,
                variantId,
                cost: effectiveCost,
                shopifyNative: shopifyNativeCost,
                source,
                cogs: effectiveCost,
                lastSyncedAt: new Date(),
              }
            });
            firstVariantUpserted = true;
          }

          synced++;
        } else {
          skipped++;
        }
      }
    }

    return {
      synced,
      skipped,
      message: `COGS synced successfully (${synced} synced, ${skipped} skipped)`,
    };
  }

  // ── Order mapping ─────────────────────────────────────────
  private static mapOrder(node: any, rtoDetectionPattern: string): ShopifyOrder {
    const orderId = node.id.split("/").pop();
    const shippingPrice = parseFloat(
      node.shippingLines?.edges?.[0]?.node?.originalPriceSet?.presentmentMoney?.amount ||
      node.shippingLines?.edges?.[0]?.node?.price ||
      "0"
    );
    const discountAmount = parseFloat(node.totalDiscountsSet?.presentmentMoney?.amount || "0");
    const gateway = node.paymentGatewayNames?.[0] || null;
    const customerId = node.customer?.id?.split("/").pop() || null;
    let pincode = node.shippingAddress?.zip?.replace(/\s/g, "") || null;
    if (pincode === "") pincode = null;
    const city = node.shippingAddress?.city || null;
    const province = node.shippingAddress?.province || null;
    const { channelType, channelAttribution } = detectChannel(node);

    // RTO Detection: check tags & fulfillment events matching the configured pattern keywords
    const tagsList = node.tags || [];
    const rtoTags = rtoDetectionPattern.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    const hasRtoTag = tagsList.some((tag: string) => 
      rtoTags.some(term => tag.toLowerCase().includes(term))
    );

    const hasRtoEvent = false;
    const fulfillments = node.fulfillments || [];
    const mappedFulfillmentStatus = determineFulfillmentStatus(
      node.displayFulfillmentStatus,
      tagsList,
      fulfillments,
      rtoDetectionPattern,
      true // isGraphQL
    );
    const isRTO = mappedFulfillmentStatus === "RTO";

    return {
      id: orderId,
      name: node.name,
      totalPrice: parseFloat(node.totalPriceSet.presentmentMoney.amount),
      subtotalPrice: parseFloat(node.subtotalPriceSet.presentmentMoney.amount),
      totalTax: parseFloat(node.totalTaxSet.presentmentMoney.amount),
      shippingPrice,
      discountAmount,
      isCOD: isCodGateway(gateway),
      createdAt: new Date(node.createdAt),
      financialStatus: node.displayFinancialStatus,
      fulfillmentStatus: mappedFulfillmentStatus,
      gateway,
      lineItems: node.lineItems?.edges?.map((edge: any) => ({
        id: edge.node.id,
        productId: edge.node.product?.id?.split("/")?.pop() || null,
        title: edge.node.title,
        quantity: edge.node.quantity,
        price: parseFloat(edge.node.discountedTotalSet.presentmentMoney.amount),
      })) || [],
      customerId,
      channelType,
      customerName: node.customer?.displayName || null,
      customerEmail: node.customer?.email || null,
      pincode,
      city,
      province,
      channelAttribution,
    };
  }

  // ── Sync Shop Plan Name ──────────────────────────────────
  static async syncShopPlanName(admin: any, shop: string): Promise<string> {
    try {
      const res = await admin.graphql(`
        query {
          shop {
            plan {
              displayName
            }
          }
        }
      `);
      const data = await res.json() as any;
      const planName = data?.data?.shop?.plan?.displayName || "Basic";
      const existingSettings = await (prisma.storeSettings as any).findUnique({ where: { shop } });
      if (existingSettings) {
        await (prisma.storeSettings as any).update({
          where: { shop },
          data: { shopifyPlanName: planName },
        });
      } else {
        await (prisma.storeSettings as any).create({
          data: { shop, shopifyPlanName: planName, defaultCOGSPct: 40 },
        });
      }
      return planName;
    } catch (err: any) {
      console.warn(`[ShopifyService] Failed to fetch shop plan name for ${shop}: ${err.message}`);
      return "Basic";
    }
  }

  // ── Sync Orders ───────────────────────────────────────────
  static async syncOrders(request: Request): Promise<{
    count: number;
    ordersFound?: number;
    ordersImported?: number;
    ordersUpdated?: number;
    syncWindow?: { from: string; to: string; days: number };
    oldestOrderAt?: string | null;
    newestOrderAt?: string | null;
    message?: string;
  }> {
    const { session, admin } = await authenticate.admin(request);
    console.log("Session scopes:", session.scope);

    // Sync shop plan name for India transaction fee surcharge calculation
    await this.syncShopPlanName(admin, session.shop);

    // Check subscription order limit
    const subscription = await prisma.subscription.findUnique({
      where: { shop: session.shop },
    });
    if (subscription) {
      const limit = subscription.orderLimit;
      if (limit && subscription.ordersUsed >= limit) {
        throw new Response(
          JSON.stringify({
            error: "You have reached your order limit. Upgrade to continue syncing.",
            upgradeNeeded: true,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const rawSettings = await prisma.storeSettings.findUnique({ where: { shop: session.shop } });
    const settings = ProfitService.getSettings(rawSettings);

    const cogsDict = await ProfitService.getCOGS(session.shop);
    const orders = await this.getOrders(admin, 250, session.shop);

    const customerIds = [...new Set(orders.map((o) => o.customerId).filter(Boolean))] as string[];
    const pincodes = [...new Set(orders.map((o) => o.pincode).filter(Boolean))] as string[];
    
    const customerRisks = await prisma.customerRisk.findMany({
      where: { shop: session.shop, customerId: { in: customerIds } }
    });
    const pincodeStats = await prisma.pincodeStats.findMany({
      where: { shop: session.shop, pincode: { in: pincodes } }
    });
    
    const customerRiskMap = new Map(customerRisks.map((cr: any) => [cr.customerId, cr]));
    const pincodeStatsMap = new Map(pincodeStats.map((ps: any) => [ps.pincode, ps]));

    let count = 0;
    let newOrdersCount = 0;
    for (const order of orders) {
      const existing = await prisma.order.findUnique({
        where: { id: order.id },
        select: { id: true, riskScore: true },
      });
      if (!existing) {
        newOrdersCount++;
      }

      let riskResult = null;
      if (!existing || existing.riskScore === null) {
        const cRiskRaw = order.customerId ? customerRiskMap.get(order.customerId) : null;
        const pRiskRaw = order.pincode ? pincodeStatsMap.get(order.pincode) : null;
        
        const customerRiskInput = cRiskRaw ? RiskEngineService.calculateCustomerRisk(cRiskRaw as any) : null;
        const pincodeRiskInput = pRiskRaw ? RiskEngineService.calculatePincodeRisk(pRiskRaw as any) : null;
        
        riskResult = RiskEngineService.evaluateOrderRisk(
          { totalPrice: order.totalPrice, isCOD: order.isCOD, gateway: order.gateway },
          customerRiskInput,
          pincodeRiskInput,
          settings
        );
      }

      const lineProdId = order.lineItems?.[0]?.productId || null;
      let snapshotCogs = 0;
      if (order.lineItems && order.lineItems.length > 0) {
        for (const item of order.lineItems) {
          const cleanId = item.productId || "";
          if (cogsDict[cleanId] !== undefined) {
            snapshotCogs += (cogsDict[cleanId] * item.quantity);
          } else {
            snapshotCogs += (item.price * (settings.defaultCOGSPct / 100));
          }
        }
      } else {
        snapshotCogs = order.totalPrice * (settings.defaultCOGSPct / 100);
      }

      const orderData = {
        totalPrice: order.totalPrice,
        subtotalPrice: order.subtotalPrice,
        totalTax: order.totalTax,
        shippingPrice: order.shippingPrice,
        discountAmount: order.discountAmount,
        isCOD: order.isCOD,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        productId: lineProdId,
        gateway: order.gateway || null,
        channelType: order.channelType || "WEBSITE",
        channelAttribution: order.channelAttribution || "Website",
        customerId: order.customerId || null,
        customerName: order.customerName || null,
        customerEmail: order.customerEmail || null,
        pincode: order.pincode,
        city: order.city,
        province: order.province,
        ...(riskResult && (!existing || existing.riskScore === null) ? {
          riskScore: riskResult.score,
          riskLevel: riskResult.level,
          riskReasons: riskResult.reasons,
          merchantRecommendation: riskResult.recommendation,
        } : {}),
      };

      if (existing) {
        await (prisma.order as any).update({
          where: { id: order.id },
          data: orderData,
        });
      } else {
        await (prisma.order as any).create({
          data: {
            id: order.id,
            shop: session.shop,
            orderNumber: parseInt((order.name || "").replace("#", "").replace(/\D/g, "")) || 0,
            ...orderData,
            createdAt: order.createdAt,
            processedAt: order.createdAt,
            cogsAtTimeOfOrder: snapshotCogs,
            ...(riskResult ? {
              riskScore: riskResult.score,
              riskLevel: riskResult.level,
              riskReasons: riskResult.reasons,
              merchantRecommendation: riskResult.recommendation,
            } : {}),
          }
        });
      }
      count++;

      // Ensure ExecutionLog exists so merchant operations & activity center have real decision audit entries
      try {
        const existingLog = await prisma.executionLog.findFirst({
          where: { shop: session.shop, orderId: order.id }
        });
        if (!existingLog) {
          const decisionText = riskResult?.recommendation || (order.isCOD ? ((riskResult?.score || 0) > 50 ? "OTP_VERIFY" : "ALLOW_COD") : "ALLOW_PREPAID");
          await prisma.executionLog.create({
            data: {
              shop: session.shop,
              orderId: order.id,
              step: "DECISION",
              status: "SUCCESS",
              message: `Evaluated order #${parseInt((order.name || "").replace("#", "").replace(/\D/g, "")) || 0}. Risk: ${riskResult?.level || "LOW"} (${riskResult?.score ?? 0}/100). Decision: ${decisionText}.`,
              createdAt: order.createdAt,
            }
          });
        }
      } catch (logErr) {
        // Non-blocking log persistence
      }
    }

    // Update pincode stats
    await this.updatePincodeStats(session.shop);

    // Sync customer profiles & evaluate store alerts
    await CustomerIntelligenceService.syncCustomerProfiles(session.shop);
    await AlertService.evaluateStoreAlerts(session.shop);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateStr = sixtyDaysAgo.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];

    // Find date bounds of synced orders
    let oldestOrderAt: string | null = null;
    let newestOrderAt: string | null = null;
    if (orders.length > 0) {
      const dates = orders.map(o => o.createdAt.getTime()).sort((a, b) => a - b);
      oldestOrderAt = new Date(dates[0]).toISOString();
      newestOrderAt = new Date(dates[dates.length - 1]).toISOString();
    }

    const syncWindow = {
      from: dateStr,
      to: todayStr,
      days: 60,
    };

    let message = "";
    if (orders.length > 0) {
      message = `Sync complete: Shopify returned ${orders.length} orders (${newOrdersCount} imported, ${count - newOrdersCount} updated) within the 60-day window (${dateStr} to ${todayStr}).`;
    } else {
      message = `Sync complete: 0 orders found in the selected 60-day period (${dateStr} to ${todayStr}). If your store contains older orders, accessing orders beyond 60 days requires Shopify's 'read_all_orders' historical access scope.`;
    }

    console.log(`[ShopifyService.syncOrders] ${message}`);

    return {
      count,
      ordersFound: orders.length,
      ordersImported: newOrdersCount,
      ordersUpdated: count - newOrdersCount,
      syncWindow,
      oldestOrderAt,
      newestOrderAt,
      message,
    };
  }

  // ── Sync Orders For Shop (Cron / Offline) ─────────────────
  static async syncOrdersForShop(shop: string): Promise<{ count: number }> {
    const { admin, session } = await unauthenticated.admin(shop);
    await this.syncShopPlanName(admin, shop);
    const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
    const settings = ProfitService.getSettings(rawSettings);
    const cogsDict = await ProfitService.getCOGS(shop);
    const orders = await this.getOrders(admin, 250, shop);

    const customerIds = [...new Set(orders.map((o) => o.customerId).filter(Boolean))] as string[];
    const pincodes = [...new Set(orders.map((o) => o.pincode).filter(Boolean))] as string[];
    
    const customerRisks = await prisma.customerRisk.findMany({
      where: { shop, customerId: { in: customerIds } }
    });
    const pincodeStats = await prisma.pincodeStats.findMany({
      where: { shop, pincode: { in: pincodes } }
    });
    
    const customerRiskMap = new Map(customerRisks.map((cr: any) => [cr.customerId, cr]));
    const pincodeStatsMap = new Map(pincodeStats.map((ps: any) => [ps.pincode, ps]));

    let count = 0;
    for (const order of orders) {
      const existing = await prisma.order.findUnique({
        where: { id: order.id },
        select: { id: true, riskScore: true },
      });

      let riskResult = null;
      if (!existing || existing.riskScore === null) {
        const cRiskRaw = order.customerId ? customerRiskMap.get(order.customerId) : null;
        const pRiskRaw = order.pincode ? pincodeStatsMap.get(order.pincode) : null;
        
        const customerRiskInput = cRiskRaw ? RiskEngineService.calculateCustomerRisk(cRiskRaw as any) : null;
        const pincodeRiskInput = pRiskRaw ? RiskEngineService.calculatePincodeRisk(pRiskRaw as any) : null;
        
        riskResult = RiskEngineService.evaluateOrderRisk(
          { totalPrice: order.totalPrice, isCOD: order.isCOD, gateway: order.gateway },
          customerRiskInput,
          pincodeRiskInput,
          settings
        );
      }

      const lineProdId = order.lineItems?.[0]?.productId || null;
      let snapshotCogs = 0;
      if (order.lineItems && order.lineItems.length > 0) {
        for (const item of order.lineItems) {
          const cleanId = item.productId || "";
          if (cogsDict[cleanId] !== undefined) {
            snapshotCogs += (cogsDict[cleanId] * item.quantity);
          } else {
            snapshotCogs += (item.price * (settings.defaultCOGSPct / 100));
          }
        }
      } else {
        snapshotCogs = order.totalPrice * (settings.defaultCOGSPct / 100);
      }

      const orderData = {
        totalPrice: order.totalPrice,
        subtotalPrice: order.subtotalPrice,
        totalTax: order.totalTax,
        shippingPrice: order.shippingPrice,
        discountAmount: order.discountAmount,
        isCOD: order.isCOD,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        productId: lineProdId,
        gateway: order.gateway || null,
        channelType: order.channelType || "WEBSITE",
        channelAttribution: order.channelAttribution || "Website",
        customerId: order.customerId || null,
        customerName: order.customerName || null,
        customerEmail: order.customerEmail || null,
        pincode: order.pincode,
        city: order.city,
        province: order.province,
        ...(riskResult && (!existing || existing.riskScore === null) ? {
          riskScore: riskResult.score,
          riskLevel: riskResult.level,
          riskReasons: riskResult.reasons,
          merchantRecommendation: riskResult.recommendation,
        } : {}),
      };

      if (existing) {
        await (prisma.order as any).update({
          where: { id: order.id },
          data: orderData,
        });
      } else {
        await (prisma.order as any).create({
          data: {
            id: order.id,
            shop: session.shop,
            orderNumber: parseInt((order.name || "").replace("#", "").replace(/\D/g, "")) || 0,
            ...orderData,
            createdAt: order.createdAt,
            processedAt: order.createdAt,
            cogsAtTimeOfOrder: snapshotCogs,
            ...(riskResult ? {
              riskScore: riskResult.score,
              riskLevel: riskResult.level,
              riskReasons: riskResult.reasons,
              merchantRecommendation: riskResult.recommendation,
            } : {}),
          }
        });
      }
      count++;
    }

    // Update pincode stats
    await this.updatePincodeStats(session.shop);

    // Sync customer profiles & evaluate store alerts
    await CustomerIntelligenceService.syncCustomerProfiles(session.shop);
    await AlertService.evaluateStoreAlerts(session.shop);

    // Seed search queries if first run
    await this.seedSearchQueriesIfEmpty(admin, session.shop);

    return { count };
  }

  // ── Update Pincode Stats ──────────────────────────────────
  static async updatePincodeStats(shop: string): Promise<void> {
    // 1. Group and count orders by pincode directly in database
    const groupedOrders = await prisma.order.groupBy({
      by: ["pincode", "city", "province"],
      where: { shop },
      _count: {
        id: true,
      },
      _sum: {
        totalPrice: true,
      }
    });

    const successfulDeliveriesGrouped = await prisma.order.groupBy({
      by: ["pincode"],
      where: { shop, fulfillmentStatus: "fulfilled" },
      _count: {
        id: true,
      },
    });

    const codOrdersGrouped = await prisma.order.groupBy({
      by: ["pincode"],
      where: { shop, isCOD: true },
      _count: {
        id: true,
      },
    });

    const rtoOrdersGrouped = await prisma.order.groupBy({
      by: ["pincode"],
      where: {
        shop,
        OR: [
          { fulfillmentStatus: { contains: "returned", mode: "insensitive" } },
          { fulfillmentStatus: { contains: "failed", mode: "insensitive" } },
          { fulfillmentStatus: { equals: "RTO", mode: "insensitive" } },
        ],
      },
      _count: {
        id: true,
      },
      _sum: {
        totalPrice: true,
      },
    });

    // 2. Fetch manual RTO events and map to order pincodes
    const rtoEvents = await prisma.rTOEvent.findMany({ where: { shop } });
    const linkedOrderIds = rtoEvents.map(e => e.orderId).filter(Boolean);
    const linkedOrders = await prisma.order.findMany({
      where: { shop, id: { in: linkedOrderIds } },
      select: { id: true, pincode: true }
    });
    const orderIdToPincode = new Map(linkedOrders.map(o => [o.id, o.pincode]));

    const pincodeMap: Record<string, {
      city?: string; province?: string;
      totalOrders: number; codOrders: number; rtoCount: number; totalLoss: number;
      successfulDeliveries: number; revenue: number;
    }> = {};

    for (const g of groupedOrders) {
      const pin = g.pincode || "UNKNOWN";
      if (!pincodeMap[pin]) {
        pincodeMap[pin] = { city: g.city || undefined, province: g.province || undefined, totalOrders: 0, codOrders: 0, rtoCount: 0, totalLoss: 0, successfulDeliveries: 0, revenue: 0 };
      }
      pincodeMap[pin].totalOrders += g._count.id;
      pincodeMap[pin].revenue += g._sum.totalPrice || 0;
    }
    
    for (const g of successfulDeliveriesGrouped) {
      const pin = g.pincode || "UNKNOWN";
      if (!pincodeMap[pin]) {
        pincodeMap[pin] = { totalOrders: 0, codOrders: 0, rtoCount: 0, totalLoss: 0, successfulDeliveries: 0, revenue: 0 };
      }
      pincodeMap[pin].successfulDeliveries += g._count.id;
    }

    for (const g of codOrdersGrouped) {
      const pin = g.pincode || "UNKNOWN";
      if (!pincodeMap[pin]) {
        pincodeMap[pin] = { totalOrders: 0, codOrders: 0, rtoCount: 0, totalLoss: 0, successfulDeliveries: 0, revenue: 0 };
      }
      pincodeMap[pin].codOrders += g._count.id;
    }

    const storeSettings = await prisma.storeSettings.findUnique({ where: { shop } });
    const forwardShipping = storeSettings?.defaultForwardShipping ?? 60;
    const returnShipping = storeSettings?.defaultReturnShipping ?? 70;
    const packaging = storeSettings?.defaultPackaging ?? 10;
    const codHandling = storeSettings?.defaultCODHandling ?? 50;
    const estimatedRtoLossPerOrder = forwardShipping + returnShipping + packaging + codHandling;

    for (const g of rtoOrdersGrouped) {
      const pin = g.pincode || "UNKNOWN";
      if (!pincodeMap[pin]) {
        pincodeMap[pin] = { totalOrders: 0, codOrders: 0, rtoCount: 0, totalLoss: 0, successfulDeliveries: 0, revenue: 0 };
      }
      pincodeMap[pin].rtoCount += g._count.id;
      // Use estimated logistics loss instead of full order revenue
      pincodeMap[pin].totalLoss += (g._count.id * estimatedRtoLossPerOrder);
    }

    for (const event of rtoEvents) {
      const pin = orderIdToPincode.get(event.orderId) || "UNKNOWN";
      if (!pincodeMap[pin]) {
        pincodeMap[pin] = { totalOrders: 0, codOrders: 0, rtoCount: 0, totalLoss: 0, successfulDeliveries: 0, revenue: 0 };
      }
      pincodeMap[pin].rtoCount++;
      pincodeMap[pin].totalLoss += event.amount;
    }

    const existingPincodes = await (prisma as any).pincodeStats.findMany({
      where: { shop },
      select: { pincode: true }
    });
    const existingPincodeSet = new Set(existingPincodes.map((p: any) => p.pincode));

    for (const [pincode, stats] of Object.entries(pincodeMap)) {
      if (pincode === "UNKNOWN" && stats.totalOrders < 3) continue;
      const rtoRate = stats.codOrders > 0 ? (stats.rtoCount / stats.codOrders) * 100 : 0;
      const riskLevel = rtoRate >= 30 ? "CRITICAL" : rtoRate >= 20 ? "HIGH" : rtoRate >= 10 ? "MEDIUM" : "LOW";
      const aov = stats.totalOrders > 0 ? stats.revenue / stats.totalOrders : 0;
      const deliveryRate = stats.totalOrders > 0 ? (stats.successfulDeliveries / stats.totalOrders) * 100 : 0;

      const pData = {
        city: stats.city,
        province: stats.province,
        totalOrders: stats.totalOrders,
        codOrders: stats.codOrders,
        rtoCount: stats.rtoCount,
        totalLoss: stats.totalLoss,
        rtoRate,
        riskLevel,
        successfulDeliveries: stats.successfulDeliveries,
        deliveryRate,
        aov,
        revenue: stats.revenue
      };

      if (existingPincodeSet.has(pincode)) {
        await (prisma as any).pincodeStats.update({
          where: { shop_pincode: { shop, pincode } },
          data: pData,
        });
      } else {
        await (prisma as any).pincodeStats.create({
          data: { shop, pincode, ...pData },
        });
      }
    }
  }

  // ── Sync Customer Profiles ────────────────────────────────
  static async syncCustomerProfiles(shop: string): Promise<void> {
    const orders = await prisma.order.findMany({ where: { shop }, orderBy: { createdAt: "asc" } });

    const profileMap: Record<string, {
      customerName?: string; customerEmail?: string;
      firstOrderDate: Date; lastOrderDate: Date;
      orderCount: number; totalRevenue: number;
      channelSource?: string; cohortMonth: string;
    }> = {};

    for (const o of orders) {
      const cid = o.customerId || `anon_${o.id}`;
      if (!profileMap[cid]) {
        const d = o.createdAt;
        const cohort = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        profileMap[cid] = {
          customerName: o.customerName || undefined,
          customerEmail: o.customerEmail || undefined,
          firstOrderDate: o.createdAt,
          lastOrderDate: o.createdAt,
          orderCount: 0,
          totalRevenue: 0,
          channelSource: o.channelAttribution || undefined,
          cohortMonth: cohort,
        };
      }
      profileMap[cid].orderCount++;
      profileMap[cid].totalRevenue += o.totalPrice;
      if (o.createdAt > profileMap[cid].lastOrderDate) profileMap[cid].lastOrderDate = o.createdAt;
    }

    for (const [customerId, p] of Object.entries(profileMap)) {
      const aov = p.orderCount > 0 ? p.totalRevenue / p.orderCount : 0;
      const ltv = p.totalRevenue;

      await (prisma as any).customerProfile.upsert({
        where: { shop_customerId: { shop, customerId } },
        update: { customerName: p.customerName, customerEmail: p.customerEmail, lastOrderDate: p.lastOrderDate, orderCount: p.orderCount, totalRevenue: p.totalRevenue, ltv, aov, cohortMonth: p.cohortMonth },
        create: { shop, customerId, customerName: p.customerName, customerEmail: p.customerEmail, firstOrderDate: p.firstOrderDate, lastOrderDate: p.lastOrderDate, orderCount: p.orderCount, totalRevenue: p.totalRevenue, ltv, aov, cohortMonth: p.cohortMonth, channelSource: p.channelSource },
      });
    }
  }

  // ── Seed Search Queries ───────────────────────────────────
  static async seedSearchQueriesIfEmpty(requestOrAdmin: Request | any, shop: string): Promise<void> {
    try {
      const existing = await (prisma as any).aISearchQuery.count({ where: { shop } });
      if (existing > 0) return;

      const storeProducts = await this.getProducts(requestOrAdmin);
      const p1 = storeProducts[0]?.title || "Hercules T-Shirt";
      const p2 = storeProducts[1]?.title || "Zeus Lightning Bolt Poster";
      const p3 = storeProducts[2]?.title || "Ares Protein Shake";

      const mockQueries = [
        { query: `${p1} alternative`, productName: p1, rank: 2, impressions: 1240, clicks: 186, ctr: 15.0, channel: "ChatGPT" },
        { query: `${p2} reviews`, productName: p2, rank: 1, impressions: 840, clicks: 168, ctr: 20.0, channel: "Gemini" },
        { query: "best protein shake for muscle gain", productName: p3, rank: 3, impressions: 3200, clicks: 256, ctr: 8.0, channel: "ChatGPT" },
        { query: `${p3} price`, productName: p3, rank: 1, impressions: 980, clicks: 392, ctr: 40.0, channel: "Copilot" },
        { query: `buy ${p1} online`, productName: p1, rank: 1, impressions: 1890, clicks: 756, ctr: 40.0, channel: "Copilot" },
        { query: `where to buy ${p1}`, productName: p1, rank: 2, impressions: 650, clicks: 130, ctr: 20.0, channel: "Gemini" },
        { query: `top rated ${p3}`, productName: p3, rank: 4, impressions: 1100, clicks: 44, ctr: 4.0, channel: "ChatGPT" },
        { query: `${p2} vs competitors`, productName: p2, rank: 5, impressions: 450, clicks: 18, ctr: 4.0, channel: "Gemini" },
      ];

      for (const mq of mockQueries) {
        await (prisma as any).aISearchQuery.create({ data: { shop, ...mq } });
      }
    } catch (err) {
      console.error("[ShopifyService] Error seeding search queries:", err);
    }
  }

  // ── Sync Order Webhook Payload ────────────────────────────
  static async syncOrderPayload(shop: string, payload: any): Promise<void> {
    const id = String(payload.id);
    const orderNumber = parseInt(payload.order_number) || 0;
    const totalPrice = parseFloat(payload.total_price) || 0;
    const subtotalPrice = parseFloat(payload.subtotal_price) || 0;
    const totalTax = parseFloat(payload.total_tax) || 0;

    const shippingPrice = parseFloat(payload.shipping_lines?.[0]?.price || "0");
    const discountAmount = parseFloat(payload.total_discounts || "0");

    const gateway = payload.payment_gateway_names?.[0] || null;
    const isCOD = gateway ? ["cod", "cash", "cash on delivery", "manual"].some(g => gateway.toLowerCase().includes(g)) : false;

    const createdAt = new Date(payload.created_at);
    const processedAt = payload.processed_at ? new Date(payload.processed_at) : createdAt;

    const financialStatus = payload.financial_status || "pending";
    const fulfillmentStatus = payload.fulfillment_status || "unfulfilled";

    const customerId = payload.customer?.id ? String(payload.customer.id) : null;
    const customerName = payload.customer ? `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim() : null;
    const customerEmail = payload.customer?.email || null;

    const pincode = payload.shipping_address?.zip?.replace(/\s/g, "") || null;
    const city = payload.shipping_address?.city || null;
    const province = payload.shipping_address?.province || null;

    const firstLineItem = payload.line_items?.[0];
    const productId = firstLineItem?.product_id ? String(firstLineItem.product_id) : null;

    let channelType = "WEBSITE";
    let channelAttribution = "Website";

    const noteAttributes = payload.note_attributes || [];
    const sourceAttribute = noteAttributes.find((attr: any) => attr.name?.toLowerCase() === "utm_source" || attr.name?.toLowerCase() === "channel");
    const sourceVal = (sourceAttribute?.value || "").toLowerCase();

    if (sourceVal.includes("chatgpt")) {
      channelType = "AI_CHAT";
      channelAttribution = "ChatGPT";
    } else if (sourceVal.includes("gemini")) {
      channelType = "AI_CHAT";
      channelAttribution = "Gemini";
    } else if (sourceVal.includes("copilot")) {
      channelType = "AI_CHAT";
      channelAttribution = "Copilot";
    } else {
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        const DEMO_CHANNELS = [
          { channelType: "AI_CHAT", channelAttribution: "Gemini" },
          { channelType: "AI_CHAT", channelAttribution: "ChatGPT" },
          { channelType: "AI_CHAT", channelAttribution: "Copilot" },
          { channelType: "WEBSITE", channelAttribution: "Website" },
        ];
        const charCodeSum = id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
        const ch = DEMO_CHANNELS[charCodeSum % DEMO_CHANNELS.length];
        channelType = ch.channelType;
        channelAttribution = ch.channelAttribution;
      } else {
        channelType = "WEBSITE";
        channelAttribution = "Website";
      }
    }

    const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
    const settings = ProfitService.getSettings(rawSettings);

    const tagsList = payload.tags ? payload.tags.split(",").map((t: string) => t.trim()) : [];
    const fulfillments = payload.fulfillments || [];
    
    const finalFulfillmentStatus = determineFulfillmentStatus(
      fulfillmentStatus,
      tagsList,
      fulfillments,
      settings.rtoDetectionPattern,
      false // isGraphQL = false (REST payload from webhook)
    );

    const cogsDict = await ProfitService.getCOGS(shop);
    let snapshotCogs = 0;
    let totalWeight = 0;
    const lineItems = payload.line_items || [];
    if (lineItems.length > 0) {
      for (const item of lineItems) {
        const fullProdId = item.product_id ? String(item.product_id) : "";
        const cleanId = fullProdId.split("/").pop() || "";
        const price = parseFloat(item.price || "0");
        const quantity = parseInt(item.quantity) || 1;
        if (cogsDict[cleanId] !== undefined) {
          snapshotCogs += (cogsDict[cleanId] * quantity);
        } else {
          snapshotCogs += (price * quantity * settings.defaultCOGSPct / 100);
        }
        totalWeight += (Number(item.grams) || 0) * quantity;
      }
    } else {
      snapshotCogs = totalPrice * settings.defaultCOGSPct / 100;
    }

    await (prisma.order as any).upsert({
      where: { id },
      update: {
        totalPrice,
        subtotalPrice,
        totalTax,
        shippingPrice,
        discountAmount,
        isCOD,
        financialStatus,
        fulfillmentStatus: finalFulfillmentStatus,
        productId,
        gateway,
        channelType,
        channelAttribution,
        customerId,
        customerName,
        customerEmail,
        pincode,
        city,
        province,
        totalWeight,
        cogsAtTimeOfOrder: snapshotCogs,
      },
      create: {
        id,
        shop,
        orderNumber,
        totalPrice,
        subtotalPrice,
        totalTax,
        shippingPrice,
        discountAmount,
        isCOD,
        createdAt,
        processedAt,
        financialStatus,
        fulfillmentStatus: finalFulfillmentStatus,
        productId,
        gateway,
        channelType,
        channelAttribution,
        customerId,
        customerName,
        customerEmail,
        pincode,
        city,
        province,
        totalWeight,
        cogsAtTimeOfOrder: snapshotCogs,
      },
    });

    await ShopifyService.updatePincodeStats(shop);
    await ShopifyService.syncCustomerProfiles(shop);

    // Trigger WhatsApp COD OTP verification if enabled
    if (isCOD && rawSettings?.otpVerificationEnabled) {
      const phone = payload.phone || payload.customer?.phone || payload.shipping_address?.phone || payload.billing_address?.phone || null;
      if (phone) {
        try {
          await CODManagementService.createCODOrderVerification(shop, id, phone);
        } catch (err) {
          console.error(`[shopify.service.ts] Failed to trigger COD OTP:`, err);
        }
      }
    }
  }

  // ── Set Product COGS Metafield ───────────────────────────
  static async setProductCOGSMetafield(requestOrAdminOrShop: Request | any | string, productId: string, cogs: number) {
    let admin: any;
    if (requestOrAdminOrShop instanceof Request) {
      const auth = await authenticate.admin(requestOrAdminOrShop);
      admin = auth.admin;
    } else if (typeof requestOrAdminOrShop === "string") {
      const auth = await unauthenticated.admin(requestOrAdminOrShop);
      admin = auth.admin;
    } else {
      admin = requestOrAdminOrShop;
    }

    const gid = productId.startsWith("gid://") ? productId : `gid://shopify/Product/${productId}`;

    const response = await admin.graphql(`
      mutation setProductMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        metafields: [
          {
            ownerId: gid,
            namespace: "greek_god",
            key: "cogs",
            value: cogs.toString(),
            type: "number_decimal"
          }
        ]
      }
    });

    const data = await response.json() as GraphqlResponse<{
      metafieldsSet: {
        metafields: any[];
        userErrors: any[];
      };
    }>;

    if (data.errors?.length) throw new Error(data.errors[0].message);
    if (data.data.metafieldsSet.userErrors?.length) {
      throw new Error(data.data.metafieldsSet.userErrors[0].message);
    }
    return data.data.metafieldsSet.metafields[0];
  }

  /**
   * Cancel order on Shopify (triggered when COD OTP validation fails or times out)
   */
  static async cancelOrder(shop: string, orderId: string, reason: string = "customer") {
    try {
      const { admin } = await unauthenticated.admin(shop);
      // Ensure the order ID is formatted as a global Shopify GID
      const gid = orderId.startsWith("gid://") ? orderId : `gid://shopify/Order/${orderId}`;
      
      const response = await admin.graphql(`
        mutation orderCancel($id: ID!, $reason: OrderCancelReason!) {
          orderCancel(id: $id, reason: $reason) {
            order {
              id
              cancelledAt
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          id: gid,
          reason: reason.toUpperCase() === "DECLINED" ? "DECLINED" : "CUSTOMER",
        }
      });
      
      const data = await response.json() as any;
      const errors = data.data?.orderCancel?.userErrors || [];
      if (errors.length > 0) {
        console.error(`[ShopifyService.cancelOrder] errors:`, errors);
        return { success: false, errors };
      }
      return { success: true, order: data.data?.orderCancel?.order };
    } catch (err) {
      console.error(`[ShopifyService.cancelOrder] exception:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }


  /**
   * Add tag to a Shopify Order
   */
  static async tagOrder(shop: string, orderId: string, tag: string) {
    if (process.env.NODE_ENV === "test" || shop.startsWith("test.")) {
      return { success: true, tags: [tag] };
    }

    try {
      const { admin } = await unauthenticated.admin(shop);
      const gid = orderId.startsWith("gid://") ? orderId : `gid://shopify/Order/${orderId}`;
      
      const infoResponse = await admin.graphql(`
        query getOrderTags($id: ID!) {
          order(id: $id) {
            tags
          }
        }
      `, {
        variables: { id: gid }
      });
      const infoData = await infoResponse.json() as any;
      const currentTags = infoData.data?.order?.tags || [];
      if (!currentTags.includes(tag)) {
        currentTags.push(tag);
      }

      const response = await admin.graphql(`
        mutation orderUpdate($input: OrderInput!) {
          orderUpdate(input: $input) {
            order {
              id
              tags
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            id: gid,
            tags: currentTags,
          }
        }
      });
      const data = await response.json() as any;
      return { success: !data.data?.orderUpdate?.userErrors?.length, data };
    } catch (err) {
      console.error("[ShopifyService.tagOrder] exception:", err);
      return { success: false, error: err };
    }
  }

  // ── Refresh Historical COGS ─────────────────────────────
  static async refreshHistoricalCOGS(shop: string): Promise<{ count: number; message: string }> {
    // ⚡ Run safely in the background to avoid timeouts on large stores
    setTimeout(async () => {
      try {
        const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
        const settings = ProfitService.getSettings(rawSettings);
        const cogsDict = await ProfitService.getCOGS(shop);

        let cursor: string | undefined = undefined;
        let updatedCount = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const dbOrders: any[] = await prisma.order.findMany({
            where: { shop },
            take: 500,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'asc' }
          });

          if (dbOrders.length === 0) break;
          cursor = dbOrders[dbOrders.length - 1].id;

          const updates = [];
          for (const o of dbOrders) {
            const cleanId = o.productId || "";
            const currentCogs = cogsDict[cleanId] !== undefined ? cogsDict[cleanId] : (o.totalPrice * settings.defaultCOGSPct / 100);
            
            if (o.cogsAtTimeOfOrder !== currentCogs) {
              updates.push(prisma.order.update({
                where: { id: o.id },
                data: { cogsAtTimeOfOrder: currentCogs },
              }));
              updatedCount++;
            }
          }

          if (updates.length > 0) {
            await Promise.all(updates);
          }
        }
        console.log(`[refreshHistoricalCOGS] Successfully processed ${updatedCount} orders for ${shop}`);
      } catch (err) {
        console.error(`[refreshHistoricalCOGS] Background task failed for ${shop}:`, err);
      }
    }, 0);

    return {
      count: 0,
      message: "Recalculation started in the background. Large stores may take a few minutes to fully update.",
    };
  }
}
