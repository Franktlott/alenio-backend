import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Pressable,
  AppState,
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
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();

  // Re-focus when the app comes back to the foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => router.replace("/(app)/team"), 1800);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const focusInput = () => {
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleVerify = async () => {
    if (otp.length < 6) {
      setError("Please enter the full 6-digit code");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const result = await authClient.emailOtp.verifyEmail({ email: email ?? "", otp });
      if (result.error) {
        setError(result.error.message ?? "Invalid code. Please try again.");
        setOtp("");
        return;
      }

      const creds = consumePendingSignUp();

      await queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY });
      const session = queryClient.getQueryData<{ user: any }>(SESSION_QUERY_KEY);
      if (session?.user) {
        setSuccess(true);
        return;
      }

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
      await authClient.emailOtp.sendVerificationOtp({ email: email ?? "", type: "email-verification" });
      setResent(true);
      setOtp("");
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
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

      <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }} onPress={focusInput}>
        <Text style={{ fontSize: 48 }}>📬</Text>
        <Text className="text-2xl font-bold text-slate-900 mt-4 mb-2 text-center">Check your email</Text>
        <Text className="text-slate-500 text-base text-center mb-8">
          We sent a 6-digit code to{"\n"}
          <Text className="font-semibold text-slate-700">{email}</Text>
        </Text>

        <View style={{ width: "100%", marginBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
            {digits.map((d, i) => (
              <View
                key={i}
                style={{
                  width: 48,
                  height: 56,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: otp.length === i && focused ? "#4361EE" : d ? "#A5B4FC" : focused ? "#E2E8F0" : "#CBD5E1",
                  backgroundColor: otp.length === i && focused ? "#EEF2FF" : "white",
                }}
              >
                <Text style={{ fontSize: 24, fontWeight: "700", color: "#0F172A" }}>{d}</Text>
              </View>
            ))}
          </View>

          <TextInput
            ref={inputRef}
            value={otp}
            onChangeText={(t) => { setError(null); setOtp(t.replace(/[^0-9]/g, "").slice(0, 6)); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
            testID="otp-input"
          />
        </View>

        {!focused && otp.length < 6 ? (
          <TouchableOpacity onPress={focusInput} style={{ marginBottom: 16, paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, backgroundColor: "#EEF2FF" }}>
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

        <TouchableOpacity onPress={() => router.replace("/sign-in")} className="mt-4 py-2">
          <Text className="text-slate-400 text-sm">Back to sign in</Text>
        </TouchableOpacity>
      </Pressable>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </View>
  );
}
