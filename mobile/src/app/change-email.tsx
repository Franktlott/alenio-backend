import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY, type MeUser } from "@/lib/auth/me-query";
import { refreshMeInAuthCaches } from "@/lib/auth/use-session";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangeEmailScreen() {
  const insets = useSafeAreaInsets();
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

  return (
    <SafeAreaView style={styles.screen} edges={[]} testID="change-email-screen">
      <LinearGradient
        colors={["#4638F2", "#7C3AED"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.header, { paddingTop: insets.top }]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.headerAction}
          hitSlop={10}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Change Email</Text>
          <Text style={styles.headerSubtitle}>Verify your new sign-in address</Text>
        </View>
        <View style={styles.headerPlaceholder} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 28 },
          ]}
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
                pendingEmail ? styles.progressLineActive : null,
              ]}
            />
            <View style={styles.progressItem}>
              <View
                style={[
                  styles.progressNumber,
                  pendingEmail ? styles.progressNumberActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.progressNumberText,
                    pendingEmail ? styles.progressNumberTextActive : null,
                  ]}
                >
                  2
                </Text>
              </View>
              <Text
                style={[
                  styles.progressLabel,
                  pendingEmail ? styles.progressLabelActive : null,
                ]}
              >
                Verify
              </Text>
            </View>
          </View>

          <View style={styles.securityCard}>
            <View style={styles.securityIcon}>
              <ShieldCheck size={21} color="#684BFF" strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.securityTitle}>Your account stays protected</Text>
              <Text style={styles.securityBody}>
                Your email changes only after you verify the code sent to the new address.
              </Text>
            </View>
          </View>

          {!pendingEmail ? (
            <View style={styles.card}>
              <Text style={styles.formTitle}>Choose your new email</Text>
              <Text style={styles.formSubtitle}>
                This will become your sign-in and account email.
              </Text>
              <View style={styles.currentEmailCard}>
                <View style={styles.currentEmailIcon}>
                  <Mail size={16} color="#667085" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.currentEmailLabel}>Current sign-in email</Text>
                  <Text style={styles.currentEmail} numberOfLines={1}>
                    {me?.email ?? "Loading…"}
                  </Text>
                </View>
              </View>
              <Text style={styles.fieldLabel}>New email address</Text>
              <View style={styles.inputWrap}>
                <Mail size={17} color="#7C3AED" />
                <TextInput
                  value={newEmail}
                  onChangeText={(value) => {
                    setNewEmail(value);
                    setError(null);
                  }}
                  placeholder="name@example.com"
                  placeholderTextColor="#98A2B3"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={() => canSend && void requestCode()}
                  style={styles.input}
                  testID="change-email-input"
                />
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Pressable
                onPress={() => void requestCode()}
                disabled={!canSend || sending}
                style={[
                  styles.primaryButton,
                  !canSend || sending ? styles.buttonDisabled : null,
                ]}
                testID="change-email-send-code"
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send verification code</Text>
                )}
              </Pressable>
              <Text style={styles.privateNote}>
                We’ll send a one-time code to verify that you own this address.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.sentIcon}>
                <CheckCircle2 size={23} color="#16A34A" strokeWidth={2.2} />
              </View>
              <Text style={styles.verifyTitle}>Check your new email</Text>
              <Text style={styles.verifyBody}>
                Enter the code sent to{" "}
                <Text style={styles.verifyEmail}>{pendingEmail}</Text>
              </Text>
              <Text style={styles.fieldLabel}>Verification code</Text>
              <TextInput
                value={otp}
                onChangeText={(value) => {
                  setOtp(value.replace(/\D/g, "").slice(0, 10));
                  setError(null);
                }}
                placeholder="••••••"
                placeholderTextColor="#98A2B3"
                keyboardType="number-pad"
                maxLength={10}
                style={styles.codeInput}
                testID="change-email-code"
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Pressable
                onPress={() => void confirmChange()}
                disabled={verifying || otp.replace(/\D/g, "").length < 6}
                style={[
                  styles.primaryButton,
                  verifying || otp.replace(/\D/g, "").length < 6
                    ? styles.buttonDisabled
                    : null,
                ]}
                testID="change-email-confirm"
              >
                {verifying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify and update email</Text>
                )}
              </Pressable>
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
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerAction: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 10.5,
    lineHeight: 13,
    color: "rgba(255,255,255,0.76)",
  },
  headerPlaceholder: { width: 34, height: 34 },
  content: { paddingHorizontal: 18, paddingTop: 18, gap: 14 },
  progressRow: {
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  progressItem: {
    width: 62,
    alignItems: "center",
  },
  progressNumber: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D8DDE8",
    backgroundColor: "#FFFFFF",
  },
  progressNumberActive: {
    borderColor: "#6D4AFF",
    backgroundColor: "#6D4AFF",
  },
  progressNumberText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#98A2B3",
  },
  progressNumberTextActive: { color: "#FFFFFF" },
  progressLabel: {
    marginTop: 5,
    fontSize: 9.5,
    fontWeight: "700",
    color: "#98A2B3",
  },
  progressLabelActive: { color: "#5B4FD6" },
  progressLine: {
    flex: 1,
    height: 2,
    marginTop: 12,
    borderRadius: 1,
    backgroundColor: "#E4E7EC",
  },
  progressLineActive: { backgroundColor: "#8B7CF6" },
  securityCard: {
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 14,
    backgroundColor: "#F6F4FF",
  },
  securityIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  securityTitle: { fontSize: 13, fontWeight: "800", color: "#172036" },
  securityBody: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 15,
    color: "#667085",
  },
  card: {
    padding: 17,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E7E5F0",
    backgroundColor: "#FFFFFF",
    shadowColor: "#201A52",
    shadowOpacity: 0.075,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  formTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    color: "#172036",
  },
  formSubtitle: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 16,
    color: "#667085",
  },
  currentEmailCard: {
    marginTop: 16,
    marginBottom: 19,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 13,
    backgroundColor: "#F7F8FB",
  },
  currentEmailIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  currentEmailLabel: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
    color: "#8A94A6",
  },
  currentEmail: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "800",
    color: "#172036",
  },
  fieldLabel: {
    marginBottom: 7,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#53627A",
  },
  inputWrap: {
    height: 48,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCE2EC",
    backgroundColor: "#FFFFFF",
  },
  input: { flex: 1, fontSize: 14, color: "#172036" },
  codeInput: {
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8DFF0",
    backgroundColor: "#FAFBFD",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 5,
    textAlign: "center",
    color: "#172036",
  },
  errorText: {
    marginTop: 9,
    fontSize: 11,
    lineHeight: 15,
    color: "#DC2626",
  },
  primaryButton: {
    minHeight: 46,
    marginTop: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#5B4FD6",
  },
  buttonDisabled: { opacity: 0.42 },
  primaryButtonText: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  privateNote: {
    marginTop: 11,
    paddingHorizontal: 6,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    color: "#8A94A6",
  },
  sentIcon: {
    width: 46,
    height: 46,
    marginBottom: 12,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF3",
  },
  verifyTitle: { fontSize: 18, lineHeight: 22, fontWeight: "800", color: "#172036" },
  verifyBody: {
    marginTop: 5,
    marginBottom: 20,
    fontSize: 12,
    lineHeight: 18,
    color: "#667085",
  },
  verifyEmail: { fontWeight: "800", color: "#344054" },
  secondaryActions: {
    marginTop: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  textAction: { fontSize: 11.5, fontWeight: "700", color: "#5B4FD6" },
  textActionMuted: { fontSize: 11.5, fontWeight: "600", color: "#667085" },
});
