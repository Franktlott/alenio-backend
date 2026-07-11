import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/use-session";
import { fetchTeamInviteByToken, type TeamInviteLinkPreview } from "@/lib/team-invites-api";
import { setPendingTeamInviteToken } from "@/lib/auth/pending-team-invite";
import { finishMobilePostAuth } from "@/lib/auth/finish-post-auth";

export default function TeamInviteScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const tokenRaw = params.token;
  const token = typeof tokenRaw === "string" ? tokenRaw : tokenRaw?.[0] ?? "";
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TeamInviteLinkPreview | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This invite link is invalid.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchTeamInviteByToken(token);
        if (cancelled) return;
        setPreview(data);
        setPendingTeamInviteToken(token);

        if (session?.user) {
          const sessionEmail =
            typeof (session.user as { email?: unknown }).email === "string"
              ? (session.user as { email: string }).email.trim().toLowerCase()
              : "";
          const inviteEmail = data.email.trim().toLowerCase();
          if (sessionEmail && inviteEmail && sessionEmail !== inviteEmail) {
            setError(
              `This invite is for ${data.email}. You're signed in as ${sessionEmail}. Sign out and continue with the invited email.`,
            );
            return;
          }
          await finishMobilePostAuth(queryClient);
          router.replace("/(app)/chat");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Invite not found or expired.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, session?.user, queryClient]);

  const startSignUp = () => {
    if (!token || !preview) return;
    setPendingTeamInviteToken(token);
    router.replace({
      pathname: "/sign-up",
      params: { email: preview.email, inviteToken: token },
    });
  };

  const startSignIn = () => {
    if (!token) return;
    setPendingTeamInviteToken(token);
    router.replace({
      pathname: "/sign-in",
      params: preview?.email ? { email: preview.email, inviteToken: token } : { inviteToken: token },
    });
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white dark:bg-slate-900 items-center justify-center" testID="invite-loading">
        <ActivityIndicator size="large" color="#6366F1" />
        <Text className="text-slate-500 mt-4">Loading invite…</Text>
      </View>
    );
  }

  if (error || !preview) {
    return (
      <View className="flex-1 bg-white dark:bg-slate-900 items-center justify-center px-6" testID="invite-error">
        <Text className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Invite unavailable</Text>
        <Text className="text-slate-500 text-center mb-8">{error ?? "This invite is no longer valid."}</Text>
        <TouchableOpacity className="bg-indigo-600 rounded-xl py-3.5 px-8" onPress={() => router.replace("/sign-in")}>
          <Text className="text-white font-semibold">Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white dark:bg-slate-900">
      <StatusBar style="light" />
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <SafeAreaView edges={["top"]}>
          <View className="items-center py-10 px-6">
            <Image source={require("@/assets/alenio-logo-white.png")} style={{ width: 200, height: 72 }} resizeMode="contain" />
            <Text className="text-white/80 text-base mt-2 text-center">You&apos;re invited to join {preview.teamName}</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 }}>
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Join your team</Text>
        <Text className="text-slate-500 dark:text-slate-400 text-base mb-8">
          {preview.inviterName ? `${preview.inviterName} invited you` : "A team leader invited you"} to collaborate on Alenio.
          Create an account with {preview.email} to join automatically.
        </Text>

        <View className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 mb-8 flex-row items-center gap-3">
          {preview.teamImage ? (
            <Image source={{ uri: preview.teamImage }} style={{ width: 48, height: 48, borderRadius: 12 }} />
          ) : (
            <View className="w-12 h-12 rounded-xl bg-indigo-100 items-center justify-center">
              <Text className="text-indigo-700 font-bold text-lg">{(preview.teamName[0] ?? "?").toUpperCase()}</Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-base font-semibold text-slate-900 dark:text-white">{preview.teamName}</Text>
            <Text className="text-sm text-slate-500 mt-0.5">Invite for {preview.email}</Text>
          </View>
        </View>

        <TouchableOpacity className="bg-indigo-600 rounded-xl py-4 items-center" onPress={startSignUp} testID="invite-create-account">
          <Text className="text-white font-semibold text-base">Create account</Text>
        </TouchableOpacity>

        <TouchableOpacity className="mt-4 py-3 items-center" onPress={startSignIn} testID="invite-sign-in">
          <Text className="text-indigo-600 font-medium text-base">I already have an account</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
