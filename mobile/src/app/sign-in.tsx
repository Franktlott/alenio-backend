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
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import {
  useFonts,
  IBMPlexSans_400Regular,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from "@expo-google-fonts/ibm-plex-sans";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#0A1628",
  card: "#0F2044",
  inputBg: "#162035",
  inputBorder: "rgba(255,255,255,0.10)",
  inputBorderFocused: "#3B82F6",
  inputBorderActive: "#1E3A5F",
  cardBorder: "rgba(255,255,255,0.08)",
  headingText: "#F8FAFC",
  bodyText: "#CBD5E1",
  labelText: "#64748B",
  mutedText: "#94A3B8",
  inputText: "#F1F5F9",
  placeholderText: "#475569",
  accent: "#3B82F6",
  ctaBg: "#2563EB",
  errorText: "#F87171",
  successText: "#34D399",
  white: "#FFFFFF",
  otpActiveBg: "#1E3A5F",
  backLinkText: "#475569",
};

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
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const otpInputRef = useRef<TextInput>(null);
  const invalidateSession = useInvalidateSession();

  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });

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

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo area */}
          <SafeAreaView edges={["top"]}>
            <View style={{ alignItems: "center", marginBottom: 40 }}>
              <Image
                source={require("@/assets/alenio-logo-white.png")}
                style={{ width: 180, height: 64 }}
                resizeMode="contain"
              />
            </View>
          </SafeAreaView>

          {/* Card */}
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: C.cardBorder,
              padding: 24,
            }}
          >
            {sendingCode ? (
              /* ── Sending code state ── */
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={C.accent} />
                <Text
                  style={{
                    fontFamily: "IBMPlexSans_400Regular",
                    color: C.mutedText,
                    fontSize: 15,
                    marginTop: 16,
                  }}
                >
                  Sending verification code…
                </Text>
              </View>
            ) : verificationStep ? (
              /* ── OTP verification view ── */
              <>
                <Text
                  style={{
                    fontFamily: "IBMPlexSans_700Bold",
                    fontSize: 24,
                    color: C.headingText,
                    marginBottom: 8,
                  }}
                >
                  Verify your email
                </Text>
                <Text
                  style={{
                    fontFamily: "IBMPlexSans_400Regular",
                    fontSize: 14,
                    color: C.mutedText,
                    marginBottom: 32,
                    lineHeight: 22,
                  }}
                >
                  We sent a 6-digit code to{" "}
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_600SemiBold",
                      color: C.bodyText,
                    }}
                  >
                    {email.trim().toLowerCase()}
                  </Text>
                </Text>

                {/* OTP digit boxes */}
                <Pressable
                  onPress={() => otpInputRef.current?.focus()}
                  style={{ width: "100%", marginBottom: 24 }}
                  testID="otp-input"
                >
                  <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
                    {digits.map((d, i) => {
                      const isActive = otp.length === i;
                      const isFilled = Boolean(d);
                      return (
                        <View
                          key={i}
                          style={{
                            width: 48,
                            height: 56,
                            backgroundColor: isActive ? C.otpActiveBg : C.inputBg,
                            borderWidth: 1.5,
                            borderColor: isActive
                              ? C.inputBorderFocused
                              : isFilled
                              ? "rgba(255,255,255,0.18)"
                              : "rgba(255,255,255,0.12)",
                            borderRadius: 8,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "IBMPlexSans_700Bold",
                              fontSize: 26,
                              color: C.headingText,
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {d}
                          </Text>
                        </View>
                      );
                    })}
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
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_400Regular",
                      color: C.errorText,
                      fontSize: 13,
                      marginBottom: 16,
                      textAlign: "center",
                    }}
                    testID="error-message"
                  >
                    {error}
                  </Text>
                ) : null}

                {resent ? (
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_400Regular",
                      color: C.successText,
                      fontSize: 13,
                      marginBottom: 16,
                      textAlign: "center",
                    }}
                  >
                    Code resent. Check your inbox.
                  </Text>
                ) : null}

                {/* Verify button */}
                <TouchableOpacity
                  style={{
                    backgroundColor: C.ctaBg,
                    borderRadius: 8,
                    paddingVertical: 16,
                    alignItems: "center",
                    marginBottom: 16,
                    opacity: verifying || otp.length < 6 ? 0.6 : 1,
                  }}
                  onPress={handleVerify}
                  disabled={verifying || otp.length < 6}
                  activeOpacity={0.85}
                  testID="verify-button"
                >
                  {verifying ? (
                    <ActivityIndicator color={C.white} />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "IBMPlexSans_600SemiBold",
                        color: C.white,
                        fontSize: 15,
                      }}
                    >
                      Verify Email
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Resend */}
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={resending}
                  style={{ paddingVertical: 10, alignItems: "center", marginBottom: 4 }}
                  testID="resend-button"
                >
                  {resending ? (
                    <ActivityIndicator color={C.accent} size="small" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "IBMPlexSans_600SemiBold",
                        color: C.accent,
                        fontSize: 14,
                      }}
                    >
                      Didn't get a code? Resend
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Back */}
                <TouchableOpacity
                  onPress={handleBackToLogin}
                  style={{ paddingVertical: 10, alignItems: "center" }}
                  testID="back-to-login-button"
                >
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_400Regular",
                      color: C.backLinkText,
                      fontSize: 14,
                    }}
                  >
                    Back to sign in
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              /* ── Sign in form ── */
              <>
                <Text
                  style={{
                    fontFamily: "IBMPlexSans_700Bold",
                    fontSize: 26,
                    color: C.headingText,
                    marginBottom: 6,
                  }}
                >
                  Welcome back
                </Text>
                <Text
                  style={{
                    fontFamily: "IBMPlexSans_400Regular",
                    fontSize: 15,
                    color: C.bodyText,
                    marginBottom: 32,
                  }}
                >
                  Sign in to your account
                </Text>

                {/* Email field */}
                <View style={{ marginBottom: 20 }}>
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_600SemiBold",
                      fontSize: 11,
                      color: C.labelText,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Email address
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: C.inputBg,
                      borderWidth: 1,
                      borderColor: focusedInput === "email" ? C.inputBorderFocused : C.inputBorder,
                      borderRadius: 8,
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      color: C.inputText,
                      fontSize: 15,
                      fontFamily: "IBMPlexSans_400Regular",
                    }}
                    placeholder="you@company.com"
                    placeholderTextColor={C.placeholderText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    value={email}
                    onChangeText={(t) => { setEmail(t); setError(null); }}
                    onFocus={() => setFocusedInput("email")}
                    onBlur={() => setFocusedInput(null)}
                    returnKeyType="next"
                    testID="email-input"
                  />
                </View>

                {/* Password field */}
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_600SemiBold",
                      fontSize: 11,
                      color: C.labelText,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Password
                  </Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      style={{
                        backgroundColor: C.inputBg,
                        borderWidth: 1,
                        borderColor: focusedInput === "password" ? C.inputBorderFocused : C.inputBorder,
                        borderRadius: 8,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        paddingRight: 48,
                        color: C.inputText,
                        fontSize: 15,
                        fontFamily: "IBMPlexSans_400Regular",
                      }}
                      placeholder="••••••••"
                      placeholderTextColor={C.placeholderText}
                      secureTextEntry={!showPassword}
                      autoComplete="password"
                      value={password}
                      onChangeText={(t) => { setPassword(t); setError(null); }}
                      onFocus={() => setFocusedInput("password")}
                      onBlur={() => setFocusedInput(null)}
                      returnKeyType="done"
                      onSubmitEditing={handleSignIn}
                      testID="password-input"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      style={{
                        position: "absolute",
                        right: 14,
                        top: 0,
                        bottom: 0,
                        justifyContent: "center",
                      }}
                      testID="toggle-password-visibility"
                    >
                      {showPassword
                        ? <EyeOff size={18} color={C.placeholderText} />
                        : <Eye size={18} color={C.placeholderText} />}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Forgot password */}
                <TouchableOpacity
                  onPress={() => router.push("/forgot-password")}
                  style={{ alignSelf: "flex-end", marginBottom: 28, paddingVertical: 4 }}
                  testID="forgot-password-link"
                >
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_600SemiBold",
                      fontSize: 13,
                      color: C.accent,
                    }}
                  >
                    Forgot password?
                  </Text>
                </TouchableOpacity>

                {/* Error */}
                {error ? (
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_400Regular",
                      color: C.errorText,
                      fontSize: 13,
                      marginBottom: 16,
                    }}
                    testID="error-message"
                  >
                    {error}
                  </Text>
                ) : null}

                {/* CTA */}
                <TouchableOpacity
                  style={{
                    backgroundColor: C.ctaBg,
                    borderRadius: 8,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity: loading ? 0.75 : 1,
                  }}
                  onPress={handleSignIn}
                  disabled={loading}
                  activeOpacity={0.85}
                  testID="sign-in-button"
                >
                  {loading ? (
                    <ActivityIndicator color={C.white} />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "IBMPlexSans_600SemiBold",
                        color: C.white,
                        fontSize: 15,
                      }}
                    >
                      Sign In
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Sign up */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    marginTop: 24,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_400Regular",
                      color: C.labelText,
                      fontSize: 14,
                    }}
                  >
                    Don't have an account?{" "}
                  </Text>
                  <TouchableOpacity onPress={() => router.push("/sign-up")} testID="sign-up-link">
                    <Text
                      style={{
                        fontFamily: "IBMPlexSans_600SemiBold",
                        color: C.accent,
                        fontSize: 14,
                      }}
                    >
                      Sign up
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Legal */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    marginTop: 20,
                    gap: 4,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_400Regular",
                      fontSize: 11,
                      color: C.labelText,
                    }}
                  >
                    By continuing you agree to our
                  </Text>
                  <TouchableOpacity onPress={() => router.push("/terms-of-service")} testID="terms-link">
                    <Text
                      style={{
                        fontFamily: "IBMPlexSans_600SemiBold",
                        fontSize: 11,
                        color: C.accent,
                      }}
                    >
                      Terms of Service
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontFamily: "IBMPlexSans_400Regular",
                      fontSize: 11,
                      color: C.labelText,
                    }}
                  >
                    and
                  </Text>
                  <TouchableOpacity onPress={() => router.push("/privacy-policy")} testID="privacy-link">
                    <Text
                      style={{
                        fontFamily: "IBMPlexSans_400Regular",
                        fontSize: 11,
                        color: C.accent,
                      }}
                    >
                      Privacy Policy
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {/* Footer logo */}
          <View style={{ alignItems: "center", marginTop: 36, paddingBottom: 8 }}>
            <Image
              source={require("@/assets/lotttech-logo.png")}
              style={{ width: 185, height: 57, opacity: 0.4 }}
              resizeMode="contain"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
