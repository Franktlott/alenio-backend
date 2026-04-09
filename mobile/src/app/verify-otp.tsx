import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession } from "@/lib/auth/use-session";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";

const OTP_LENGTH = 6;

export default function VerifyOtp() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputs = useRef<(TextInput | null)[]>([]);
  const invalidateSession = useInvalidateSession();

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleChange = (text: string, index: number) => {
    setError(null);
    const cleaned = text.replace(/[^0-9]/g, "").slice(-1);
    const next = [...code];
    next[index] = cleaned;
    setCode(next);
    if (cleaned && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
    if (cleaned && index === OTP_LENGTH - 1) {
      inputs.current[index]?.blur();
      handleVerify(next.join(""));
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (otp?: string) => {
    const finalCode = otp ?? code.join("");
    if (finalCode.length < OTP_LENGTH) {
      setError("Please enter all 6 digits");
      return;
    }
    if (!email) {
      setError("Email missing. Please go back and sign up again.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await authClient.emailOtp.verifyEmail({
      email: email.trim().toLowerCase(),
      otp: finalCode,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Invalid or expired code. Please try again.");
      setCode(Array(OTP_LENGTH).fill(""));
      inputs.current[0]?.focus();
    } else {
      setSuccess(true);
      await invalidateSession();
    }
  };

  const handleResend = async () => {
    if (!email || countdown > 0) return;
    setResending(true);
    setError(null);
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: "email-verification",
    });
    setResending(false);
    if (result.error) {
      setError("Failed to resend code. Please try again.");
    } else {
      setCountdown(60);
      setCode(Array(OTP_LENGTH).fill(""));
      inputs.current[0]?.focus();
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
            <Text className="text-white/80 text-base mt-2">Connect. Execute. Celebrate.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <View className="flex-1 px-6 pt-10">
          <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Check your email
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 text-base mb-8">
            We sent a 6-digit code to{" "}
            <Text className="text-indigo-600 font-medium">{email}</Text>
          </Text>

          {/* OTP boxes */}
          <View className="flex-row justify-between mb-6" testID="otp-container">
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={(r) => { inputs.current[i] = r; }}
                value={digit}
                onChangeText={(t) => handleChange(t, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                style={{
                  width: 48,
                  height: 56,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: digit ? "#4361EE" : "#E2E8F0",
                  backgroundColor: "#F8FAFC",
                  fontSize: 24,
                  fontWeight: "bold",
                  textAlign: "center",
                  color: "#1E293B",
                }}
                testID={`otp-input-${i}`}
              />
            ))}
          </View>

          {error ? (
            <Text className="text-red-500 text-sm mb-4" testID="error-message">{error}</Text>
          ) : null}

          {success ? (
            <Text className="text-green-600 text-sm mb-4">Email verified! Signing you in...</Text>
          ) : null}

          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 items-center"
            onPress={() => handleVerify()}
            disabled={loading || code.join("").length < OTP_LENGTH}
            activeOpacity={0.8}
            testID="verify-button"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Verify email</Text>
            )}
          </TouchableOpacity>

          <View className="flex-row justify-center items-center mt-6">
            <Text className="text-slate-500 text-sm">Didn't receive it? </Text>
            {countdown > 0 ? (
              <Text className="text-slate-400 text-sm">Resend in {countdown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend} disabled={resending} testID="resend-button">
                {resending ? (
                  <ActivityIndicator size="small" color="#4361EE" />
                ) : (
                  <Text className="text-indigo-600 text-sm font-medium">Resend code</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            className="items-center mt-4 py-2"
            onPress={() => router.back()}
            testID="back-button"
          >
            <Text className="text-slate-500 text-sm">← Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </View>
  );
}
