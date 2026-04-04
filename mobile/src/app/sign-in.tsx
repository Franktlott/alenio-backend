import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { authClient } from "@/lib/auth/auth-client";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOTP = async () => {
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: "sign-in",
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Failed to send verification code");
    } else {
      router.push({ pathname: "/verify-otp", params: { email: email.trim().toLowerCase() } });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 justify-center px-6">
          {/* Logo */}
          <View className="items-center mb-12">
            <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-4">
              <Text className="text-white text-2xl font-bold">A</Text>
            </View>
            <Text className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Alenio
            </Text>
            <Text className="text-slate-500 dark:text-slate-400 text-base mt-1">
              Team task management
            </Text>
          </View>

          {/* Form */}
          <View>
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email address
            </Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
              placeholder="you@example.com"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              onSubmitEditing={handleSendOTP}
              returnKeyType="send"
              testID="email-input"
            />

            {error ? (
              <Text className="text-red-500 text-sm mt-2">{error}</Text>
            ) : null}

            <TouchableOpacity
              className="bg-primary rounded-xl py-4 items-center mt-4"
              onPress={handleSendOTP}
              disabled={loading}
              activeOpacity={0.8}
              testID="send-otp-button"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">Continue with email</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text className="text-center text-slate-400 dark:text-slate-500 text-xs mt-8">
            We'll send a 6-digit code to verify your identity
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
