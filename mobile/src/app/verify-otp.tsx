import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Pressable,
} from "react-native";
import { authClient } from "@/lib/auth/auth-client";
import { SESSION_QUERY_KEY } from "@/lib/auth/use-session";
import { consumePendingSignUp } from "@/lib/auth/pending-signup";
import { useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";

export default function VerifyOtp() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => router.replace("/(app)/team"), 1800);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleVerify = async () => {
    if (otp.length < 6) {
      setError("Please enter the full 6-digit code");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await authClient.emailOtp.verifyEmail({ email: email ?? "", otp });
    if (result.error) {
      setLoading(false);
      setError(result.error.message ?? "Invalid code. Please try again.");
      setOtp("");
      return;
    }
    const creds = consumePendingSignUp();
    if (creds) {
      const signInResult = await authClient.signIn.email({ email: creds.email, password: creds.password });
      if (signInResult.error) {
        setLoading(false);
        setError("Verified! Please sign in to continue.");
        router.replace("/sign-in");
        return;
      }
    }
    await queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY });
    setSuccess(true);
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setResent(false);
    await authClient.emailOtp.sendVerificationOtp({ email: email ?? "", type: "email-verification" });
    setResending(false);
    setResent(true);
    setOtp("");
  };

  const digits = otp.split("").concat(Array(6).fill("")).slice(0, 6);

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

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <StatusBar style="light" />
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <SafeAreaView edges={["top"]}>
          <View className="items-center py-10 px-6">
            <Image source={require("@/assets/alenio-logo-white.png")} style={{ width: 200, height: 72 }} resizeMode="contain" />
            <Text className="text-white/80 text-base mt-2">Connect. Execute. Celebrate.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View className="flex-1 items-center justify-center px-8">
        <Text style={{ fontSize: 48 }}>📬</Text>
        <Text className="text-2xl font-bold text-slate-900 mt-4 mb-2 text-center">Check your email</Text>
        <Text className="text-slate-500 text-base text-center mb-8">
          We sent a 6-digit code to{"\n"}
          <Text className="font-semibold text-slate-700">{email}</Text>
        </Text>

        <Pressable onPress={() => inputRef.current?.focus()} className="w-full mb-6">
          <View className="flex-row justify-center gap-3">
            {digits.map((d, i) => (
              <View
                key={i}
                className={`w-12 h-14 rounded-xl items-center justify-center border-2 ${
                  otp.length === i ? "border-indigo-500 bg-indigo-50" : d ? "border-indigo-300 bg-white" : "border-slate-200 bg-white"
                }`}
              >
                <Text className="text-2xl font-bold text-slate-900">{d}</Text>
              </View>
            ))}
          </View>
          <TextInput
            ref={inputRef}
            value={otp}
            onChangeText={(t) => { setError(null); setOtp(t.replace(/[^0-9]/g, "").slice(0, 6)); }}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
            testID="otp-input"
          />
        </Pressable>

        {error ? <Text className="text-red-500 text-sm mb-4 text-center">{error}</Text> : null}
        {resent ? <Text className="text-green-600 text-sm mb-4 text-center">Code resent! Check your inbox.</Text> : null}

        <TouchableOpacity
          className="bg-indigo-600 rounded-xl py-4 items-center w-full mb-4"
          onPress={handleVerify}
          disabled={loading || otp.length < 6}
          activeOpacity={0.8}
          testID="verify-button"
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold text-base">Verify Email</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleResend} disabled={resending} className="py-2">
          {resending ? <ActivityIndicator color="#6366F1" size="small" /> : <Text className="text-indigo-600 text-sm font-medium">Didn't get a code? Resend</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace("/sign-in")} className="mt-4 py-2">
          <Text className="text-slate-400 text-sm">Back to sign in</Text>
        </TouchableOpacity>
      </View>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </View>
  );
}
