import { getBackendUrl } from "./backend-url";
import { clearSession, getAccessToken, setAccessToken } from "./session";

function extractToken(data: unknown, headerToken: string | null): string | null {
  if (headerToken?.trim()) return headerToken.trim();
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const nested = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
  for (const obj of [root, nested]) {
    if (!obj) continue;
    for (const key of ["token", "accessToken", "sessionToken"]) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    const session = obj.session;
    if (session && typeof session === "object") {
      const t = (session as { token?: string }).token;
      if (typeof t === "string" && t.trim()) return t.trim();
    }
  }
  return null;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const res = await fetch(`${getBackendUrl()}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const body = await res.json().catch(() => null);
  const headerToken = res.headers.get("set-auth-token") ?? res.headers.get("x-auth-token");
  const token = extractToken(body, headerToken);
  if (!res.ok || !token) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : "Sign-in failed";
    throw new Error(message);
  }
  await setAccessToken(token);
}

export async function signOut(): Promise<void> {
  try {
    const token = getAccessToken();
    await fetch(`${getBackendUrl()}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    /* ignore network errors on sign-out */
  }
  await clearSession();
}
