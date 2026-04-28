import { fetch } from "expo/fetch";
import { getAuthHeaders } from "@/lib/auth/auth-client";
import { readJsonSafe } from "@/lib/api/api";

export type MeUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isAdmin: boolean;
};

/** Shared with root `_layout`, `app/index`, and post-login prefetch — single cache key `["me"]`. */
export async function fetchMeUser(): Promise<MeUser | null> {
  const authHeaders = await getAuthHeaders();
  const base = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!base?.trim()) return null;
  const res = await fetch(`${base.replace(/\/+$/, "")}/api/me`, {
    credentials: "include",
    headers: authHeaders,
  });
  if (!res.ok) return null;
  const json = await readJsonSafe<{ data: MeUser | null }>(res);
  return json?.data ?? null;
}

export const ME_QUERY_KEY = ["me"] as const;
