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
import { authClient } from "@/lib/auth/auth-client";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

export default function SignIn() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    setError(null);
    const trimmed = phone.trim();
    if (!trimmed) {
      setError("Please enter your phone number");
      return;
    }
    setLoading(true);
    const result = await authClient.phoneNumber.sendOtp({ phoneNumber: trimmed });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Failed to send code. Please try again.");
    } else {
      router.push({ pathname: "/verify-otp", params: { phone: trimmed } });
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
            Enter your phone number
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 text-base mb-8">
            We'll text you a verification code
          </Text>

          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Phone number</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
              placeholder="+1 (555) 000-0000"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              autoComplete="tel"
              value={phone}
              onChangeText={(t) => { setPhone(t); setError(null); }}
              returnKeyType="done"
              onSubmitEditing={handleSendCode}
              testID="phone-input"
            />
          </View>

          {error ? (
            <Text className="text-red-500 text-sm mb-4" testID="error-message">{error}</Text>
          ) : null}

          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 items-center mt-2"
            onPress={handleSendCode}
            disabled={loading}
            activeOpacity={0.8}
            testID="send-code-button"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Send Code</Text>
            )}
          </TouchableOpacity>

          {/* Legal links */}
          <View className="flex-row justify-center flex-wrap mt-8 gap-1">
            <Text className="text-xs text-slate-400">By continuing you agree to our</Text>
            <TouchableOpacity onPress={() => router.push("/terms-of-service")} testID="terms-link">
              <Text className="text-xs text-indigo-500 font-medium">Terms of Service</Text>
            </TouchableOpacity>
            <Text className="text-xs text-slate-400">and</Text>
            <TouchableOpacity onPress={() => router.push("/privacy-policy")} testID="privacy-link">
              <Text className="text-xs text-indigo-500 font-medium">Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </View>
  );
}
