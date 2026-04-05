import { fetch } from "expo/fetch";
import { authClient } from "../auth/auth-client";

const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;

const request = async <T>(
  url: string,
  options: { method?: string; body?: string } = {}
): Promise<T> => {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Cookie: authClient.getCookie(),
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Request failed: ${response.status}`);
  }
  return response.json();
};

export const api = {
  get: <T>(url: string) => request<{ data: T }>(url).then((r) => r.data),
  post: <T>(url: string, body: unknown) =>
    request<{ data: T }>(url, { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  put: <T>(url: string, body: unknown) =>
    request<{ data: T }>(url, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.data),
  delete: async <T>(url: string) => {
    const response = await fetch(`${baseUrl}${url}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Cookie: authClient.getCookie() },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message ?? `Request failed: ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json().then((r: { data: T }) => r.data);
  },
  patch: <T>(url: string, body: unknown) =>
    request<{ data: T }>(url, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  patchFull: <T>(url: string, body: unknown) =>
    request<{ data: T; milestone?: number }>(url, { method: "PATCH", body: JSON.stringify(body) }),
};
