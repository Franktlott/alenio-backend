import { authHeadersFromToken, agentDebugLog, getAuthHeaders } from "@/lib/auth/auth-client";
import { readJsonSafe } from "@/lib/api/api";
import { getBackendUrl } from "@/lib/backend-url";
import { safeFetch } from "@/lib/auth/safe-fetch";

export type MeUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isAdmin: boolean;
};

/** Shared with root `_layout`, `app/index`, and post-login prefetch — single cache key `["me"]`. */
export async function fetchMeUser(bearerToken?: string | null): Promise<MeUser | null> {
  const token = typeof bearerToken === "string" ? bearerToken.trim() : "";
  const authHeaders = token
    ? authHeadersFromToken(token)
    : await getAuthHeaders();
  let base: string;
  try {
    base = getBackendUrl();
  } catch {
    return null;
  }
  const res = await safeFetch(`${base}/api/me`, {
    method: "GET",
    credentials: "omit",
    headers: authHeaders,
  });
  const json = await readJsonSafe<{ data: MeUser | null }>(res);
  const me = res.ok ? (json?.data ?? null) : null;
  agentDebugLog("/api/me response", {
    runId: "account-switch-v3",
    hypothesisId: "H3",
    status: res.status,
    hasAuthHeader: !!authHeaders.Authorization,
    hasMeId: !!me?.id,
  });
  if (!res.ok) return null;
  return me;
}

export const ME_QUERY_KEY = ["me"] as const;
