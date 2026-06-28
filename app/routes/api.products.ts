import { authenticate } from "../shopify.server";
import { ShopifyService } from "../services/shopify.service";

export async function loader({ request }: { request: Request }) {
  try {
    const products = await ShopifyService.getProducts(request);
    return Response.json({ products });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error('[Products API] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch products' },
      { status: 500 }
    );
  }
}