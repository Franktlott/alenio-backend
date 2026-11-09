import { createSign } from "crypto";
import { env } from "../env";

const DEFAULT_PACKAGE = "com.lotttechnologies.alenio";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function serviceAccount(): ServiceAccount | null {
  const raw = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key, token_uri: parsed.token_uri };
  } catch {
    console.warn("[google-play] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
}

export function isGooglePlayReportingConfigured(): boolean {
  return serviceAccount() !== null;
}

export function playPackageName(): string {
  return env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || DEFAULT_PACKAGE;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.client_email,
    scope: SCOPE,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key).toString("base64url");
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google sign-in failed (${res.status} ${json.error ?? ""})`.trim());
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

export type PlayApiResult = { ok: true } | { ok: false; status: number; message: string; alreadyExists: boolean };

async function call(path: string, body: unknown): Promise<PlayApiResult> {
  const account = serviceAccount();
  if (!account) return { ok: false, status: 0, message: "Google Play credentials aren't set on this server.", alreadyExists: false };
  const token = await accessToken(account);
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => "");
  return {
    ok: false,
    status: res.status,
    message: text.slice(0, 500) || res.statusText,
    alreadyExists: res.status === 409 || /ALREADY_EXISTS/.test(text),
  };
}

export function createExternalTransaction(transactionId: string, body: unknown): Promise<PlayApiResult> {
  const parent = `applications/${encodeURIComponent(playPackageName())}`;
  return call(`${parent}/externalTransactions?externalTransactionId=${encodeURIComponent(transactionId)}`, body);
}

export function refundExternalTransaction(transactionId: string, body: unknown): Promise<PlayApiResult> {
  const name = `applications/${encodeURIComponent(playPackageName())}/externalTransactions/${encodeURIComponent(transactionId)}`;
  return call(`${name}:refund`, body);
}
