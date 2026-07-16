/* eslint-disable @typescript-eslint/no-explicit-any */
import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import { getSubscription } from "./feature-access.service";
import { CustomerIntelligenceService } from "./customer-intelligence.service";
import { AlertService } from "./alerts.service";
import { ProfitService } from "./profit.service";
import { CODManagementService } from "./cod-management.service";

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
                edges { node { price } }
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
              channelInformation {
                channelDefinition {
                  handle
                }
              }
              shippingAddress {
                zip
                city
                province
              }
              customer {
                id
                displayName
                email
              }
              lineItems(first: 10) {
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
        await (prisma as any).storeSettings.updateMany({
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
    } else {
      admin = requestOrAdmin;
      shop = admin?.rest?.session?.shop || admin?.session?.shop || "default_shop";
    }

    // ⚡ Cache hit check (TTL of 15 minutes = 15 * 60 * 1000 ms)
    if (shop) {
      const cached = ShopifyService.productsCache.get(shop);
      if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
        console.log(`[ShopifyService] Returning cached products for ${shop}`);
        return cached.data;
      }
    }

    const response = await admin.graphql(`
      query GetProducts {
        products(first: 100) {
          edges {
            node {
              id
              title
              variants(first: 50) {
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
              }
              metafield(namespace: "greek_god", key: "cogs") {
                value
              }
            }
          }
        }
      }
    `);

    const data = await response.json() as GraphqlResponse<{
      products: { edges: Array<{ node: any }> };
    }>;

    if (data.errors?.length) throw new Error(data.errors[0].message);

    const result = data.data.products.edges.map((edge) => {
      const firstVariant = edge.node.variants?.edges?.[0]?.node;
      const unitCost = firstVariant?.inventoryItem?.unitCost?.amount ? parseFloat(firstVariant.inventoryItem.unitCost.amount) : null;
      return {
        id: edge.node.id.split("/").pop() || "",
        title: edge.node.title,
        price: firstVariant?.price || "0",
        variantId: firstVariant?.id?.split("/")?.pop() || null,
        shopifyNativeCost: unitCost,
        cogsFromMetafield: edge.node.metafield?.value ? parseFloat(edge.node.metafield.value) : null,
      };
    });

    if (shop) {
      ShopifyService.productsCache.set(shop, {
        data: result,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  // ── Sync Native Shopify COGS ─────────────────────────────────
  static async syncNativeCOGS(requestOrAdmin: Request | any, shopName: string = ""): Promise<{ synced: number; skipped: number; message: string }> {
    let shop = shopName;
    if (requestOrAdmin instanceof Request) {
      const auth = await authenticate.admin(requestOrAdmin);
      if (!shop) shop = auth.session.shop;
    } else if (typeof requestOrAdmin === "string" && !shop) {
      shop = requestOrAdmin;
    }

    if (!shop) throw new Error("Shop domain is required for native COGS sync");

    const products = await this.getProducts(requestOrAdmin);

    let synced = 0;
    let skipped = 0;

    for (const p of products) {
      const productId = p.id;
      const shopifyNativeCost = p.shopifyNativeCost ?? p.cogsFromMetafield;

      const existingRecord = await (prisma as any).productCOGS.findUnique({
        where: { shop_productId: { shop, productId } },
      });

      const manualOverride = existingRecord?.manualOverride;
      const effectiveCost = manualOverride ?? shopifyNativeCost ?? (existingRecord?.cogs && existingRecord.cogs > 0 ? existingRecord.cogs : null);
      const source = manualOverride != null ? "manual_override" : shopifyNativeCost != null ? "shopify_native" : "manual_override";

      if (effectiveCost !== null && effectiveCost !== undefined) {
        await (prisma as any).productCOGS.upsert({
          where: { shop_productId: { shop, productId } },
          update: {
            variantId: p.variantId,
            cost: effectiveCost,
            shopifyNative: shopifyNativeCost,
            source,
            cogs: effectiveCost, // legacy compatibility
            lastSyncedAt: new Date(),
          },
          create: {
            shop,
            productId,
            variantId: p.variantId,
            cost: effectiveCost,
            shopifyNative: shopifyNativeCost,
            source,
            cogs: effectiveCost,
            lastSyncedAt: new Date(),
          },
        });
        synced++;
      } else {
        skipped++;
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
    const shippingPrice = parseFloat(node.shippingLines?.edges?.[0]?.node?.price || "0");
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

    let hasRtoEvent = false;
    const fulfillments = node.fulfillments || [];
    for (const f of fulfillments) {
      const events = f.events?.edges || [];
      for (const e of events) {
        const msg = (e.node.message || "").toLowerCase();
        const status = (e.node.status || "").toLowerCase();
        const matchesTerm = rtoTags.some(term => msg.includes(term));
        if (
          matchesTerm || 
          status === "failure" && msg.includes("undelivered")
        ) {
          hasRtoEvent = true;
          break;
        }
      }
      if (hasRtoEvent) break;
    }

    const isRTO = hasRtoTag || hasRtoEvent;
    const mappedFulfillmentStatus = isRTO ? "RTO" : node.displayFulfillmentStatus;

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
      await (prisma.storeSettings as any).upsert({
        where: { shop },
        update: { shopifyPlanName: planName },
        create: { shop, shopifyPlanName: planName, defaultCOGSPct: 40 },
      });
      return planName;
    } catch (err: any) {
      console.warn(`[ShopifyService] Failed to fetch shop plan name for ${shop}: ${err.message}`);
      return "Basic";
    }
  }

  // ── Sync Orders ───────────────────────────────────────────
  static async syncOrders(request: Request): Promise<{ count: number }> {
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

    const cogsDict = await ProfitService.getCOGS(session.shop);
    const orders = await this.getOrders(admin, 250, session.shop);

    let count = 0;
    let newOrdersCount = 0;
    for (const order of orders) {
      const existing = await prisma.order.findUnique({
        where: { id: order.id },
        select: { id: true },
      });
      if (!existing) {
        newOrdersCount++;
      }

      const lineProdId = order.lineItems?.[0]?.productId || null;
      let snapshotCogs = 0;
      if (order.lineItems && order.lineItems.length > 0) {
        for (const item of order.lineItems) {
          const cleanId = item.productId || "";
          if (cogsDict[cleanId] !== undefined) {
            snapshotCogs += (cogsDict[cleanId] * item.quantity);
          } else {
            snapshotCogs += (item.price * 0.4);
          }
        }
      } else {
        snapshotCogs = order.totalPrice * 0.4;
      }

      await (prisma.order as any).upsert({
        where: { id: order.id },
        update: {
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
        },
        create: {
          id: order.id,
          shop: session.shop,
          orderNumber: parseInt((order.name || "").replace("#", "").replace(/\D/g, "")) || 0,
          totalPrice: order.totalPrice,
          subtotalPrice: order.subtotalPrice,
          totalTax: order.totalTax,
          shippingPrice: order.shippingPrice,
          discountAmount: order.discountAmount,
          isCOD: order.isCOD,
          createdAt: order.createdAt,
          processedAt: order.createdAt,
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
          cogsAtTimeOfOrder: snapshotCogs,
        },
      });
      count++;
    }

    // Update pincode stats
    await this.updatePincodeStats(session.shop);

    // Sync customer profiles & evaluate store alerts
    await CustomerIntelligenceService.syncCustomerProfiles(session.shop);
    await AlertService.evaluateStoreAlerts(session.shop);

    // Seed search queries if first run
    await this.seedSearchQueriesIfEmpty(admin, session.shop);

    // Update ordersUsed count in subscription
    if (subscription && newOrdersCount > 0) {
      await prisma.subscription.update({
        where: { shop: session.shop },
        data: { ordersUsed: { increment: newOrdersCount } },
      });
    }

    return { count };
  }

  // ── Sync Orders For Shop (Cron / Offline) ─────────────────
  static async syncOrdersForShop(shop: string): Promise<{ count: number }> {
    const { admin, session } = await unauthenticated.admin(shop);
    await this.syncShopPlanName(admin, shop);
    const cogsDict = await ProfitService.getCOGS(shop);
    const orders = await this.getOrders(admin, 250, shop);

    let count = 0;
    for (const order of orders) {
      const lineProdId = order.lineItems?.[0]?.productId || null;
      let snapshotCogs = 0;
      if (order.lineItems && order.lineItems.length > 0) {
        for (const item of order.lineItems) {
          const cleanId = item.productId || "";
          if (cogsDict[cleanId] !== undefined) {
            snapshotCogs += (cogsDict[cleanId] * item.quantity);
          } else {
            snapshotCogs += (item.price * 0.4);
          }
        }
      } else {
        snapshotCogs = order.totalPrice * 0.4;
      }

      await (prisma.order as any).upsert({
        where: { id: order.id },
        update: {
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
        },
        create: {
          id: order.id,
          shop: session.shop,
          orderNumber: parseInt((order.name || "").replace("#", "").replace(/\D/g, "")) || 0,
          totalPrice: order.totalPrice,
          subtotalPrice: order.subtotalPrice,
          totalTax: order.totalTax,
          shippingPrice: order.shippingPrice,
          discountAmount: order.discountAmount,
          isCOD: order.isCOD,
          createdAt: order.createdAt,
          processedAt: order.createdAt,
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
          cogsAtTimeOfOrder: snapshotCogs,
        },
      });
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
    }> = {};

    for (const g of groupedOrders) {
      const pin = g.pincode || "UNKNOWN";
      if (!pincodeMap[pin]) {
        pincodeMap[pin] = { city: g.city || undefined, province: g.province || undefined, totalOrders: 0, codOrders: 0, rtoCount: 0, totalLoss: 0 };
      }
      pincodeMap[pin].totalOrders += g._count.id;
    }

    for (const g of codOrdersGrouped) {
      const pin = g.pincode || "UNKNOWN";
      if (!pincodeMap[pin]) {
        pincodeMap[pin] = { totalOrders: 0, codOrders: 0, rtoCount: 0, totalLoss: 0 };
      }
      pincodeMap[pin].codOrders += g._count.id;
    }

    for (const g of rtoOrdersGrouped) {
      const pin = g.pincode || "UNKNOWN";
      if (!pincodeMap[pin]) {
        pincodeMap[pin] = { totalOrders: 0, codOrders: 0, rtoCount: 0, totalLoss: 0 };
      }
      pincodeMap[pin].rtoCount += g._count.id;
      pincodeMap[pin].totalLoss += g._sum.totalPrice || 0;
    }

    for (const event of rtoEvents) {
      const pin = orderIdToPincode.get(event.orderId) || "UNKNOWN";
      if (pincodeMap[pin]) {
        pincodeMap[pin].rtoCount++;
        pincodeMap[pin].totalLoss += event.amount;
      }
    }

    const upsertPromises: any[] = [];
    for (const [pincode, stats] of Object.entries(pincodeMap)) {
      if (pincode === "UNKNOWN" && stats.totalOrders < 3) continue;
      const rtoRate = stats.codOrders > 0 ? (stats.rtoCount / stats.codOrders) * 100 : 0;
      const riskLevel = rtoRate >= 30 ? "CRITICAL" : rtoRate >= 20 ? "HIGH" : rtoRate >= 10 ? "MEDIUM" : "LOW";

      upsertPromises.push(
        (prisma as any).pincodeStats.upsert({
          where: { shop_pincode: { shop, pincode } },
          update: { city: stats.city, province: stats.province, totalOrders: stats.totalOrders, codOrders: stats.codOrders, rtoCount: stats.rtoCount, totalLoss: stats.totalLoss, rtoRate, riskLevel },
          create: { shop, pincode, city: stats.city, province: stats.province, totalOrders: stats.totalOrders, codOrders: stats.codOrders, rtoCount: stats.rtoCount, totalLoss: stats.totalLoss, rtoRate, riskLevel },
        })
      );
    }

    // Execute pincode upserts in chunks of 100
    const batchSize = 100;
    for (let i = 0; i < upsertPromises.length; i += batchSize) {
      const batch = upsertPromises.slice(i, i + batchSize);
      await prisma.$transaction(batch);
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
    const rtoTags = settings.rtoDetectionPattern.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);
    const hasRtoTag = tagsList.some((tag: string) => 
      rtoTags.some((term: string) => tag.toLowerCase().includes(term))
    );

    let hasRtoEvent = false;
    const fulfillments = payload.fulfillments || [];
    for (const f of fulfillments) {
      const status = (f.status || "").toLowerCase();
      const shipmentStatus = (f.shipment_status || "").toLowerCase();
      const trackingCompany = (f.tracking_company || "").toLowerCase();
      if (
        status === "failure" || 
        shipmentStatus === "rto" || 
        shipmentStatus === "returned" ||
        rtoTags.some((term: string) => shipmentStatus.includes(term) || trackingCompany.includes(term))
      ) {
        hasRtoEvent = true;
        break;
      }
    }

    const isRTO = hasRtoTag || hasRtoEvent;
    const finalFulfillmentStatus = isRTO ? "RTO" : fulfillmentStatus;

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
        fulfillmentStatus,
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
}
