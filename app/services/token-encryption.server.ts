import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTED_TOKEN_PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey(): Buffer {
  const configuredKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!configuredKey) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be set to a base64-encoded 32-byte key before tokens can be stored.",
    );
  }

  const key = Buffer.from(configuredKey, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}

/** Encrypts a token using AES-256-GCM and prefixes it with a format version. */
export function encryptToken(token: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_TOKEN_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypts AES-256-GCM token ciphertext. Plaintext is temporarily accepted so
 * existing records continue to work until the supplied migration is run.
 */
export function decryptToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (!token.startsWith(ENCRYPTED_TOKEN_PREFIX)) return token;

  const parts = token.split(":");
  if (parts.length !== 5) throw new Error("Encrypted token has an invalid format.");

  const [, , ivValue, authTagValue, ciphertextValue] = parts;
  const iv = Buffer.from(ivValue, "base64");
  const authTag = Buffer.from(authTagValue, "base64");
  const ciphertext = Buffer.from(ciphertextValue, "base64");
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || ciphertext.length === 0) {
    throw new Error("Encrypted token has invalid encryption parameters.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Encrypted token could not be authenticated or decrypted.");
  }
}

export function isEncryptedToken(token: string | null | undefined): boolean {
  return Boolean(token?.startsWith(ENCRYPTED_TOKEN_PREFIX));
}
