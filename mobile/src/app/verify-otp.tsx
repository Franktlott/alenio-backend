import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { OtpInput } from "react-native-otp-entry";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession } from "@/lib/auth/use-session";
import { SafeAreaView } from "react-native-safe-area-context";

export default function VerifyOTP() {
  const { email, name } = useLocalSearchParams<{ email: string; name?: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidateSession = useInvalidateSession();

  const handleVerifyOTP = async (otp: string) => {
    setLoading(true);
    setError(null);
    const result = await authClient.signIn.emailOtp({
      email: email.trim(),
      otp,
    });
    if (result.error) {
      setLoading(false);
      setError(result.error.message ?? "Invalid verification code. Please try again.");
      return;
    }
    // Set name if this is a new user (no name set yet) and a name was provided
    const currentName = result.data?.user?.name;
    const needsName = !currentName || currentName === email.trim();
    if (name?.trim() && needsName) {
      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;
      await fetch(`${baseUrl}/api/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim() }),
      });
    }
    await invalidateSession();
    // Stack.Protected handles navigation automatically
  };

  const handleResend = async () => {
    await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "sign-in",
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
      <View className="flex-1 justify-center px-6">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mb-8"
          testID="back-button"
        >
          <Text className="text-primary text-base">← Back</Text>
        </TouchableOpacity>

        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Check your email
        </Text>
        <Text className="text-slate-500 dark:text-slate-400 text-base mb-8">
          We sent a 6-digit code to{"\n"}
          <Text className="font-semibold text-slate-700 dark:text-slate-300">{email}</Text>
        </Text>

        {loading ? (
          <View className="items-center mb-4">
            <ActivityIndicator color="#0F766E" testID="loading-indicator" />
          </View>
        ) : null}

        <View testID="otp-input">
          <OtpInput
            numberOfDigits={6}
            onFilled={handleVerifyOTP}
            type="numeric"
            focusColor="#0F766E"
            theme={{
              containerStyle: { justifyContent: "center" },
              inputsContainerStyle: { gap: 8 },
              pinCodeContainerStyle: {
                backgroundColor: "white",
                borderColor: "#E2E8F0",
                borderRadius: 12,
                width: 48,
                height: 56,
              },
              pinCodeTextStyle: { fontSize: 22, fontWeight: "600", color: "#0F172A" },
              focusedPinCodeContainerStyle: { borderColor: "#0F766E", borderWidth: 2 },
            }}
          />
        </View>

        {error ? (
          <Text className="text-red-500 text-sm text-center mt-4">{error}</Text>
        ) : null}

        <TouchableOpacity
          onPress={handleResend}
          className="mt-6 items-center"
          testID="resend-button"
        >
          <Text className="text-slate-500 text-sm">
            Didn't receive a code?{" "}
            <Text className="text-primary font-semibold">Resend</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
