/* eslint-disable @typescript-eslint/no-explicit-any */
import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";

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

  // Deterministic demo attribution based on order id (for stores without AI channels yet)
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

export class ShopifyService {
  // ── Orders ───────────────────────────────────────────────
  static async getOrders(requestOrAdmin: Request | any, limit: number = 100) {
    let admin: any;
    if (requestOrAdmin instanceof Request) {
      const auth = await authenticate.admin(requestOrAdmin);
      admin = auth.admin;
    } else {
      admin = requestOrAdmin;
    }

    const response = await admin.graphql(`
      query GetOrders($limit: Int!) {
        orders(first: $limit, sortKey: CREATED_AT, reverse: true) {
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
        }
      }
    `, { variables: { limit } });

    const data = await response.json() as GraphqlResponse<{
      orders: { edges: Array<{ node: any }> };
    }>;

    if (data.errors?.length) throw new Error(data.errors[0].message);
    return data.data.orders.edges.map((edge) => this.mapOrder(edge.node));
  }

  // ── Products ─────────────────────────────────────────────
  static async getProducts(requestOrAdmin: Request | any) {
    let admin: any;
    if (requestOrAdmin instanceof Request) {
      const auth = await authenticate.admin(requestOrAdmin);
      admin = auth.admin;
    } else {
      admin = requestOrAdmin;
    }

    const response = await admin.graphql(`
      query GetProducts {
        products(first: 100) {
          edges {
            node {
              id
              title
              variants(first: 1) {
                edges { node { id price } }
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

    return data.data.products.edges.map((edge) => ({
      id: edge.node.id.split("/").pop(),
      title: edge.node.title,
      price: edge.node.variants.edges[0]?.node.price || "0",
      cogsFromMetafield: edge.node.metafield?.value ? parseFloat(edge.node.metafield.value) : null,
    }));
  }

  // ── Order mapping ─────────────────────────────────────────
  private static mapOrder(node: any): ShopifyOrder {
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
      fulfillmentStatus: node.displayFulfillmentStatus,
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

  // ── Sync Orders ───────────────────────────────────────────
  static async syncOrders(request: Request): Promise<{ count: number }> {
    const { session, admin } = await authenticate.admin(request);
    console.log("Session scopes:", session.scope);

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

    const orders = await this.getOrders(admin, 100);

    let count = 0;
    for (const order of orders) {
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
          productId: order.lineItems?.[0]?.productId || null,
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
          productId: order.lineItems?.[0]?.productId || null,
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
      });
      count++;
    }

    // Update pincode stats
    await this.updatePincodeStats(session.shop);

    // Sync customer profiles
    await this.syncCustomerProfiles(session.shop);

    // Seed search queries if first run
    await this.seedSearchQueriesIfEmpty(admin, session.shop);

    // Update ordersUsed count in subscription
    if (subscription) {
      await prisma.subscription.update({
        where: { shop: session.shop },
        data: { ordersUsed: { increment: count } },
      });
    }

    return { count };
  }

  // ── Sync Orders For Shop (Cron / Offline) ─────────────────
  static async syncOrdersForShop(shop: string): Promise<{ count: number }> {
    const { admin, session } = await unauthenticated.admin(shop);
    const orders = await this.getOrders(admin, 100);

    let count = 0;
    for (const order of orders) {
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
          productId: order.lineItems?.[0]?.productId || null,
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
          productId: order.lineItems?.[0]?.productId || null,
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
      });
      count++;
    }

    // Update pincode stats
    await this.updatePincodeStats(session.shop);

    // Sync customer profiles
    await this.syncCustomerProfiles(session.shop);

    // Seed search queries if first run
    await this.seedSearchQueriesIfEmpty(admin, session.shop);

    return { count };
  }

  // ── Update Pincode Stats ──────────────────────────────────
  static async updatePincodeStats(shop: string): Promise<void> {
    const orders = await prisma.order.findMany({ where: { shop } });

    // Group by pincode
    const pincodeMap: Record<string, {
      city?: string; province?: string;
      totalOrders: number; codOrders: number; rtoCount: number; totalLoss: number;
    }> = {};

    for (const o of orders) {
      const pin = o.pincode || "UNKNOWN";
      if (!pincodeMap[pin]) {
        pincodeMap[pin] = { city: o.city || undefined, province: o.province || undefined, totalOrders: 0, codOrders: 0, rtoCount: 0, totalLoss: 0 };
      }
      pincodeMap[pin].totalOrders++;
      if ((o as any).isCOD) pincodeMap[pin].codOrders++;
      if (o.fulfillmentStatus?.toLowerCase().includes("returned") || o.fulfillmentStatus?.toLowerCase().includes("failed")) {
        pincodeMap[pin].rtoCount++;
        pincodeMap[pin].totalLoss += o.totalPrice;
      }
    }

    // Also count manual RTO events
    const rtoEvents = await prisma.rTOEvent.findMany({ where: { shop } });
    for (const event of rtoEvents) {
      const linkedOrder = orders.find((o: any) => o.id === event.orderId);
      if (!linkedOrder) continue;
      const pin = linkedOrder.pincode || "UNKNOWN";
      if (pincodeMap[pin]) {
        pincodeMap[pin].rtoCount++;
        pincodeMap[pin].totalLoss += event.amount;
      }
    }

    for (const [pincode, stats] of Object.entries(pincodeMap)) {
      if (pincode === "UNKNOWN" && stats.totalOrders < 3) continue;
      const rtoRate = stats.codOrders > 0 ? (stats.rtoCount / stats.codOrders) * 100 : 0;
      const riskLevel = rtoRate >= 30 ? "CRITICAL" : rtoRate >= 20 ? "HIGH" : rtoRate >= 10 ? "MEDIUM" : "LOW";

      await (prisma as any).pincodeStats.upsert({
        where: { shop_pincode: { shop, pincode } },
        update: { city: stats.city, province: stats.province, totalOrders: stats.totalOrders, codOrders: stats.codOrders, rtoCount: stats.rtoCount, totalLoss: stats.totalLoss, rtoRate, riskLevel },
        create: { shop, pincode, city: stats.city, province: stats.province, totalOrders: stats.totalOrders, codOrders: stats.codOrders, rtoCount: stats.rtoCount, totalLoss: stats.totalLoss, rtoRate, riskLevel },
      });
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
      },
    });

    await ShopifyService.updatePincodeStats(shop);
    await ShopifyService.syncCustomerProfiles(shop);
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
}