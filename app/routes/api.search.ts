import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { SearchApplicationService } from "../application/search/search.application";
import { AuditLogService } from "../services/compliance/audit-log.service";

export const loader = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  const meta = AuditLogService.extractRequestMeta(request);
  AuditLogService.logAccess({
    shop,
    actor: (session as any).accountOwner ? "merchant_owner" : "merchant_staff",
    resource: "SEARCH_QUERY",
    resourceId: "omni-search",
    action: "SEARCH",
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const results = await SearchApplicationService.search(shop, q);
  return Response.json({ results });
};
