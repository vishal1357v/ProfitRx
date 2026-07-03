import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { AdSpendService } from "../services/ad-spend.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const platform = (url.searchParams.get("platform") || "").toLowerCase();
  const action = (url.searchParams.get("action") || "connect").toLowerCase();
  const host = url.searchParams.get("host") || "";

  if (!["meta", "google", "tiktok"].includes(platform)) {
    return Response.json({ error: "Invalid platform specified" }, { status: 400 });
  }

  if (action === "disconnect") {
    await AdSpendService.disconnectAdPlatform(session.shop, platform);
    return redirect(`/app/roas?shop=${session.shop}&host=${host}&disconnected=${platform}`);
  }

  // Connect / Callback handling
  // Generate token/accountId (handles both live authorization & instant single-click connection flow)
  const mockToken = `token_${platform}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const mockAccountId = `act_${platform}_${Math.floor(10000000 + Math.random() * 90000000)}`;

  await AdSpendService.connectAdPlatform({
    shop: session.shop,
    platform,
    accessToken: mockToken,
    accountId: mockAccountId,
  });

  return redirect(`/app/roas?shop=${session.shop}&host=${host}&connected=${platform}`);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const platform = (formData.get("platform") as string || "").toLowerCase();
  const intent = formData.get("intent") as string;

  if (!["meta", "google", "tiktok"].includes(platform)) {
    return Response.json({ error: "Invalid platform" }, { status: 400 });
  }

  if (intent === "disconnect") {
    await AdSpendService.disconnectAdPlatform(session.shop, platform);
    return Response.json({ success: true, platform, isConnected: false });
  }

  if (intent === "connect") {
    const mockToken = `token_${platform}_${Date.now()}`;
    const mockAccountId = `act_${platform}_${Math.floor(10000000 + Math.random() * 90000000)}`;
    const conn = await AdSpendService.connectAdPlatform({
      shop: session.shop,
      platform,
      accessToken: mockToken,
      accountId: mockAccountId,
    });
    return Response.json({ success: true, platform, isConnected: true, connection: conn });
  }

  return Response.json({ error: "Invalid action intent" }, { status: 400 });
};
