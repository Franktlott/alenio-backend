import { getBackendUrl } from "./backend-url";
import { getAccessToken } from "./session";

type ApiErrorBody = { error?: { message?: string; code?: string } };

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function getErrorCode(err: unknown): string | null {
  if (err instanceof ApiError) return err.code;
  return null;
}

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

  let res: Response;
  try {
    res = await fetch(`${getBackendUrl()}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      "You’re offline. Readings stay on this device until you reconnect.",
      "NETWORK_ERROR",
      0,
    );
  }

  const body = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;
  if (!res.ok) {
    throw new ApiError(
      body?.error?.message ?? `Request failed (${res.status})`,
      body?.error?.code ?? "REQUEST_FAILED",
      res.status,
    );
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
