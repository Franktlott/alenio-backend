import { getBackendUrl } from "../backend-url";
import { safeFetch } from "./safe-fetch";
import { setAccessToken, setAccessTokenFromAuthData } from "./auth-client";

export type EmailSignInResult = {
  data: { user?: unknown; session?: unknown; token?: string } | null;
  error: { message?: string; code?: string } | null;
};

/**
 * Direct email/password sign-in — bypasses better-auth client + better-fetch,
 * which crash under Expo's fetch runtime.
 */
export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<EmailSignInResult> {
  const url = `${getBackendUrl()}/api/auth/sign-in/email`;
  console.warn("[alenio-auth] direct sign-in POST", { urlHost: new URL(url).host });

  let res: Response;
  try {
    res = await safeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
      credentials: "omit",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[alenio-auth] direct sign-in network error", { message });
    return { data: null, error: { message: message || "Network request failed" } };
  }

  const headerToken = res.headers.get("set-auth-token")?.trim() || null;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  console.warn("[alenio-auth] direct sign-in response", {
    status: res.status,
    ok: res.ok,
    hasHeaderToken: !!headerToken,
  });

  if (!res.ok) {
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const nested = rec.error && typeof rec.error === "object" ? (rec.error as Record<string, unknown>) : null;
    const message =
      (typeof nested?.message === "string" && nested.message) ||
      (typeof rec.message === "string" && rec.message) ||
      (typeof rec.statusText === "string" && rec.statusText) ||
      `Sign-in failed (${res.status})`;
    const code =
      (typeof nested?.code === "string" && nested.code) ||
      (typeof rec.code === "string" && rec.code) ||
      undefined;
    return { data: null, error: { message, code } };
  }

  if (headerToken) setAccessToken(headerToken);
  setAccessTokenFromAuthData(body);
  const data =
    body && typeof body === "object"
      ? (body as { user?: unknown; session?: unknown; token?: string })
      : null;
  return { data, error: null };
}
