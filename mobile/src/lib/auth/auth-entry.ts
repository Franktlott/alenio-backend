import { InteractionManager } from "react-native";
import { router } from "expo-router";
import type { QueryClient } from "@tanstack/react-query";
import { agentDebugLog } from "@/lib/auth/auth-client";
import { resolveAuthenticatedDestination } from "@/lib/no-workspace-routing";

/** Authenticated home route after session + `/api/me` are ready. */
export function mobileHomeHref(_isAdmin: boolean) {
  // Platform admins use the regular app; open Admin from Profile when needed.
  return "/(app)/chat";
}

/** Navigate after Stack.Protected mounts the authenticated stack (never call from render). */
export function navigateToMobileHomeWithRetry(isAdmin: boolean, queryClient?: QueryClient) {
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const attempt = async (label: string) => {
    if (cancelled) return;
    try {
      const destination = await resolveAuthenticatedDestination(isAdmin, queryClient);
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
    void attempt("afterInteractions");
  });

  void attempt("immediate");
  for (const ms of [150, 600]) {
    timers.push(setTimeout(() => void attempt(`t+${ms}`), ms));
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
  "/auth-callback",
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
