import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

export type OAuthPlatform = "web" | "mobile";

export type MicrosoftOAuthState = {
  userId: string;
  platform: OAuthPlatform;
  exp: number;
  nonce: string;
};

/** Microsoft identity platform v2 (multi-tenant / personal accounts). */
export const MICROSOFT_AUTH_AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
export const MICROSOFT_AUTHORIZE_URL = `${MICROSOFT_AUTH_AUTHORITY}/authorize`;
export const MICROSOFT_TOKEN_URL = `${MICROSOFT_AUTH_AUTHORITY}/token`;

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Minimum delegated Microsoft Graph / OIDC scopes for read-only Outlook calendar sync.
 * Do not add write, shared, directory, mail, or application permissions.
 */
export const MICROSOFT_CALENDAR_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Calendars.Read",
] as const;

export const MICROSOFT_CALENDAR_SCOPE_STRING = MICROSOFT_CALENDAR_SCOPES.join(" ");

/** Permissions we must never request or accept for this integration. */
const FORBIDDEN_SCOPE_FRAGMENTS = [
  "Calendars.ReadWrite",
  "Calendars.Read.Shared",
  "Calendars.ReadWrite.Shared",
  "User.Read.All",
  "Directory.Read.All",
  "Mail.Read",
  "Group.Read.All",
  "Files.Read",
  "Files.ReadWrite",
  ".ReadWrite",
] as const;

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

function normalizeScopeToken(scope: string): string {
  const trimmed = scope.trim();
  if (!trimmed) return "";
  // Graph sometimes returns full resource URIs.
  const graphPrefix = "https://graph.microsoft.com/";
  if (trimmed.startsWith(graphPrefix)) {
    return trimmed.slice(graphPrefix.length);
  }
  return trimmed;
}

export function parseGrantedScopes(scopeString?: string | null): string[] {
  if (!scopeString?.trim()) return [];
  return scopeString
    .split(/\s+/)
    .map(normalizeScopeToken)
    .filter(Boolean);
}

/** Reject tokens that include elevated / write Graph permissions. */
export function assertDelegatedReadOnlyScopes(grantedScopeString?: string | null): void {
  const granted = parseGrantedScopes(grantedScopeString);
  if (granted.length === 0) return;

  const forbidden = granted.filter((scope) =>
    FORBIDDEN_SCOPE_FRAGMENTS.some((fragment) => scope === fragment || scope.includes(fragment)),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `Microsoft returned unexpected permissions (${forbidden.join(", ")}). Disconnect and reconnect with read-only calendar access.`,
    );
  }
}

export type MicrosoftAuthorizeDebugInfo = {
  authorityUrl: string;
  authorizationUrl: string;
  clientId: string;
  redirectUri: string;
  requestedScopes: readonly string[];
};

export function buildMicrosoftAuthorizeUrl(state: string): string {
  const clientId = env.MICROSOFT_CALENDAR_CLIENT_ID!.trim();
  const redirectUri = microsoftRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MICROSOFT_CALENDAR_SCOPE_STRING,
    state,
    // Force consent so previously granted write scopes are not silently reused.
    prompt: "consent",
  });
  const authorizationUrl = `${MICROSOFT_AUTHORIZE_URL}?${params.toString()}`;

  const debugInfo: MicrosoftAuthorizeDebugInfo = {
    authorityUrl: MICROSOFT_AUTH_AUTHORITY,
    authorizationUrl,
    clientId,
    redirectUri,
    requestedScopes: [...MICROSOFT_CALENDAR_SCOPES],
  };
  console.info("[microsoft-oauth] authorize redirect", JSON.stringify(debugInfo));

  return authorizationUrl;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

async function postMicrosoftToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Microsoft token request failed");
  }
  assertDelegatedReadOnlyScopes(json.scope);
  return json;
}

export async function exchangeMicrosoftCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CALENDAR_CLIENT_ID!.trim(),
    client_secret: env.MICROSOFT_CALENDAR_CLIENT_SECRET!.trim(),
    grant_type: "authorization_code",
    code,
    redirect_uri: microsoftRedirectUri(),
    scope: MICROSOFT_CALENDAR_SCOPE_STRING,
  });
  const tokens = await postMicrosoftToken(body);
  if (!tokens.refresh_token) {
    throw new Error("Microsoft did not return a refresh token. Try disconnecting and reconnecting.");
  }
  console.info(
    "[microsoft-oauth] token exchange granted scopes",
    JSON.stringify({ grantedScopes: parseGrantedScopes(tokens.scope), requestedScopes: [...MICROSOFT_CALENDAR_SCOPES] }),
  );
  return tokens;
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CALENDAR_CLIENT_ID!.trim(),
    client_secret: env.MICROSOFT_CALENDAR_CLIENT_SECRET!.trim(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: microsoftRedirectUri(),
    scope: MICROSOFT_CALENDAR_SCOPE_STRING,
  });
  return postMicrosoftToken(body);
}

/** GET-only Graph helper — no write methods exist in this module. */
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

async function graphGetCollection<T>(accessToken: string, initialPath: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = initialPath.startsWith("http") ? initialPath : `${GRAPH_BASE}${initialPath}`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Microsoft Graph error (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json()) as { value?: T[]; "@odata.nextLink"?: string };
    items.push(...(data.value ?? []));
    url = data["@odata.nextLink"] ?? null;
  }

  return items;
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

export type GraphDateTimeZone = {
  dateTime?: string;
  /** Some Graph responses use date-only for all-day events. */
  date?: string;
  timeZone?: string;
};

export type MicrosoftCalendarEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  start?: GraphDateTimeZone;
  end?: GraphDateTimeZone;
  showAs?: string;
};

/** Read start/end from Graph whether the value is in dateTime or date. */
export function graphDateTimeRaw(value?: GraphDateTimeZone): string | undefined {
  const raw = value?.dateTime?.trim() || value?.date?.trim();
  return raw || undefined;
}

export async function fetchMicrosoftCalendarView(
  accessToken: string,
  calendarId: string,
  startIso: string,
  endIso: string,
): Promise<MicrosoftCalendarEvent[]> {
  // Pad the window so all-day events on range edges are not dropped by Graph.
  const start = new Date(startIso);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(endIso);
  end.setUTCDate(end.getUTCDate() + 1);
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $top: "250",
    $orderby: "start/dateTime",
    $select: "id,subject,isAllDay,isCancelled,start,end,showAs",
  });
  const path = `/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params.toString()}`;
  return graphGetCollection<MicrosoftCalendarEvent>(accessToken, path);
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
