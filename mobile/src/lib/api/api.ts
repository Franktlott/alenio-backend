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
  return response.json();
};

export const api = {
  get: <T>(url: string) => request<{ data: T }>(url).then((r) => r.data),
  post: <T>(url: string, body: unknown) =>
    request<{ data: T }>(url, { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  put: <T>(url: string, body: unknown) =>
    request<{ data: T }>(url, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.data),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
  patch: <T>(url: string, body: unknown) =>
    request<{ data: T }>(url, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
};
