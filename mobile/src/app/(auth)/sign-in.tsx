import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from "lucide-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import {
  agentDebugLog,
  clearAccessToken,
  setAccessToken,
} from "@/lib/auth/auth-client";
import { sendEmailVerificationOtp } from "@/lib/auth/auth-api";
import {
  formatAuthFlowError,
  isEmailNotVerifiedError,
} from "@/lib/auth/auth-errors";
import {
  clearSignedOutMark,
  markSessionSignedOut,
  cancelMobileAuthQueries,
} from "@/lib/auth/use-session";
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
import {
  AuthLoadingScreen,
  useAuthLoadingSequence,
} from "@/components/auth-loading";
import {
  AUTH_INPUT_CLASS,
  AuthCard,
  AuthField,
  AuthHeading,
  AuthMessage,
  AuthPrimaryButton,
  AuthScreen,
  authGoBack,
} from "@/components/auth/AuthScreen";

export default function SignIn() {
  const params = useLocalSearchParams<{
    reason?: string;
    email?: string | string[];
    inviteToken?: string | string[];
    joinCode?: string | string[];
  }>();
  const { reason } = params;
  const emailFromInvite =
    typeof params.email === "string" ? params.email : (params.email?.[0] ?? "");
  const inviteToken =
    typeof params.inviteToken === "string"
      ? params.inviteToken
      : (params.inviteToken?.[0] ?? "");
  const joinCode =
    typeof params.joinCode === "string"
      ? params.joinCode
      : (params.joinCode?.[0] ?? "");
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
  const { activeIndex, allDone, exiting, runWithAuth } =
    useAuthLoadingSequence();

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
    console.warn("[alenio-auth] sign-in start v3-direct", {
      emailLen: emailNorm.length,
    });
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
          params: inviteToken
            ? { email: emailNorm, inviteToken }
            : { email: emailNorm },
        });
        return;
      }
      const signedInUser = result.data?.user as
        | { emailVerified?: boolean }
        | undefined;
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
          params: inviteToken
            ? { email: emailNorm, inviteToken }
            : { email: emailNorm },
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
      const token = result.callbackUrl
        ? extractAuthTokenFromCallbackUrl(result.callbackUrl)
        : null;
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
    <AuthScreen
      testID="sign-in-screen"
      onBack={authGoBack}
      wrapContentInCard={false}
    >
      <AuthHeading
        badge="Welcome back"
        badgeIcon={<Text style={{ fontSize: 13 }}>👋</Text>}
        title="Sign in to Alenio"
        subtitle="Continue to your work, people and conversations."
      />

      <AuthCard>
        {reason === "password-reset" ? (
          <View
            className="mb-5 flex-row items-center rounded-[18px] border border-[#DDEDE7] bg-[#F5FBF8] px-4 py-3.5"
            style={{ gap: 12 }}
            testID="password-reset-success"
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 13,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#E5F6EF",
                borderWidth: 1,
                borderColor: "#CFEBDF",
              }}
            >
              <CheckCircle2 size={20} color="#268A68" strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="text-[10px] font-bold tracking-[0.7px] text-[#43816D]">
                PASSWORD UPDATED
              </Text>
              <Text className="mt-0.5 text-[14px] font-bold text-[#18372D]">
                You’re ready to sign in
              </Text>
              <Text className="mt-1 text-[12px] leading-[17px] text-[#648077]">
                Enter your new password below to continue.
              </Text>
            </View>
          </View>
        ) : null}

        <AuthField
          label="Email address"
          icon={<Mail size={20} color="#593CE6" strokeWidth={1.9} />}
        >
          <TextInput
            className={AUTH_INPUT_CLASS}
            placeholder="you@example.com"
            placeholderTextColor="#98A1B2"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            editable={!inviteToken}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            returnKeyType="next"
            testID="email-input"
          />
          {inviteToken && emailFromInvite ? (
            <Text className="mt-2 text-xs text-slate-400">
              This invite is locked to {emailFromInvite.trim().toLowerCase()}.
            </Text>
          ) : null}
        </AuthField>

        <AuthField
          label="Password"
          icon={<LockKeyhole size={20} color="#593CE6" strokeWidth={1.9} />}
          className="mb-6"
          labelAction={
            <TouchableOpacity
              onPress={() => router.push("/forgot-password")}
              testID="forgot-password-link"
            >
              <Text className="text-[12px] font-semibold text-[#4F35D9]">
                Forgot password?
              </Text>
            </TouchableOpacity>
          }
        >
          <TextInput
            className={AUTH_INPUT_CLASS}
            style={{ paddingRight: 48 }}
            placeholder="Enter your password"
            placeholderTextColor="#98A1B2"
            secureTextEntry={!showPassword}
            autoComplete="password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            testID="password-input"
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            style={{
              position: "absolute",
              right: 14,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
            testID="toggle-password-visibility"
          >
            {showPassword ? (
              <EyeOff size={20} color="#98A1B2" />
            ) : (
              <Eye size={20} color="#98A1B2" />
            )}
          </TouchableOpacity>
        </AuthField>

        {error ? (
          <AuthMessage tone="error" testID="error-message">
            {error}
          </AuthMessage>
        ) : null}

        <AuthPrimaryButton
          label="Sign in"
          loading={loading}
          onPress={handleSignIn}
          disabled={loading || microsoftLoading}
          testID="sign-in-button"
        />

        <View className="my-6 flex-row items-center">
          <View className="h-px flex-1 bg-[#E4E5EB]" />
          <Text className="mx-3 text-[10px] font-semibold uppercase text-[#8991A0]">
            or
          </Text>
          <View className="h-px flex-1 bg-[#E4E5EB]" />
        </View>

        <TouchableOpacity
          className="h-[54px] flex-row items-center justify-center rounded-[14px] border border-[#DFE1E9] bg-white"
          onPress={handleMicrosoft}
          disabled={loading || microsoftLoading}
          activeOpacity={0.8}
          testID="sign-in-microsoft"
        >
          {microsoftLoading ? (
            <ActivityIndicator color="#4361EE" />
          ) : (
            <>
              <View className="mr-4 h-[22px] w-[22px] flex-row flex-wrap gap-[2px]">
                <View className="h-[10px] w-[10px] bg-[#F25022]" />
                <View className="h-[10px] w-[10px] bg-[#7FBA00]" />
                <View className="h-[10px] w-[10px] bg-[#00A4EF]" />
                <View className="h-[10px] w-[10px] bg-[#FFB900]" />
              </View>
              <Text className="text-[15px] font-semibold text-[#172033]">
                Continue with Microsoft
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View className="mt-7 flex-row items-center justify-center">
          <Text className="text-[13px] text-[#687386]">New to Alenio? </Text>
          <TouchableOpacity
            onPress={() => router.push("/sign-up")}
            testID="sign-up-link"
          >
            <Text className="text-[13px] font-bold text-[#4F35D9]">
              Create account
            </Text>
          </TouchableOpacity>
        </View>

      </AuthCard>

      <View className="mt-6 flex-row flex-wrap justify-center gap-1 px-4">
        <Text className="text-[10px] text-[#8C94A3]">
          By continuing you agree to our
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/terms-of-service")}
          testID="terms-link"
        >
          <Text className="text-[10px] font-semibold text-[#4F35D9]">
            Terms of Service
          </Text>
        </TouchableOpacity>
        <Text className="text-[10px] text-[#8C94A3]">and</Text>
        <TouchableOpacity
          onPress={() => router.push("/privacy-policy")}
          testID="privacy-link"
        >
          <Text className="text-[10px] font-semibold text-[#4F35D9]">
            Privacy Policy
          </Text>
        </TouchableOpacity>
      </View>
      <Text className="mt-3 text-center text-[10px] text-[#A0A6B2]">
        © 2026 Alenio Insights
      </Text>
    </AuthScreen>
  );
}
