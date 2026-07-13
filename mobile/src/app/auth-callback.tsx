import React, { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { setAccessToken } from "@/lib/auth/auth-client";
import { completeMobileAuthEntry } from "@/lib/auth/complete-auth-entry";
import {
  extractAuthTokenFromCallbackUrl,
  extractOAuthErrorFromCallbackUrl,
} from "@/lib/auth/microsoft-auth";
import { formatAuthFlowError } from "@/lib/auth/auth-errors";
import { cancelMobileAuthQueries, clearSignedOutMark } from "@/lib/auth/use-session";
import { navigateToMobileHomeWithRetry } from "@/lib/auth/auth-entry";
import { AuthLoadingScreen, useAuthLoadingSequence } from "@/components/auth-loading";

/**
 * Handles `alenio://auth-callback?auth_token=…` and shows the premium workspace boot screen.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ auth_token?: string | string[]; error?: string | string[] }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { activeIndex, allDone, exiting, runWithAuth } = useAuthLoadingSequence();

  const finish = useCallback(async () => {
    setError(null);
    try {
      const rawTokenParam = typeof params.auth_token === "string" ? params.auth_token : params.auth_token?.[0];
      const rawError = typeof params.error === "string" ? params.error : params.error?.[0];
      if (rawError) {
        setError(rawError);
        return;
      }

      let token = rawTokenParam?.trim() || null;
      if (!token) {
        const href =
          typeof window !== "undefined" && typeof window.location?.href === "string"
            ? window.location.href
            : null;
        if (href) {
          const oauthError = extractOAuthErrorFromCallbackUrl(href);
          if (oauthError) {
            setError(oauthError);
            return;
          }
          token = extractAuthTokenFromCallbackUrl(href);
        }
      }

      if (!token) {
        setError("Sign-in did not return a session. Try Microsoft again, or use email and password.");
        return;
      }

      const result = await runWithAuth(async () => {
        clearSignedOutMark();
        await cancelMobileAuthQueries(queryClient);
        setAccessToken(token!);
        return completeMobileAuthEntry(queryClient, null, { navigate: false });
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      navigateToMobileHomeWithRetry(result.me.isAdmin === true, queryClient);
    } catch (err) {
      setError(formatAuthFlowError(err));
    }
  }, [params.auth_token, params.error, queryClient, runWithAuth]);

  useEffect(() => {
    void finish();
  }, [finish]);

  return (
    <AuthLoadingScreen
      activeIndex={activeIndex}
      allDone={allDone}
      exiting={exiting && !error}
      error={error}
      onBackToSignIn={() => router.replace("/sign-in")}
      onRetry={() => void finish()}
    />
  );
}
