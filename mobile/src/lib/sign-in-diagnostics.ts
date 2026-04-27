import * as Device from "expo-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { fetch } from "expo/fetch";
import { getNotifDebugLog, getNotifStatus } from "./notifications";
import { authClient, getAuthHeaders, getAccessToken } from "./auth/auth-client";

function push(lines: string[], label: string, value: string) {
  lines.push(`${label}: ${value}`);
}

/** Show host + db path for support; strip password from postgres-style URLs. */
function summarizeDatabaseUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "(empty)";
  const redacted = t.replace(/^(postgres(?:ql)?:\/\/)([^:]+):([^@/]+)@/i, "$1$2:***@");
  if (redacted.length > 140) {
    return `${redacted.slice(0, 100)}…${redacted.slice(-32)}`;
  }
  return redacted;
}

/**
 * Collects backend reachability, env summary, and push notification readiness (no auth required).
 */
export async function runSignInDiagnostics(): Promise<string> {
  const lines: string[] = [];

  push(lines, "Time (UTC)", new Date().toISOString());
  push(lines, "Platform", `${Platform.OS} (v${String(Platform.Version)})`);

  const exec = Constants.executionEnvironment;
  const execLabel =
    exec === ExecutionEnvironment.StoreClient
      ? "storeClient (often Expo Go)"
      : exec === ExecutionEnvironment.Standalone
        ? "standalone"
        : exec === ExecutionEnvironment.Bare
          ? "bare"
          : String(exec);
  push(lines, "Execution environment", execLabel);
  push(lines, "App ownership", Constants.appOwnership ?? "(unknown)");

  if (exec === ExecutionEnvironment.StoreClient) {
    lines.push("");
    lines.push("Note: In Expo Go, push tokens and some native features are limited.");
    lines.push("Use a development build for full notification testing.");
  }

  const backendRaw = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() ?? "";
  lines.push("");
  if (!backendRaw) {
    push(lines, "EXPO_PUBLIC_BACKEND_URL", "MISSING — set in ENV / build config");
  } else {
    push(lines, "EXPO_PUBLIC_BACKEND_URL", backendRaw);
    const base = backendRaw.replace(/\/$/, "");
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch(`${base}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      const text = await res.text();
      push(lines, "GET /health", `${res.status} ${res.ok ? "OK" : "FAIL"} — ${text.slice(0, 200)}`);
      let apiDatabase: string | null = null;
      try {
        const j = JSON.parse(text) as { database?: unknown };
        if (typeof j.database === "string" && j.database.trim()) {
          apiDatabase = j.database.trim();
        }
      } catch {
        /* non-JSON body */
      }
      push(
        lines,
        "Current database (this API)",
        apiDatabase ?? "(not reported — older server or non-JSON response)",
      );

      // Authenticated debug probe: confirms whether backend sees a valid session/token.
      try {
        const accessToken = await getAccessToken();
        push(lines, "Local token present", accessToken ? "yes" : "no");
        if (accessToken) {
          push(lines, "Local token prefix", `${accessToken.slice(0, 16)}…`);
        }
        try {
          const localSession = await authClient.getSession();
          const sessionData = (localSession?.data ?? null) as Record<string, unknown> | null;
          push(lines, "Local session user", sessionData && typeof sessionData.user === "object" ? "yes" : "no");
          const sessionObj = sessionData && typeof sessionData.session === "object"
            ? (sessionData.session as Record<string, unknown>)
            : null;
          const sessionToken =
            (typeof sessionObj?.token === "string" ? sessionObj.token : null) ??
            (typeof sessionObj?.accessToken === "string" ? sessionObj.accessToken : null) ??
            (typeof sessionObj?.access_token === "string" ? sessionObj.access_token : null);
          push(lines, "Local session token field", sessionToken ? "yes" : "no");
        } catch {
          push(lines, "Local session probe", "failed");
        }
        const authHeaders = await getAuthHeaders();
        push(lines, "Auth header present", authHeaders.Authorization ? "yes" : "no");
        let meRes = await fetch(`${base}/api/me/debug`, {
          credentials: "include",
          headers: authHeaders,
        });
        // Session hydration can lag on native right after sign-in; retry once.
        if (meRes.status === 401) {
          const freshHeaders = await getAuthHeaders();
          meRes = await fetch(`${base}/api/me/debug`, {
            credentials: "include",
            headers: freshHeaders,
          });
        }
        const meText = await meRes.text();
        push(lines, "GET /api/me/debug", `${meRes.status} ${meRes.ok ? "OK" : "FAIL"}`);
        try {
          const j = JSON.parse(meText) as {
            data?: {
              authenticated?: boolean;
              authUserId?: string;
              appUserFound?: boolean;
              database?: string;
            };
            error?: { code?: string; message?: string };
          };
          const authenticated = j.data?.authenticated;
          const authUserId = j.data?.authUserId;
          const appUserFound = j.data?.appUserFound;
          const db = j.data?.database;
          const errCode = j.error?.code;
          const errMsg = j.error?.message;
          push(lines, "  auth authenticated", authenticated === true ? "yes" : authenticated === false ? "no" : "unknown");
          push(lines, "  auth user id", authUserId ?? "(none)");
          push(lines, "  app user row found", typeof appUserFound === "boolean" ? String(appUserFound) : "unknown");
          if (db) push(lines, "  api database (debug)", db);
          if (errCode || errMsg) push(lines, "  auth error", `${errCode ?? "UNKNOWN"} ${errMsg ?? ""}`.trim());
        } catch {
          push(lines, "  /api/me/debug body", meText.slice(0, 200) || "(empty)");
        }
      } catch (e) {
        push(lines, "GET /api/me/debug", `FAILED — ${e instanceof Error ? e.message : String(e)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      push(lines, "GET /health", `FAILED — ${msg}`);
      push(lines, "Current database (this API)", "(unknown — backend unreachable)");
    }
  }

  const neon = process.env.EXPO_PUBLIC_NEON_AUTH_URL?.trim();
  push(lines, "EXPO_PUBLIC_NEON_AUTH_URL", neon ? `${neon.slice(0, 56)}${neon.length > 56 ? "…" : ""}` : "(not set)");

  lines.push("");
  const dbUrl = process.env.EXPO_PUBLIC_DATABASE_URL?.trim();
  if (dbUrl) {
    push(lines, "EXPO_PUBLIC_DATABASE_URL (client-only, masked)", summarizeDatabaseUrl(dbUrl));
  } else {
    push(
      lines,
      "EXPO_PUBLIC_DATABASE_URL (client-only)",
      "(not set — optional mirror for support; never ship production DB credentials in the app)",
    );
  }

  lines.push("");
  push(lines, "Physical device", Device.isDevice ? "yes" : "no (simulator — push usually unavailable)");
  const perm = await Notifications.getPermissionsAsync();
  push(lines, "Notification permission", `${perm.status}${perm.granted ? " (granted)" : ""}`);

  const projectIdFromExtra = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const projectIdFromEas = (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  const projectIdFromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const HARDCODED_EAS_PROJECT_ID = "f40ec24d-0b09-4cc6-8746-805bd60e9ea2";
  const projectId = (
    projectIdFromExtra ??
    projectIdFromEas ??
    projectIdFromEnv ??
    HARDCODED_EAS_PROJECT_ID
  )?.trim();

  push(lines, "EAS projectId (resolved)", projectId ?? "missing");
  push(lines, "  from extra", projectIdFromExtra ?? "—");
  push(lines, "  from easConfig", projectIdFromEas ?? "—");
  push(lines, "  from env EXPO_PUBLIC_EAS_PROJECT_ID", projectIdFromEnv ?? "—");

  lines.push("");
  if (Device.isDevice && perm.granted && projectId) {
    try {
      const tokenPromise = Notifications.getExpoPushTokenAsync({ projectId });
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("getExpoPushTokenAsync timed out (18s)")), 18_000);
      });
      const { data: token } = await Promise.race([tokenPromise, timeoutPromise]);
      push(
        lines,
        "Expo push token",
        token ? `${token.slice(0, 36)}…` : "(empty)",
      );
    } catch (e) {
      push(lines, "Expo push token", `ERROR — ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    push(
      lines,
      "Expo push token",
      "(skipped — need physical device, granted permission, and projectId)",
    );
  }

  lines.push("");
  const lastStatus = await getNotifStatus();
  push(lines, "Last stored push status", lastStatus ?? "(none)");

  const debugLog = await getNotifDebugLog();
  if (debugLog.length > 0) {
    lines.push("");
    lines.push("Recent push debug log (latest 8):");
    for (const entry of debugLog.slice(-8)) {
      const detail = entry.detail ? ` — ${entry.detail}` : "";
      lines.push(`  • [${entry.status}] ${entry.step}${detail}`);
    }
  }

  return lines.join("\n");
}
