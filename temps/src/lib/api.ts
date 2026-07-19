import { getBackendUrl } from "./backend-url";
import { clearSession, getAccessToken } from "./session";

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

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Register a callback when the API returns 401 (session cleared). */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

async function handleUnauthorized() {
  await clearSession();
  for (const listener of unauthorizedListeners) {
    try {
      listener();
    } catch {
      /* ignore listener errors */
    }
  }
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
    if (res.status === 401) {
      await handleUnauthorized();
      throw new ApiError(
        body?.error?.message ?? "Session expired. Sign in again.",
        body?.error?.code ?? "UNAUTHORIZED",
        401,
      );
    }
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
