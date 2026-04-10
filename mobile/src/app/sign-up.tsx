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
import { router } from "expo-router";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleSignUp = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!password) {
      setError("Please enter a password");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const result = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Failed to create account. Please try again.");
    } else {
      setVerificationSent(true);
    }
  };

  const header = (
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
  );

  if (verificationSent) {
    return (
      <View className="flex-1 bg-white dark:bg-slate-900">
        <StatusBar style="light" />
        {header}
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ fontSize: 48 }}>📬</Text>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white mt-4 mb-2 text-center">
            Check your email
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 text-base text-center mb-4">
            We sent a verification link to{"\n"}
            <Text className="font-semibold text-slate-700 dark:text-slate-200">{email}</Text>
          </Text>
          <Text className="text-slate-400 text-sm text-center mb-8">
            Click the link in the email to verify your account, then come back here to sign in.
          </Text>
          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 items-center w-full"
            onPress={() => router.replace("/sign-in")}
            activeOpacity={0.8}
            testID="go-to-sign-in-button"
          >
            <Text className="text-white font-semibold text-base">Go to Sign In</Text>
          </TouchableOpacity>
        </View>
        <View style={{ alignItems: "center", paddingBottom: 16 }}>
          <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white dark:bg-slate-900">
      <StatusBar style="light" />
      {header}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Create account
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 text-base mb-8">
            Join Alenio and get started
          </Text>

          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Full name</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
              placeholder="Your name"
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
              autoComplete="name"
              value={name}
              onChangeText={(t) => { setName(t); setError(null); }}
              returnKeyType="next"
              testID="name-input"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email address</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
              placeholder="you@example.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null); }}
              returnKeyType="next"
              testID="email-input"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
              placeholder="••••••••"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); }}
              returnKeyType="next"
              testID="password-input"
            />
          </View>

          <View className="mb-6">
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
              onSubmitEditing={handleSignUp}
              testID="confirm-password-input"
            />
          </View>

          {error ? (
            <Text className="text-red-500 text-sm mb-4" testID="error-message">{error}</Text>
          ) : null}

          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 items-center"
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.8}
            testID="create-account-button"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Create Account</Text>
            )}
          </TouchableOpacity>

          <View className="flex-row justify-center items-center mt-6">
            <Text className="text-slate-500 text-sm">Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push("/sign-in")} testID="sign-in-link">
              <Text className="text-indigo-600 text-sm font-medium">Sign in</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-center flex-wrap mt-6 gap-1">
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
