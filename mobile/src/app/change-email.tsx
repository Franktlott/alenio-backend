import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY, type MeUser } from "@/lib/auth/me-query";
import { refreshMeInAuthCaches } from "@/lib/auth/use-session";
import { colors } from "@/theme";

const BRAND = colors.brand;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangeEmailScreen() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get<MeUser>("/api/me"),
  });
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedEmail = newEmail.trim().toLowerCase();
  const canSend = useMemo(
    () =>
      EMAIL_PATTERN.test(normalizedEmail) &&
      normalizedEmail !== me?.email?.trim().toLowerCase(),
    [me?.email, normalizedEmail],
  );

  const requestCode = async (email = normalizedEmail) => {
    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await api.post("/api/profile/email-change/request", { newEmail: email });
      setPendingEmail(email);
      setOtp("");
      toast({ title: "Verification code sent", preset: "done" });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not send the verification code.",
      );
    } finally {
      setSending(false);
    }
  };

  const confirmChange = async () => {
    const code = otp.replace(/\D/g, "");
    if (code.length < 6) {
      setError("Enter the full verification code.");
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      await api.post("/api/profile/email-change/confirm", {
        newEmail: pendingEmail,
        otp: code,
      });
      await refreshMeInAuthCaches(queryClient);
      toast({ title: "Email updated", preset: "done" });
      router.back();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "That code could not be verified.",
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleClose = () => router.back();
  const onVerifyStep = !!pendingEmail;
  const canConfirm = otp.replace(/\D/g, "").length >= 6 && !verifying;

  return (
    <AlenioBottomSheet
      asScreen
      title="Change email"
      subtitle={
        onVerifyStep
          ? "Enter the code sent to your new address"
          : "Verify your new sign-in address"
      }
      onClose={handleClose}
      showCloseButton
      showScrollIndicator
      bodyHeightRatio={0.62}
      testID="change-email-screen"
      footer={
        onVerifyStep ? (
          <>
            <TouchableOpacity
              testID="change-email-confirm"
              onPress={() => void confirmChange()}
              disabled={!canConfirm}
              style={[
                alenioSheetStyles.primaryButton,
                { backgroundColor: BRAND },
                !canConfirm ? alenioSheetStyles.primaryButtonDisabled : null,
              ]}
              activeOpacity={0.92}
            >
              {verifying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  Verify and update email
                </Text>
              )}
            </TouchableOpacity>
            <View style={styles.secondaryActions}>
              <Pressable
                onPress={() => void requestCode(pendingEmail)}
                disabled={sending}
                hitSlop={8}
              >
                <Text style={styles.textAction}>
                  {sending ? "Sending…" : "Resend code"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPendingEmail("");
                  setOtp("");
                  setError(null);
                }}
                hitSlop={8}
              >
                <Text style={styles.textActionMuted}>Use a different email</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity
              testID="change-email-send-code"
              onPress={() => void requestCode()}
              disabled={!canSend || sending}
              style={[
                alenioSheetStyles.primaryButton,
                { backgroundColor: BRAND },
                !canSend || sending
                  ? alenioSheetStyles.primaryButtonDisabled
                  : null,
              ]}
              activeOpacity={0.92}
            >
              {sending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  Send verification code
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClose}
              style={alenioSheetStyles.cancelButton}
              testID="change-email-cancel"
              activeOpacity={0.8}
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )
      }
    >
      <View style={styles.progressRow}>
        <View style={styles.progressItem}>
          <View style={[styles.progressNumber, styles.progressNumberActive]}>
            <Text style={[styles.progressNumberText, styles.progressNumberTextActive]}>
              1
            </Text>
          </View>
          <Text style={[styles.progressLabel, styles.progressLabelActive]}>
            New email
          </Text>
        </View>
        <View
          style={[
            styles.progressLine,
            onVerifyStep ? styles.progressLineActive : null,
          ]}
        />
        <View style={styles.progressItem}>
          <View
            style={[
              styles.progressNumber,
              onVerifyStep ? styles.progressNumberActive : null,
            ]}
          >
            <Text
              style={[
                styles.progressNumberText,
                onVerifyStep ? styles.progressNumberTextActive : null,
              ]}
            >
              2
            </Text>
          </View>
          <Text
            style={[
              styles.progressLabel,
              onVerifyStep ? styles.progressLabelActive : null,
            ]}
          >
            Verify
          </Text>
        </View>
      </View>

      <AlenioSheetCard tint="purple">
        <View style={alenioSheetStyles.optionRow}>
          <AlenioSheetIcon color={BRAND}>
            <ShieldCheck size={20} color="#FFFFFF" strokeWidth={2.2} />
          </AlenioSheetIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={alenioSheetStyles.optionTitle}>
              Your account stays protected
            </Text>
            <Text style={alenioSheetStyles.optionSubtitle}>
              Your email changes only after you verify the code sent to the new
              address.
            </Text>
          </View>
        </View>
      </AlenioSheetCard>

      {!onVerifyStep ? (
        <View style={styles.block}>
          <Text style={styles.formTitle}>Choose your new email</Text>
          <Text style={styles.formSubtitle}>
            This will become your sign-in and account email.
          </Text>

          <View style={styles.currentEmailCard}>
            <View style={styles.currentEmailIcon}>
              <Mail size={15} color="#64748B" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.currentEmailLabel}>Current sign-in email</Text>
              <Text style={styles.currentEmail} numberOfLines={1}>
                {me?.email ?? "Loading…"}
              </Text>
            </View>
          </View>

          <Text style={alenioSheetStyles.fieldLabel}>New email address</Text>
          <View style={styles.inputWrap}>
            <Mail size={16} color={BRAND} />
            <TextInput
              value={newEmail}
              onChangeText={(value) => {
                setNewEmail(value);
                setError(null);
              }}
              placeholder="name@example.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => canSend && void requestCode()}
              style={styles.input}
              testID="change-email-input"
            />
          </View>
          {error ? (
            <Text style={alenioSheetStyles.errorText}>{error}</Text>
          ) : (
            <Text style={styles.privateNote}>
              We’ll send a one-time code to verify that you own this address.
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.block}>
          <View style={styles.sentIcon}>
            <CheckCircle2 size={22} color="#16A34A" strokeWidth={2.2} />
          </View>
          <Text style={styles.formTitle}>Check your new email</Text>
          <Text style={styles.verifyBody}>
            Enter the code sent to{" "}
            <Text style={styles.verifyEmail}>{pendingEmail}</Text>
          </Text>

          <Text style={alenioSheetStyles.fieldLabel}>Verification code</Text>
          <TextInput
            value={otp}
            onChangeText={(value) => {
              setOtp(value.replace(/\D/g, "").slice(0, 10));
              setError(null);
            }}
            placeholder="••••••"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            maxLength={10}
            style={styles.codeInput}
            testID="change-email-code"
          />
          {error ? (
            <Text style={[alenioSheetStyles.errorText, { marginTop: 8 }]}>
              {error}
            </Text>
          ) : null}
        </View>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  progressItem: {
    width: 72,
    alignItems: "center",
  },
  progressNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  progressNumberActive: {
    borderColor: BRAND,
    backgroundColor: BRAND,
  },
  progressNumberText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
  },
  progressNumberTextActive: { color: "#FFFFFF" },
  progressLabel: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
  },
  progressLabelActive: { color: BRAND },
  progressLine: {
    flex: 1,
    height: 2,
    marginTop: 12,
    borderRadius: 1,
    backgroundColor: "#E2E8F0",
  },
  progressLineActive: { backgroundColor: colors.brandAccent },
  block: {
    marginTop: 2,
  },
  formTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  formSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
  currentEmailCard: {
    marginBottom: 14,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  currentEmailIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  currentEmailLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#94A3B8",
  },
  currentEmail: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  inputWrap: {
    minHeight: 48,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 46,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 0,
  },
  codeInput: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 5,
    textAlign: "center",
    color: "#0F172A",
  },
  privateNote: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    color: "#94A3B8",
  },
  sentIcon: {
    width: 44,
    height: 44,
    marginBottom: 10,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF3",
  },
  verifyBody: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
  verifyEmail: { fontWeight: "700", color: "#0F172A" },
  secondaryActions: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
  },
  textAction: { fontSize: 13, fontWeight: "700", color: BRAND },
  textActionMuted: { fontSize: 13, fontWeight: "600", color: "#64748B" },
});
