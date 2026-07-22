/**
 * /api/force-reauth?shop=yourstore.myshopify.com
 * Deletes the stale session (wrong/partial scopes) and forces a fresh OAuth
 * so the app gets a new token with ALL required scopes.
 */
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "greek-god-wvwt8ptt.myshopify.com";
  const secret = url.searchParams.get("secret");

  if (secret !== process.env.SHOPIFY_API_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let deleted = 0;
  try {
    const result = await prisma.session.deleteMany({ where: { shop } });
    deleted = result.count;
    console.log(`[force-reauth] Deleted ${deleted} session(s) for ${shop}`);
  } catch (err) {
    console.error("[force-reauth] Failed to delete sessions:", err);
  }

  // Redirect to OAuth login — the SDK will request ALL configured scopes
  throw redirect(`/auth/login?shop=${shop}`);
}
