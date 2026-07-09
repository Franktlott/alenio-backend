import { InteractionManager } from "react-native";
import { router } from "expo-router";
import { agentDebugLog } from "@/lib/auth/auth-client";

/** Authenticated home route after session + `/api/me` are ready. */
export function mobileHomeHref(isAdmin: boolean) {
  return isAdmin ? "/(admin)" : "/(app)/chat";
}

/** Navigate after Stack.Protected mounts the authenticated stack (never call from render). */
export function navigateToMobileHomeWithRetry(isAdmin: boolean) {
  const destination = mobileHomeHref(isAdmin);
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const attempt = (label: string) => {
    if (cancelled) return;
    try {
      router.replace(destination);
      agentDebugLog("nav attempt", {
        runId: "auth-simplify-v4",
        hypothesisId: "H4",
        label,
        destination,
      });
    } catch {
      // expo-router can throw if the target stack is not mounted yet
    }
  };

  InteractionManager.runAfterInteractions(() => {
    attempt("afterInteractions");
  });

  attempt("immediate");
  // Short retry window only — long retries were yanking users off other screens.
  for (const ms of [150, 600]) {
    timers.push(setTimeout(() => attempt(`t+${ms}`), ms));
  }

  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
  };
}

export const AUTH_ENTRY_PREFIXES = [
  "/",
  "/welcome",
  "/sign-in",
  "/sign-up",
  "/verify-otp",
  "/forgot-password",
  "/verify-reset-code",
  "/reset-password",
] as const;

export function isAuthEntryPath(pathname: string) {
  return AUTH_ENTRY_PREFIXES.some(
    (entry) => pathname === entry || (entry !== "/" && pathname.startsWith(`${entry}/`))
  );
}
