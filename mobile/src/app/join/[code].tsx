import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useSession } from "@/lib/auth/use-session";
import {
  clearPendingJoinCode,
  normalizeJoinInviteCode,
  setPendingJoinCode,
} from "@/lib/auth/pending-join-code";

/**
 * Deep link: alenio://join/{inviteCode}
 * Logged-in users go straight to onboarding join.
 * Logged-out users keep the code and continue through sign-in.
 */
export default function JoinCodeDeepLinkScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const raw = typeof params.code === "string" ? params.code : params.code?.[0] ?? "";
  const code = normalizeJoinInviteCode(raw);
  const { data: session, isLoading } = useSession();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!code) {
      clearPendingJoinCode();
      setReady(true);
      return;
    }
    if (session?.user) {
      // Code is passed in the onboarding URL — no need to keep a pending copy.
      clearPendingJoinCode();
    } else {
      setPendingJoinCode(code);
    }
    setReady(true);
  }, [code, session?.user]);

  if (!ready || isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }} testID="join-code-loading">
        <ActivityIndicator size="large" color="#4361EE" />
        <Text style={{ marginTop: 12, color: "#64748B" }}>Opening invite…</Text>
      </View>
    );
  }

  if (!code) {
    return <Redirect href="/welcome" />;
  }

  if (session?.user) {
    return (
      <Redirect
        href={{
          pathname: "/onboarding",
          params: { mode: "join", code, focus: "code" },
        }}
      />
    );
  }

  return (
    <Redirect
      href={{
        pathname: "/sign-in",
        params: { joinCode: code },
      }}
    />
  );
}
