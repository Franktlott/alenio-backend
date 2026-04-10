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
import { router } from "expo-router";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      const baseURL = process.env.EXPO_PUBLIC_BACKEND_URL!;
      const res = await fetch(`${baseURL}/api/auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          redirectTo: "vibecode://reset-password",
        }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        const json = await res.json().catch(() => ({})) as { message?: string };
        setError(json.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
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
          <Text className="text-slate-900 dark:text-white text-2xl font-bold mb-2">Reset password</Text>
          <Text className="text-slate-500 dark:text-slate-400 text-sm mb-8">
            Enter your email and we'll send you a link to reset your password.
          </Text>

          {success ? (
            <View
              className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-4 mb-4"
              testID="success-message"
            >
              <Text className="text-green-700 dark:text-green-400 text-sm font-medium">
                Check your email for a reset link
              </Text>
            </View>
          ) : null}

          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email address</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
              placeholder="you@example.com"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null); }}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              testID="email-input"
            />
          </View>

          {error ? (
            <Text className="text-red-500 text-sm mt-2" testID="error-message">{error}</Text>
          ) : null}

          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 items-center mt-4"
            onPress={handleSubmit}
            disabled={loading || success}
            activeOpacity={0.8}
            testID="submit-button"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Send reset link</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/sign-in")}
            className="items-center mt-4 py-2"
            testID="back-to-sign-in-link"
          >
            <Text className="text-indigo-600 text-sm font-medium">Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </SafeAreaView>
  );
}
