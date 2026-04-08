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
import { useInvalidateSession } from "@/lib/auth/use-session";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

export default function SignIn() {
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidateSession = useInvalidateSession();

  const handleSubmit = async () => {
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }

    if (isNew) {
      if (!name.trim()) {
        setError("Please enter your name");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }

      setLoading(true);
      const result = await authClient.signUp.email({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
      });
      setLoading(false);

      if (result.error) {
        setError(result.error.message ?? "Sign up failed. Please try again.");
      } else {
        await invalidateSession();
      }
    } else {
      setLoading(true);
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });
      setLoading(false);

      if (result.error) {
        setError(result.error.message ?? "Sign in failed. Please check your credentials.");
      } else {
        await invalidateSession();
      }
    }
  };

  const switchMode = (newMode: boolean) => {
    setIsNew(newMode);
    setError(null);
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
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
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Mode toggle */}
          <View className="flex-row bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-6">
            <TouchableOpacity
              onPress={() => switchMode(false)}
              className="flex-1 py-2.5 rounded-lg items-center"
              style={{ backgroundColor: !isNew ? "#4361EE" : "transparent" }}
              testID="sign-in-tab"
            >
              <Text className="text-sm font-semibold" style={{ color: !isNew ? "white" : "#94A3B8" }}>
                Sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => switchMode(true)}
              className="flex-1 py-2.5 rounded-lg items-center"
              style={{ backgroundColor: isNew ? "#4361EE" : "transparent" }}
              testID="new-here-tab"
            >
              <Text className="text-sm font-semibold" style={{ color: isNew ? "white" : "#94A3B8" }}>
                Join
              </Text>
            </TouchableOpacity>
          </View>

          {/* Name field — only for sign up */}
          {isNew ? (
            <View className="mb-4">
              <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Full name</Text>
              <TextInput
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                placeholder="Jane Smith"
                placeholderTextColor="#94A3B8"
                autoCapitalize="words"
                autoComplete="name"
                value={name}
                onChangeText={(t) => { setName(t); setError(null); }}
                returnKeyType="next"
                testID="name-input"
              />
            </View>
          ) : null}

          {/* Email field */}
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
              returnKeyType="next"
              testID="email-input"
            />
          </View>

          {/* Password field */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
              placeholder="••••••••"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              autoComplete={isNew ? "new-password" : "current-password"}
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); }}
              returnKeyType={isNew ? "next" : "done"}
              onSubmitEditing={isNew ? undefined : handleSubmit}
              testID="password-input"
            />
          </View>

          {/* Confirm password — only for sign up */}
          {isNew ? (
            <View className="mb-2">
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
          ) : null}

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
              <Text className="text-white font-semibold text-base">
                {isNew ? "Create account" : "Sign in"}
              </Text>
            )}
          </TouchableOpacity>

          {!isNew ? (
            <TouchableOpacity
              onPress={() => router.push("/forgot-password")}
              className="items-center mt-4 py-2"
              testID="forgot-password-link"
            >
              <Text className="text-indigo-600 text-sm font-medium">Forgot password?</Text>
            </TouchableOpacity>
          ) : null}

          {/* Legal links */}
          <View className="flex-row justify-center flex-wrap mt-6 mb-2 gap-1">
            <Text className="text-xs text-slate-400">By continuing you agree to our</Text>
            <TouchableOpacity onPress={() => router.push("/terms-of-service")} testID="terms-link">
              <Text className="text-xs text-indigo-500 font-medium">Terms of Service</Text>
            </TouchableOpacity>
            <Text className="text-xs text-slate-400">and</Text>
            <TouchableOpacity onPress={() => router.push("/privacy-policy")} testID="privacy-link">
              <Text className="text-xs text-indigo-500 font-medium">Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </View>
  );
}
