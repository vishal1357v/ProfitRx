import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { SearchApplicationService } from "../application/search/search.application";

export const loader = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  const results = await SearchApplicationService.search(shop, q);
  return Response.json({ results });
};
