import React, { useEffect, useRef, useState } from "react";
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
  Pressable,
  AppState,
} from "react-native";
import { authClient } from "@/lib/auth/auth-client";
import { consumePendingSignUp, setPendingSignUp } from "@/lib/auth/pending-signup";
import { SESSION_QUERY_KEY } from "@/lib/auth/use-session";
import { useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

export default function SignUp() {
  // Step 1 state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 2 (OTP) state
  const [step, setStep] = useState<1 | 2>(1);
  const [otp, setOtp] = useState("");
  const [otpFocused, setOtpFocused] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [success, setSuccess] = useState(false);
  const otpRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-focus OTP input when returning from email app
  useEffect(() => {
    if (step !== 2) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setTimeout(() => otpRef.current?.focus(), 150);
    });
    return () => sub.remove();
  }, [step]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => router.replace("/(app)/team"), 1800);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const focusOtp = () => setTimeout(() => otpRef.current?.focus(), 50);

  // ── Step 1: create account ────────────────────────────────────────
  const handleSignUp = async () => {
    setError(null);
    if (!name.trim()) { setError("Please enter your name"); return; }
    if (!email.trim()) { setError("Please enter your email address"); return; }
    if (!password) { setError("Please enter a password"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }

    setLoading(true);
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      if (result.error) {
        setError(result.error.message ?? "Failed to create account. Please try again.");
        return;
      }
      await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "email-verification",
      });
      setPendingSignUp(email.trim().toLowerCase(), password);
      setStep(2);
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP ───────────────────────────────────────────
  const handleVerify = async () => {
    if (otp.length < 6) { setError("Please enter the full 6-digit code"); return; }
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.emailOtp.verifyEmail({ email: email.trim().toLowerCase(), otp });
      if (result.error) {
        setError(result.error.message ?? "Invalid code. Please try again.");
        setOtp("");
        return;
      }
      const creds = consumePendingSignUp();
      await queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY });
      const session = queryClient.getQueryData<{ user: any }>(SESSION_QUERY_KEY);
      if (session?.user) { setSuccess(true); return; }
      if (creds) {
        const signInResult = await authClient.signIn.email({ email: creds.email, password: creds.password });
        if (!signInResult.error) {
          await queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY });
          setSuccess(true);
          return;
        }
      }
      router.replace("/sign-in");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setResent(false);
    try {
      await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "email-verification",
      });
      setResent(true);
      setOtp("");
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const digits = otp.split("").concat(Array(6).fill("")).slice(0, 6);

  // ── Success screen ───────────────────────────────────────────────
  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
        <StatusBar style="dark" />
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <Text style={{ fontSize: 48, color: "white", lineHeight: 56 }}>✓</Text>
        </View>
        <Text style={{ fontSize: 24, fontWeight: "800", color: "#0F172A", marginBottom: 8 }}>Email verified!</Text>
        <Text style={{ fontSize: 16, color: "#64748B" }}>Taking you to the app…</Text>
      </View>
    );
  }

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

  // ── Step 2: OTP entry ────────────────────────────────────────────
  if (step === 2) {
    return (
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <StatusBar style="light" />
        {header}
        <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }} onPress={focusOtp}>
          <Text style={{ fontSize: 48 }}>📬</Text>
          <Text className="text-2xl font-bold text-slate-900 mt-4 mb-2 text-center">Check your email</Text>
          <Text className="text-slate-500 text-base text-center mb-8">
            We sent a 6-digit code to{"\n"}
            <Text className="font-semibold text-slate-700">{email.trim().toLowerCase()}</Text>
          </Text>

          <View style={{ width: "100%", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
              {digits.map((d, i) => (
                <View key={i} style={{
                  width: 48, height: 56, borderRadius: 12,
                  alignItems: "center", justifyContent: "center", borderWidth: 2,
                  borderColor: otp.length === i && otpFocused ? "#4361EE" : d ? "#A5B4FC" : otpFocused ? "#E2E8F0" : "#CBD5E1",
                  backgroundColor: otp.length === i && otpFocused ? "#EEF2FF" : "white",
                }}>
                  <Text style={{ fontSize: 24, fontWeight: "700", color: "#0F172A" }}>{d}</Text>
                </View>
              ))}
            </View>
            <TextInput
              ref={otpRef}
              value={otp}
              onChangeText={(t) => { setError(null); setOtp(t.replace(/[^0-9]/g, "").slice(0, 6)); }}
              onFocus={() => setOtpFocused(true)}
              onBlur={() => setOtpFocused(false)}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
              testID="otp-input"
            />
          </View>

          {!otpFocused && otp.length < 6 ? (
            <TouchableOpacity onPress={focusOtp} style={{ marginBottom: 16, paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, backgroundColor: "#EEF2FF" }}>
              <Text style={{ color: "#4361EE", fontSize: 14, fontWeight: "600" }}>Tap here to enter code</Text>
            </TouchableOpacity>
          ) : <View style={{ height: 24 }} />}

          {error ? <Text className="text-red-500 text-sm mb-4 text-center">{error}</Text> : null}
          {resent ? <Text className="text-green-600 text-sm mb-4 text-center">Code resent! Check your inbox.</Text> : null}

          <TouchableOpacity
            style={{ backgroundColor: "#4361EE", borderRadius: 12, paddingVertical: 16, alignItems: "center", width: "100%", marginBottom: 16, opacity: loading || otp.length < 6 ? 0.5 : 1 }}
            onPress={handleVerify}
            disabled={loading || otp.length < 6}
            activeOpacity={0.8}
            testID="verify-button"
          >
            {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>Verify Email</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResend} disabled={resending} className="py-2">
            {resending ? <ActivityIndicator color="#6366F1" size="small" /> : <Text className="text-indigo-600 text-sm font-medium">Didn't get a code? Resend</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setStep(1); setOtp(""); setError(null); }} className="mt-4 py-2">
            <Text className="text-slate-400 text-sm">Back</Text>
          </TouchableOpacity>
        </Pressable>

        <View style={{ alignItems: "center", paddingBottom: 16 }}>
          <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
        </View>
      </View>
    );
  }

  // ── Step 1: sign-up form ─────────────────────────────────────────
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
