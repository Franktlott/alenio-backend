import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
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

/**
 * Handles `alenio://auth-callback?auth_token=…` when the OS delivers the deep link
 * (also used if openAuthSessionAsync hands off via Linking).
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ auth_token?: string | string[]; error?: string | string[] }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const rawTokenParam = typeof params.auth_token === "string" ? params.auth_token : params.auth_token?.[0];
        const rawError = typeof params.error === "string" ? params.error : params.error?.[0];
        if (rawError) {
          if (!cancelled) setError(rawError);
          return;
        }

        let token = rawTokenParam?.trim() || null;
        if (!token) {
          // Fallback: reconstruct from full URL if expo-router parsed oddly
          const href =
            typeof window !== "undefined" && typeof window.location?.href === "string"
              ? window.location.href
              : null;
          if (href) {
            const oauthError = extractOAuthErrorFromCallbackUrl(href);
            if (oauthError) {
              if (!cancelled) setError(oauthError);
              return;
            }
            token = extractAuthTokenFromCallbackUrl(href);
          }
        }

        if (!token) {
          if (!cancelled) {
            setError("Sign-in did not return a session. Try Microsoft again, or use email and password.");
          }
          return;
        }

        clearSignedOutMark();
        await cancelMobileAuthQueries(queryClient);
        setAccessToken(token);
        const completed = await completeMobileAuthEntry(queryClient, null);
        if (!completed.ok) {
          if (!cancelled) setError(completed.error);
          return;
        }
      } catch (err) {
        if (!cancelled) setError(formatAuthFlowError(err));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [params.auth_token, params.error, queryClient]);

  return (
    <View className="flex-1 bg-white dark:bg-slate-900 items-center justify-center px-6">
      {error ? (
        <>
          <Text className="text-xl font-bold text-slate-900 dark:text-white mb-2">Sign-in issue</Text>
          <Text className="text-red-500 text-center mb-6" testID="auth-callback-error">
            {error}
          </Text>
          <Text
            className="text-indigo-600 font-semibold"
            onPress={() => router.replace("/sign-in")}
            testID="auth-callback-back"
          >
            Back to sign in
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color="#4361EE" size="large" />
          <Text className="text-slate-500 mt-4" testID="auth-callback-loading">
            Finishing Microsoft sign-in…
          </Text>
        </>
      )}
    </View>
  );
}
