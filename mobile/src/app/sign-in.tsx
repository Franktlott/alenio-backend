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
} from "react-native";
import { router } from "expo-router";
import { authClient } from "@/lib/auth/auth-client";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";

export default function SignIn() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOTP = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
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
      router.push({
        pathname: "/verify-otp",
        params: { email: email.trim().toLowerCase(), name: name.trim() },
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-slate-900" edges={["top"]}>
      <StatusBar style="light" />
      {/* Gradient top area with logo */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="items-center py-10 px-6">
          <View className="bg-white rounded-2xl p-4 mb-4">
            <Image
              source={require("@/assets/alenio-logo.png")}
              style={{ width: 180, height: 65 }}
              resizeMode="contain"
            />
          </View>
          <Text className="text-white/80 text-base mt-2">Team task management</Text>
        </View>
      </LinearGradient>

      {/* Form area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-8">
          {/* Form */}
          <View>
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Your name
            </Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white mb-4"
              placeholder="Jane Smith"
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
              autoComplete="name"
              value={name}
              onChangeText={(t) => { setName(t); setError(null); }}
              returnKeyType="next"
              testID="name-input"
            />

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
              onChangeText={(t) => { setEmail(t); setError(null); }}
              onSubmitEditing={handleSendOTP}
              returnKeyType="send"
              testID="email-input"
            />

            {error ? (
              <Text className="text-red-500 text-sm mt-2">{error}</Text>
            ) : null}

            <TouchableOpacity
              className="bg-indigo-600 rounded-xl py-4 items-center mt-4"
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
