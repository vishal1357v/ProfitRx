import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { AlertRepository } from "../infrastructure/repositories/alert.repository";

// GET: Fetch notifications (alerts)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview =
    url.searchParams.get("preview") === "true" ||
    url.searchParams.get("demo") === "true" ||
    url.searchParams.get("shop") === "glam-aura-india.myshopify.com";

  if (isPreview) {
    return Response.json({
      notifications: [
        {
          id: "preview-alert-1",
          type: "RTO_RISK",
          severity: "WARNING",
          message: "3 COD orders from high-risk pincodes (Meerut, Patna) await review.",
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }

  let session: any;
  try {
    const auth = await authenticate.admin(request);
    session = auth.session;
  } catch {
    // Return empty notifications safely instead of throwing 410
    return Response.json({ notifications: [] });
  }

  const shop = session.shop;
  const notifications = await AlertRepository.findActiveByShop(shop, 30);

  return Response.json({
    notifications: notifications.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
  });
};

// POST: Mark as read / resolve
export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const isPreview =
    url.searchParams.get("preview") === "true" ||
    url.searchParams.get("demo") === "true";

  if (isPreview) {
    return Response.json({ success: true });
  }

  let session: any;
  try {
    const auth = await authenticate.admin(request);
    session = auth.session;
  } catch {
    return Response.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const shop = session.shop;
  const body = await request.json();

  if (body.action === "markRead" && body.id) {
    await AlertRepository.resolveAlert(shop, body.id);
    return Response.json({ success: true });
  }

  if (body.action === "markAllRead") {
    await AlertRepository.resolveAll(shop);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};
