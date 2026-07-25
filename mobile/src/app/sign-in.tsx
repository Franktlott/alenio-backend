import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react-native";
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
        exiting={Boolean(exiting && !bootstrapError)}
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
    <View className="flex-1 bg-[#F7F7FF]" testID="sign-in-screen">
      <StatusBar style="light" />
      <LinearGradient
        colors={["#1769F5", "#7138EF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.65 }}
        style={{ height: 330 }}
      >
        <SafeAreaView edges={["top"]}>
          <View className="items-center px-6 pt-7">
            <Image
              source={require("@/assets/alenio-logo-white.png")}
              style={{ width: 210, height: 76 }}
              resizeMode="contain"
            />
            <Text className="mt-1 text-center text-[17px] leading-[23px] text-white">
              Your frontline{"\n"}operations platform.
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 310,
          left: -28,
          right: -28,
          height: 100,
          borderTopLeftRadius: 70,
          borderTopRightRadius: 70,
          backgroundColor: "#F7F7FF",
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
        style={{ marginTop: -82 }}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 23, paddingBottom: 44 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            className="rounded-[15px] bg-white px-9 pb-10 pt-11"
            style={{
              shadowColor: "#30315F",
              shadowOffset: { width: 0, height: 7 },
              shadowOpacity: 0.14,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
              <Text className="mb-1 text-[27px] font-bold leading-[34px] text-[#172033]">
                Welcome back
              </Text>
              <Text className="mb-8 text-[16px] leading-6 text-[#687386]">
                Sign in to your account
              </Text>

              <View className="mb-5">
                <Text className="mb-2 text-[13px] font-semibold text-[#344054]">Email address</Text>
                <View className="relative justify-center">
                  <Mail
                    size={20}
                    color="#593CE6"
                    strokeWidth={1.9}
                    style={{ position: "absolute", left: 16, zIndex: 1 }}
                  />
                  <TextInput
                    className="h-[54px] rounded-[10px] border border-[#CED2DB] bg-white pl-[50px] pr-4 text-[15px] text-[#172033]"
                    placeholder="you@example.com"
                    placeholderTextColor="#98A1B2"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    value={email}
                    editable={!inviteToken}
                    onChangeText={(t) => { setEmail(t); setError(null); }}
                    returnKeyType="next"
                    testID="email-input"
                  />
                </View>
                {inviteToken && emailFromInvite ? (
                  <Text className="text-xs text-slate-400 mt-2">
                    This invite is locked to {emailFromInvite.trim().toLowerCase()}.
                  </Text>
                ) : null}
              </View>

              <View className="mb-2">
                <Text className="mb-2 text-[13px] font-semibold text-[#344054]">Password</Text>
                <View className="relative justify-center">
                  <LockKeyhole
                    size={20}
                    color="#593CE6"
                    strokeWidth={1.9}
                    style={{ position: "absolute", left: 16, zIndex: 1 }}
                  />
                  <TextInput
                    className="h-[54px] rounded-[10px] border border-[#CED2DB] bg-white pl-[50px] text-[15px] text-[#172033]"
                    style={{ paddingRight: 48 }}
                    placeholder="••••••••"
                    placeholderTextColor="#172033"
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
                    {showPassword ? <EyeOff size={20} color="#98A1B2" /> : <Eye size={20} color="#98A1B2" />}
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => router.push("/forgot-password")}
                className="mb-6 self-start py-1"
                testID="forgot-password-link"
              >
                <Text className="text-[13px] font-medium text-[#4F35D9]">Forgot password?</Text>
              </TouchableOpacity>

              {error ? (
                <Text className="text-red-500 text-sm mb-4" testID="error-message">{error}</Text>
              ) : null}

              <LinearGradient
                colors={["#7137EA", "#4333E6"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  height: 54,
                  borderRadius: 10,
                  shadowColor: "#5337E4",
                  shadowOffset: { width: 0, height: 5 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 5,
                }}
              >
                <TouchableOpacity
                  className="flex-1 items-center justify-center rounded-[10px]"
                  onPress={handleSignIn}
                  disabled={loading || microsoftLoading}
                  activeOpacity={0.82}
                  testID="sign-in-button"
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-[16px] font-semibold text-white">Sign In</Text>
                  )}
                </TouchableOpacity>
              </LinearGradient>

              <View className="my-6 flex-row items-center">
                <View className="h-px flex-1 bg-[#E2E4EA]" />
                <Text className="mx-3 text-[10px] font-medium uppercase text-[#7F8796]">or</Text>
                <View className="h-px flex-1 bg-[#E2E4EA]" />
              </View>

              <TouchableOpacity
                className="h-[54px] flex-row items-center justify-center rounded-[10px] border border-[#E0E2E8] bg-white"
                onPress={handleMicrosoft}
                disabled={loading || microsoftLoading}
                activeOpacity={0.8}
                testID="sign-in-microsoft"
              >
                {microsoftLoading ? (
                  <ActivityIndicator color="#4361EE" />
                ) : (
                  <>
                    <View className="mr-5 h-[22px] w-[22px] flex-row flex-wrap gap-[2px]">
                      <View className="h-[10px] w-[10px] bg-[#F25022]" />
                      <View className="h-[10px] w-[10px] bg-[#7FBA00]" />
                      <View className="h-[10px] w-[10px] bg-[#00A4EF]" />
                      <View className="h-[10px] w-[10px] bg-[#FFB900]" />
                    </View>
                    <Text className="text-[16px] font-medium text-[#172033]">Continue with Microsoft</Text>
                  </>
                )}
              </TouchableOpacity>

              <View className="mt-8 flex-row items-center justify-center">
                <Text className="text-[14px] text-[#687386]">Don't have an account? </Text>
                <TouchableOpacity onPress={() => router.push("/sign-up")} testID="sign-up-link">
                  <Text className="text-[14px] font-medium text-[#4F35D9]">Sign up</Text>
                </TouchableOpacity>
              </View>

              <View className="mt-8 flex-row flex-wrap justify-center gap-1">
                <Text className="text-[11px] text-[#7F8796]">By continuing you agree to our</Text>
                <TouchableOpacity onPress={() => router.push("/terms-of-service")} testID="terms-link">
                  <Text className="text-[11px] font-medium text-[#4F35D9]">Terms of Service</Text>
                </TouchableOpacity>
                <Text className="text-[11px] text-[#7F8796]">and</Text>
                <TouchableOpacity onPress={() => router.push("/privacy-policy")} testID="privacy-link">
                  <Text className="text-[11px] font-medium text-[#4F35D9]">Privacy Policy</Text>
                </TouchableOpacity>
              </View>
              <Text className="mt-7 text-center text-[11px] text-[#8C94A3]">
                © 2026 Alenio Insights
              </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
