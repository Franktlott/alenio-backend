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
import { authClient, clearAccessToken } from "@/lib/auth/auth-client";
import { setPendingSignUp } from "@/lib/auth/pending-signup";
import { formatAuthFlowError } from "@/lib/auth/auth-errors";
import { markSessionSignedOut } from "@/lib/auth/use-session";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    setError(null);
    if (!name.trim()) { setError("Please enter your name"); return; }
    if (!email.trim()) { setError("Please enter your email address"); return; }
    const emailNorm = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      setError("Please enter a valid email address");
      return;
    }
    if (!password) { setError("Please enter a password"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }

    setLoading(true);
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: emailNorm,
        password,
      });
      if (result.error) {
        setError(result.error.message ?? "Failed to create account. Please try again.");
        return;
      }

      if (!result.data?.user) {
        setError("Account could not be confirmed. Please try signing in.");
        router.replace("/sign-in");
        return;
      }

      const sent = await authClient.emailOtp.sendVerificationOtp({
        email: emailNorm,
        type: "email-verification",
      });
      if (sent.error) {
        setError(
          sent.error.message ??
            "Account created, but we could not send a verification code. Please try signing in and resend the code.",
        );
        router.replace("/sign-in");
        return;
      }
      clearAccessToken();
      markSessionSignedOut(60_000);
      setPendingSignUp(emailNorm, password);
      router.replace({ pathname: "/verify-otp", params: { email: emailNorm } });
    } catch (err) {
      console.warn("[sign-up]", err);
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  const header = (
    <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
      <SafeAreaView edges={["top"]}>
        <View className="items-center py-10 px-6">
          <Image source={require("@/assets/alenio-logo-white.png")} style={{ width: 200, height: 72 }} resizeMode="contain" />
          <Text className="text-white/80 text-base mt-2">Connect. Execute. Celebrate.</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );

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
          <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Create account</Text>
          <Text className="text-slate-500 dark:text-slate-400 text-base mb-8">Join Alenio and get started</Text>

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
            <View style={{ position: "relative" }}>
              <TextInput
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                style={{ paddingRight: 48 }}
                placeholder="••••••••"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                returnKeyType="next"
                testID="password-input"
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }} testID="toggle-password-visibility">
                {showPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-6">
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
                onSubmitEditing={handleSignUp}
                testID="confirm-password-input"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword((v) => !v)} style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }} testID="toggle-confirm-password-visibility">
                {showConfirmPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
              </TouchableOpacity>
            </View>
          </View>

          {error ? <Text className="text-red-500 text-sm mb-4" testID="error-message">{error}</Text> : null}

          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 items-center"
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.8}
            testID="create-account-button"
          >
            {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold text-base">Create Account</Text>}
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

          <View style={{ alignItems: "center", marginTop: 32, paddingBottom: 8 }}>
            <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
