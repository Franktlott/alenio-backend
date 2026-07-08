import { fetch } from "expo/fetch";
import { authHeadersFromToken, agentDebugLog, getAuthHeaders } from "@/lib/auth/auth-client";
import { readJsonSafe } from "@/lib/api/api";
import { getBackendUrl } from "@/lib/backend-url";

export type MeUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isAdmin: boolean;
};

/** Shared with root `_layout`, `app/index`, and post-login prefetch — single cache key `["me"]`. */
export async function fetchMeUser(bearerToken?: string | null): Promise<MeUser | null> {
  const authHeaders = bearerToken?.trim()
    ? authHeadersFromToken(bearerToken)
    : await getAuthHeaders();
  let base: string;
  try {
    base = getBackendUrl();
  } catch {
    return null;
  }
  const res = await fetch(`${base}/api/me`, {
    credentials: "include",
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
