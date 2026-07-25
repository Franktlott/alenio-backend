import React, { useState } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken, setAccessTokenFromAuthData } from "@/lib/auth/auth-client";
import { mobileAuthHeaders, sendEmailVerificationOtp, verifyEmailOtp } from "@/lib/auth/auth-api";
import { signInWithEmailPassword } from "@/lib/auth/sign-in-email";
import { formatAuthFlowError } from "@/lib/auth/auth-errors";
import { clearPendingSignUp, getPendingSignUp } from "@/lib/auth/pending-signup";
import { useInvalidateSession } from "@/lib/auth/use-session";
import { completeMobileAuthEntry } from "@/lib/auth/complete-auth-entry";
import { setPendingTeamInviteToken } from "@/lib/auth/pending-team-invite";
import { getBackendUrl } from "@/lib/backend-url";
import { safeFetch } from "@/lib/auth/safe-fetch";
import {
  AUTH_CODE_INPUT_CLASS,
  AuthField,
  AuthHeading,
  AuthMessage,
  AuthPrimaryButton,
  AuthScreen,
  AuthTextLink,
} from "@/components/auth/AuthScreen";

/** Better Auth defaults to 6; some projects use longer OTPs. */
const OTP_MIN_LEN = 6;
const OTP_MAX_LEN = 10;

export default function VerifyOtp() {
  const params = useLocalSearchParams<{ email?: string | string[]; inviteToken?: string | string[] }>();
  const emailRaw = params.email;
  const email = typeof emailRaw === "string" ? emailRaw : emailRaw?.[0] ?? "";
  const inviteToken =
    typeof params.inviteToken === "string" ? params.inviteToken : params.inviteToken?.[0] ?? "";

  const [otp, setOtp] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendHint, setResendHint] = useState<string | null>(null);
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (inviteToken) setPendingTeamInviteToken(inviteToken);
  }, [inviteToken]);

  const handleVerify = async () => {
    setError(null);
    const code = otp.replace(/\D/g, "");
    if (code.length < OTP_MIN_LEN) {
      setError(`Enter the full code from your email (at least ${OTP_MIN_LEN} digits).`);
      return;
    }
    if (code.length > OTP_MAX_LEN) {
      setError("That code looks too long. Use only the numbers from the email.");
      return;
    }
    const emailNorm = email.trim().toLowerCase();
    setLoading(true);
    try {
      try {
        const result = await verifyEmailOtp(emailNorm, code);
        if (result.error) {
          setError(
            typeof result.error.message === "string"
              ? result.error.message
              : "That code did not work. Try again or request a new code.",
          );
          return;
        }
        setAccessTokenFromAuthData(result.data ?? null);
      } catch (e) {
        setError(formatAuthFlowError(e));
        return;
      }

      await invalidateSession();
      const bearer = (await getAccessToken())?.trim() ?? null;
      let sessionUser: unknown = null;
      if (bearer) {
        try {
          const sessionRes = await safeFetch(`${getBackendUrl()}/api/auth/get-session`, {
            method: "GET",
            headers: mobileAuthHeaders({
              Authorization: `Bearer ${bearer}`,
            }),
            credentials: "omit",
          });
          if (sessionRes.ok) {
            const body = (await sessionRes.json()) as { user?: unknown } | null;
            sessionUser = body?.user ?? null;
            setAccessTokenFromAuthData(body);
          }
        } catch {
          /* fall through to pending sign-in */
        }
      }

      if (!sessionUser) {
        const pending = getPendingSignUp();
        if (pending && pending.email === emailNorm) {
          try {
            const si = await signInWithEmailPassword(pending.email, pending.password);
            if (!si.error) {
              clearPendingSignUp();
              const completed = await completeMobileAuthEntry(queryClient, si);
              if (!completed.ok) {
                setError(completed.error);
                return;
              }
              return;
            }
          } catch {
            /* user can sign in manually */
          } finally {
            clearPendingSignUp();
          }
        }
      }

      if (sessionUser) {
        const completed = await completeMobileAuthEntry(queryClient, { data: { user: sessionUser } });
        if (!completed.ok) {
          setError(completed.error);
          router.replace("/sign-in");
          return;
        }
      } else {
        router.replace("/sign-in");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) return;
    setResendHint(null);
    setError(null);
    setResendLoading(true);
    try {
      const sent = await sendEmailVerificationOtp(email.trim().toLowerCase());
      if (sent.error) {
        setError(sent.error.message ?? "Could not resend code.");
      } else {
        setResendHint("We sent a new code to your email.");
      }
    } finally {
      setResendLoading(false);
    }
  };

  if (!email.trim()) {
    return (
      <AuthScreen testID="verify-otp-missing-email">
        <AuthHeading
          title="Email required"
          subtitle="Missing email. Go back to sign in and try again."
        />
        <AuthPrimaryButton
          label="Back to sign in"
          loading={false}
          onPress={() => router.replace("/sign-in")}
          testID="verify-otp-back-sign-in"
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen testID="verify-otp-screen" scrollTestID="verify-otp-scroll">
      <AuthHeading
        title="Verify your email"
        subtitle={
          <>
            We sent a verification code to{" "}
            <Text className="font-semibold text-[#172033]" selectable testID="verify-otp-email-display">
              {email.trim().toLowerCase()}
            </Text>
          </>
        }
      />

          <AuthField label="Verification code">
            <TextInput
              className={AUTH_CODE_INPUT_CLASS}
              placeholder="••••••"
              placeholderTextColor="#98A1B2"
              keyboardType="number-pad"
              maxLength={OTP_MAX_LEN}
              value={otp}
              onChangeText={(t) => {
                setOtp(t.replace(/\D/g, "").slice(0, OTP_MAX_LEN));
                setError(null);
              }}
              returnKeyType="done"
              onSubmitEditing={handleVerify}
              testID="verify-otp-input"
            />
          </AuthField>

          {error ? (
            <AuthMessage tone="error" testID="verify-otp-error">{error}</AuthMessage>
          ) : null}
          {resendHint ? (
            <AuthMessage tone="success" testID="verify-otp-resend-hint">{resendHint}</AuthMessage>
          ) : null}

          <AuthPrimaryButton
            label="Verify and continue"
            loading={loading}
            onPress={handleVerify}
            disabled={loading}
            testID="verify-otp-submit"
          />

          <TouchableOpacity
            className="mt-4 items-center py-3"
            onPress={handleResend}
            disabled={resendLoading}
            testID="verify-otp-resend"
          >
            {resendLoading ? (
              <ActivityIndicator color="#6366F1" />
            ) : (
              <Text className="text-[14px] font-medium text-[#4F35D9]">Resend code</Text>
            )}
          </TouchableOpacity>

          <AuthTextLink
            label="Back to sign in"
            onPress={() => router.replace("/sign-in")}
            testID="verify-otp-cancel"
            className="mt-2"
          />
    </AuthScreen>
  );
}
