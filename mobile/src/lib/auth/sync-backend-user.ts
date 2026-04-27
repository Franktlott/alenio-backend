import { getAuthHeaders } from "./auth-client";

/**
 * Ensures the backend has a Prisma user row for the current Neon Auth session.
 * Call after sign-up (if a bearer token is present) and after email verification / sign-in.
 */
export async function provisionBackendUserAfterAuth(): Promise<void> {
  const base = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (!base) {
    console.warn("[sync-backend-user] EXPO_PUBLIC_BACKEND_URL is not set");
    return;
  }
  const auth = await getAuthHeaders();
  if (!auth.Authorization) {
    return;
  }
  const url = `${base.replace(/\/+$/, "")}/api/auth/sync-user`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[sync-backend-user] request failed", res.status, text);
    }
  } catch (e) {
    console.warn("[sync-backend-user]", e);
  }
}
