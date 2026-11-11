import React, { useState } from "react";
import { TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { checkForgetPasswordOtp } from "@/lib/auth/auth-api";
import { formatAuthFlowError } from "@/lib/auth/auth-errors";
import {
  AUTH_CODE_INPUT_CLASS_DARK,
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

export default function VerifyResetCode() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailNorm = (email ?? "").trim().toLowerCase();

  const handleContinue = async () => {
    setError(null);
    const otpNorm = otp.replace(/\D/g, "");

    if (!emailNorm) {
      setError("Missing email. Please request a new reset code.");
      return;
    }
    if (otpNorm.length < 6) {
      setError("Enter the code from your email.");
      return;
    }

    setLoading(true);
    try {
      const check = await checkForgetPasswordOtp(emailNorm, otpNorm);
      if (check.error) {
        setError(check.error.message ?? "Invalid code. Please try again.");
        return;
      }

      router.replace({
        pathname: "/reset-password",
        params: { email: emailNorm, otp: otpNorm },
      });
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      testID="verify-reset-code-screen"
      tone="dark"
      onBack={authGoBack}
      wrapContentInCard={false}
    >
      <AuthHeading
        badge="Check your email"
        title="Verify reset"
        titleAccent="code"
        subtitle={`Enter the code sent to ${emailNorm || "your email"}.`}
      />
      <AuthCard>

          <AuthField label="Reset code">
            <TextInput
              className={AUTH_CODE_INPUT_CLASS_DARK}
              placeholder="••••••"
              placeholderTextColor={AUTH_PLACEHOLDER_DARK}
              keyboardType="number-pad"
              maxLength={10}
              value={otp}
              onChangeText={(t) => {
                setOtp(t.replace(/\D/g, "").slice(0, 10));
                setError(null);
              }}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              testID="reset-code-input"
            />
          </AuthField>

          {error ? (
            <AuthMessage tone="error" testID="error-message">{error}</AuthMessage>
          ) : null}

          <AuthPrimaryButton
            label="Verify code"
            loading={loading}
            onPress={handleContinue}
            disabled={loading}
            testID="verify-reset-code-button"
          />

          <AuthTextLink
            label="Request a new code"
            onPress={() => router.push("/forgot-password")}
            testID="back-to-forgot-password-link"
          />
      </AuthCard>
    </AuthScreen>
  );
}
