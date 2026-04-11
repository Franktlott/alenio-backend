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
import { SESSION_QUERY_KEY, useSession } from "@/lib/auth/use-session";
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
  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user) {
      router.replace("/(app)/team");
    }
  }, [session?.user]);

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
    // verifyEmail only marks email as verified — sign in now
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
    setLoading(false);
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setResent(false);
    await authClient.emailOtp.sendVerificationOtp({
      email: email ?? "",
      type: "email-verification",
    });
    setResending(false);
    setResent(true);
    setOtp("");
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

      <View className="flex-1 items-center justify-center px-8">
        <Text style={{ fontSize: 48 }}>📬</Text>
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mt-4 mb-2 text-center">
          Check your email
        </Text>
        <Text className="text-slate-500 dark:text-slate-400 text-base text-center mb-8">
          We sent a 6-digit code to{"\n"}
          <Text className="font-semibold text-slate-700 dark:text-slate-200">{email}</Text>
        </Text>

        {/* OTP boxes */}
        <Pressable onPress={() => inputRef.current?.focus()} className="w-full mb-6">
          <View className="flex-row justify-center gap-3">
            {digits.map((d, i) => (
              <View
                key={i}
                className={`w-12 h-14 rounded-xl items-center justify-center border-2 ${
                  otp.length === i
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950"
                    : d
                    ? "border-indigo-300 bg-white dark:bg-slate-800"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                }`}
              >
                <Text className="text-2xl font-bold text-slate-900 dark:text-white">{d}</Text>
              </View>
            ))}
          </View>
          <TextInput
            ref={inputRef}
            value={otp}
            onChangeText={(t) => {
              setError(null);
              setOtp(t.replace(/[^0-9]/g, "").slice(0, 6));
            }}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
            testID="otp-input"
          />
        </Pressable>

        {error ? (
          <Text className="text-red-500 text-sm mb-4 text-center" testID="error-message">{error}</Text>
        ) : null}

        {resent ? (
          <Text className="text-green-600 text-sm mb-4 text-center">Code resent! Check your inbox.</Text>
        ) : null}

        <TouchableOpacity
          className="bg-indigo-600 rounded-xl py-4 items-center w-full mb-4"
          onPress={handleVerify}
          disabled={loading || otp.length < 6}
          activeOpacity={0.8}
          testID="verify-button"
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">Verify Email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleResend}
          disabled={resending}
          className="py-2"
          testID="resend-button"
        >
          {resending ? (
            <ActivityIndicator color="#6366F1" size="small" />
          ) : (
            <Text className="text-indigo-600 text-sm font-medium">Didn't get a code? Resend</Text>
          )}
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
