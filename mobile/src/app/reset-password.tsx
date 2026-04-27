import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react-native";
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
import { formatAuthFlowError } from "@/lib/auth/auth-errors";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";

export default function ResetPassword() {
  const { token, email, otp } = useLocalSearchParams<{ token?: string; email?: string; otp?: string }>();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    const emailNorm = (email ?? "").trim().toLowerCase();
    const otpNorm = (otp ?? "").replace(/\D/g, "");

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
    setLoading(true);
    try {
      if (typeof token === "string" && token.trim()) {
        const result = await authClient.resetPassword({
          newPassword,
          token,
        });
        if (result.error) {
          setError(result.error.message ?? "Failed to reset password. The link may have expired.");
        } else {
          setSuccess(true);
        }
        return;
      }

      if (!emailNorm) {
        setError("Missing email. Go back and request a reset code again.");
        return;
      }
      if (otpNorm.length < 6) {
        setError("Enter the 6-digit code from your email.");
        return;
      }

      const otpResult = await authClient.emailOtp.resetPassword({
        email: emailNorm,
        otp: otpNorm,
        password: newPassword,
      });
      if (otpResult.error) {
        setError(otpResult.error.message ?? "Failed to reset password. Check your code and try again.");
      } else {
        setSuccess(true);
      }
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
          <Text className="text-slate-900 dark:text-white text-2xl font-bold mb-2">New password</Text>
          <Text className="text-slate-500 dark:text-slate-400 text-sm mb-8">
            {typeof token === "string" && token.trim()
              ? "Choose a strong password for your account."
              : "Choose a strong password for your account."}
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
              {email ? (
                <Text className="text-xs text-slate-500 dark:text-slate-400 mb-3" testID="reset-password-email">
                  Resetting password for {email}
                </Text>
              ) : null}

              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">New password</Text>
                <View style={{ position: "relative" }}>
                  <TextInput
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                    style={{ paddingRight: 48 }}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showNewPassword}
                    autoComplete="new-password"
                    value={newPassword}
                    onChangeText={(t) => { setNewPassword(t); setError(null); }}
                    returnKeyType="next"
                    testID="new-password-input"
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPassword((v) => !v)}
                    style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}
                    testID="toggle-new-password-visibility"
                  >
                    {showNewPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
                  </TouchableOpacity>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Confirm password</Text>
                <View style={{ position: "relative" }}>
                  <TextInput
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                    style={{ paddingRight: 48 }}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showConfirmPassword}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    testID="confirm-password-input"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword((v) => !v)}
                    style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}
                    testID="toggle-confirm-password-visibility"
                  >
                    {showConfirmPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
                  </TouchableOpacity>
                </View>
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
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </SafeAreaView>
  );
}
