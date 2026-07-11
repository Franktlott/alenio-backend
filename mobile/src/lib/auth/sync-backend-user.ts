import { authHeadersFromToken, getAuthHeaders } from "./auth-client";
import { getBackendUrl } from "../backend-url";

/**
 * Ensures the backend has a Prisma user row for the current Neon Auth session.
 * Call after sign-up (if a bearer token is present) and after email verification / sign-in.
 */
export async function provisionBackendUserAfterAuth(bearerToken?: string | null): Promise<boolean> {
  let base: string;
  try {
    base = getBackendUrl();
  } catch {
    console.warn("[sync-backend-user] EXPO_PUBLIC_BACKEND_URL is not set");
    return false;
  }
  const token = typeof bearerToken === "string" ? bearerToken.trim() : "";
  const auth = token
    ? authHeadersFromToken(token)
    : await getAuthHeaders();
  if (!auth.Authorization) {
    return false;
  }
  const url = `${base}/api/auth/sync-user`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[sync-backend-user] request failed", res.status, text);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[sync-backend-user]", e);
    return false;
  }
}
