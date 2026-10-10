import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * At-rest encryption for OAuth tokens and HMAC signing for links that have to
 * be unguessable (unsubscribe, OAuth state). One key, APP_ENCRYPTION_KEY,
 * 32 bytes as hex. Encrypted values are self-describing strings so the
 * format can change later without a migration: `v1.<iv>.<tag>.<ciphertext>`.
 */
const key = Buffer.from(env.APP_ENCRYPTION_KEY, "hex");

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(stored: string): string {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted value.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Hex HMAC-SHA256 of `value`, truncated to `chars` (default 32 = 128 bits). */
export function hmac(value: string, chars = 32): string {
  return crypto.createHmac("sha256", key).update(value).digest("hex").slice(0, chars);
}

/** Constant-time string equality (same-length check first, like the auth middleware). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Signed, URL-safe token carrying one id: `base64url(id).hmac`. Used for
 * unsubscribe links. `readSignedId` returns null for anything tampered.
 */
export function signId(id: string): string {
  return `${Buffer.from(id).toString("base64url")}.${hmac(id)}`;
}

export function readSignedId(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  return id && safeEqual(hmac(id), token.slice(dot + 1)) ? id : null;
}

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");
