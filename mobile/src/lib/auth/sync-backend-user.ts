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
  const auth = bearerToken?.trim()
    ? authHeadersFromToken(bearerToken)
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
      // #region agent log
      fetch('http://127.0.0.1:7364/ingest/e507813d-15c1-41eb-aedc-9cfd7576ce45',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4ff4c0'},body:JSON.stringify({sessionId:'4ff4c0',runId:'post-fix',hypothesisId:'H2',location:'sync-backend-user.ts:provisionBackendUserAfterAuth',message:'sync-user failed',data:{status:res.status,hasAuthHeader:!!auth.Authorization},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return false;
    }
    // #region agent log
    fetch('http://127.0.0.1:7364/ingest/e507813d-15c1-41eb-aedc-9cfd7576ce45',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4ff4c0'},body:JSON.stringify({sessionId:'4ff4c0',runId:'post-fix',hypothesisId:'H2',location:'sync-backend-user.ts:provisionBackendUserAfterAuth',message:'sync-user ok',data:{status:res.status},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return true;
  } catch (e) {
    console.warn("[sync-backend-user]", e);
    return false;
  }
}
