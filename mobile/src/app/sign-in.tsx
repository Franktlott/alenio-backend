import React, { useEffect, useRef, useState } from "react";
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
import { agentDebugLog, clearAccessToken, setAccessToken } from "@/lib/auth/auth-client";
import { sendEmailVerificationOtp } from "@/lib/auth/auth-api";
import { formatAuthFlowError, isEmailNotVerifiedError } from "@/lib/auth/auth-errors";
import { clearSignedOutMark, markSessionSignedOut, cancelMobileAuthQueries } from "@/lib/auth/use-session";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { LEGAL_APP_NAME, LEGAL_COMPANY_NAME, LEGAL_PARENT_COMPANY_NAME } from "@/lib/legal-constants";
import { useQueryClient } from "@tanstack/react-query";
import { setPendingTeamInviteToken } from "@/lib/auth/pending-team-invite";
import { setPendingJoinCode } from "@/lib/auth/pending-join-code";
import { completeMobileAuthEntry } from "@/lib/auth/complete-auth-entry";
import { signInWithEmailPassword } from "@/lib/auth/sign-in-email";
import {
  extractAuthTokenFromCallbackUrl,
  signInWithMicrosoft,
} from "@/lib/auth/microsoft-auth";
import { navigateToMobileHomeWithRetry } from "@/lib/auth/auth-entry";
import { AuthLoadingScreen, useAuthLoadingSequence } from "@/components/auth-loading";

export default function SignIn() {
  const params = useLocalSearchParams<{
    reason?: string;
    email?: string | string[];
    inviteToken?: string | string[];
    joinCode?: string | string[];
  }>();
  const { reason } = params;
  const emailFromInvite =
    typeof params.email === "string" ? params.email : params.email?.[0] ?? "";
  const inviteToken =
    typeof params.inviteToken === "string" ? params.inviteToken : params.inviteToken?.[0] ?? "";
  const joinCode =
    typeof params.joinCode === "string" ? params.joinCode : params.joinCode?.[0] ?? "";
  const [email, setEmail] = useState(emailFromInvite.trim().toLowerCase());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const signingInRef = useRef(false);
  const { activeIndex, allDone, exiting, runWithAuth } = useAuthLoadingSequence();

  useEffect(() => {
    clearSignedOutMark();
  }, []);

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

  useEffect(() => {
    if (joinCode) setPendingJoinCode(joinCode);
  }, [joinCode]);

  const handleSignIn = async () => {
    if (loading || microsoftLoading) return;
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
    signingInRef.current = true;
    clearAccessToken();
    clearSignedOutMark();
    await cancelMobileAuthQueries(queryClient);
    const emailNorm = email.trim().toLowerCase();
    console.warn("[alenio-auth] sign-in start v3-direct", { emailLen: emailNorm.length });
    try {
      const result = await signInWithEmailPassword(emailNorm, password);
      console.warn("[alenio-auth] sign-in result", {
        hasError: !!result.error,
        errorMsg: result.error?.message ?? null,
        hasUser: !!result.data?.user,
      });
      if (result.error && isEmailNotVerifiedError(result.error)) {
        try {
          await sendEmailVerificationOtp(emailNorm);
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
          await sendEmailVerificationOtp(emailNorm);
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
        const completed = await completeMobileAuthEntry(queryClient, result);
        if (!completed.ok) {
          setError(completed.error);
          return;
        }
        agentDebugLog("sign-in complete awaiting layout nav", {
          runId: "auth-simplify-v4",
          hypothesisId: "H4",
          meIdPrefix: completed.me.id.slice(0, 8),
        });
      }
    } catch (err) {
      console.warn("[alenio-auth] sign-in threw", err);
      setError(formatAuthFlowError(err));
    } finally {
      signingInRef.current = false;
      setLoading(false);
    }
  };

  const handleMicrosoft = async () => {
    if (loading || microsoftLoading || bootstrapping) return;
    setError(null);
    setBootstrapError(null);
    setMicrosoftLoading(true);
    signingInRef.current = true;
    clearAccessToken();
    clearSignedOutMark();
    await cancelMobileAuthQueries(queryClient);
    try {
      const result = await signInWithMicrosoft();
      if (result.error) {
        setError(result.error.message ?? "Microsoft sign-in failed.");
        return;
      }
      const token = result.callbackUrl ? extractAuthTokenFromCallbackUrl(result.callbackUrl) : null;
      if (!token) {
        setError("Sign-in did not return a session. Please try again.");
        return;
      }
      setMicrosoftLoading(false);
      setBootstrapping(true);
      setAccessToken(token);
      const completed = await runWithAuth(() =>
        completeMobileAuthEntry(queryClient, null, { navigate: false }),
      );
      if (!completed.ok) {
        setBootstrapError(completed.error);
        return;
      }
      navigateToMobileHomeWithRetry(completed.me.isAdmin === true, queryClient);
    } catch (err) {
      setBootstrapError(formatAuthFlowError(err));
      setError(formatAuthFlowError(err));
    } finally {
      signingInRef.current = false;
      setMicrosoftLoading(false);
    }
  };

  if (bootstrapping) {
    return (
      <AuthLoadingScreen
        activeIndex={activeIndex}
        allDone={allDone}
        exiting={exiting && !bootstrapError}
        error={bootstrapError}
        onBackToSignIn={() => {
          setBootstrapping(false);
          setBootstrapError(null);
        }}
        onRetry={() => {
          setBootstrapping(false);
          setBootstrapError(null);
          void handleMicrosoft();
        }}
      />
    );
  }

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
            <Text className="text-white/80 text-base mt-2">Connect. Execute. Elevate.</Text>
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
                  editable={!inviteToken}
                  onChangeText={(t) => { setEmail(t); setError(null); }}
                  returnKeyType="next"
                  testID="email-input"
                />
                {inviteToken && emailFromInvite ? (
                  <Text className="text-xs text-slate-400 mt-2">
                    This invite is locked to {emailFromInvite.trim().toLowerCase()}.
                  </Text>
                ) : null}
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
                disabled={loading || microsoftLoading}
                activeOpacity={0.8}
                testID="sign-in-button"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold text-base">Sign In</Text>
                )}
              </TouchableOpacity>

              <View className="flex-row items-center my-5">
                <View className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <Text className="mx-3 text-xs text-slate-400 uppercase">or</Text>
                <View className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </View>

              <TouchableOpacity
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-4 items-center"
                onPress={handleMicrosoft}
                disabled={loading || microsoftLoading}
                activeOpacity={0.8}
                testID="sign-in-microsoft"
              >
                {microsoftLoading ? (
                  <ActivityIndicator color="#4361EE" />
                ) : (
                  <Text className="text-slate-900 dark:text-white font-semibold text-base">
                    Continue with Microsoft
                  </Text>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
