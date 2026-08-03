import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

type AdPlatform = "meta" | "google" | "tiktok";

export type AdOAuthState = {
  shop: string;
  platform: AdPlatform;
  host: string;
};

function signingSecret(): string {
  const secret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!secret) throw new Error("SHOPIFY_API_SECRET is required to sign OAuth state.");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function createAdOAuthState(state: AdOAuthState): string {
  const payload = Buffer.from(JSON.stringify({ ...state, issuedAt: Date.now(), nonce: randomBytes(16).toString("base64url") })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdOAuthState(value: string | null): AdOAuthState {
  if (!value) throw new Error("OAuth state is missing.");
  const [payload, signature, ...extra] = value.split(".");
  if (!payload || !signature || extra.length > 0) throw new Error("OAuth state has an invalid format.");

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("OAuth state signature is invalid.");
  }

  let parsed: { shop?: unknown; platform?: unknown; host?: unknown; issuedAt?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("OAuth state payload is invalid.");
  }

  if (
    typeof parsed.shop !== "string" ||
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(parsed.shop) ||
    !["meta", "google", "tiktok"].includes(String(parsed.platform)) ||
    typeof parsed.host !== "string" ||
    typeof parsed.issuedAt !== "number" ||
    !Number.isFinite(parsed.issuedAt) ||
    Date.now() - parsed.issuedAt > STATE_TTL_MS ||
    parsed.issuedAt > Date.now() + 60_000
  ) {
    throw new Error("OAuth state is invalid or has expired.");
  }

  return { shop: parsed.shop, platform: parsed.platform as AdPlatform, host: parsed.host };
}
