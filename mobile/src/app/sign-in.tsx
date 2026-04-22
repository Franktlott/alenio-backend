import React, { useRef, useState } from "react";
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
} from "react-native";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession } from "@/lib/auth/use-session";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const otpInputRef = useRef<TextInput>(null);
  const invalidateSession = useInvalidateSession();

  const handleSignIn = async () => {
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }
    setLoading(true);
    const result = await authClient.signIn.email({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (result.error) {
      const msg = result.error.message ?? "";
      if (msg.toLowerCase().includes("verify") || msg.toLowerCase().includes("verified")) {
        setSendingCode(true);
        await authClient.emailOtp.sendVerificationOtp({
          email: email.trim().toLowerCase(),
          type: "email-verification",
        });
        setSendingCode(false);
        setVerificationStep(true);
        setTimeout(() => otpInputRef.current?.focus(), 100);
      } else {
        setError(msg || "Invalid email or password. Please try again.");
      }
    } else {
      await invalidateSession();
    }
  };

  const handleVerify = async () => {
    if (otp.length < 6) {
      setError("Please enter the full 6-digit code");
      return;
    }
    setError(null);
    setVerifying(true);
    const result = await authClient.emailOtp.verifyEmail({
      email: email.trim().toLowerCase(),
      otp,
    });
    if (result.error) {
      setVerifying(false);
      setError(result.error.message ?? "Invalid code. Please try again.");
      setOtp("");
      return;
    }
    const signInResult = await authClient.signIn.email({
      email: email.trim().toLowerCase(),
      password,
    });
    setVerifying(false);
    if (signInResult.error) {
      setError(signInResult.error.message ?? "Verified! Please try signing in.");
      setVerificationStep(false);
      return;
    }
    await invalidateSession();
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setResent(false);
    await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: "email-verification",
    });
    setResending(false);
    setResent(true);
    setOtp("");
    setTimeout(() => otpInputRef.current?.focus(), 100);
  };

  const handleBackToLogin = () => {
    setVerificationStep(false);
    setOtp("");
    setError(null);
    setResent(false);
  };

  const digits = otp.split("").concat(Array(6).fill("")).slice(0, 6);

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
          {sendingCode ? (
            <View className="flex-1 items-center justify-center py-16">
              <ActivityIndicator size="large" color="#4361EE" />
              <Text className="text-slate-500 text-base mt-4">Sending verification code…</Text>
            </View>
          ) : verificationStep ? (
            <>
              <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Verify your email
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-base mb-8">
                We sent a 6-digit code to{" "}
                <Text className="font-semibold text-slate-700 dark:text-slate-200">
                  {email.trim().toLowerCase()}
                </Text>
              </Text>

              <Pressable
                onPress={() => otpInputRef.current?.focus()}
                className="w-full mb-6"
                testID="otp-input"
              >
                <View className="flex-row justify-center gap-3">
                  {digits.map((d, i) => (
                    <View
                      key={i}
                      className={`w-12 h-14 rounded-xl items-center justify-center border-2 ${
                        otp.length === i
                          ? "border-indigo-500 bg-indigo-50"
                          : d
                          ? "border-indigo-300 bg-white"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <Text className="text-2xl font-bold text-slate-900">{d}</Text>
                    </View>
                  ))}
                </View>
                <TextInput
                  ref={otpInputRef}
                  value={otp}
                  onChangeText={(t) => {
                    setError(null);
                    setOtp(t.replace(/[^0-9]/g, "").slice(0, 6));
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                />
              </Pressable>

              {error ? (
                <Text className="text-red-500 text-sm mb-4 text-center" testID="error-message">
                  {error}
                </Text>
              ) : null}
              {resent ? (
                <Text className="text-green-600 text-sm mb-4 text-center">
                  Code resent! Check your inbox.
                </Text>
              ) : null}

              <TouchableOpacity
                className="bg-indigo-600 rounded-xl py-4 items-center mb-4"
                onPress={handleVerify}
                disabled={verifying || otp.length < 6}
                activeOpacity={0.8}
                testID="verify-button"
              >
                {verifying ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold text-base">Verify Email</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleResend}
                disabled={resending}
                className="py-2 items-center mb-2"
                testID="resend-button"
              >
                {resending ? (
                  <ActivityIndicator color="#6366F1" size="small" />
                ) : (
                  <Text className="text-indigo-600 text-sm font-medium">
                    Didn't get a code? Resend
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleBackToLogin}
                className="py-2 items-center"
                testID="back-to-login-button"
              >
                <Text className="text-slate-400 text-sm">Back to sign in</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Welcome back
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-base mb-8">
                Sign in to your account
              </Text>

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

              <View className="mb-2">
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</Text>
                <View style={{ position: "relative" }}>
                  <TextInput
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                    style={{ paddingRight: 48 }}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    value={password}
                    onChangeText={(t) => { setPassword(t); setError(null); }}
                    returnKeyType="done"
                    onSubmitEditing={handleSignIn}
                    testID="password-input"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}
                    testID="toggle-password-visibility"
                  >
                    {showPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => router.push("/forgot-password")}
                className="self-end mb-6 py-1"
                testID="forgot-password-link"
              >
                <Text className="text-sm text-indigo-600 font-medium">Forgot password?</Text>
              </TouchableOpacity>

              {error ? (
                <Text className="text-red-500 text-sm mb-4" testID="error-message">{error}</Text>
              ) : null}

              <TouchableOpacity
                className="bg-indigo-600 rounded-xl py-4 items-center"
                onPress={handleSignIn}
                disabled={loading}
                activeOpacity={0.8}
                testID="sign-in-button"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold text-base">Sign In</Text>
                )}
              </TouchableOpacity>

              <View className="flex-row justify-center items-center mt-6">
                <Text className="text-slate-500 text-sm">Don't have an account? </Text>
                <TouchableOpacity onPress={() => router.push("/sign-up")} testID="sign-up-link">
                  <Text className="text-indigo-600 text-sm font-medium">Sign up</Text>
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
            </>
          )}

          <View style={{ alignItems: "center", marginTop: 32, paddingBottom: 8 }}>
            <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
