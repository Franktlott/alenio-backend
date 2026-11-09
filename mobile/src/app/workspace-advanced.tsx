import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Crown,
  LogOut,
  ShieldCheck,
  Trash2,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { applyTeamRemovedFromAccount } from "@/lib/workspace-switch";
import { workspaceManagementCapabilities } from "@/lib/workspace-management";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import type { Team, TeamMember } from "@/lib/types";
import { formatTeamRole } from "@/components/WorkspaceTeamUI";
import { UserAvatar } from "@/components/UserAvatar";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { OwnershipTransferSheet } from "@/components/OwnershipTransferSheet";

function AdvancedRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled = false,
  destructive = false,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.row,
        destructive ? styles.destructiveRow : null,
        disabled ? styles.disabled : null,
      ]}
      accessibilityRole="button"
      testID={testID}
    >
      <View style={[styles.rowIcon, destructive ? styles.destructiveIcon : null]}>
        {icon}
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, destructive ? styles.destructiveTitle : null]}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={17} color={destructive ? "#F87171" : "#A1AAB8"} />
    </Pressable>
  );
}

export default function WorkspaceAdvancedScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const setActiveTeamId = useTeamStore((state) => state.setActiveTeamId);
  const teamId =
    (typeof params.teamId === "string" && params.teamId) || activeTeamId || "";
  const { access } = useWorkspaceAccess(teamId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [transferMember, setTransferMember] = useState<TeamMember | null>(null);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: Boolean(session?.user),
  });
  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${encodeURIComponent(teamId)}`),
    enabled: Boolean(teamId),
  });
  const role = (
    team?.role ??
    teams.find((candidate) => candidate.id === teamId)?.role ??
    ""
  ).toLowerCase();
  const capabilities = workspaceManagementCapabilities(role);
  const canDelete = capabilities.canDelete && access.canWrite;
  const canTransfer = canDelete;
  const canLeave = !canDelete;
  const transferCandidates = useMemo(
    () =>
      (team?.members ?? []).filter(
        (member) =>
          member.role !== "owner" && member.userId !== session?.user?.id,
      ),
    [session?.user?.id, team?.members],
  );

  const finishRemoval = async (message: string) => {
    await applyTeamRemovedFromAccount(
      teamId,
      activeTeamId,
      setActiveTeamId,
      queryClient,
    );
    toast({ title: message, preset: "done" });
    router.replace("/(app)/profile");
  };

  const deleteMutation = useMutation({
    mutationFn: (body: { password: string }) =>
      api.delete(`/api/teams/${encodeURIComponent(teamId)}`, body),
    onSuccess: () => finishRemoval("Workspace deleted"),
    onError: (error: Error) =>
      toast({
        title:
          error.message === "Incorrect password"
            ? "Incorrect password. Please try again."
            : "Failed to delete workspace",
        preset: "error",
      }),
  });
  const leaveMutation = useMutation({
    mutationFn: () => api.delete(`/api/teams/${encodeURIComponent(teamId)}/leave`),
    onSuccess: () => finishRemoval("Left workspace"),
    onError: () => toast({ title: "Couldn’t leave workspace", preset: "error" }),
  });

  const confirmLeave = () => {
    Alert.alert(
      "Leave workspace?",
      `You’ll lose access to ${team?.name ?? "this workspace"}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => leaveMutation.mutate(),
        },
      ],
    );
  };

  if (!teamId) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No workspace selected</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={[]} testID="workspace-advanced-screen">
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerAction}
          hitSlop={10}
          accessibilityLabel="Back"
          testID="workspace-advanced-back"
        >
          <ArrowLeft size={20} color="#172033" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Ownership & deletion</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {team?.name ?? "Workspace"}
            {role ? ` · ${formatTeamRole(role)}` : ""}
          </Text>
        </View>
        <View style={styles.headerPlaceholder} />
      </View>

      {isLoading || !team ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#5B45FF" />
        </View>
      ) : deleteOpen ? (
        <ScrollView
          contentContainerStyle={[
            styles.deleteContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.deleteIcon}>
            <Trash2 size={22} color="#DC2626" strokeWidth={2.1} />
          </View>
          <Text style={styles.deleteTitle}>Delete workspace?</Text>
          <Text style={styles.deleteBody}>
            This permanently deletes{" "}
            <Text style={styles.strong}>{team.name}</Text>, including its tasks
            and messages. Members keep their accounts.
          </Text>
          <Text style={styles.fieldLabel}>Your account password</Text>
          <TextInput
            style={styles.input}
            value={deletePassword}
            onChangeText={setDeletePassword}
            placeholder="Enter your password"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            testID="delete-workspace-password-input"
          />
          <Pressable
            onPress={() =>
              deleteMutation.mutate({ password: deletePassword.trim() })
            }
            disabled={
              deleteMutation.isPending || deletePassword.trim().length === 0
            }
            style={[
              styles.deleteButton,
              deletePassword.trim().length === 0 ? styles.deleteButtonDisabled : null,
            ]}
            testID="confirm-delete-workspace"
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.deleteButtonText}>Delete forever</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setDeleteOpen(false);
              setDeletePassword("");
            }}
            style={styles.cancelButton}
            testID="cancel-delete-workspace"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introCard}>
            <View style={styles.introIcon}>
              <ShieldCheck size={20} color="#5B45FF" strokeWidth={2.1} />
            </View>
            <View style={styles.introCopy}>
              <Text style={styles.introTitle}>Advanced workspace controls</Text>
              <Text style={styles.introText}>
                Ownership and access changes can affect every workspace member.
              </Text>
            </View>
          </View>

          {canTransfer ? (
            <>
              <Text style={styles.sectionLabel}>OWNERSHIP</Text>
              <View style={styles.card}>
                <AdvancedRow
                  icon={<Crown size={18} color="#7C3AED" strokeWidth={2} />}
                  title="Transfer ownership"
                  subtitle={
                    transferCandidates.length > 0
                      ? "Choose a member to become the new owner"
                      : "Add another member before transferring ownership"
                  }
                  onPress={() => setMemberPickerOpen(true)}
                  disabled={transferCandidates.length === 0}
                  testID="transfer-workspace-ownership"
                />
              </View>
            </>
          ) : null}

          {canLeave ? (
            <>
              <Text style={styles.sectionLabel}>MEMBERSHIP</Text>
              <View style={styles.card}>
                <AdvancedRow
                  icon={
                    leaveMutation.isPending ? (
                      <ActivityIndicator size="small" color="#64748B" />
                    ) : (
                      <LogOut size={18} color="#64748B" strokeWidth={2} />
                    )
                  }
                  title="Leave workspace"
                  subtitle="Remove your account from this workspace"
                  onPress={confirmLeave}
                  disabled={leaveMutation.isPending}
                  testID="leave-workspace-button"
                />
              </View>
            </>
          ) : null}

          {canDelete ? (
            <>
              <Text style={styles.sectionLabel}>DANGER ZONE</Text>
              <View style={styles.card}>
                <AdvancedRow
                  icon={<Trash2 size={18} color="#EF4444" strokeWidth={2} />}
                  title="Delete workspace"
                  subtitle="Permanently delete this workspace"
                  onPress={() => setDeleteOpen(true)}
                  destructive
                  testID="delete-workspace-button"
                />
              </View>
            </>
          ) : null}
        </ScrollView>
      )}

      <AlenioBottomSheet
        visible={memberPickerOpen}
        title="Choose the new owner"
        subtitle="Select an eligible workspace member"
        onClose={() => setMemberPickerOpen(false)}
        showCloseButton
        compact
        testID="ownership-transfer-member-picker"
      >
        <View style={styles.memberList}>
          {transferCandidates.map((member) => (
            <Pressable
              key={member.userId}
              onPress={() => {
                setMemberPickerOpen(false);
                setTimeout(() => setTransferMember(member), 260);
              }}
              style={styles.memberRow}
              accessibilityRole="button"
            >
              <UserAvatar user={member.user} size={40} radius={20} />
              <View style={styles.memberCopy}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.user.name?.trim() || member.user.email}
                </Text>
                <Text style={styles.memberRole}>{formatTeamRole(member.role)}</Text>
              </View>
              <ChevronRight size={16} color="#A1AAB8" />
            </Pressable>
          ))}
        </View>
      </AlenioBottomSheet>

      <OwnershipTransferSheet
        visible={!!transferMember}
        teamId={teamId}
        member={
          transferMember
            ? {
                userId: transferMember.userId,
                user: {
                  name: transferMember.user.name,
                  email: transferMember.user.email,
                  image: transferMember.user.image ?? null,
                },
              }
            : null
        }
        onClose={() => setTransferMember(null)}
        onStarted={() => {
          void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
          void queryClient.invalidateQueries({ queryKey: ["teams"] });
          toast({ title: "Ownership transfer requested", preset: "done" });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    minHeight: 82,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EDF3",
    backgroundColor: "#FFFFFF",
  },
  headerAction: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#172033",
    letterSpacing: -0.25,
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "600",
    color: "#8A96A8",
  },
  headerPlaceholder: { width: 34, height: 34 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  content: { paddingHorizontal: 16, paddingTop: 18 },
  introCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8E3FF",
    backgroundColor: "#F8F7FF",
  },
  introIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECE9FF",
  },
  introCopy: { flex: 1, minWidth: 0 },
  introTitle: { fontSize: 13, fontWeight: "800", color: "#172033" },
  introText: { marginTop: 3, fontSize: 10.5, lineHeight: 15, color: "#7C8798" },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 9,
    marginLeft: 2,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#718096",
  },
  card: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E1E6F0",
    backgroundColor: "#FFFFFF",
  },
  row: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F1FF",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, lineHeight: 17, fontWeight: "700", color: "#172033" },
  rowSubtitle: { marginTop: 3, fontSize: 10.5, lineHeight: 14, color: "#8A96A8" },
  destructiveRow: { backgroundColor: "#FFFBFB" },
  destructiveIcon: { backgroundColor: "#FFF0F0" },
  destructiveTitle: { color: "#DC2626" },
  disabled: { opacity: 0.45 },
  deleteContent: { paddingHorizontal: 20, paddingTop: 24 },
  deleteIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF1F2",
  },
  deleteTitle: {
    marginTop: 18,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    color: "#0F172A",
  },
  deleteBody: {
    marginTop: 8,
    marginBottom: 22,
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
  },
  strong: { fontWeight: "800", color: "#334155" },
  fieldLabel: { marginBottom: 7, fontSize: 11, fontWeight: "700", color: "#64748B" },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#DDE3EC",
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    color: "#0F172A",
  },
  deleteButton: {
    minHeight: 48,
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#DC2626",
  },
  deleteButtonDisabled: { backgroundColor: "#CBD5E1" },
  deleteButtonText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  cancelButton: {
    minHeight: 46,
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#E9EEF5",
  },
  cancelButtonText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  memberList: { overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0" },
  memberRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E9F1",
  },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 13, fontWeight: "700", color: "#172033" },
  memberRole: { marginTop: 3, fontSize: 10.5, color: "#8A96A8" },
});
