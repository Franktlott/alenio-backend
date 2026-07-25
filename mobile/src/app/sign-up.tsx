import React, { useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { clearAccessToken, setAccessToken, setAccessTokenFromAuthData } from "@/lib/auth/auth-client";
import { sendEmailVerificationOtp, signUpWithEmailPassword } from "@/lib/auth/auth-api";
import { signInWithEmailPassword } from "@/lib/auth/sign-in-email";
import { provisionBackendUserAfterAuth } from "@/lib/auth/sync-backend-user";
import { setPendingSignUp } from "@/lib/auth/pending-signup";
import { formatAuthFlowError, isEmailAlreadyRegisteredError, isEmailNotVerifiedError } from "@/lib/auth/auth-errors";
import { cancelMobileAuthQueries, clearSignedOutMark, markSessionSignedOut } from "@/lib/auth/use-session";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { setPendingTeamInviteToken } from "@/lib/auth/pending-team-invite";
import { completeMobileAuthEntry } from "@/lib/auth/complete-auth-entry";
import { LEGAL_APP_NAME, LEGAL_COMPANY_NAME, LEGAL_PARENT_COMPANY_NAME } from "@/lib/legal-constants";
import {
  extractAuthTokenFromCallbackUrl,
  signInWithMicrosoft,
} from "@/lib/auth/microsoft-auth";
import { navigateToMobileHomeWithRetry } from "@/lib/auth/auth-entry";
import { AuthLoadingScreen, useAuthLoadingSequence } from "@/components/auth-loading";
import {
  AUTH_INPUT_CLASS,
  AuthField,
  AuthHeading,
  AuthMessage,
  AuthPrimaryButton,
  AuthScreen,
} from "@/components/auth/AuthScreen";

export default function SignUp() {
  const params = useLocalSearchParams<{ email?: string | string[]; inviteToken?: string | string[] }>();
  const emailFromInvite =
    typeof params.email === "string" ? params.email : params.email?.[0] ?? "";
  const inviteToken =
    typeof params.inviteToken === "string" ? params.inviteToken : params.inviteToken?.[0] ?? "";
  const inviteEmailLocked = Boolean(inviteToken && emailFromInvite.trim());

  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailFromInvite.trim().toLowerCase());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { activeIndex, allDone, exiting, runWithAuth } = useAuthLoadingSequence();

  useEffect(() => {
    if (emailFromInvite) setEmail(emailFromInvite.trim().toLowerCase());
  }, [emailFromInvite]);

  useEffect(() => {
    if (inviteToken) setPendingTeamInviteToken(inviteToken);
  }, [inviteToken]);

  const handleSignUp = async () => {
    if (loading || microsoftLoading) return;
    setError(null);
    if (!name.trim()) { setError("Please enter your name"); return; }
    if (!email.trim()) { setError("Please enter your email address"); return; }
    const emailNorm = inviteEmailLocked
      ? emailFromInvite.trim().toLowerCase()
      : email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      setError("Please enter a valid email address");
      return;
    }
    if (!password) { setError("Please enter a password"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }

    setLoading(true);
    try {
      console.warn("[alenio-auth] sign-up start", { emailLen: emailNorm.length });
      const result = await signUpWithEmailPassword({
        name: name.trim(),
        email: emailNorm,
        password,
      });
      console.warn("[alenio-auth] sign-up result", {
        ok: result.ok,
        status: result.status,
        errorMsg: result.error?.message ?? null,
      });
      if (result.error) {
        if (isEmailNotVerifiedError(result.error) || isEmailAlreadyRegisteredError(result.error)) {
          const signIn = await signInWithEmailPassword(emailNorm, password);
          if (signIn.error && isEmailNotVerifiedError(signIn.error)) {
            try {
              await sendEmailVerificationOtp(emailNorm);
            } catch {
              /* still send user to verify screen */
            }
            clearAccessToken();
            markSessionSignedOut(60_000);
            setPendingSignUp(emailNorm, password);
            router.replace({
              pathname: "/verify-otp",
              params: inviteToken ? { email: emailNorm, inviteToken } : { email: emailNorm },
            });
            return;
          }
          if (!signIn.error) {
            setAccessTokenFromAuthData(signIn ?? null);
            setAccessTokenFromAuthData(signIn.data ?? null);
            const existingUser = signIn.data?.user as { emailVerified?: boolean } | undefined;
            if (existingUser?.emailVerified === false) {
              clearAccessToken();
              markSessionSignedOut(60_000);
              setPendingSignUp(emailNorm, password);
              router.replace({
                pathname: "/verify-otp",
                params: inviteToken ? { email: emailNorm, inviteToken } : { email: emailNorm },
              });
              return;
            }
            const completed = await completeMobileAuthEntry(queryClient, signIn);
            if (!completed.ok) {
              setError(completed.error);
              return;
            }
            return;
          }
          setError(
            "An account with this email already exists. Sign in with your password, or reset it if you forgot.",
          );
          return;
        }
        setError(result.error.message ?? "Failed to create account. Please try again.");
        return;
      }

      const user =
        result.data && typeof result.data === "object"
          ? (result.data as { user?: unknown }).user
          : null;
      if (!user) {
        setError("Account could not be confirmed. Please try signing in.");
        router.replace("/sign-in");
        return;
      }

      // Sync Better Auth user into the app database while session/token may still be present.
      setAccessTokenFromAuthData(result.data);
      await provisionBackendUserAfterAuth();

      // Verification email is sent on sign-up — do not send again here.
      clearAccessToken();
      markSessionSignedOut(60_000);
      setPendingSignUp(emailNorm, password);
      router.replace({
        pathname: "/verify-otp",
        params: inviteToken ? { email: emailNorm, inviteToken } : { email: emailNorm },
      });
    } catch (err) {
      console.warn("[sign-up]", err);
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoft = async () => {
    if (loading || microsoftLoading || bootstrapping) return;
    setError(null);
    setBootstrapError(null);
    setMicrosoftLoading(true);
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
    <AuthScreen testID="sign-up-screen">
      <AuthHeading title="Create account" subtitle="Join Alenio and get started" />

          <AuthField label="Full name" icon={<UserRound size={20} color="#593CE6" strokeWidth={1.9} />}>
            <TextInput
              className={AUTH_INPUT_CLASS}
              placeholder="Your name"
              placeholderTextColor="#98A1B2"
              autoCapitalize="words"
              autoComplete="name"
              value={name}
              onChangeText={(t) => { setName(t); setError(null); }}
              returnKeyType="next"
              testID="name-input"
            />
          </AuthField>

          <AuthField label="Email address" icon={<Mail size={20} color="#593CE6" strokeWidth={1.9} />}>
            <TextInput
              className={AUTH_INPUT_CLASS}
              placeholder="you@example.com"
              placeholderTextColor="#98A1B2"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              editable={!inviteEmailLocked}
              onChangeText={(t) => { setEmail(t); setError(null); }}
              returnKeyType="next"
              testID="email-input"
            />
            {inviteEmailLocked ? (
              <Text className="text-xs text-slate-400 mt-2">
                This invite is locked to {emailFromInvite.trim().toLowerCase()}.
              </Text>
            ) : null}
          </AuthField>

          <AuthField label="Password" icon={<LockKeyhole size={20} color="#593CE6" strokeWidth={1.9} />}>
            <View style={{ position: "relative" }}>
              <TextInput
                className={AUTH_INPUT_CLASS}
                style={{ paddingRight: 48 }}
                placeholder="••••••••"
                placeholderTextColor="#172033"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                returnKeyType="next"
                testID="password-input"
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }} testID="toggle-password-visibility">
                {showPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
              </TouchableOpacity>
            </View>
          </AuthField>

          <AuthField
            label="Confirm password"
            icon={<LockKeyhole size={20} color="#593CE6" strokeWidth={1.9} />}
            className="mb-6"
          >
            <View style={{ position: "relative" }}>
              <TextInput
                className={AUTH_INPUT_CLASS}
                style={{ paddingRight: 48 }}
                placeholder="••••••••"
                placeholderTextColor="#172033"
                secureTextEntry={!showConfirmPassword}
                autoComplete="new-password"
                value={confirmPassword}
                onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
                testID="confirm-password-input"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword((v) => !v)} style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }} testID="toggle-confirm-password-visibility">
                {showConfirmPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
              </TouchableOpacity>
            </View>
          </AuthField>

          {error ? <AuthMessage tone="error" testID="error-message">{error}</AuthMessage> : null}

          <AuthPrimaryButton
            label="Create Account"
            loading={loading}
            onPress={handleSignUp}
            disabled={loading || microsoftLoading}
            testID="create-account-button"
          />

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
            testID="sign-up-microsoft"
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
            <Text className="text-[14px] text-[#687386]">Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push("/sign-in")} testID="sign-in-link">
              <Text className="text-[14px] font-medium text-[#4F35D9]">Sign in</Text>
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
          <Text className="mt-3 px-4 text-center text-[10px] text-[#8C94A3]">
            {LEGAL_APP_NAME} is operated by {LEGAL_COMPANY_NAME}. Parent company: {LEGAL_PARENT_COMPANY_NAME}.
          </Text>
          <Text className="mt-5 text-center text-[11px] text-[#8C94A3]">© 2026 Alenio Insights</Text>
    </AuthScreen>
  );
}
