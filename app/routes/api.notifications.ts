import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { AlertRepository } from "../infrastructure/repositories/alert.repository";

// GET: Fetch notifications (alerts)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
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
  const { session } = await authenticate.admin(request);
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
