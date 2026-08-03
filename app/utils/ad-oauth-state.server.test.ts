import { afterEach, describe, expect, it } from "vitest";
import { createAdOAuthState, verifyAdOAuthState } from "./ad-oauth-state.server";

const originalSecret = process.env.SHOPIFY_API_SECRET;

afterEach(() => {
  process.env.SHOPIFY_API_SECRET = originalSecret;
});

describe("ad OAuth state", () => {
  it("accepts a signed state and rejects a tampered tenant", () => {
    process.env.SHOPIFY_API_SECRET = "test-secret";
    const state = createAdOAuthState({ shop: "merchant.myshopify.com", platform: "meta", host: "encoded-host" });

    expect(verifyAdOAuthState(state)).toEqual({ shop: "merchant.myshopify.com", platform: "meta", host: "encoded-host" });

    const [payload, signature] = state.split(".");
    const tampered = Buffer.from(JSON.stringify({
      ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
      shop: "other-merchant.myshopify.com",
    })).toString("base64url");
    expect(() => verifyAdOAuthState(`${tampered}.${signature}`)).toThrow("signature");
  });
});
