/**
 * Data Loss Prevention (DLP) Utility
 *
 * Provides masking functions for protected customer data to prevent
 * PII from leaking into application logs, error traces, and exports.
 *
 * Used by: webhook routes, execution loggers, audit log service
 */

/**
 * Masks a phone number, preserving country code prefix and last 4 digits.
 * Examples:
 *   "+919876543210" → "+91 ****3210"
 *   "9876543210"    → "****3210"
 *   null/undefined  → null
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  const last4 = digits.slice(-4);

  // Detect Indian country code
  if (digits.startsWith("91") && digits.length >= 12) {
    return `+91 ****${last4}`;
  }
  return `****${last4}`;
}

/**
 * Masks an email address, preserving first character and domain.
 * Examples:
 *   "john@example.com" → "j***@example.com"
 *   "a@b.co"           → "a***@b.co"
 *   null/undefined      → null
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return "***@***";
  const firstChar = email[0];
  const domain = email.slice(atIndex);
  return `${firstChar}***${domain}`;
}

/**
 * Strips or masks sensitive data from a JSON-serializable object
 * before it is written to logs. Operates on a shallow copy.
 *
 * Fields that are fully redacted: accessToken, refreshToken, otp, password, secret
 * Fields that are masked: phone, email, customerEmail, customerName
 */
export function sanitizeLogData(data: Record<string, unknown>): Record<string, unknown> {
  if (!data || typeof data !== "object") return data;

  const redactKeys = new Set([
    "accessToken",
    "refreshToken",
    "otp",
    "password",
    "secret",
    "token",
    "api_secret",
    "apiSecret",
  ]);

  const maskFunctions: Record<string, (v: unknown) => unknown> = {
    phone: (v) => maskPhone(v as string),
    email: (v) => maskEmail(v as string),
    customerEmail: (v) => maskEmail(v as string),
    customerName: () => "[REDACTED]",
    customer_email: (v) => maskEmail(v as string),
    first_name: () => "[REDACTED]",
    last_name: () => "[REDACTED]",
  };

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (redactKeys.has(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (maskFunctions[key] && value != null) {
      sanitized[key] = maskFunctions[key](value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeLogData(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Produces a safe log string from a GDPR webhook payload.
 * Only includes non-PII identifiers: shop_domain, shop_id, customer.id, orders_requested.
 */
export function safeGdprLogSummary(payload: Record<string, unknown>): string {
  const summary: Record<string, unknown> = {};
  if (payload.shop_domain) summary.shop_domain = payload.shop_domain;
  if (payload.shop_id) summary.shop_id = payload.shop_id;
  if (payload.customer && typeof payload.customer === "object") {
    summary.customer_id = (payload.customer as Record<string, unknown>).id ?? null;
  }
  if (Array.isArray(payload.orders_requested)) {
    summary.orders_requested_count = payload.orders_requested.length;
  }
  return JSON.stringify(summary);
}
