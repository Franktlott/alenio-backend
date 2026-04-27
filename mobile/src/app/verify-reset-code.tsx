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
import { authClient } from "@/lib/auth/auth-client";
import { formatAuthFlowError } from "@/lib/auth/auth-errors";

export default function VerifyResetCode() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailNorm = (email ?? "").trim().toLowerCase();

  const handleContinue = async () => {
    setError(null);
    const otpNorm = otp.replace(/\D/g, "");

    if (!emailNorm) {
      setError("Missing email. Please request a new reset code.");
      return;
    }
    if (otpNorm.length < 6) {
      setError("Enter the code from your email.");
      return;
    }

    setLoading(true);
    try {
      const check = await authClient.emailOtp.checkVerificationOtp({
        email: emailNorm,
        otp: otpNorm,
        type: "forget-password",
      });
      if (check.error) {
        setError(check.error.message ?? "Invalid code. Please try again.");
        return;
      }

      router.replace({
        pathname: "/reset-password",
        params: { email: emailNorm, otp: otpNorm },
      });
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-slate-900" edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="items-center py-10 px-6">
          <Image
            source={require("@/assets/alenio-logo-white.png")}
            style={{ width: 200, height: 72 }}
            resizeMode="contain"
          />
          <Text className="text-white/80 text-base mt-2">Turn communication into execution.</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-slate-900 dark:text-white text-2xl font-bold mb-2">Verify reset code</Text>
          <Text className="text-slate-500 dark:text-slate-400 text-sm mb-8">
            Enter the code sent to {emailNorm || "your email"}.
          </Text>

          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Reset code</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white tracking-widest text-center"
              placeholder="••••••"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={10}
              value={otp}
              onChangeText={(t) => {
                setOtp(t.replace(/\D/g, "").slice(0, 10));
                setError(null);
              }}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              testID="reset-code-input"
            />
          </View>

          {error ? (
            <Text className="text-red-500 text-sm mt-2" testID="error-message">{error}</Text>
          ) : null}

          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 items-center mt-4"
            onPress={handleContinue}
            disabled={loading}
            activeOpacity={0.8}
            testID="verify-reset-code-button"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Verify code</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/forgot-password")}
            className="items-center mt-4 py-2"
            testID="back-to-forgot-password-link"
          >
            <Text className="text-indigo-600 text-sm font-medium">Request a new code</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </SafeAreaView>
  );
}
