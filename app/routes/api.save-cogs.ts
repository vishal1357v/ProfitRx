import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ShopifyService } from "../services/shopify.service";
import {
  checkRateLimit,
  getClientIp,
  validateCOGS,
  withDbRetry,
} from "../utils/security.server";

export async function action({ request }: { request: Request }) {
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

  try {
    const { session, admin } = await authenticate.admin(request);
    const body = await request.json();

    // Validate body structure
    if (!body || typeof body !== "object") {
      return Response.json(
        { error: "Invalid request body payload" },
        { status: 400 }
      );
    }

    // Fetch products to retrieve catalog prices for backend validations
    let products: any[] = [];
    try {
      products = await ShopifyService.getProducts(request);
    } catch (err) {
      console.error("[Save COGS API] Failed to fetch catalog prices for validation:", err);
    }
    const productPriceMap = new Map<string, number>(
      products.map((p) => [p.id, parseFloat(p.price || "0")])
    );

    const results = [];
    for (const [productId, cogs] of Object.entries(body)) {
      if (typeof cogs !== "number") {
        return Response.json(
          { error: "COGS value must be a valid number" },
          { status: 400 }
        );
      }

      const productPrice = productPriceMap.get(productId);
      if (!validateCOGS(cogs, productPrice)) {
        return Response.json(
          {
            error: `COGS value ₹${cogs} is invalid for Product ID: ${productId}. It must be non-negative and less than or equal to the selling price (₹${productPrice ?? "N/A"}).`,
          },
          { status: 400 }
        );
      }

      // Upsert within database retry wrapper
      const result = await withDbRetry(async () => {
        return await prisma.productCOGS.upsert({
          where: {
            shop_productId: { shop: session.shop, productId },
          },
          update: {
            cogs: cogs,
          },
          create: {
            shop: session.shop,
            productId: productId,
            cogs: cogs,
          },
        });
      });

      // Also write back to Shopify product metafield
      try {
        await ShopifyService.setProductCOGSMetafield(admin, productId, cogs);
      } catch (err) {
        console.error(`[Save COGS API] Failed to write metafield to Shopify for ${productId}:`, err);
      }

      results.push(result);
    }

    return Response.json({
      success: true,
      count: results.length,
      message: `Successfully saved COGS for ${results.length} products`,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("Error saving COGS:", error);
    return Response.json(
      { error: "Failed to save product costs" },
      { status: 500 }
    );
  }
}