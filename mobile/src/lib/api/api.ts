import { fetch } from "expo/fetch";
import { authClient, getAccessToken, getAuthHeaders } from "../auth/auth-client";

const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;

type ApiErrorBody = { error?: { message?: string } };

export const readJsonSafe = async <T>(response: Response): Promise<T | null> => {
  if (response.status === 204 || response.status === 205) return null;
  const maybeJson = response as Response & { json?: () => Promise<unknown>; text?: () => Promise<string> };
  if (typeof maybeJson.json === "function") {
    return (await maybeJson.json().catch(() => null)) as T | null;
  }
  if (typeof maybeJson.text === "function") {
    const raw = await maybeJson.text().catch(() => "");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return null;
};

const request = async <T>(
  url: string,
  options: { method?: string; body?: string; skipSignOut?: boolean } = {}
): Promise<T> => {
  const { method, body, skipSignOut } = options;
  let authHeaders = await getAuthHeaders();
  const doFetch = (headers: Record<string, string>) =>
    fetch(`${baseUrl}${url}`, {
      method,
      body,
      credentials: "include",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
    });

  let response = await doFetch(authHeaders);

  // RN auth state can lag briefly after sign-in/verification; retry once with a fresh token.
  if (response.status === 401 && !skipSignOut) {
    const freshToken = await getAccessToken();
    if (freshToken) {
      authHeaders = { ...authHeaders, Authorization: `Bearer ${freshToken}` };
      response = await doFetch(authHeaders);
    }
  }

  if (!response.ok) {
    const err = await readJsonSafe<ApiErrorBody>(response);
    if (response.status === 401 && !skipSignOut) {
      authClient.signOut().catch(() => {});
    }
    throw new Error(err?.error?.message ?? `Request failed: ${response.status}`);
  }
  const parsed = await readJsonSafe<T>(response);
  return (parsed ?? ({} as T));
};

export const api = {
  get: <T>(url: string) => request<{ data: T }>(url).then((r) => r.data),
  post: <T>(url: string, body: unknown, opts?: { skipSignOut?: boolean }) =>
    request<{ data: T }>(url, { method: "POST", body: JSON.stringify(body), ...opts }).then((r) => r.data),
  put: <T>(url: string, body: unknown) =>
    request<{ data: T }>(url, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.data),
  delete: async <T>(url: string) => {
    let authHeaders = await getAuthHeaders();
    const doDelete = (headers: Record<string, string>) =>
      fetch(`${baseUrl}${url}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      });

    let response = await doDelete(authHeaders);
    if (response.status === 401) {
      const freshToken = await getAccessToken();
      if (freshToken) {
        authHeaders = { ...authHeaders, Authorization: `Bearer ${freshToken}` };
        response = await doDelete(authHeaders);
      }
    }

    if (!response.ok) {
      const err = await readJsonSafe<ApiErrorBody>(response);
      throw new Error(err?.error?.message ?? `Request failed: ${response.status}`);
    }
    if (response.status === 204 || response.status === 205) return undefined as T;
    const parsed = await readJsonSafe<{ data: T }>(response);
    return parsed?.data as T;
  },
  patch: <T>(url: string, body: unknown) =>
    request<{ data: T }>(url, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  patchFull: <T>(url: string, body: unknown) =>
    request<{ data: T; milestone?: number; comeback?: number }>(url, { method: "PATCH", body: JSON.stringify(body) }),
};
