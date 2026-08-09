import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  FileText,
  LogOut,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { applyTeamRemovedFromAccount } from "@/lib/workspace-switch";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import type { Team } from "@/lib/types";
import {
  WorkspaceTeamAvatar,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import { UserAvatar } from "@/components/UserAvatar";
import { WorkplaceStandardsSheet } from "@/components/WorkplaceStandardsSheet";
import {
  mergeWorkplaceStandards,
  type WorkplaceStandards,
} from "@/lib/workplace-standards";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { colors } from "@/theme";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { workspaceManagementCapabilities } from "@/lib/workspace-management";

type JoinRequestItem = {
  id: string;
  status: string;
  user: { id: string; name: string; email: string; image: string | null };
};

function ManagementRow({
  icon,
  title,
  subtitle,
  onPress,
  testID,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.menuRow,
        disabled ? styles.menuRowDisabled : null,
      ]}
      accessibilityRole="button"
      testID={testID}
    >
      <View style={styles.menuIcon}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={16} color="#B5BECA" />
    </Pressable>
  );
}

export default function WorkspaceSettingsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const setActiveTeamId = useTeamStore((state) => state.setActiveTeamId);
  const { switchWorkspace } = useSwitchWorkspace();

  const teamId =
    (typeof params.teamId === "string" && params.teamId) || activeTeamId || "";
  const { access } = useWorkspaceAccess(teamId);

  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [standardsOpen, setStandardsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: Boolean(session?.user),
  });

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: Boolean(teamId),
  });

  const role = (
    team?.role ??
    teams.find((candidate) => candidate.id === teamId)?.role ??
    ""
  ).toLowerCase();
  const capabilities = workspaceManagementCapabilities(role);
  const isOwner = capabilities.canDelete;
  const isLeader = capabilities.canManageMembers;
  const canManage = isLeader && access.canWrite;
  const isCurrent = teamId === activeTeamId;
  const memberCount = team?._count?.members ?? team?.members?.length;

  const { data: teamStandards } = useQuery({
    queryKey: ["team", teamId, "workplaceStandards"],
    queryFn: async () => {
      const row = await api.get<Team & { workplaceStandards?: WorkplaceStandards }>(
        `/api/teams/${teamId}`,
      );
      return mergeWorkplaceStandards(row.workplaceStandards);
    },
    enabled: Boolean(teamId && isOwner),
  });

  const { data: joinRequests = [] } = useQuery({
    queryKey: ["join-requests", teamId],
    queryFn: () =>
      api.get<JoinRequestItem[]>(`/api/teams/${teamId}/join-requests`),
    enabled: Boolean(teamId && canManage),
  });

  useEffect(() => {
    if (!team) return;
    setName(team.name);
    setImage(team.image ?? null);
    setEditingDetails(false);
    setConfirmingDelete(false);
    setDeletePassword("");
  }, [team]);

  const dirty = useMemo(() => {
    if (!team) return false;
    return (
      name.trim() !== team.name || (image ?? null) !== (team.image ?? null)
    );
  }, [team, name, image]);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; image: string | null }) =>
      api.patch<Team>(`/api/teams/${teamId}`, data),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      void queryClient.invalidateQueries({ queryKey: ["team", updated.id] });
      setEditingDetails(false);
      toast({ title: "Workspace updated", preset: "done" });
    },
    onError: () =>
      toast({ title: "Failed to update workspace", preset: "error" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (body: { password: string }) =>
      api.delete(`/api/teams/${teamId}`, body),
    onSuccess: async () => {
      await applyTeamRemovedFromAccount(
        teamId,
        activeTeamId,
        setActiveTeamId,
        queryClient,
      );
      toast({ title: "Workspace deleted", preset: "done" });
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/profile");
    },
    onError: (error: Error) => {
      toast({
        title:
          error.message === "Incorrect password"
            ? "Incorrect password. Please try again."
            : "Failed to delete workspace",
        preset: "error",
      });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => api.delete(`/api/teams/${teamId}/leave`),
    onSuccess: async () => {
      await applyTeamRemovedFromAccount(
        teamId,
        activeTeamId,
        setActiveTeamId,
        queryClient,
      );
      toast({ title: "Left workspace", preset: "done" });
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/profile");
    },
    onError: () =>
      toast({ title: "Couldn’t leave workspace", preset: "error" }),
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/approve`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["join-requests", teamId],
      });
      void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      toast({ title: "Request approved", preset: "done" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/reject`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["join-requests", teamId],
      });
      toast({ title: "Request declined", preset: "done" });
    },
  });

  const pickPhoto = async () => {
    if (!canManage || !teamId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingImage(true);
    try {
      const uploaded = await uploadFile(
        result.assets[0].uri,
        "team-photo.jpg",
        "image/jpeg",
        { purpose: "team", teamId },
      );
      setImage(uploaded.url);
    } catch (error) {
      toast({
        title: "Failed to upload photo",
        message: error instanceof Error ? error.message : "Upload failed",
        preset: "error",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const saveDetails = () => {
    if (!canManage || !name.trim()) return;
    updateMutation.mutate({ name: name.trim(), image });
  };

  if (!teamId) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No workspace selected</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top"]}
      testID="workspace-settings-screen"
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/manage-workspaces")
          }
          hitSlop={10}
          style={styles.topAction}
          testID="workspace-settings-back"
        >
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {team?.name ?? "Workspace"}
        </Text>
        {canManage && !confirmingDelete ? (
          <Pressable
            onPress={() => setEditingDetails(true)}
            hitSlop={10}
            style={styles.editAction}
            testID="workspace-settings-edit"
          >
            <Text style={styles.editActionText}>Edit</Text>
          </Pressable>
        ) : (
          <View style={styles.topAction} />
        )}
      </View>

      {isLoading || !team ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : confirmingDelete ? (
        <ScrollView
          contentContainerStyle={[
            styles.deleteContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.deleteTitle}>Delete workspace?</Text>
          <Text style={styles.deleteBody}>
            This permanently deletes{" "}
            <Text style={{ fontWeight: "700" }}>{team.name}</Text>, including
            its tasks and messages. Members keep their accounts.
          </Text>
          <Text style={styles.fieldLabel}>Your account password</Text>
          <TextInput
            style={styles.input}
            value={deletePassword}
            onChangeText={setDeletePassword}
            placeholder="Password"
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
              styles.primaryButton,
              {
                marginTop: 16,
                backgroundColor:
                  deletePassword.trim().length > 0 ? "#EF4444" : "#CBD5E1",
              },
            ]}
            testID="confirm-delete-workspace"
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Delete forever</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setConfirmingDelete(false);
              setDeletePassword("");
            }}
            style={styles.secondaryButton}
            testID="cancel-delete-workspace"
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <SafeKeyboardAvoidingView style={{ flex: 1 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + 32 },
            ]}
          >
            <View style={styles.identityCard}>
              <WorkspaceTeamAvatar team={team} size={62} radius={15} />
              <View style={styles.identityText}>
                <Text style={styles.workspaceName}>{team.name}</Text>
                <Text style={styles.workspaceMeta}>
                  {formatTeamRole(team.role)}
                  {memberCount != null
                    ? `\n${memberCount} Member${memberCount === 1 ? "" : "s"}`
                    : ""}
                </Text>
              </View>
              {!isCurrent ? (
                <Pressable
                  onPress={() => void switchWorkspace(teamId)}
                  style={styles.useButton}
                  testID="workspace-settings-make-current"
                >
                  <Text style={styles.useButtonText}>Use</Text>
                </Pressable>
              ) : (
                <View style={styles.currentBadge}>
                  <Check size={11} color={colors.brand} strokeWidth={2.7} />
                  <Text style={styles.currentBadgeText}>Current</Text>
                </View>
              )}
            </View>

            {editingDetails ? (
              <View style={styles.editCard}>
                <Text style={styles.sectionLabel}>WORKSPACE DETAILS</Text>
                <View style={styles.editPhotoRow}>
                  <Pressable
                    onPress={pickPhoto}
                    disabled={uploadingImage}
                    style={styles.photoWrap}
                    testID="workspace-settings-pick-photo"
                  >
                    {uploadingImage ? (
                      <View style={[styles.editPhoto, styles.photoPlaceholder]}>
                        <ActivityIndicator color={colors.brand} />
                      </View>
                    ) : image ? (
                      <Image
                        source={{ uri: image }}
                        style={styles.editPhoto}
                        resizeMode="cover"
                      />
                    ) : (
                      <WorkspaceTeamAvatar
                        team={{ name: team.name, image }}
                        size={56}
                        radius={14}
                      />
                    )}
                    <View style={styles.cameraBadge}>
                      <Camera size={12} color="#FFFFFF" />
                    </View>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Workspace name</Text>
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="Workspace name"
                      placeholderTextColor="#94A3B8"
                      testID="workspace-settings-name-input"
                    />
                  </View>
                </View>
                <View style={styles.editActions}>
                  <Pressable
                    onPress={() => {
                      setName(team.name);
                      setImage(team.image ?? null);
                      setEditingDetails(false);
                    }}
                    style={styles.compactSecondary}
                  >
                    <Text style={styles.compactSecondaryText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveDetails}
                    disabled={
                      updateMutation.isPending || !dirty || !name.trim()
                    }
                    style={[
                      styles.compactPrimary,
                      !dirty || !name.trim() ? styles.buttonDisabled : null,
                    ]}
                    testID="save-workspace-button"
                  >
                    {updateMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.compactPrimaryText}>Save</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {canManage && joinRequests.length > 0 ? (
              <View style={styles.requestsCard}>
                <Text style={styles.sectionLabel}>
                  PENDING REQUESTS · {joinRequests.length}
                </Text>
                {joinRequests.map((request, index) => (
                  <View key={request.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.requestRow}>
                      <UserAvatar
                        user={request.user}
                        size={36}
                        radius={18}
                        backgroundColor="#EEF2FF"
                        textColor="#4361EE"
                        fontSize={14}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.requestName} numberOfLines={1}>
                          {request.user.name}
                        </Text>
                        <Text style={styles.requestEmail} numberOfLines={1}>
                          {request.user.email}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => rejectMutation.mutate(request.id)}
                        style={styles.rejectButton}
                      >
                        <X size={14} color="#EF4444" />
                      </Pressable>
                      <Pressable
                        onPress={() => approveMutation.mutate(request.id)}
                        style={styles.approveButton}
                      >
                        <Check size={14} color="#16A34A" />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.manageLabel}>MANAGE WORKSPACE</Text>
            <View style={styles.menuCard}>
              <ManagementRow
                icon={<FileText size={16} color="#64748B" />}
                title="Workspace Details"
                subtitle="View and edit name, description, and photo"
                onPress={() => setEditingDetails(true)}
                disabled={!canManage}
                testID="workspace-settings-details"
              />
              <View style={styles.divider} />
              <ManagementRow
                icon={<Users size={16} color="#64748B" />}
                title="Members"
                subtitle="Invite, remove, and manage members"
                onPress={() =>
                  router.push({
                    pathname: "/team-directory",
                    params: { teamId },
                  })
                }
                testID="workspace-settings-members"
              />
              {isLeader ? (
                <>
                  <View style={styles.divider} />
                  <ManagementRow
                    icon={<ShieldCheck size={16} color="#64748B" />}
                    title="Permissions"
                    subtitle="Manage roles and access"
                    onPress={() =>
                      router.push({
                        pathname: "/team-directory",
                        params: { teamId },
                      })
                    }
                    testID="workspace-settings-permissions"
                  />
                </>
              ) : null}
              {isOwner ? (
                <>
                  <View style={styles.divider} />
                  <ManagementRow
                    icon={<Settings2 size={16} color="#64748B" />}
                    title="Workspace Settings"
                    subtitle={
                      access.canWrite
                        ? "Notifications, defaults, and preferences"
                        : "Choose a plan to restore editing"
                    }
                    onPress={() => setStandardsOpen(true)}
                    disabled={!access.canWrite}
                    testID="workspace-settings-standards"
                  />
                </>
              ) : null}
              <View style={styles.divider} />
              <ManagementRow
                icon={<CreditCard size={16} color="#64748B" />}
                title="Billing & Plan"
                subtitle="View plan and billing details"
                onPress={() =>
                  router.push({ pathname: "/choose-plan", params: { teamId } })
                }
                testID="workspace-settings-plan"
              />
            </View>

            {isOwner && access.canWrite ? (
              <Pressable
                onPress={() => setConfirmingDelete(true)}
                style={styles.dangerCard}
                testID="delete-workspace-button"
              >
                <Trash2 size={17} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dangerTitle}>Delete Workspace</Text>
                  <Text style={styles.dangerSub}>
                    Permanently remove this workspace
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                style={styles.dangerCard}
                testID="leave-workspace-button"
              >
                {leaveMutation.isPending ? (
                  <ActivityIndicator color="#EF4444" />
                ) : (
                  <LogOut size={17} color="#EF4444" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.dangerTitle}>Leave Workspace</Text>
                  <Text style={styles.dangerSub}>
                    Remove yourself from this workspace
                  </Text>
                </View>
              </Pressable>
            )}
          </ScrollView>
        </SafeKeyboardAvoidingView>
      )}

      {isOwner && access.canWrite ? (
        <WorkplaceStandardsSheet
          visible={standardsOpen}
          teamId={teamId}
          initialStandards={
            teamStandards ?? mergeWorkplaceStandards(undefined)
          }
          onClose={() => setStandardsOpen(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
            void queryClient.invalidateQueries({
              queryKey: ["team", teamId, "workplaceStandards"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["member-stats", teamId],
            });
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  topBar: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topAction: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    maxWidth: "68%",
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  editAction: {
    minWidth: 38,
    height: 38,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  editActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
  },
  centered: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginBottom: 16,
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  identityCard: {
    minHeight: 86,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E7EBF1",
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  workspaceName: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    color: "#0F172A",
  },
  workspaceMeta: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: "#7C8798",
  },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.brand,
  },
  useButton: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "#EEF2FF",
  },
  useButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.brand,
  },
  editCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E7EBF1",
    backgroundColor: "#FFFFFF",
  },
  sectionLabel: {
    marginBottom: 11,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.75,
    color: "#8A96A8",
  },
  editPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photoWrap: {
    position: "relative",
  },
  editPhoto: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  cameraBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: colors.brand,
  },
  fieldLabel: {
    marginBottom: 5,
    fontSize: 10.5,
    fontWeight: "600",
    color: "#64748B",
  },
  input: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#DEE4EC",
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    color: "#0F172A",
  },
  editActions: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  compactSecondary: {
    minWidth: 76,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  compactSecondaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  compactPrimary: {
    minWidth: 76,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.brand,
  },
  buttonDisabled: {
    backgroundColor: "#CBD5E1",
  },
  compactPrimaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  requestsCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E7EBF1",
    backgroundColor: "#FFFFFF",
  },
  requestRow: {
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  requestName: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#0F172A",
  },
  requestEmail: {
    marginTop: 2,
    fontSize: 10.5,
    color: "#94A3B8",
  },
  rejectButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
  },
  approveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCFCE7",
  },
  manageLabel: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.75,
    color: "#8A96A8",
  },
  menuCard: {
    overflow: "hidden",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E7EBF1",
    backgroundColor: "#FFFFFF",
  },
  menuRow: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  menuRowDisabled: {
    opacity: 0.45,
  },
  menuRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  menuIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F7FA",
  },
  menuTitle: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
    color: "#0F172A",
  },
  menuSub: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: "#8A96A8",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 51,
    backgroundColor: "#E9EDF3",
  },
  dangerCard: {
    minHeight: 62,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#FAD7D7",
    backgroundColor: "#FFFFFF",
  },
  dangerTitle: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#EF4444",
  },
  dangerSub: {
    marginTop: 3,
    fontSize: 10,
    color: "#A0A8B5",
  },
  deleteContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  deleteTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  deleteBody: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },
  primaryButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: colors.brand,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryButton: {
    minHeight: 46,
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#E9EEF5",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
});
