import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../env";

function encryptionKey(): Buffer {
  const raw = env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (raw) {
    const buf = Buffer.from(raw, raw.length >= 44 ? "base64" : "utf8");
    if (buf.length >= 32) return buf.subarray(0, 32);
    return createHash("sha256").update(raw).digest();
  }
  return createHash("sha256").update(`${env.BACKEND_URL}:calendar-dev-key`).digest();
}

export function encryptSecret(plain: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = encryptionKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
