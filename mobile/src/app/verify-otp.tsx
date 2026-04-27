import React, { useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { authClient, setAccessTokenFromAuthData } from "@/lib/auth/auth-client";
import { provisionBackendUserAfterAuth } from "@/lib/auth/sync-backend-user";
import { formatAuthFlowError } from "@/lib/auth/auth-errors";
import { clearPendingSignUp, getPendingSignUp } from "@/lib/auth/pending-signup";
import { clearSignedOutMark, useInvalidateSession } from "@/lib/auth/use-session";

/** Better Auth defaults to 6; some projects use longer OTPs. */
const OTP_MIN_LEN = 6;
const OTP_MAX_LEN = 10;

export default function VerifyOtp() {
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const emailRaw = params.email;
  const email = typeof emailRaw === "string" ? emailRaw : emailRaw?.[0] ?? "";

  const [otp, setOtp] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendHint, setResendHint] = useState<string | null>(null);
  const invalidateSession = useInvalidateSession();

  const handleVerify = async () => {
    setError(null);
    const code = otp.replace(/\D/g, "");
    if (code.length < OTP_MIN_LEN) {
      setError(`Enter the full code from your email (at least ${OTP_MIN_LEN} digits).`);
      return;
    }
    if (code.length > OTP_MAX_LEN) {
      setError("That code looks too long. Use only the numbers from the email.");
      return;
    }
    const emailNorm = email.trim().toLowerCase();
    setLoading(true);
    try {
      try {
        const result = await authClient.emailOtp.verifyEmail({
          email: emailNorm,
          otp: code,
        });
        if (result?.error) {
          setError(
            typeof result.error.message === "string"
              ? result.error.message
              : "That code did not work. Try again or request a new code.",
          );
          return;
        }
        setAccessTokenFromAuthData(result ?? null);
        setAccessTokenFromAuthData(result.data ?? null);
      } catch (e) {
        setError(formatAuthFlowError(e));
        return;
      }

      await invalidateSession();
      let sessionRes = await authClient.getSession();

      if (!sessionRes.data?.user) {
        const pending = getPendingSignUp();
        if (pending && pending.email === emailNorm) {
          try {
            const si = await authClient.signIn.email({
              email: pending.email,
              password: pending.password,
            });
            if (!si.error) {
              setAccessTokenFromAuthData(si ?? null);
              setAccessTokenFromAuthData(si.data ?? null);
              await invalidateSession();
              sessionRes = await authClient.getSession();
            }
          } catch {
            /* user can sign in manually */
          } finally {
            clearPendingSignUp();
          }
        }
      }

      if (sessionRes.data?.user) {
        await provisionBackendUserAfterAuth();
        clearSignedOutMark();
        router.replace("/");
      } else {
        router.replace("/sign-in");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) return;
    setResendHint(null);
    setError(null);
    setResendLoading(true);
    try {
      const sent = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "email-verification",
      });
      if (sent.error) {
        setError(sent.error.message ?? "Could not resend code.");
      } else {
        setResendHint("We sent a new code to your email.");
      }
    } finally {
      setResendLoading(false);
    }
  };

  if (!email.trim()) {
    return (
      <View className="flex-1 bg-white dark:bg-slate-900 items-center justify-center px-6" testID="verify-otp-missing-email">
        <Text className="text-slate-600 dark:text-slate-300 text-center mb-6">Missing email. Go back to sign in and try again.</Text>
        <TouchableOpacity
          className="bg-indigo-600 rounded-xl py-3.5 px-8"
          onPress={() => router.replace("/sign-in")}
          testID="verify-otp-back-sign-in"
        >
          <Text className="text-white font-semibold">Back to sign in</Text>
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
            <Text className="text-white/80 text-base mt-2">Verify your email</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          testID="verify-otp-scroll"
        >
          <Text className="text-lg text-slate-600 dark:text-slate-300 mb-2">
            We sent a verification code to
          </Text>
          <Text className="text-base font-semibold text-slate-900 dark:text-white mb-8" selectable testID="verify-otp-email-display">
            {email.trim().toLowerCase()}
          </Text>

          <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Verification code</Text>
          <TextInput
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white tracking-widest text-center"
            placeholder="••••••"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            maxLength={OTP_MAX_LEN}
            value={otp}
            onChangeText={(t) => {
              setOtp(t.replace(/\D/g, "").slice(0, OTP_MAX_LEN));
              setError(null);
            }}
            returnKeyType="done"
            onSubmitEditing={handleVerify}
            testID="verify-otp-input"
          />

          {error ? (
            <Text className="text-red-500 text-sm mt-4" testID="verify-otp-error">
              {error}
            </Text>
          ) : null}
          {resendHint ? (
            <Text className="text-emerald-600 text-sm mt-3" testID="verify-otp-resend-hint">
              {resendHint}
            </Text>
          ) : null}

          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 items-center mt-8"
            onPress={handleVerify}
            disabled={loading}
            testID="verify-otp-submit"
          >
            {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold text-base">Verify and continue</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-4 py-3 items-center"
            onPress={handleResend}
            disabled={resendLoading}
            testID="verify-otp-resend"
          >
            {resendLoading ? (
              <ActivityIndicator color="#6366F1" />
            ) : (
              <Text className="text-indigo-600 font-medium text-base">Resend code</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity className="mt-6 py-2 items-center" onPress={() => router.replace("/sign-in")} testID="verify-otp-cancel">
            <Text className="text-slate-500 text-sm">Back to sign in</Text>
          </TouchableOpacity>

          <View className="items-center mt-10">
            <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
