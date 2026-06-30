import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

export type OAuthPlatform = "web" | "mobile";

export type MicrosoftOAuthState = {
  userId: string;
  platform: OAuthPlatform;
  exp: number;
  nonce: string;
};

const MICROSOFT_AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = ["offline_access", "Calendars.Read", "User.Read", "openid", "profile"].join(" ");

function stateSecret(): string {
  return env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim() || `${env.BACKEND_URL}:microsoft-oauth-state`;
}

function encodeState(payload: MicrosoftOAuthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function decodeState(raw: string): MicrosoftOAuthState | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MicrosoftOAuthState;
    if (!parsed?.userId || !parsed?.platform || !parsed?.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isMicrosoftCalendarConfigured(): boolean {
  return Boolean(
    env.MICROSOFT_CALENDAR_CLIENT_ID?.trim() && env.MICROSOFT_CALENDAR_CLIENT_SECRET?.trim(),
  );
}

export function microsoftRedirectUri(): string {
  const base = env.BACKEND_URL.replace(/\/$/, "");
  return `${base}/api/calendar-connections/microsoft/callback`;
}

export function createMicrosoftOAuthState(userId: string, platform: OAuthPlatform): string {
  return encodeState({
    userId,
    platform,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: randomBytes(16).toString("hex"),
  });
}

export function buildMicrosoftAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CALENDAR_CLIENT_ID!.trim(),
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account consent",
  });
  return `${MICROSOFT_AUTH_BASE}/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export async function exchangeMicrosoftCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CALENDAR_CLIENT_ID!.trim(),
    client_secret: env.MICROSOFT_CALENDAR_CLIENT_SECRET!.trim(),
    grant_type: "authorization_code",
    code,
    redirect_uri: microsoftRedirectUri(),
  });
  const res = await fetch(`${MICROSOFT_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Microsoft token exchange failed");
  }
  if (!json.refresh_token) {
    throw new Error("Microsoft did not return a refresh token. Try disconnecting and reconnecting.");
  }
  return json;
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CALENDAR_CLIENT_ID!.trim(),
    client_secret: env.MICROSOFT_CALENDAR_CLIENT_SECRET!.trim(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: microsoftRedirectUri(),
  });
  const res = await fetch(`${MICROSOFT_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Microsoft token refresh failed");
  }
  return json;
}

async function graphGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph error (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export type MicrosoftCalendarListItem = {
  id: string;
  name: string;
  isDefaultCalendar?: boolean;
};

export async function fetchMicrosoftCalendars(accessToken: string): Promise<MicrosoftCalendarListItem[]> {
  const data = await graphGet<{ value?: Array<{ id: string; name: string; isDefaultCalendar?: boolean }> }>(
    accessToken,
    "/me/calendars",
  );
  return (data.value ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    isDefaultCalendar: c.isDefaultCalendar,
  }));
}

export type MicrosoftCalendarEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  showAs?: string;
};

export async function fetchMicrosoftCalendarView(
  accessToken: string,
  calendarId: string,
  startIso: string,
  endIso: string,
): Promise<MicrosoftCalendarEvent[]> {
  const params = new URLSearchParams({
    startDateTime: startIso,
    endDateTime: endIso,
  });
  const path = `/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params.toString()}`;
  const data = await graphGet<{ value?: MicrosoftCalendarEvent[] }>(accessToken, path);
  return data.value ?? [];
}

export async function fetchMicrosoftProfile(accessToken: string): Promise<{ mail?: string; userPrincipalName?: string }> {
  return graphGet<{ mail?: string; userPrincipalName?: string }>(accessToken, "/me?$select=mail,userPrincipalName");
}

export function successRedirectUrl(platform: OAuthPlatform, status: "connected" | "error", message?: string): string {
  if (platform === "mobile") {
    const params = new URLSearchParams({ outlook: status });
    if (message) params.set("message", message);
    return `${env.APP_SCHEME}://profile?${params.toString()}`;
  }
  const webBase = (env.WEB_PUBLIC_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
  const params = new URLSearchParams({ outlook: status });
  if (message) params.set("message", message);
  return `${webBase}/profile?${params.toString()}`;
}
