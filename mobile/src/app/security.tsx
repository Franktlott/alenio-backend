import React, { useState } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { api, readJsonSafe } from "@/lib/api/api";
import {
  authClient,
  clearAccessToken,
  getAuthHeaders,
} from "@/lib/auth/auth-client";
import {
  clearAllCachesForSignedOutUser,
  clearMobileAuthCaches,
  markSessionSignedOut,
} from "@/lib/auth/use-session";
import { getBackendUrl } from "@/lib/backend-url";
import {
  WORKSPACE_PLAN_TITLE,
  workspacePlanHref,
} from "@/lib/plan-access-copy";
import { useTeamStore } from "@/lib/state/team-store";
import { colors } from "@/theme";

const BRAND = colors.brand;

type DeletionIssue = {
  code: string;
  message: string;
  teamId: string;
  teamName: string;
  blocking: boolean;
};

export default function SecurityScreen() {
  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const [step, setStep] = useState<"home" | "impact" | "verify">("home");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readinessEnabled = step === "impact" || step === "verify";
  const { data: deletionReadiness, isLoading: readinessLoading } = useQuery({
    queryKey: ["deletion-readiness"],
    queryFn: () =>
      api.get<{
        canDelete: boolean;
        issues: DeletionIssue[];
      }>("/api/user/deletion-readiness"),
    enabled: readinessEnabled,
    staleTime: 0,
  });

  const blockers =
    deletionReadiness?.issues.filter((issue) => issue.blocking) ?? [];
  const warnings =
    deletionReadiness?.issues.filter((issue) => !issue.blocking) ?? [];
  const canContinue = deletionReadiness?.canDelete === true;

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${getBackendUrl()}/api/user`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const json = await readJsonSafe<{
        data?: unknown;
        error?: { message?: string };
      }>(res);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Failed to delete account");
      }
      return json?.data;
    },
    onSuccess: async () => {
      markSessionSignedOut();
      clearAccessToken();
      await clearMobileAuthCaches(queryClient);
      await authClient.signOut();
      clearAllCachesForSignedOutUser(queryClient);
      setActiveTeamId(null);
      router.replace("/welcome");
    },
    onError: (err: Error) => {
      setError(
        err.message === "Incorrect password"
          ? "Incorrect password. Please try again."
          : err.message,
      );
      setStep("verify");
    },
  });

  const handleClose = () => {
    if (deleteAccount.isPending) return;
    if (step === "verify") {
      setPassword("");
      setError(null);
      setStep("impact");
      return;
    }
    if (step === "impact") {
      setStep("home");
      return;
    }
    router.back();
  };

  const isBlocked = !readinessLoading && blockers.length > 0;
  const title =
    step === "verify"
      ? "Verify your identity"
      : step === "impact"
        ? isBlocked
          ? "Can’t delete yet"
          : "Delete account"
        : "Security";
  const subtitle =
    step === "verify"
      ? "Enter your password to permanently delete this account"
      : step === "impact"
        ? isBlocked
          ? "Resolve ownership before this account can be deleted"
          : "Removes you from Alenio. Shared workplaces keep their records."
        : "Protect your account and manage sensitive actions";

  return (
    <AlenioBottomSheet
      asScreen
      title={title}
      subtitle={subtitle}
      onClose={handleClose}
      showCloseButton
      showScrollIndicator
      bodyHeightRatio={0.72}
      testID="security-screen"
      footer={
        step === "home" ? (
          <TouchableOpacity
            onPress={() => router.back()}
            style={alenioSheetStyles.cancelButton}
            testID="security-done"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Done</Text>
          </TouchableOpacity>
        ) : step === "impact" && !readinessLoading && canContinue ? (
          <>
            <TouchableOpacity
              onPress={() => setStep("verify")}
              style={[
                alenioSheetStyles.primaryButton,
                { backgroundColor: "#0F172A" },
              ]}
              testID="delete-continue-step1"
            >
              <Text style={alenioSheetStyles.primaryButtonText}>
                Continue to verification
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setStep("home")}
              style={alenioSheetStyles.cancelButton}
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : step === "impact" && !readinessLoading ? (
          <TouchableOpacity
            onPress={() => setStep("home")}
            style={[
              alenioSheetStyles.primaryButton,
              { backgroundColor: "#F1F5F9" },
            ]}
          >
            <Text style={[alenioSheetStyles.primaryButtonText, { color: "#475569" }]}>
              Close
            </Text>
          </TouchableOpacity>
        ) : step === "verify" ? (
          <>
            <TouchableOpacity
              onPress={() => {
                if (!password.trim()) {
                  setError("Enter your password to confirm deletion.");
                  return;
                }
                deleteAccount.mutate();
              }}
              disabled={deleteAccount.isPending || !password.trim()}
              style={[
                alenioSheetStyles.primaryButton,
                { backgroundColor: "#DC2626" },
                !password.trim() || deleteAccount.isPending
                  ? alenioSheetStyles.primaryButtonDisabled
                  : null,
              ]}
              testID="confirm-delete-account"
            >
              {deleteAccount.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  Delete my account
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setPassword("");
                setError(null);
                setStep("impact");
              }}
              disabled={deleteAccount.isPending}
              style={alenioSheetStyles.cancelButton}
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Back</Text>
            </TouchableOpacity>
          </>
        ) : null
      }
    >
      {step === "home" ? (
        <>
          <AlenioSheetCard tint="purple">
            <View style={alenioSheetStyles.optionRow}>
              <AlenioSheetIcon color={BRAND}>
                <ShieldCheck size={20} color="#FFFFFF" strokeWidth={2.2} />
              </AlenioSheetIcon>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={alenioSheetStyles.optionTitle}>Account protection</Text>
                <Text style={alenioSheetStyles.optionSubtitle}>
                  Review sensitive actions that permanently affect your Alenio
                  account.
                </Text>
              </View>
            </View>
          </AlenioSheetCard>

          <View style={styles.list}>
            <Pressable
              onPress={() => setStep("impact")}
              testID="security-delete-account"
            >
              <View style={styles.row}>
                <View style={styles.dangerIcon}>
                  <Trash2 size={15} color="#B94A3F" strokeWidth={2.1} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.dangerTitle}>Delete account</Text>
                  <Text style={styles.detail}>
                    Removes your profile and sign-in. Shared workplaces keep
                    their records.
                  </Text>
                </View>
                <ChevronRight size={16} color="#C0C7D1" strokeWidth={2.2} />
              </View>
            </Pressable>
          </View>
        </>
      ) : null}

      {step === "impact" ? (
        <>
          {readinessLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#64748B" />
              <Text style={styles.loadingText}>
                Checking workspaces and billing…
              </Text>
            </View>
          ) : null}

          {!readinessLoading && isBlocked ? (
            <>
              <AlenioSheetCard tint="danger">
                <View style={alenioSheetStyles.optionRow}>
                  <View style={styles.impactIcon}>
                    <AlertTriangle size={18} color="#DC2626" strokeWidth={2.1} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={alenioSheetStyles.optionTitle}>
                      You can’t delete this account yet
                    </Text>
                    <Text style={alenioSheetStyles.optionSubtitle}>
                      Finish the items below, then try again.
                    </Text>
                  </View>
                </View>
              </AlenioSheetCard>

              <View style={styles.blockerCard}>
                <View style={styles.blockerHeader}>
                  <View style={styles.blockerIcon}>
                    <ShieldAlert size={15} color="#B45309" strokeWidth={2.1} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.blockerTitle}>
                      Workspace ownership required
                    </Text>
                    <Text style={styles.detail}>
                      Complete this before deleting your account.
                    </Text>
                  </View>
                </View>
                {blockers.map((issue) => (
                  <View
                    key={`${issue.code}-${issue.teamId}`}
                    style={styles.blockerIssue}
                  >
                    <Text style={styles.blockerMessage}>{issue.message}</Text>
                    {issue.code === "active_web_billing" ||
                    issue.code === "mobile_store_billing" ? (
                      <TouchableOpacity
                        onPress={() =>
                          router.push(workspacePlanHref(issue.teamId))
                        }
                        style={styles.resolveButton}
                      >
                        <Text style={styles.resolveButtonText}>
                          Open {WORKSPACE_PLAN_TITLE}
                        </Text>
                        <ChevronRight size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    ) : null}
                    {issue.code === "multi_member_owner" ? (
                      <TouchableOpacity
                        onPress={() => router.push("/(app)/team")}
                        style={styles.resolveButton}
                      >
                        <Text style={styles.resolveButtonText}>
                          Resolve in Team
                        </Text>
                        <ChevronRight size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {!readinessLoading && canContinue ? (
            <>
              <AlenioSheetCard tint="danger">
                <View style={alenioSheetStyles.optionRow}>
                  <View style={styles.impactIcon}>
                    <AlertTriangle size={18} color="#DC2626" strokeWidth={2.1} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={alenioSheetStyles.optionTitle}>
                      What gets removed
                    </Text>
                    <Text style={alenioSheetStyles.optionSubtitle}>
                      Your account is deleted. Workplace records can remain for
                      the remaining team.
                    </Text>
                  </View>
                </View>
                <View style={styles.bullets}>
                  {[
                    "Your profile, username, and sign-in are permanently removed",
                    "You're removed from every workspace",
                    "Solo workspaces you alone own are deleted",
                  ].map((item) => (
                    <View key={item} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </AlenioSheetCard>

              <View style={styles.keepCard}>
                <Text style={styles.keepTitle}>What stays</Text>
                <Text style={styles.keepText}>
                  Shared workspaces continue for remaining members. Workplace
                  history may remain where needed for the organization.
                </Text>
              </View>

              {warnings.length > 0 ? (
                <View style={styles.warningCard}>
                  <Text style={styles.warningTitle}>Before you continue</Text>
                  {warnings.map((issue) => (
                    <Text
                      key={`${issue.code}-${issue.teamId}`}
                      style={styles.warningText}
                    >
                      {issue.message}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {step === "verify" ? (
        <>
          <View style={styles.permanentCard}>
            <View style={styles.permanentIcon}>
              <Trash2 size={16} color="#B94A3F" strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.permanentEyebrow}>PERMANENT ACTION</Text>
              <Text style={styles.permanentTitle}>
                Your account cannot be restored
              </Text>
              <Text style={styles.detail}>
                Your profile and sign-in will be permanently removed. Shared
                workplaces keep records needed for the remaining team.
              </Text>
            </View>
          </View>

          <Text style={alenioSheetStyles.fieldLabel}>Account password</Text>
          <View style={styles.passwordRow}>
            <Lock size={15} color="#94A3B8" />
            <TextInput
              value={password}
              onChangeText={(next) => {
                setPassword(next);
                setError(null);
              }}
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              style={styles.passwordInput}
              testID="delete-password-input"
            />
            <Pressable
              onPress={() => setPasswordVisible((v) => !v)}
              hitSlop={8}
            >
              <Text style={styles.showHide}>
                {passwordVisible ? "Hide" : "Show"}
              </Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      ) : null}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  dangerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  dangerTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#B91C1C",
  },
  detail: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: "#94A3B8",
  },
  impactIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  bullets: {
    gap: 5,
    paddingTop: 2,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 5,
    backgroundColor: "#FB7185",
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#334155",
  },
  loadingCard: {
    alignItems: "center",
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748B",
  },
  blockerCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 12,
  },
  blockerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  blockerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  blockerTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  blockerIssue: {
    gap: 10,
  },
  blockerMessage: {
    fontSize: 13,
    lineHeight: 18,
    color: "#475569",
  },
  resolveButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: BRAND,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  resolveButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  warningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 12,
    gap: 6,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  warningText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
  keepCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  keepTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  keepText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  permanentCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FFF8F7",
    borderWidth: 1,
    borderColor: "#F5E4E1",
  },
  permanentIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FCEAE7",
  },
  permanentEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: "#A75A52",
  },
  permanentTitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  passwordRow: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 0,
  },
  showHide: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
  },
});
