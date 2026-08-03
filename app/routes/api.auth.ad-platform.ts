import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { AdSpendService } from "../services/ad-spend.service";
import { createAdOAuthState, verifyAdOAuthState } from "../utils/ad-oauth-state.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  // 1. Handle OAuth Redirect Callback from platforms (Unauthenticated)
  if (code && stateParam) {
    try {
      const { shop: callbackShop, platform: callbackPlatform, host: callbackHost } = verifyAdOAuthState(stateParam);

      const redirectUri = `${process.env.SHOPIFY_APP_URL || `https://${url.host}`}/api/auth/ad-platform`;

      let accessToken = "";
      let refreshToken = null;
      let tokenExpiresAt = null;

      if (callbackPlatform === "meta") {
        const metaClientId = process.env.META_CLIENT_ID || process.env.META_APP_ID;
        const metaClientSecret = process.env.META_CLIENT_SECRET || process.env.META_APP_SECRET;
        if (metaClientId && metaClientSecret) {
          const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${metaClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${metaClientSecret}&code=${code}`;
          const response = await fetch(exchangeUrl);
          const data = await response.json();
          if (data.access_token) {
            accessToken = data.access_token;
            // Exchange for a long-lived page/system token
            const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaClientId}&client_secret=${metaClientSecret}&fb_exchange_token=${accessToken}`;
            const llResp = await fetch(longLivedUrl);
            const llData = await llResp.json();
            accessToken = llData.access_token || accessToken;
          }
        }
      } else if (callbackPlatform === "google") {
        if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
          const tokenUrl = "https://oauth2.googleapis.com/token";
          const response = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: process.env.GOOGLE_CLIENT_ID || "",
              client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          });
          const data = await response.json();
          if (data.access_token) {
            accessToken = data.access_token;
            refreshToken = data.refresh_token || null;
            if (data.expires_in) {
              tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
            }
          }
        }
      } else if (callbackPlatform === "tiktok") {
        if (process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET) {
          const tokenUrl = "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/";
          const response = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              app_id: process.env.TIKTOK_APP_ID || "",
              secret: process.env.TIKTOK_APP_SECRET || "",
              auth_code: code,
            }),
          });
          const data = await response.json();
          if (data.data?.access_token) {
            accessToken = data.data.access_token;
            refreshToken = data.data.refresh_token || null;
          }
        }
      }

      if (!accessToken) {
        return Response.json({ error: `Unable to connect ${callbackPlatform}: the OAuth exchange did not return an access token.` }, { status: 502 });
      }

      await AdSpendService.connectAdPlatform({
        shop: callbackShop,
        platform: callbackPlatform,
        accessToken,
        refreshToken,
        tokenExpiresAt,
      });

      // Redirect merchant back into Shopify Admin embedded context using Client ID path routing
      const client_id = "08f8a7442c2182a3a390f753591c06f3";
      return redirect(`https://${callbackShop}/admin/apps/${client_id}/app/roas?shop=${callbackShop}&host=${callbackHost}&connected=${callbackPlatform}`);
    } catch (err: any) {
      console.error("[AdSpend OAuth Callback Error]:", err.message);
      return Response.json({ error: "OAuth callback exchange failed" }, { status: 500 });
    }
  }

  // 2. Standard Connect / Disconnect flow initiated from inside the app iframe
  const { session } = await authenticate.admin(request);
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

  const redirectUri = `${process.env.SHOPIFY_APP_URL || `https://${url.host}`}/api/auth/ad-platform`;

  const clientKeysExist = {
    meta: !!(process.env.META_CLIENT_ID || process.env.META_APP_ID),
    google: !!process.env.GOOGLE_CLIENT_ID,
    tiktok: !!process.env.TIKTOK_APP_ID,
  };

  const hasKeys = clientKeysExist[platform as keyof typeof clientKeysExist];
  if (hasKeys) {
    const state = createAdOAuthState({ shop: session.shop, platform: platform as "meta" | "google" | "tiktok", host });

    let redirectUrl = "";
    if (platform === "meta") {
      const metaClientId = process.env.META_CLIENT_ID || process.env.META_APP_ID;
      redirectUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${metaClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=ads_read,read_insights`;
    } else if (platform === "google") {
      redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/adwords&access_type=offline&prompt=consent&state=${state}`;
    } else if (platform === "tiktok") {
      redirectUrl = `https://business-api.tiktok.com/portal/auth?app_id=${process.env.TIKTOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    }
    return redirect(redirectUrl);
  }

  return Response.json({ error: `${platform} OAuth is not configured for this deployment.` }, { status: 503 });
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
    const isConfigured = platform === "meta"
      ? Boolean(process.env.META_CLIENT_ID || process.env.META_APP_ID)
      : platform === "google"
        ? Boolean(process.env.GOOGLE_CLIENT_ID)
        : Boolean(process.env.TIKTOK_APP_ID);
    return Response.json({ success: isConfigured, platform, isConfigured });
  }

  return Response.json({ error: "Invalid action intent" }, { status: 400 });
};
