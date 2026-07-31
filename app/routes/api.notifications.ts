import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GET: Fetch notifications (alerts)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const notifications = await prisma.alert.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      type: true,
      severity: true,
      message: true,
      isRead: true,
      createdAt: true,
    },
  });

  return Response.json({
    notifications: notifications.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
  });
};

// POST: Mark as read
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const body = await request.json();

  if (body.action === "markRead" && body.id) {
    await prisma.alert.updateMany({
      where: { id: body.id, shop },
      data: { isRead: true, readAt: new Date() },
    });
    return Response.json({ success: true });
  }

  if (body.action === "markAllRead") {
    await prisma.alert.updateMany({
      where: { shop, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};
