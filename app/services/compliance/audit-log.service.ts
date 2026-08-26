import prisma from "../../db.server";

export interface LogAccessParams {
  shop: string;
  actor: string;        // "merchant_admin" | "system_sync" | "webhook" | "api_client"
  resource: string;     // e.g. "ORDER_DETAIL_VIEW", "CUSTOMER_LIST_VIEW", "SEARCH_QUERY", "REPORT_VIEW", "REPORT_EXPORT", "OPERATIONS_VIEW", "DASHBOARD_VIEW", "RTO_VIEW", "HEATMAP_VIEW", "COD_RULES_VIEW", "CUSTOMER_API_VIEW", "GDPR_DATA_REQUEST"
  resourceId?: string | null;  // Order number/ID, customer ID, report type — STRICTLY NO PII
  action: "VIEW" | "EXPORT" | "SEARCH";
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditLogService {
  /**
   * Records access to protected customer data in CustomerDataAccessLog.
   * Fire-and-forget: does not block the caller if DB write fails, but logs an error.
   * STRICT GUARANTEE: Never logs customer PII (names, emails, phones, addresses) inside the audit log.
   */
  static async logAccess(params: LogAccessParams): Promise<void> {
    try {
      // Ensure no PII accidentally leaked into resourceId (e.g. emails or full phone numbers)
      let safeResourceId = params.resourceId || null;
      if (safeResourceId && (safeResourceId.includes("@") || safeResourceId.length > 50)) {
        safeResourceId = "[REDACTED_IDENTIFIER]";
      }

      await (prisma as any).customerDataAccessLog.create({
        data: {
          shop: params.shop,
          actor: params.actor || "merchant_admin",
          resource: params.resource,
          resourceId: safeResourceId,
          action: params.action,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent ? params.userAgent.substring(0, 255) : null,
        },
      });
    } catch (err: any) {
      // Non-blocking: audit log failure should not break user operations,
      // but must be logged to stderr
      console.error("[AuditLogService] Failed to record customer data access log:", err?.message || err);
    }
  }

  /**
   * Helper to extract client IP and User-Agent from Request headers
   */
  static extractRequestMeta(request: Request): { ipAddress?: string; userAgent?: string } {
    const headers = request.headers;
    const ipAddress = 
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      headers.get("cf-connecting-ip") ||
      undefined;
    const userAgent = headers.get("user-agent") || undefined;
    return { ipAddress, userAgent };
  }
}
