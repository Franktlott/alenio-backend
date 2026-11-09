import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  ClipboardList,
  Clock3,
  CreditCard,
  Lock,
  Pencil,
  ShieldCheck,
  Target,
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
import { workspaceDevelopmentHref } from "@/lib/workspace-development-navigation";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import {
  COMMON_TIMEZONES,
  formatTimeZoneLabel,
  resolveTimeZone,
} from "@/lib/timezone";

type JoinRequestItem = {
  id: string;
  status: string;
  user: { id: string; name: string; email: string; image: string | null };
};

function workspacePlanLabel(plan: string) {
  const normalized = plan.trim().toLowerCase();
  if (normalized === "operations") return "Operations";
  if (normalized === "pro" || normalized === "team") return "Pro";
  return "Free";
}

function shortDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ManagementRow({
  icon,
  title,
  subtitle,
  onPress,
  testID,
  disabled = false,
  locked = false,
  trailingBadge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
  locked?: boolean;
  trailingBadge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.menuRow,
        disabled || locked ? styles.menuRowDisabled : null,
      ]}
      accessibilityRole="button"
      testID={testID}
    >
      <View style={styles.menuIcon}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSub} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {trailingBadge ? (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{trailingBadge}</Text>
        </View>
      ) : null}
      {locked ? (
        <Lock size={15} color="#8290A5" strokeWidth={2.2} />
      ) : (
        <ChevronRight size={14} color="#C0C7D1" />
      )}
    </Pressable>
  );
}

export default function WorkspaceSettingsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);

  const teamId =
    (typeof params.teamId === "string" && params.teamId) || activeTeamId || "";
  const { access } = useWorkspaceAccess(teamId);

  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [timezonePickerOpen, setTimezonePickerOpen] = useState(false);
  const [standardsOpen, setStandardsOpen] = useState(false);
  const [paidFeatureCallout, setPaidFeatureCallout] = useState<
    "standards" | "templates" | null
  >(null);

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
  const hasPaidWorkspaceFeatures = access.features.team && access.canWrite;
  const memberCount = team?._count?.members ?? team?.members?.length;
  const planLabel = workspacePlanLabel(access.plan);
  const planPeriodDate = shortDate(access.currentPeriodEnd);
  const planInfo =
    access.status === "trialing"
      ? access.remainingDays == null
        ? "Trial active"
        : `${access.remainingDays} day${access.remainingDays === 1 ? "" : "s"} left in trial`
      : !access.canWrite
        ? "Read-only workspace access"
        : access.cancelAtPeriodEnd && planPeriodDate
          ? `Plan ends ${planPeriodDate}`
          : planPeriodDate
            ? `Renews ${planPeriodDate}`
            : "Active workspace access";

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
    setNameEditorOpen(false);
  }, [team]);

  const updateMutation = useMutation({
    mutationFn: (data: {
      name: string;
      image: string | null;
      location: string | null;
      timezone?: string;
    }) =>
      api.patch<Team>(`/api/teams/${teamId}`, data),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      void queryClient.invalidateQueries({ queryKey: ["team", updated.id] });
      setNameEditorOpen(false);
      setTimezonePickerOpen(false);
      toast({ title: "Workspace updated", preset: "done" });
    },
    onError: () => {
      setImage(team?.image ?? null);
      toast({ title: "Failed to update workspace", preset: "error" });
    },
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
    let uploadedUrl: string | null = null;
    try {
      const uploaded = await uploadFile(
        result.assets[0].uri,
        "team-photo.jpg",
        "image/jpeg",
        { purpose: "team", teamId },
      );
      uploadedUrl = uploaded.url;
      setImage(uploadedUrl);
    } catch (error) {
      toast({
        title: "Failed to upload photo",
        message: error instanceof Error ? error.message : "Upload failed",
        preset: "error",
      });
    } finally {
      setUploadingImage(false);
    }
    if (!uploadedUrl) return;
    updateMutation.mutate({
      name: team?.name ?? name.trim(),
      image: uploadedUrl,
      location: team?.location ?? null,
    });
  };

  const saveName = () => {
    if (!canManage || !name.trim() || name.trim() === team?.name) return;
    updateMutation.mutate({
      name: name.trim(),
      image: team?.image ?? image,
      location: team?.location ?? null,
    });
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
      edges={[]}
      testID="workspace-settings-screen"
    >
      <View
        style={[styles.topBar, { paddingTop: insets.top }]}
      >
        <Pressable
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(app)/execute")
          }
          hitSlop={10}
          style={styles.headerAction}
          testID="workspace-settings-back"
        >
          <ArrowLeft size={20} color="#172033" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.topTitle} numberOfLines={1}>
            Workspace
          </Text>
        </View>
        <View style={styles.topActionPlaceholder} />
      </View>

      {isLoading || !team ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <SafeKeyboardAvoidingView style={{ flex: 1 }}>
          <ScrollView
            style={styles.settingsScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <View style={styles.workspaceHero}>
              <Pressable
                onPress={pickPhoto}
                disabled={!canManage || uploadingImage}
                style={styles.workspaceHeroPhoto}
                accessibilityRole={canManage ? "button" : undefined}
                accessibilityLabel={canManage ? "Change workspace photo" : undefined}
                testID="workspace-settings-hero-photo"
              >
                <WorkspaceTeamAvatar
                  team={{ name: name || team.name, image }}
                  size={76}
                  radius={14}
                />
                {canManage ? (
                  <View style={styles.workspaceHeroCamera}>
                    {uploadingImage ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Camera size={13} color="#FFFFFF" strokeWidth={2.4} />
                    )}
                  </View>
                ) : null}
              </Pressable>
              <View style={styles.workspaceHeroCopy}>
                <View style={styles.workspaceNameRow}>
                  <Text
                    style={styles.workspaceName}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.62}
                  >
                    {team.name}
                  </Text>
                  {canManage ? (
                    <Pressable
                      onPress={() => {
                        setName(team.name);
                        setNameEditorOpen(true);
                      }}
                      hitSlop={8}
                      style={styles.workspaceNameEdit}
                      accessibilityRole="button"
                      accessibilityLabel="Edit workspace name"
                      testID="workspace-settings-edit-name"
                    >
                      <Pencil size={13} color="#5368E8" strokeWidth={2.3} />
                    </Pressable>
                  ) : null}
                </View>
                {team.location ? (
                  <Text style={styles.workspaceLocation} numberOfLines={1}>
                    {team.location}
                  </Text>
                ) : null}
                <View style={styles.workspaceMeta}>
                  <View style={styles.workspaceMetaItem}>
                    <Users size={12} color="#64748B" strokeWidth={2.2} />
                    <Text style={styles.workspaceMetaText}>
                      {memberCount ?? 0} member{memberCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <View style={styles.workspaceMetaDivider} />
                  <View style={styles.workspaceMetaItem}>
                    <ShieldCheck size={12} color="#64748B" strokeWidth={2.2} />
                    <Text style={styles.workspaceMetaText}>
                      {formatTeamRole(team.role)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

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

            <Text style={styles.settingsHeading}>MANAGE</Text>
            <View style={styles.settingsList}>
              <ManagementRow
                icon={<Users size={18} color="#6D4AFF" strokeWidth={2.1} />}
                title="Members"
                subtitle="View and manage workspace members"
                onPress={() =>
                  router.push(workspaceDevelopmentHref(teamId))
                }
                trailingBadge={String(memberCount ?? 0)}
                testID="workspace-settings-members"
              />
              <View style={styles.divider} />
              <ManagementRow
                icon={<ShieldCheck size={18} color="#169B67" strokeWidth={2.1} />}
                title="Roles & permissions"
                subtitle="Control member access and roles"
                onPress={() =>
                  router.push({
                    pathname: "/workspace-permissions",
                    params: { teamId },
                  })
                }
                disabled={!isLeader}
                testID="workspace-settings-permissions"
              />
              <View style={styles.divider} />
              <ManagementRow
                icon={
                  <Target
                    size={18}
                    color={hasPaidWorkspaceFeatures ? "#3478F6" : "#8290A5"}
                    strokeWidth={2.1}
                  />
                }
                title="Development standards"
                subtitle="Set expectations and track progress"
                onPress={() => {
                  if (!hasPaidWorkspaceFeatures) {
                    setPaidFeatureCallout("standards");
                    return;
                  }
                  setStandardsOpen(true);
                }}
                disabled={!isOwner}
                locked={!hasPaidWorkspaceFeatures}
                testID="workspace-settings-standards"
              />
              <View style={styles.divider} />
              <ManagementRow
                icon={
                  <ClipboardList
                    size={18}
                    color={hasPaidWorkspaceFeatures ? "#F47B34" : "#8290A5"}
                    strokeWidth={2.1}
                  />
                }
                title="Check-in templates"
                subtitle="Create and manage check-in templates"
                onPress={() => {
                  if (!hasPaidWorkspaceFeatures) {
                    setPaidFeatureCallout("templates");
                    return;
                  }
                  router.push({
                    pathname: "/check-in-templates",
                    params: { teamId },
                  });
                }}
                disabled={!isLeader}
                locked={!hasPaidWorkspaceFeatures}
                testID="workspace-settings-check-in-templates"
              />
              <View style={styles.divider} />
              <ManagementRow
                icon={<CreditCard size={18} color="#7C3AED" strokeWidth={2} />}
                title="Subscription & billing"
                subtitle="Manage your plan and payment details"
                onPress={() =>
                  router.push({ pathname: "/choose-plan", params: { teamId } })
                }
                testID="workspace-settings-plan"
              />
              <View style={styles.divider} />
              <ManagementRow
                icon={<Trash2 size={18} color="#8290A5" strokeWidth={2} />}
                title="Ownership & deletion"
                subtitle="Transfer ownership or delete workspace"
                onPress={() =>
                  router.push({
                    pathname: "/workspace-advanced",
                    params: { teamId },
                  })
                }
                testID="workspace-settings-advanced"
              />
              <View style={styles.divider} />
              <ManagementRow
                icon={<Clock3 size={18} color="#3478F6" strokeWidth={2.1} />}
                title="Workspace timezone"
                subtitle={formatTimeZoneLabel(resolveTimeZone(team.timezone))}
                onPress={() => setTimezonePickerOpen(true)}
                disabled={!isOwner || !access.canWrite}
                testID="workspace-timezone-setting"
              />
            </View>
          </ScrollView>
          <View
            style={[
              styles.summaryDock,
              { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <View style={styles.summaryCard}>
              <Text style={styles.summaryHeading}>WORKSPACE SUMMARY</Text>
              <View style={styles.summaryMetrics}>
                <View style={styles.summaryMetric}>
                  <View style={[styles.summaryIcon, styles.summaryIconMembers]}>
                    <Users size={14} color="#6657E8" strokeWidth={2.2} />
                  </View>
                  <Text style={styles.summaryValue}>{memberCount ?? 0}</Text>
                  <Text style={styles.summaryLabel}>
                    Member{memberCount === 1 ? "" : "s"}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryMetric}>
                  <View style={[styles.summaryIcon, styles.summaryIconRole]}>
                    <ShieldCheck size={14} color="#16A36A" strokeWidth={2.2} />
                  </View>
                  <Text style={styles.summaryValue}>
                    {formatTeamRole(team.role)}
                  </Text>
                  <Text style={styles.summaryLabel}>Your role</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryMetric}>
                  <View style={[styles.summaryIcon, styles.summaryIconPlan]}>
                    <CreditCard size={14} color="#3478F6" strokeWidth={2.2} />
                  </View>
                  <Text style={styles.summaryValue}>{planLabel}</Text>
                  <Text style={styles.summaryLabel}>Plan</Text>
                </View>
              </View>
              <View style={styles.summaryPlanInfo}>
                <View
                  style={[
                    styles.summaryPlanDot,
                    !access.canWrite ? styles.summaryPlanDotReadOnly : null,
                  ]}
                />
                <Text style={styles.summaryPlanText} numberOfLines={1}>
                  {planInfo}
                </Text>
              </View>
            </View>
          </View>
        </SafeKeyboardAvoidingView>
      )}

      <AlenioBottomSheet
        visible={timezonePickerOpen}
        title="Workspace timezone"
        subtitle="Timed workspace events are scheduled in this timezone."
        onClose={() => setTimezonePickerOpen(false)}
        compact
        showCloseButton
        testID="workspace-timezone-picker"
      >
        <View style={styles.timezoneOptions}>
          {COMMON_TIMEZONES.map((timezone) => {
            const selected = resolveTimeZone(team?.timezone) === timezone;
            return (
              <Pressable
                key={timezone}
                onPress={() => {
                  if (!team || updateMutation.isPending) return;
                  updateMutation.mutate({
                    name: team.name,
                    image: team.image ?? null,
                    location: team.location ?? null,
                    timezone,
                  });
                }}
                disabled={updateMutation.isPending}
                style={[
                  styles.timezoneOption,
                  selected ? styles.timezoneOptionSelected : null,
                ]}
                testID={`workspace-timezone-option-${timezone.replaceAll("/", "-")}`}
              >
                <Text
                  style={[
                    styles.timezoneOptionText,
                    selected ? styles.timezoneOptionTextSelected : null,
                  ]}
                >
                  {formatTimeZoneLabel(timezone)}
                </Text>
                {selected ? (
                  <Check size={15} color={colors.brand} strokeWidth={2.5} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={nameEditorOpen}
        title="Edit workspace name"
        subtitle="Choose the name members will see across Alenio."
        onClose={() => {
          setName(team?.name ?? "");
          setNameEditorOpen(false);
        }}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="workspace-name-editor"
        footer={
          <View style={styles.nameEditorActions}>
            <Pressable
              onPress={() => {
                setName(team?.name ?? "");
                setNameEditorOpen(false);
              }}
              style={styles.nameEditorCancel}
            >
              <Text style={styles.nameEditorCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={saveName}
              disabled={
                updateMutation.isPending ||
                !name.trim() ||
                name.trim() === team?.name
              }
              style={[
                styles.nameEditorSave,
                !name.trim() || name.trim() === team?.name
                  ? styles.nameEditorSaveDisabled
                  : null,
              ]}
              testID="save-workspace-name-button"
            >
              {updateMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.nameEditorSaveText}>Save name</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={styles.nameEditorLabel}>Workspace name</Text>
        <TextInput
          style={styles.nameEditorInput}
          value={name}
          onChangeText={setName}
          placeholder="Workspace name"
          placeholderTextColor="#94A3B8"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={saveName}
          maxLength={80}
          testID="workspace-settings-name-input"
        />
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={paidFeatureCallout !== null}
        title="Paid workspace feature"
        subtitle="Available during your trial and on paid workspace plans."
        onClose={() => setPaidFeatureCallout(null)}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="workspace-paid-feature-callout"
      >
        <View style={styles.paidFeatureCallout}>
          <View style={styles.paidFeatureIcon}>
            <Lock size={24} color="#5B45FF" strokeWidth={2.2} />
          </View>
          <Text style={styles.paidFeatureTitle}>
            {paidFeatureCallout === "standards"
              ? "Unlock Development Standards"
              : "Unlock Check-in Templates"}
          </Text>
          <Text style={styles.paidFeatureBody}>
            {paidFeatureCallout === "standards"
              ? "Set shared development expectations and track progress across your workspace."
              : "Create reusable templates for consistent, meaningful team check-ins."}
          </Text>
          <Pressable
            onPress={() => setPaidFeatureCallout(null)}
            style={({ pressed }) => [
              styles.paidFeatureButton,
              pressed ? styles.paidFeatureButtonPressed : null,
            ]}
            accessibilityRole="button"
            testID="workspace-paid-feature-dismiss"
          >
            <Text style={styles.paidFeatureButtonText}>Got it</Text>
          </Pressable>
        </View>
      </AlenioBottomSheet>

      {isOwner && hasPaidWorkspaceFeatures ? (
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
    backgroundColor: "#FFFFFF",
  },
  topBar: {
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
  topActionPlaceholder: {
    width: 34,
    height: 34,
  },
  topTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  topTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#172033",
    letterSpacing: -0.25,
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
    paddingTop: 18,
    paddingBottom: 16,
  },
  settingsScroll: {
    flex: 1,
  },
  workspaceHero: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 2,
    paddingVertical: 12,
    marginBottom: 22,
  },
  workspaceHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  workspaceHeroPhoto: {
    position: "relative",
  },
  workspaceHeroCamera: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    backgroundColor: colors.brand,
    shadowColor: "#293A89",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  workspaceNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  workspaceName: {
    flex: 1,
    minWidth: 0,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.35,
    color: "#18213A",
  },
  workspaceNameEdit: {
    width: 26,
    height: 26,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#DDE2FF",
    backgroundColor: "#F2F4FF",
  },
  workspaceLocation: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  workspaceMeta: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9,
  },
  workspaceMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  workspaceMetaText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  workspaceMetaDivider: {
    width: 1,
    height: 12,
    backgroundColor: "#D7DDEA",
  },
  timezoneOptions: {
    gap: 5,
    paddingBottom: 4,
  },
  timezoneOption: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E5EAF1",
    backgroundColor: "#FFFFFF",
  },
  timezoneOptionSelected: {
    borderColor: "#C9D3FF",
    backgroundColor: "#F1F3FF",
  },
  timezoneOptionText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
    color: "#526078",
  },
  timezoneOptionTextSelected: {
    color: "#3448C5",
  },
  sectionLabel: {
    marginBottom: 11,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.75,
    color: "#8A96A8",
  },
  nameEditorLabel: {
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  nameEditorInput: {
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCE2EC",
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: "#0F172A",
  },
  nameEditorActions: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  nameEditorCancel: {
    minWidth: 82,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  nameEditorCancelText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  nameEditorSave: {
    minWidth: 106,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.brand,
  },
  nameEditorSaveDisabled: {
    backgroundColor: "#CBD5E1",
  },
  nameEditorSaveText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  paidFeatureCallout: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 2,
  },
  paidFeatureIcon: {
    width: 52,
    height: 52,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#F0EEFF",
    borderWidth: 1,
    borderColor: "#DDD8FF",
  },
  paidFeatureTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: "#10213B",
    textAlign: "center",
  },
  paidFeatureBody: {
    maxWidth: 310,
    marginTop: 7,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "500",
    color: "#6F7B91",
    textAlign: "center",
  },
  paidFeatureButton: {
    width: "100%",
    minHeight: 44,
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#5B45FF",
  },
  paidFeatureButtonPressed: {
    opacity: 0.82,
  },
  paidFeatureButtonText: {
    fontSize: 13.5,
    fontWeight: "800",
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
  settingsList: {
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E8F0",
    backgroundColor: "#FFFFFF",
    shadowColor: "#24365C",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  settingsHeading: {
    marginBottom: 8,
    paddingHorizontal: 2,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#6F7B91",
  },
  menuRow: {
    minHeight: 54,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuRowDisabled: {
    opacity: 0.45,
  },
  menuRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  menuIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F3F7",
  },
  menuTitle: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    color: "#10213B",
  },
  menuSub: {
    marginTop: 1,
    fontSize: 10.25,
    lineHeight: 13,
    fontWeight: "500",
    color: "#8A96A8",
  },
  menuBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F0EEFF",
  },
  menuBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#6B5CE7",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
    backgroundColor: "#E5E9F1",
  },
  summaryDock: {
    paddingTop: 6,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E4E8F0",
    backgroundColor: "#FFFFFF",
  },
  summaryCard: {
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E9F1",
    backgroundColor: "#FFFFFF",
  },
  summaryHeading: {
    marginBottom: 7,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    letterSpacing: 0.75,
    color: "#6F7B91",
  },
  summaryMetrics: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  summaryMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  summaryIcon: {
    width: 22,
    height: 22,
    marginBottom: 3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  summaryIconMembers: {
    backgroundColor: "#F0EEFF",
  },
  summaryIconRole: {
    backgroundColor: "#EAF9F2",
  },
  summaryIconPlan: {
    backgroundColor: "#EDF5FF",
  },
  summaryValue: {
    maxWidth: "100%",
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
    color: "#1B2941",
    textAlign: "center",
  },
  summaryLabel: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 11,
    color: "#8A96A8",
    textAlign: "center",
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 7,
    backgroundColor: "#E5E9F1",
  },
  summaryPlanInfo: {
    minHeight: 21,
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8ECF3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  summaryPlanDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22A06B",
  },
  summaryPlanDotReadOnly: {
    backgroundColor: "#F59E0B",
  },
  summaryPlanText: {
    flexShrink: 1,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
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
});
