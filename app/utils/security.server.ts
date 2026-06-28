const ipRequests = new Map<string, { count: number; resetAt: number }>();

/**
 * Checks if the request is within rate limits.
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number = 100
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const record = ipRequests.get(ip);

  if (!record || now > record.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + 60000 });
    return { allowed: true, remaining: maxRequests - 1, resetIn: 60 };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count++;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetIn: Math.ceil((record.resetAt - now) / 1000),
  };
}

/**
 * Extracts client IP from request headers.
 */
export function getClientIp(request: Request): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp;
  return "127.0.0.1";
}

/**
 * Performs connection retries with exponential backoff on database queries.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 500
): Promise<T> {
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[DB Retry] Attempt ${attempt} failed: ${errMsg}`);
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Database transaction retry limit exceeded");
}

/**
 * Validates Cost of Goods Sold values.
 */
export function validateCOGS(cogs: number, price?: number): boolean {
  if (isNaN(cogs) || cogs < 0) {
    return false;
  }
  if (price !== undefined && cogs > price) {
    return false;
  }
  return true;
}

/**
 * Validates RTO Loss amount values.
 */
export function validateRTOEvent(amount: number, orderTotal: number): boolean {
  if (isNaN(amount) || amount < 0) {
    return false;
  }
  if (amount > orderTotal) {
    return false;
  }
  return true;
}

/**
 * Validates email addresses.
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generates secure CORS headers for Shopify storefront requests.
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowedOrigins = [/\.myshopify\.com$/, /^http:\/\/localhost(:\d+)?$/];
  const isAllowed = allowedOrigins.some((pattern) => {
    if (typeof pattern === "string") return pattern === origin;
    return pattern.test(origin);
  });

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}
