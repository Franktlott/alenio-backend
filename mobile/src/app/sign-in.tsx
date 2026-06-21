import React, { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
} from "react-native";
import { authClient, clearAccessToken, getAccessToken, getAuthHeaders, setAccessTokenFromAuthData } from "@/lib/auth/auth-client";
import { formatAuthFlowError, isEmailNotVerifiedError } from "@/lib/auth/auth-errors";
import {
  clearSignedOutMark,
  markSessionSignedOut,
  SESSION_QUERY_KEY,
  useInvalidateSession,
} from "@/lib/auth/use-session";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { LEGAL_APP_NAME, LEGAL_COMPANY_NAME, LEGAL_PARENT_COMPANY_NAME } from "@/lib/legal-constants";
import { useQueryClient } from "@tanstack/react-query";
import { fetch } from "expo/fetch";
import { readJsonSafe } from "@/lib/api/api";
import { provisionBackendUserAfterAuth } from "@/lib/auth/sync-backend-user";
import { fetchMeUser, ME_QUERY_KEY } from "@/lib/auth/me-query";
import { setPendingTeamInviteToken } from "@/lib/auth/pending-team-invite";
import { finishMobilePostAuth } from "@/lib/auth/finish-post-auth";

export default function SignIn() {
  const params = useLocalSearchParams<{
    reason?: string;
    email?: string | string[];
    inviteToken?: string | string[];
  }>();
  const { reason } = params;
  const emailFromInvite =
    typeof params.email === "string" ? params.email : params.email?.[0] ?? "";
  const inviteToken =
    typeof params.inviteToken === "string" ? params.inviteToken : params.inviteToken?.[0] ?? "";
  const [email, setEmail] = useState(emailFromInvite.trim().toLowerCase());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (reason === "session-required") {
      setError("Please sign in again to continue.");
    }
  }, [reason]);

  useEffect(() => {
    if (emailFromInvite) setEmail(emailFromInvite.trim().toLowerCase());
  }, [emailFromInvite]);

  useEffect(() => {
    if (inviteToken) setPendingTeamInviteToken(inviteToken);
  }, [inviteToken]);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const ensureSessionAndToken = async () => {
    // Neon session materialization can lag briefly after sign-in on mobile.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await invalidateSession();
      const bearer = (await getAccessToken())?.trim() ?? null;
      const sessionRes = await authClient.getSession({
        fetchOptions: {
          headers: {
            "X-Force-Fetch": "1",
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
        },
      } as never);
      const tokenFromSession =
        setAccessTokenFromAuthData(sessionRes ?? null) ??
        setAccessTokenFromAuthData(sessionRes.data ?? null);
      const tokenFromClient = await getAccessToken();
      if (sessionRes.data?.user && (tokenFromSession || tokenFromClient)) {
        return true;
      }
      await sleep(250);
    }
    return false;
  };

  const handleSignIn = async () => {
    if (loading) return;
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }
    setLoading(true);
    const emailNorm = email.trim().toLowerCase();
    try {
      const result = await authClient.signIn.email({
        email: emailNorm,
        password,
      });
      if (result.error && isEmailNotVerifiedError(result.error)) {
        try {
          await authClient.emailOtp.sendVerificationOtp({
            email: emailNorm,
            type: "email-verification",
          });
        } catch {
          /* still send user to verify screen */
        }
        clearAccessToken();
        markSessionSignedOut(60_000);
        router.replace({
          pathname: "/verify-otp",
          params: inviteToken ? { email: emailNorm, inviteToken } : { email: emailNorm },
        });
        return;
      }
      const signedInUser = result.data?.user as { emailVerified?: boolean } | undefined;
      if (!result.error && signedInUser?.emailVerified === false) {
        try {
          await authClient.emailOtp.sendVerificationOtp({
            email: emailNorm,
            type: "email-verification",
          });
        } catch {
          /* still send user to verify screen */
        }
        clearAccessToken();
        markSessionSignedOut(60_000);
        router.replace({
          pathname: "/verify-otp",
          params: inviteToken ? { email: emailNorm, inviteToken } : { email: emailNorm },
        });
        return;
      }
      if (result.error) {
        const msg = result.error.message ?? "";
        setError(msg || "Invalid email or password. Please try again.");
      } else {
        const tokenFromResult =
          setAccessTokenFromAuthData(result ?? null) ??
          setAccessTokenFromAuthData(result.data ?? null);
        clearSignedOutMark();
        const ready = tokenFromResult ? await ensureSessionAndToken() : await ensureSessionAndToken();
        if (!ready) {
          setError("Sign-in did not establish a session. Please try again.");
          return;
        }
        await queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY });
        await provisionBackendUserAfterAuth();
        const authHeaders = await getAuthHeaders();
        let backendAuthed = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const backendSessionRes = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/me/debug`, {
            credentials: "include",
            headers: authHeaders,
          });
          const backendJson = await readJsonSafe<{
            data?: { authenticated?: boolean };
          }>(backendSessionRes);
          if (backendSessionRes.ok && backendJson?.data?.authenticated === true) {
            backendAuthed = true;
            break;
          }
          await sleep(250);
        }
        if (!backendAuthed) {
          // Do not strand the user on sign-in for transient backend auth propagation delays.
          await sleep(200);
        }
        queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
        const me = await queryClient.fetchQuery({
          queryKey: ME_QUERY_KEY,
          queryFn: fetchMeUser,
        });
        if (!me?.id) {
          setError("Could not load your profile. Try signing in again.");
          return;
        }
        await finishMobilePostAuth(queryClient);
        await queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY });
        router.replace("/(app)/chat");
      }
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white dark:bg-slate-900">
      <StatusBar style="light" />
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <SafeAreaView edges={["top"]}>
          <View className="items-center py-10 px-6">
            <Image
              source={require("@/assets/alenio-logo-white.png")}
              style={{ width: 200, height: 72 }}
              resizeMode="contain"
            />
            <Text className="text-white/80 text-base mt-2">Connect. Workspace. Celebrate.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <>
              <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Welcome back
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-base mb-8">
                Sign in to your account
              </Text>

              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email address</Text>
                <TextInput
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                  placeholder="you@example.com"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(null); }}
                  returnKeyType="next"
                  testID="email-input"
                />
              </View>

              <View className="mb-2">
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</Text>
                <View style={{ position: "relative" }}>
                  <TextInput
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                    style={{ paddingRight: 48 }}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    value={password}
                    onChangeText={(t) => { setPassword(t); setError(null); }}
                    returnKeyType="done"
                    onSubmitEditing={handleSignIn}
                    testID="password-input"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}
                    testID="toggle-password-visibility"
                  >
                    {showPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => router.push("/forgot-password")}
                className="self-end mb-6 py-1"
                testID="forgot-password-link"
              >
                <Text className="text-sm text-indigo-600 font-medium">Forgot password?</Text>
              </TouchableOpacity>

              {error ? (
                <Text className="text-red-500 text-sm mb-4" testID="error-message">{error}</Text>
              ) : null}

              <TouchableOpacity
                className="bg-indigo-600 rounded-xl py-4 items-center"
                onPress={handleSignIn}
                disabled={loading}
                activeOpacity={0.8}
                testID="sign-in-button"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold text-base">Sign In</Text>
                )}
              </TouchableOpacity>

              <View className="flex-row justify-center items-center mt-6">
                <Text className="text-slate-500 text-sm">Don't have an account? </Text>
                <TouchableOpacity onPress={() => router.push("/sign-up")} testID="sign-up-link">
                  <Text className="text-indigo-600 text-sm font-medium">Sign up</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row justify-center flex-wrap mt-6 gap-1">
                <Text className="text-xs text-slate-400">By continuing you agree to our</Text>
                <TouchableOpacity onPress={() => router.push("/terms-of-service")} testID="terms-link">
                  <Text className="text-xs text-indigo-500 font-medium">Terms of Service</Text>
                </TouchableOpacity>
                <Text className="text-xs text-slate-400">and</Text>
                <TouchableOpacity onPress={() => router.push("/privacy-policy")} testID="privacy-link">
                  <Text className="text-xs text-indigo-500 font-medium">Privacy Policy</Text>
                </TouchableOpacity>
              </View>
              <Text className="text-[10px] text-slate-400 text-center mt-2 px-4">
                {LEGAL_APP_NAME} is operated by {LEGAL_COMPANY_NAME}. Parent company: {LEGAL_PARENT_COMPANY_NAME}.
              </Text>
          </>

          <View style={{ alignItems: "center", marginTop: 32, paddingBottom: 8 }}>
            <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
