import { getBackendUrl } from "./backend-url";
import { getAccessToken } from "./session";

type ApiError = { error?: { message?: string; code?: string } };

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getBackendUrl()}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => null)) as (T & ApiError) | null;
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function apiGet<T>(path: string) {
  return apiRequest<T>(path);
}

export function apiPost<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, { method: "POST", body: body == null ? undefined : JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown) {
  return apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}
