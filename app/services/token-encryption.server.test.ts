import { afterEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken, isEncryptedToken } from "./token-encryption.server";

const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
});

describe("token encryption", () => {
  it("stores authenticated ciphertext and restores the original value", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const token = "shpat_sensitive-token";
    const encrypted = encryptToken(token);

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain(token);
    expect(isEncryptedToken(encrypted)).toBe(true);
    expect(decryptToken(encrypted)).toBe(token);
  });

  it("rejects modified ciphertext", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const encrypted = encryptToken("sensitive-token");
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

    expect(() => decryptToken(tampered)).toThrow("could not be authenticated");
  });
});
