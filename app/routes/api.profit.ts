import { authenticate } from "../shopify.server";
import { ProfitService } from "../services/profit.service";
import {
  checkRateLimit,
  getClientIp,
  withDbRetry,
} from "../utils/security.server";

export async function loader({ request }: { request: Request }) {
  // IP Rate Limiting check
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
    const { session } = await authenticate.admin(request);
    const data = await withDbRetry(async () => {
      return await ProfitService.calculate(session.shop);
    });
    return Response.json(data);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error('[Profit API] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to calculate profit' },
      { status: 500 }
    );
  }
}