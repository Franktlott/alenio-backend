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
import { authClient } from "@/lib/auth/auth-client";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";

export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    if (!newPassword) {
      setError("Please enter a new password");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("Invalid or missing reset token. Please request a new reset link.");
      return;
    }

    setLoading(true);
    const result = await authClient.resetPassword({
      newPassword,
      token,
    });
    setLoading(false);

    if (result.error) {
      setError(result.error.message ?? "Failed to reset password. The link may have expired.");
    } else {
      setSuccess(true);
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
          <Text className="text-slate-900 dark:text-white text-2xl font-bold mb-2">New password</Text>
          <Text className="text-slate-500 dark:text-slate-400 text-sm mb-8">
            Choose a strong password for your account.
          </Text>

          {success ? (
            <View
              className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-4 mb-6"
              testID="success-message"
            >
              <Text className="text-green-700 dark:text-green-400 text-sm font-medium">
                Password reset! Sign in with your new password.
              </Text>
            </View>
          ) : null}

          {!success ? (
            <>
              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">New password</Text>
                <TextInput
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  autoComplete="new-password"
                  value={newPassword}
                  onChangeText={(t) => { setNewPassword(t); setError(null); }}
                  returnKeyType="next"
                  testID="new-password-input"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Confirm password</Text>
                <TextInput
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  testID="confirm-password-input"
                />
              </View>

              {error ? (
                <Text className="text-red-500 text-sm mt-2" testID="error-message">{error}</Text>
              ) : null}

              <TouchableOpacity
                className="bg-indigo-600 rounded-xl py-4 items-center mt-4"
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.8}
                testID="submit-button"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold text-base">Reset password</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity
            onPress={() => router.push("/sign-in")}
            className="items-center mt-4 py-2"
            testID="go-to-sign-in-link"
          >
            <Text className="text-indigo-600 text-sm font-medium">
              {success ? "Go to sign in" : "Back to sign in"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 142, height: 44 }} resizeMode="contain" />
      </View>
    </SafeAreaView>
  );
}
