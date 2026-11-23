import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
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
import { AppHeaderBand } from "@/components/AppHeaderBand";
import { UserAvatar } from "@/components/UserAvatar";
import {
  AlenioList,
  AlenioListRow,
  AppText,
  Button,
  Card,
  IconTile,
  SectionHeader,
  tintInk,
} from "@/components/ui";
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
import { useDuoSheetTopClearance } from "@/lib/adaptive-layout";
import { palette, tints } from "@/theme";

const BAND_SHEET_RADIUS = 0;
const HEADER_ROW = 48;

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

function overviewIcon(role: TeamRole) {
  if (role === "owner") return Crown;
  if (role === "team_leader") return UserRoundCog;
  return UsersRound;
}

export default function WorkspacePermissionsScreen() {
  const insets = useSafeAreaInsets();
  const duoSheetTop = useDuoSheetTopClearance({ fullScreen: true });
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const { access } = useWorkspaceAccess(teamId);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [selectedRole, setSelectedRole] =
    useState<EditableWorkspaceRole>("member");

  /** On Duo, grow the purple band so the white sheet starts just under the dock. */
  const bandHeight = Math.max(insets.top + HEADER_ROW + 18, duoSheetTop);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, []),
  );

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

  const header = (
    <>
      <AppHeaderBand height={bandHeight} />
      <View style={[styles.bandHeader, { paddingTop: insets.top }]}>
        <Pressable
          onPress={goBack}
          hitSlop={10}
          style={styles.headerAction}
          accessibilityRole="button"
          accessibilityLabel="Back to workspace settings"
          testID="workspace-permissions-back"
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.bandTitle} numberOfLines={1}>
            Roles & permissions
          </Text>
        </View>
        <View style={styles.topActionPlaceholder} />
      </View>
    </>
  );

  if (!teamId) {
    return (
      <View style={styles.screen} testID="workspace-permissions-screen">
        {header}
        <View style={styles.sheet}>
          <View style={styles.centered}>
            <AppText variant="body" color={palette.inkMuted}>
              No workspace selected
            </AppText>
            <Button
              variant="primary"
              size="md"
              label="Go back"
              onPress={goBack}
              style={{ marginTop: 16 }}
              testID="workspace-permissions-missing-back"
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="workspace-permissions-screen">
      {header}
      <View style={styles.sheet}>
        {isLoading ? (
          <View style={styles.centered} testID="workspace-permissions-loading">
            <ActivityIndicator color={palette.violet} />
          </View>
        ) : isError || !team ? (
          <View style={styles.centered} testID="workspace-permissions-error">
            <AppText variant="sectionTitle">Permissions aren’t available</AppText>
            <AppText
              variant="supporting"
              style={{ marginTop: 6, textAlign: "center", maxWidth: 280 }}
            >
              We couldn’t load this workspace. Please try again.
            </AppText>
            <Button
              variant="primary"
              size="md"
              label="Try again"
              onPress={() => void refetch()}
              style={{ marginTop: 16 }}
              testID="workspace-permissions-retry"
            />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, 20) + 16 },
            ]}
            testID="workspace-permissions-content"
          >
            <Card>
              <View style={styles.heroRow}>
                <IconTile tint="lavender" size={44}>
                  <ShieldCheck
                    size={20}
                    color={tintInk("lavender")}
                    strokeWidth={2.2}
                  />
                </IconTile>
                <View style={styles.heroCopy}>
                  <AppText variant="sectionLabel" color={palette.violet}>
                    Access
                  </AppText>
                  <AppText variant="sectionTitle" style={styles.heroTitle}>
                    Clear roles. Confident teams.
                  </AppText>
                  <AppText variant="supporting" style={{ marginTop: 2 }}>
                    Keep responsibilities simple while protecting workspace
                    ownership.
                  </AppText>
                </View>
              </View>
            </Card>

            <View style={styles.sectionBlock}>
              <SectionHeader label="Role overview" />
              <AlenioList>
                {OVERVIEW_ROLES.map((role) => {
                  const presentation = getWorkspaceRolePresentation(role);
                  const Icon = overviewIcon(role);
                  return (
                    <AlenioListRow
                      key={role}
                      leading={
                        <IconTile tint="lavender">
                          <Icon
                            size={16}
                            color={tintInk("lavender")}
                            strokeWidth={2.1}
                          />
                        </IconTile>
                      }
                      title={presentation.label}
                      subtitle={presentation.description}
                    />
                  );
                })}
              </AlenioList>
            </View>

            {isTeamLeader ? (
              <View style={styles.noteCard} testID="permissions-read-only-note">
                <IconTile tint="lavender" size={28}>
                  <ShieldCheck
                    size={14}
                    color={tintInk("lavender")}
                    strokeWidth={2.2}
                  />
                </IconTile>
                <AppText variant="supporting" style={{ flex: 1 }}>
                  Team Leaders can view access. Only the workspace Owner can
                  change roles.
                </AppText>
              </View>
            ) : isOwner && !access.canWrite ? (
              <View style={styles.noteCard} testID="permissions-plan-note">
                <IconTile tint="lavender" size={28}>
                  <ShieldCheck
                    size={14}
                    color={tintInk("lavender")}
                    strokeWidth={2.2}
                  />
                </IconTile>
                <AppText variant="supporting" style={{ flex: 1 }}>
                  This workspace is read-only. Tap a manageable member to choose
                  a plan and restore role changes.
                </AppText>
              </View>
            ) : null}

            <View style={styles.sectionBlock}>
              <SectionHeader
                label="Workspace access"
                action={
                  <AppText variant="meta">
                    {isOwner && access.canWrite ? "Tap to manage" : "View only"}
                  </AppText>
                }
              />
              <AppText variant="supporting" style={styles.memberCount}>
                {members.length} member{members.length === 1 ? "" : "s"}
              </AppText>
              <AlenioList testID="workspace-access-list">
                {members.map((member) => {
                  const presentation = getWorkspaceRolePresentation(member.role);
                  const editable = canEditWorkspacePermissionTarget({
                    viewerRole,
                    targetRole: member.role,
                  });
                  return (
                    <AlenioListRow
                      key={member.id}
                      leading={
                        <UserAvatar
                          user={member.user}
                          size={36}
                          radius={18}
                          backgroundColor={tints.lavender.bg}
                          textColor={tints.lavender.fg}
                          fontSize={14}
                        />
                      }
                      title={member.user.name || "Alenio member"}
                      subtitle={member.user.email}
                      trailing={
                        <View style={styles.memberTrailing}>
                          <View
                            style={[
                              styles.roleBadge,
                              {
                                backgroundColor: presentation.badgeBackground,
                              },
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
                            <ChevronRight
                              size={16}
                              color={palette.inkMuted}
                              strokeWidth={2.2}
                            />
                          ) : null}
                        </View>
                      }
                      onPress={editable ? () => openMember(member) : undefined}
                      accessibilityLabel={
                        editable
                          ? `Manage ${member.user.name || member.user.email}'s role`
                          : undefined
                      }
                      testID={`workspace-permission-member-${member.userId}`}
                    />
                  );
                })}
              </AlenioList>
            </View>
          </ScrollView>
        )}
      </View>

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
          <Button
            variant="primary"
            size="lg"
            fullWidth
            label="Update role"
            loading={roleMutation.isPending}
            disabled={
              !selectedMember ||
              roleMutation.isPending ||
              selectedRole === selectedMember.role
            }
            onPress={() => {
              if (!selectedMember) return;
              roleMutation.mutate({
                userId: selectedMember.userId,
                role: selectedRole,
              });
            }}
            testID="workspace-role-update"
          />
        }
      >
        <AppText variant="supporting" style={{ marginBottom: 10 }}>
          Select the access level, then confirm the change.
        </AppText>
        <AlenioList>
          {EDITABLE_WORKSPACE_ROLES.map((role) => {
            const presentation = getWorkspaceRolePresentation(role);
            const selected = selectedRole === role;
            return (
              <AlenioListRow
                key={role}
                title={presentation.label}
                subtitle={presentation.description}
                onPress={() => setSelectedRole(role)}
                trailing={
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
                }
                accessibilityLabel={presentation.label}
                testID={`workspace-role-option-${role}`}
              />
            );
          })}
        </AlenioList>
      </AlenioBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.page,
  },
  bandHeader: {
    zIndex: 2,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  topActionPlaceholder: {
    width: 34,
    height: 34,
  },
  topTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  bandTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.25,
  },
  sheet: {
    flex: 1,
    marginTop: -8,
    borderTopLeftRadius: BAND_SHEET_RADIUS,
    borderTopRightRadius: BAND_SHEET_RADIUS,
    backgroundColor: palette.page,
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  centered: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    marginTop: 2,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  sectionBlock: {
    gap: 0,
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: "#FFFFFF",
  },
  memberCount: {
    marginTop: -4,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  memberTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  roleBadge: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  roleBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#D8D3E8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  radioSelected: {
    borderColor: palette.violet,
    backgroundColor: palette.violet,
  },
});
