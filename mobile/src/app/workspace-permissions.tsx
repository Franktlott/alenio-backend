import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Crown,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
} from "lucide-react-native";
import { toast } from "burnt";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { api, ApiError } from "@/lib/api/api";
import type { Team, TeamMember, TeamRole } from "@/lib/types";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import {
  EDITABLE_WORKSPACE_ROLES,
  canEditWorkspacePermissionTarget,
  getWorkspaceRolePresentation,
  sortWorkspacePermissionMembers,
  type EditableWorkspaceRole,
} from "@/lib/workspace-permissions";
import { colors } from "@/theme";

const OVERVIEW_ROLES: readonly TeamRole[] = [
  "owner",
  "team_leader",
  "member",
];

function friendlyRoleError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "You don’t have permission to change this role.";
    }
    if (error.status === 404) {
      return "This member is no longer in the workspace.";
    }
    return error.message;
  }
  return "Please check your connection and try again.";
}

export default function WorkspacePermissionsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const { access } = useWorkspaceAccess(teamId);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [selectedRole, setSelectedRole] =
    useState<EditableWorkspaceRole>("member");

  const {
    data: team,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: Boolean(teamId),
  });

  const members = useMemo(
    () => sortWorkspacePermissionMembers(team?.members ?? []),
    [team?.members],
  );
  const viewerRole = team?.role;
  const isOwner = viewerRole === "owner";
  const isTeamLeader = viewerRole === "team_leader";

  const roleMutation = useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: EditableWorkspaceRole;
    }) =>
      api.patch(`/api/teams/${teamId}/members/${userId}/role`, {
        role,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] }),
      ]);
      setSelectedMember(null);
      toast({ title: "Role updated", preset: "done" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Couldn’t update role",
        message: friendlyRoleError(error),
        preset: "error",
      });
    },
  });

  const closeSheet = () => {
    if (!roleMutation.isPending) setSelectedMember(null);
  };

  const openMember = (member: TeamMember) => {
    if (
      !canEditWorkspacePermissionTarget({
        viewerRole,
        targetRole: member.role,
      })
    ) {
      return;
    }
    if (!access.canWrite) {
      toast({
        title: "Workspace is read-only",
        message: "Choose a plan to restore role management.",
        preset: "error",
      });
      router.push({ pathname: "/choose-plan", params: { teamId } });
      return;
    }
    setSelectedRole(
      member.role === "team_leader" ? "team_leader" : "member",
    );
    setSelectedMember(member);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/workspace-settings", params: { teamId } });
  };

  if (!teamId) {
    return (
      <SafeAreaView style={styles.screen} testID="workspace-permissions-screen">
        <View style={styles.centered}>
          <Text style={styles.stateTitle}>No workspace selected</Text>
          <Pressable
            onPress={goBack}
            style={styles.stateButton}
            accessibilityRole="button"
            testID="workspace-permissions-missing-back"
          >
            <Text style={styles.stateButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top"]}
      testID="workspace-permissions-screen"
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={goBack}
          hitSlop={10}
          style={styles.topAction}
          accessibilityRole="button"
          accessibilityLabel="Back to workspace settings"
          testID="workspace-permissions-back"
        >
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.topTitle}>Workspace Permissions</Text>
        <View style={styles.topSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.centered} testID="workspace-permissions-loading">
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : isError || !team ? (
        <View style={styles.centered} testID="workspace-permissions-error">
          <Text style={styles.stateTitle}>Permissions aren’t available</Text>
          <Text style={styles.stateBody}>
            We couldn’t load this workspace. Please try again.
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={styles.stateButton}
            accessibilityRole="button"
            testID="workspace-permissions-retry"
          >
            <Text style={styles.stateButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
          ]}
          testID="workspace-permissions-content"
        >
          <View style={styles.hero}>
            <View style={styles.heroOrbLarge} />
            <View style={styles.heroOrbSmall} />
            <View style={styles.heroIcon}>
              <ShieldCheck size={23} color={colors.brand} strokeWidth={2.2} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroEyebrow}>ALENIO ACCESS</Text>
              <Text style={styles.heroTitle}>Clear roles. Confident teams.</Text>
              <Text style={styles.heroBody}>
                Keep responsibilities simple while protecting workspace
                ownership.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>ROLE OVERVIEW</Text>
          <View style={styles.overviewCard}>
            {OVERVIEW_ROLES.map((role, index) => {
              const presentation = getWorkspaceRolePresentation(role);
              const Icon =
                role === "owner"
                  ? Crown
                  : role === "team_leader"
                    ? UserRoundCog
                    : UsersRound;
              return (
                <View key={role}>
                  {index > 0 ? <View style={styles.overviewDivider} /> : null}
                  <View style={styles.overviewRow}>
                    <View style={styles.overviewIcon}>
                      <Icon size={16} color={colors.brand} strokeWidth={2.1} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.overviewTitle}>
                        {presentation.label}
                      </Text>
                      <Text style={styles.overviewBody}>
                        {presentation.description}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {isTeamLeader ? (
            <View style={styles.readOnlyNote} testID="permissions-read-only-note">
              <ShieldCheck size={16} color="#64748B" />
              <Text style={styles.readOnlyText}>
                Team Leaders can view access. Only the workspace Owner can
                change roles.
              </Text>
            </View>
          ) : isOwner && !access.canWrite ? (
            <View style={styles.readOnlyNote} testID="permissions-plan-note">
              <ShieldCheck size={16} color="#64748B" />
              <Text style={styles.readOnlyText}>
                This workspace is read-only. Tap a manageable member to choose
                a plan and restore role changes.
              </Text>
            </View>
          ) : null}

          <View style={styles.listHeading}>
            <View>
              <Text style={styles.sectionLabelNoMargin}>WORKSPACE ACCESS</Text>
              <Text style={styles.listTitle}>
                {members.length} member{members.length === 1 ? "" : "s"}
              </Text>
            </View>
            {isOwner && access.canWrite ? (
              <Text style={styles.ownerHint}>Tap to manage</Text>
            ) : (
              <Text style={styles.ownerHint}>View only</Text>
            )}
          </View>

          <View style={styles.memberCard} testID="workspace-access-list">
            {members.map((member, index) => {
              const presentation = getWorkspaceRolePresentation(member.role);
              const editable = canEditWorkspacePermissionTarget({
                viewerRole,
                targetRole: member.role,
              });
              return (
                <View key={member.id}>
                  {index > 0 ? <View style={styles.memberDivider} /> : null}
                  <Pressable
                    onPress={() => openMember(member)}
                    disabled={!editable}
                    style={styles.memberRow}
                    accessibilityRole={editable ? "button" : undefined}
                    accessibilityLabel={
                      editable
                        ? `Manage ${member.user.name || member.user.email}'s role`
                        : undefined
                    }
                    accessibilityHint={
                      editable && !access.canWrite
                        ? "Opens plan options"
                        : editable
                          ? "Opens role options"
                          : undefined
                    }
                    testID={`workspace-permission-member-${member.userId}`}
                  >
                    <UserAvatar
                      user={member.user}
                      size={38}
                      radius={19}
                      backgroundColor="#EEF2FF"
                      textColor={colors.brand}
                      fontSize={14}
                    />
                    <View style={styles.memberIdentity}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {member.user.name || "Alenio member"}
                      </Text>
                      <Text style={styles.memberEmail} numberOfLines={1}>
                        {member.user.email}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.roleBadge,
                        { backgroundColor: presentation.badgeBackground },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleBadgeText,
                          { color: presentation.badgeText },
                        ]}
                      >
                        {presentation.shortLabel}
                      </Text>
                    </View>
                    {editable ? (
                      <ChevronRight size={15} color="#A7B0BF" />
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      <AlenioBottomSheet
        visible={selectedMember != null}
        title="Manage role"
        subtitle={
          selectedMember
            ? `${selectedMember.user.name || selectedMember.user.email} · ${team?.name ?? "Workspace"}`
            : undefined
        }
        onClose={closeSheet}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="workspace-role-sheet"
        footer={
          <Pressable
            onPress={() => {
              if (!selectedMember) return;
              roleMutation.mutate({
                userId: selectedMember.userId,
                role: selectedRole,
              });
            }}
            disabled={
              !selectedMember ||
              roleMutation.isPending ||
              selectedRole === selectedMember.role
            }
            style={[
              styles.updateButton,
              !selectedMember ||
              roleMutation.isPending ||
              selectedRole === selectedMember.role
                ? styles.updateButtonDisabled
                : null,
            ]}
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                !selectedMember ||
                roleMutation.isPending ||
                selectedRole === selectedMember.role,
            }}
            testID="workspace-role-update"
          >
            {roleMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.updateButtonText}>Update role</Text>
            )}
          </Pressable>
        }
      >
        <Text style={styles.sheetIntro}>
          Select the access level, then confirm the change.
        </Text>
        {EDITABLE_WORKSPACE_ROLES.map((role) => {
          const presentation = getWorkspaceRolePresentation(role);
          const selected = selectedRole === role;
          return (
            <Pressable
              key={role}
              onPress={() => setSelectedRole(role)}
              style={[
                styles.roleOption,
                selected ? styles.roleOptionSelected : null,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={presentation.label}
              testID={`workspace-role-option-${role}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.roleOptionTitle}>{presentation.label}</Text>
                <Text style={styles.roleOptionBody}>
                  {presentation.description}
                </Text>
              </View>
              <View
                style={[
                  styles.radio,
                  selected ? styles.radioSelected : null,
                ]}
              >
                {selected ? (
                  <Check size={13} color="#FFFFFF" strokeWidth={3} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </AlenioBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topAction: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3E8F2",
    backgroundColor: "#F8FAFF",
  },
  topTitle: {
    maxWidth: "72%",
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  topSpacer: {
    width: 34,
    height: 34,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  centered: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#10213B",
  },
  stateBody: {
    marginTop: 6,
    maxWidth: 280,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    color: "#7B8798",
  },
  stateButton: {
    minHeight: 42,
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  stateButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  hero: {
    position: "relative",
    minHeight: 126,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    overflow: "hidden",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#D7DFFF",
    backgroundColor: "#F2F5FF",
  },
  heroOrbLarge: {
    position: "absolute",
    width: 124,
    height: 124,
    right: -50,
    top: -62,
    borderRadius: 62,
    backgroundColor: "#E2E7FF",
  },
  heroOrbSmall: {
    position: "absolute",
    width: 58,
    height: 58,
    right: 52,
    bottom: -39,
    borderRadius: 29,
    backgroundColor: "#E7EBFF",
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D7DFFF",
    backgroundColor: "#FFFFFF",
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.85,
    color: colors.brand,
  },
  heroTitle: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    color: "#10213B",
    letterSpacing: -0.2,
  },
  heroBody: {
    marginTop: 5,
    fontSize: 10.5,
    lineHeight: 15,
    color: "#718096",
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 3,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.78,
    color: "#8A96A8",
  },
  sectionLabelNoMargin: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.78,
    color: colors.brand,
  },
  overviewCard: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E1E6F0",
    backgroundColor: "#FFFFFF",
  },
  overviewRow: {
    minHeight: 52,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  overviewIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  overviewTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: "#10213B",
  },
  overviewBody: {
    marginTop: 1,
    fontSize: 9.5,
    lineHeight: 12.5,
    color: "#8A96A8",
  },
  overviewDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
    backgroundColor: "#E5E9F1",
  },
  readOnlyNote: {
    minHeight: 50,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  readOnlyText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "500",
    color: "#64748B",
  },
  listHeading: {
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 3,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  listTitle: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#10213B",
  },
  ownerHint: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "#94A3B8",
  },
  memberCard: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E1E6F0",
    backgroundColor: "#FFFFFF",
  },
  memberRow: {
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  memberDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
    backgroundColor: "#E5E9F1",
  },
  memberIdentity: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    color: "#10213B",
  },
  memberEmail: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    color: "#94A3B8",
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
  },
  sheetIntro: {
    marginBottom: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#7B8798",
  },
  roleOption: {
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  roleOptionSelected: {
    borderColor: "#B9C5FF",
    backgroundColor: "#F2F5FF",
  },
  roleOptionTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#10213B",
  },
  roleOptionBody: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#7B8798",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  radioSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  updateButton: {
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  updateButtonDisabled: {
    opacity: 0.45,
  },
  updateButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
