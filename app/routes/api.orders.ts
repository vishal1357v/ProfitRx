import { authenticate } from "../shopify.server";
import { ShopifyService } from "../services/shopify.service";

export async function loader({ request }: { request: Request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const orders = await ShopifyService.getOrders(admin, 50);
    return Response.json({ orders });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error('[Orders API] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
