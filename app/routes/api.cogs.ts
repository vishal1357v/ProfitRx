import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ProfitService } from "../services/profit.service";
import {
  checkRateLimit,
  getClientIp,
  withDbRetry,
} from "../utils/security.server";

export async function loader({ request }: LoaderFunctionArgs) {
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
    const cogs = await withDbRetry(async () => {
      return await ProfitService.getCOGS(session.shop);
    });
    return Response.json({ cogs });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error('[COGS API] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch COGS' },
      { status: 500 }
    );
  }
}
