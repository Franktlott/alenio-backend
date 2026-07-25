import React, { useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { resetPasswordWithOtp, resetPasswordWithToken } from "@/lib/auth/auth-api";
import { formatAuthFlowError } from "@/lib/auth/auth-errors";
import { router, useLocalSearchParams } from "expo-router";
import {
  AUTH_INPUT_CLASS,
  AuthField,
  AuthHeading,
  AuthMessage,
  AuthPrimaryButton,
  AuthScreen,
  AuthTextLink,
} from "@/components/auth/AuthScreen";

export default function ResetPassword() {
  const { token, email, otp } = useLocalSearchParams<{ token?: string; email?: string; otp?: string }>();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    const emailNorm = (email ?? "").trim().toLowerCase();
    const otpNorm = (otp ?? "").replace(/\D/g, "");

    if (!newPassword) {
      setError("Please enter a new password");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      if (typeof token === "string" && token.trim()) {
        const result = await resetPasswordWithToken(newPassword, token);
        if (result.error) {
          setError(result.error.message ?? "Failed to reset password. The link may have expired.");
        } else {
          setSuccess(true);
        }
        return;
      }

      if (!emailNorm) {
        setError("Missing email. Go back and request a reset code again.");
        return;
      }
      if (otpNorm.length < 6) {
        setError("Enter the 6-digit code from your email.");
        return;
      }

      const otpResult = await resetPasswordWithOtp(emailNorm, otpNorm, newPassword);
      if (otpResult.error) {
        setError(otpResult.error.message ?? "Failed to reset password. Check your code and try again.");
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen testID="reset-password-screen">
      <AuthHeading title="New password" subtitle="Choose a strong password for your account." />

          {success ? (
            <AuthMessage tone="success" testID="success-message">
              Password reset! Sign in with your new password.
            </AuthMessage>
          ) : null}

          {!success ? (
            <>
              {email ? (
                <Text className="mb-4 text-xs text-[#687386]" testID="reset-password-email">
                  Resetting password for {email}
                </Text>
              ) : null}

              <AuthField label="New password" icon={<LockKeyhole size={20} color="#593CE6" strokeWidth={1.9} />}>
                <View style={{ position: "relative" }}>
                  <TextInput
                    className={AUTH_INPUT_CLASS}
                    style={{ paddingRight: 48 }}
                    placeholder="••••••••"
                    placeholderTextColor="#172033"
                    secureTextEntry={!showNewPassword}
                    autoComplete="new-password"
                    value={newPassword}
                    onChangeText={(t) => { setNewPassword(t); setError(null); }}
                    returnKeyType="next"
                    testID="new-password-input"
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPassword((v) => !v)}
                    style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}
                    testID="toggle-new-password-visibility"
                  >
                    {showNewPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
                  </TouchableOpacity>
                </View>
              </AuthField>

              <AuthField
                label="Confirm password"
                icon={<LockKeyhole size={20} color="#593CE6" strokeWidth={1.9} />}
                className="mb-6"
              >
                <View style={{ position: "relative" }}>
                  <TextInput
                    className={AUTH_INPUT_CLASS}
                    style={{ paddingRight: 48 }}
                    placeholder="••••••••"
                    placeholderTextColor="#172033"
                    secureTextEntry={!showConfirmPassword}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    testID="confirm-password-input"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword((v) => !v)}
                    style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}
                    testID="toggle-confirm-password-visibility"
                  >
                    {showConfirmPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
                  </TouchableOpacity>
                </View>
              </AuthField>

              {error ? (
                <AuthMessage tone="error" testID="error-message">{error}</AuthMessage>
              ) : null}

              <AuthPrimaryButton
                label="Reset password"
                loading={loading}
                onPress={handleSubmit}
                disabled={loading}
                testID="submit-button"
              />
            </>
          ) : null}

          <AuthTextLink
            label={success ? "Go to sign in" : "Back to sign in"}
            onPress={() => router.push("/sign-in")}
            testID="go-to-sign-in-link"
          />
    </AuthScreen>
  );
}
