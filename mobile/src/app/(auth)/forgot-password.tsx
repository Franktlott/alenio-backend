import React, { useState } from "react";
import { TextInput } from "react-native";
import { Mail } from "lucide-react-native";
import { router } from "expo-router";
import { getAuthPasswordFlowClient } from "@/lib/auth/auth-client";
import { formatAuthFlowError } from "@/lib/auth/auth-errors";
import {
  AUTH_ICON_DARK,
  AUTH_INPUT_CLASS_DARK,
  AUTH_PLACEHOLDER_DARK,
  AuthCard,
  AuthField,
  authGoBack,
  AuthHeading,
  AuthMessage,
  AuthPrimaryButton,
  AuthScreen,
  AuthTextLink,
} from "@/components/auth/AuthScreen";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    setLoading(true);
    const emailNorm = email.trim().toLowerCase();
    try {
      console.warn("[alenio-auth] forgot-password send", { emailLen: emailNorm.length });
      const result = await getAuthPasswordFlowClient().forgetPassword.emailOtp({
        email: emailNorm,
      });
      console.warn("[alenio-auth] forgot-password result", {
        hasError: !!result.error,
        errorMsg: result.error?.message ?? null,
      });
      if (!result.error) {
        setSuccess(true);
        router.replace({ pathname: "/verify-reset-code", params: { email: emailNorm } });
      } else {
        setError(result.error.message ?? "Something went wrong. Please try again.");
      }
    } catch (err) {
      console.warn("[alenio-auth] forgot-password threw", err);
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      testID="forgot-password-screen"
      tone="dark"
      onBack={authGoBack}
      wrapContentInCard={false}
    >
      <AuthHeading
        badge="Account recovery"
        title="Reset"
        titleAccent="password"
        subtitle="Enter the email for your Alenio account. We'll send a reset code if that account exists."
      />
      <AuthCard>

          {success ? (
            <AuthMessage tone="success" testID="success-message">
              Check your email for a reset code
            </AuthMessage>
          ) : null}

          <AuthField label="Email address" icon={<Mail size={20} color={AUTH_ICON_DARK} strokeWidth={1.9} />}>
            <TextInput
              className={AUTH_INPUT_CLASS_DARK}
              placeholder="you@example.com"
              placeholderTextColor={AUTH_PLACEHOLDER_DARK}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null); }}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              testID="email-input"
            />
          </AuthField>

          {error ? (
            <AuthMessage tone="error" testID="error-message">{error}</AuthMessage>
          ) : null}

          <AuthPrimaryButton
            label="Send reset code"
            loading={loading}
            onPress={handleSubmit}
            disabled={loading || success}
            testID="submit-button"
          />

          <AuthTextLink
            label="Back to sign in"
            onPress={() => router.push("/sign-in")}
            testID="back-to-sign-in-link"
          />
      </AuthCard>
    </AuthScreen>
  );
}
