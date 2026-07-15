import { getBackendUrl } from "../backend-url";
import { safeFetch } from "./safe-fetch";

export type AuthApiError = { message?: string; code?: string } | null;

function pickError(body: unknown, fallback: string): { message: string; code?: string } {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const nested = rec.error && typeof rec.error === "object" ? (rec.error as Record<string, unknown>) : null;
  const message =
    (typeof nested?.message === "string" && nested.message) ||
    (typeof rec.message === "string" && rec.message) ||
    fallback;
  const code =
    (typeof nested?.code === "string" && nested.code) ||
    (typeof rec.code === "string" && rec.code) ||
    undefined;
  return { message, code };
}

/** POST JSON to Better Auth `/api/auth/*` using XHR (avoids Expo winter fetch crash). */
export async function postAuthApi(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown; error: AuthApiError }> {
  const url = `${getBackendUrl()}/api/auth${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await safeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      credentials: "omit",
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: pickError(data, `Request failed (${res.status})`) };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, data: null, error: { message: message || "Network request failed" } };
  }
}

export async function sendForgetPasswordOtp(email: string) {
  // Alenio wrapper logs whether Resend actually ran (Better Auth always returns success).
  const url = `${getBackendUrl()}/api/password-reset/request`;
  try {
    const res = await safeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email }),
      credentials: "omit",
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    console.warn("[alenio-auth] password-reset/request", {
      status: res.status,
      ok: res.ok,
      data,
    });
    if (res.ok) {
      return { ok: true, status: res.status, data, error: null as AuthApiError };
    }
  } catch (err) {
    console.warn("[alenio-auth] password-reset/request failed, falling back", err);
  }

  // Fallback until the new backend route is deployed.
  return postAuthApi("/email-otp/send-verification-otp", {
    email,
    type: "forget-password",
  });
}

export async function checkForgetPasswordOtp(email: string, otp: string) {
  return postAuthApi("/email-otp/check-verification-otp", {
    email,
    otp,
    type: "forget-password",
  });
}

export async function resetPasswordWithOtp(email: string, otp: string, password: string) {
  return postAuthApi("/email-otp/reset-password", {
    email,
    otp,
    password,
  });
}

export async function resetPasswordWithToken(newPassword: string, token: string) {
  return postAuthApi("/reset-password", {
    newPassword,
    token,
  });
}
