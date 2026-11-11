import React, { useCallback, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Crown,
  Layers,
  LogOut,
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
import { AppHeaderBand } from "@/components/AppHeaderBand";
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
import { palette, tints } from "@/theme";

const BAND_SHEET_RADIUS = 24;
const HEADER_ROW = 48;

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
  const bandHeight = insets.top + HEADER_ROW + 18;

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, []),
  );

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

  const goBack = () => {
    if (deleteOpen) {
      setDeleteOpen(false);
      setDeletePassword("");
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/workspace-settings", params: { teamId } });
  };

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
    mutationFn: () =>
      api.delete(`/api/teams/${encodeURIComponent(teamId)}/leave`),
    onSuccess: () => finishRemoval("Left workspace"),
    onError: () =>
      toast({ title: "Couldn’t leave workspace", preset: "error" }),
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

  const header = (
    <>
      <AppHeaderBand height={bandHeight} />
      <View style={[styles.bandHeader, { paddingTop: insets.top }]}>
        <Pressable
          onPress={goBack}
          style={styles.headerAction}
          hitSlop={10}
          accessibilityLabel="Back"
          testID="workspace-advanced-back"
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.bandTitle} numberOfLines={1}>
            {deleteOpen ? "Delete workspace" : "Ownership & deletion"}
          </Text>
          {!deleteOpen && team?.name ? (
            <Text style={styles.bandSubtitle} numberOfLines={1}>
              {team.name}
              {role ? ` · ${formatTeamRole(role)}` : ""}
            </Text>
          ) : null}
        </View>
        <View style={styles.topActionPlaceholder} />
      </View>
    </>
  );

  if (!teamId) {
    return (
      <View style={styles.screen} testID="workspace-advanced-screen">
        {header}
        <View style={styles.sheet}>
          <View style={styles.centered}>
            <AppText variant="body" color={palette.inkMuted}>
              No workspace selected
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="workspace-advanced-screen">
      {header}
      <View style={styles.sheet}>
        {isLoading || !team ? (
          <View style={styles.centered}>
            <ActivityIndicator color={palette.violet} />
          </View>
        ) : deleteOpen ? (
          <ScrollView
            contentContainerStyle={[
              styles.deleteContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 16 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <Card>
              <View style={styles.deleteHero}>
                <View style={styles.deleteIcon}>
                  <Trash2 size={22} color="#DC2626" strokeWidth={2.1} />
                </View>
                <AppText variant="sectionTitle" style={styles.deleteTitle}>
                  Delete workspace?
                </AppText>
                <AppText variant="supporting" style={{ marginTop: 6 }}>
                  This permanently deletes{" "}
                  <Text style={styles.strong}>{team.name}</Text>, including its
                  tasks and messages. Members keep their accounts.
                </AppText>
              </View>
            </Card>

            <View style={styles.sectionBlock}>
              <SectionHeader label="Confirm with password" />
              <Card>
                <AppText variant="sectionLabel" style={{ marginBottom: 6 }}>
                  Your account password
                </AppText>
                <TextInput
                  style={styles.input}
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  placeholder="Enter your password"
                  placeholderTextColor={palette.inkMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="delete-workspace-password-input"
                />
              </Card>
            </View>

            <Button
              variant="destructive"
              size="lg"
              fullWidth
              label="Delete forever"
              loading={deleteMutation.isPending}
              disabled={
                deleteMutation.isPending || deletePassword.trim().length === 0
              }
              onPress={() =>
                deleteMutation.mutate({ password: deletePassword.trim() })
              }
              testID="confirm-delete-workspace"
            />
            <Button
              variant="ghost"
              size="md"
              fullWidth
              label="Cancel"
              onPress={() => {
                setDeleteOpen(false);
                setDeletePassword("");
              }}
              testID="cancel-delete-workspace"
            />
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, 20) + 16 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Card>
              <View style={styles.heroRow}>
                <IconTile tint="lavender" size={44}>
                  <Layers
                    size={20}
                    color={tintInk("lavender")}
                    strokeWidth={2.1}
                  />
                </IconTile>
                <View style={styles.heroCopy}>
                  <AppText variant="sectionLabel" color={palette.violet}>
                    Advanced
                  </AppText>
                  <AppText variant="sectionTitle" style={styles.heroTitle}>
                    Ownership & deletion
                  </AppText>
                  <AppText variant="supporting" style={{ marginTop: 2 }}>
                    Ownership and access changes can affect every workspace
                    member.
                  </AppText>
                </View>
              </View>
            </Card>

            {canTransfer ? (
              <View style={styles.sectionBlock}>
                <SectionHeader label="Ownership" />
                <AlenioList>
                  <AlenioListRow
                    leading={
                      <IconTile tint="lavender">
                        <Crown
                          size={16}
                          color={tintInk("lavender")}
                          strokeWidth={2}
                        />
                      </IconTile>
                    }
                    title="Transfer ownership"
                    subtitle={
                      transferCandidates.length > 0
                        ? "Choose a member to become the new owner"
                        : "Add another member before transferring ownership"
                    }
                    onPress={
                      transferCandidates.length > 0
                        ? () => setMemberPickerOpen(true)
                        : undefined
                    }
                    chevron={transferCandidates.length > 0}
                    style={
                      transferCandidates.length === 0
                        ? styles.rowDisabled
                        : undefined
                    }
                    testID="transfer-workspace-ownership"
                  />
                </AlenioList>
              </View>
            ) : null}

            {canLeave ? (
              <View style={styles.sectionBlock}>
                <SectionHeader label="Membership" />
                <AlenioList>
                  <AlenioListRow
                    leading={
                      <IconTile tint="lavender">
                        {leaveMutation.isPending ? (
                          <ActivityIndicator
                            size="small"
                            color={tintInk("lavender")}
                          />
                        ) : (
                          <LogOut
                            size={16}
                            color={tintInk("lavender")}
                            strokeWidth={2}
                          />
                        )}
                      </IconTile>
                    }
                    title="Leave workspace"
                    subtitle="Remove your account from this workspace"
                    onPress={
                      leaveMutation.isPending ? undefined : confirmLeave
                    }
                    chevron={!leaveMutation.isPending}
                    style={
                      leaveMutation.isPending ? styles.rowDisabled : undefined
                    }
                    testID="leave-workspace-button"
                  />
                </AlenioList>
              </View>
            ) : null}

            {canDelete ? (
              <View style={styles.sectionBlock}>
                <SectionHeader label="Danger zone" />
                <AlenioList>
                  <AlenioListRow
                    leading={
                      <View style={styles.dangerTile}>
                        <Trash2 size={16} color="#DC2626" strokeWidth={2} />
                      </View>
                    }
                    title={
                      <AppText variant="rowTitle" color="#DC2626">
                        Delete workspace
                      </AppText>
                    }
                    subtitle="Permanently delete this workspace"
                    onPress={() => setDeleteOpen(true)}
                    chevron
                    testID="delete-workspace-button"
                  />
                </AlenioList>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>

      <AlenioBottomSheet
        visible={memberPickerOpen}
        title="Choose the new owner"
        subtitle="Select an eligible workspace member"
        onClose={() => setMemberPickerOpen(false)}
        showCloseButton
        compact
        testID="ownership-transfer-member-picker"
      >
        <AlenioList>
          {transferCandidates.map((member) => (
            <AlenioListRow
              key={member.userId}
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
              title={member.user.name?.trim() || member.user.email}
              subtitle={formatTeamRole(member.role)}
              onPress={() => {
                setMemberPickerOpen(false);
                setTimeout(() => setTransferMember(member), 260);
              }}
              chevron
            />
          ))}
        </AlenioList>
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
  bandSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.72)",
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
  deleteContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
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
  rowDisabled: {
    opacity: 0.45,
  },
  dangerTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
  },
  deleteHero: {
    alignItems: "flex-start",
  },
  deleteIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF1F2",
    marginBottom: 12,
  },
  deleteTitle: {
    fontSize: 18,
    lineHeight: 22,
  },
  strong: {
    fontWeight: "800",
    color: palette.ink,
  },
  input: {
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E0EF",
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: palette.ink,
  },
});
