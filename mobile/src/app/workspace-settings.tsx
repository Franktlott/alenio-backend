import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  Layers,
  Lock,
  Pencil,
  ShieldCheck,
  Target,
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
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { palette, tints } from "@/theme";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { workspaceManagementCapabilities } from "@/lib/workspace-management";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
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
import { formatTimeZoneLabel, resolveTimeZone } from "@/lib/timezone";

const BAND_SHEET_RADIUS = 24;
const HEADER_ROW = 48;

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
  const trialDaysLeft =
    access.status === "trialing" && access.remainingDays != null
      ? access.remainingDays
      : null;
  const planInfo =
    access.status === "trialing"
      ? trialDaysLeft == null
        ? "Trial active"
        : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in trial`
      : !access.canWrite
        ? "Read-only workspace access"
        : access.cancelAtPeriodEnd && planPeriodDate
          ? `Plan ends ${planPeriodDate}`
          : planPeriodDate
            ? `Renews ${planPeriodDate}`
            : "Active workspace access";
  const billingSubtitle = `${planLabel} · ${planInfo}`;

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, []),
  );

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/(app)/execute");
  const bandHeight = insets.top + HEADER_ROW + 18;

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
      <View style={styles.screen} testID="workspace-settings-screen">
        <AppHeaderBand height={bandHeight} />
        <View style={[styles.bandHeader, { paddingTop: insets.top }]}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={styles.headerAction}
            testID="workspace-settings-back"
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
          <View style={styles.topTitleWrap}>
            <Text style={styles.bandTitle} numberOfLines={1}>
              Workspace Settings
            </Text>
          </View>
          <View style={styles.topActionPlaceholder} />
        </View>
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
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="workspace-settings-screen">
      <AppHeaderBand height={bandHeight} />
      <View style={[styles.bandHeader, { paddingTop: insets.top }]}>
        <Pressable
          onPress={goBack}
          hitSlop={10}
          style={styles.headerAction}
          testID="workspace-settings-back"
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.bandTitle} numberOfLines={1}>
            Workspace Settings
          </Text>
        </View>
        <View style={styles.topActionPlaceholder} />
      </View>

      <View style={styles.sheet}>
        {isLoading || !team ? (
          <View style={styles.centered}>
            <ActivityIndicator color={palette.violet} />
          </View>
        ) : (
          <SafeKeyboardAvoidingView style={{ flex: 1 }}>
            <ScrollView
              style={styles.settingsScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.content,
                { paddingBottom: Math.max(insets.bottom, 20) + 16 },
              ]}
            >
              <Card>
                <View style={styles.heroRow}>
                  <Pressable
                    onPress={pickPhoto}
                    disabled={!canManage || uploadingImage}
                    style={styles.heroPhoto}
                    accessibilityRole={canManage ? "button" : undefined}
                    accessibilityLabel={
                      canManage ? "Change workspace photo" : undefined
                    }
                    testID="workspace-settings-hero-photo"
                  >
                    {uploadingImage ? (
                      <View style={styles.heroPhotoLoading}>
                        <ActivityIndicator size="small" color={palette.violet} />
                      </View>
                    ) : (
                      <WorkspaceTeamAvatar
                        team={{ name: name || team.name, image }}
                        size={56}
                        radius={14}
                      />
                    )}
                  </Pressable>
                  <View style={styles.heroCopy}>
                    <AppText
                      variant="sectionTitle"
                      numberOfLines={2}
                      style={styles.heroName}
                    >
                      {team.name}
                    </AppText>
                    {team.location ? (
                      <AppText variant="supporting" numberOfLines={1}>
                        {team.location}
                      </AppText>
                    ) : null}
                    <View style={styles.heroMeta}>
                      <View style={styles.heroMetaItem}>
                        <Users
                          size={12}
                          color={palette.inkMuted}
                          strokeWidth={2.2}
                        />
                        <AppText variant="meta">
                          {memberCount ?? 0} member
                          {memberCount === 1 ? "" : "s"}
                        </AppText>
                      </View>
                      <View style={styles.heroMetaDivider} />
                      <View style={styles.heroMetaItem}>
                        <ShieldCheck
                          size={12}
                          color={palette.inkMuted}
                          strokeWidth={2.2}
                        />
                        <AppText variant="meta">
                          {formatTeamRole(team.role)}
                        </AppText>
                      </View>
                    </View>
                  </View>
                  {canManage ? (
                    <Pressable
                      onPress={() => {
                        setName(team.name);
                        setNameEditorOpen(true);
                      }}
                      hitSlop={8}
                      style={styles.heroEdit}
                      accessibilityRole="button"
                      accessibilityLabel="Edit workspace name"
                      testID="workspace-settings-edit-name"
                    >
                      <Pencil size={14} color={palette.violet} strokeWidth={2.3} />
                    </Pressable>
                  ) : null}
                </View>
              </Card>

              {canManage && joinRequests.length > 0 ? (
                <View style={styles.sectionBlock}>
                  <SectionHeader
                    label={`Pending requests · ${joinRequests.length}`}
                  />
                  <Card padded={false} style={styles.requestsCard}>
                    {joinRequests.map((request, index) => (
                      <View key={request.id}>
                        {index > 0 ? <View style={styles.rowDivider} /> : null}
                        <View style={styles.requestRow}>
                          <UserAvatar
                            user={request.user}
                            size={36}
                            radius={18}
                            backgroundColor={tints.lavender.bg}
                            textColor={tints.lavender.fg}
                            fontSize={14}
                          />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <AppText variant="rowTitle" numberOfLines={1}>
                              {request.user.name}
                            </AppText>
                            <AppText variant="supporting" numberOfLines={1}>
                              {request.user.email}
                            </AppText>
                          </View>
                          <Pressable
                            onPress={() => rejectMutation.mutate(request.id)}
                            style={styles.rejectButton}
                            accessibilityLabel="Decline request"
                          >
                            <X size={14} color="#EF4444" />
                          </Pressable>
                          <Pressable
                            onPress={() => approveMutation.mutate(request.id)}
                            style={styles.approveButton}
                            accessibilityLabel="Approve request"
                          >
                            <Check size={14} color="#16A34A" />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </Card>
                </View>
              ) : null}

              <View style={styles.sectionBlock}>
                <SectionHeader label="People & access" />
                <AlenioList>
                  <AlenioListRow
                    leading={
                      <IconTile tint="lavender">
                        <ShieldCheck
                          size={16}
                          color={tintInk("lavender")}
                          strokeWidth={2.1}
                        />
                      </IconTile>
                    }
                    title="Roles & permissions"
                    subtitle="Control access and member roles"
                    onPress={
                      isLeader
                        ? () =>
                            router.push({
                              pathname: "/workspace-permissions",
                              params: { teamId },
                            })
                        : undefined
                    }
                    chevron={isLeader}
                    style={isLeader ? undefined : styles.rowDisabled}
                    testID="workspace-settings-permissions"
                  />
                </AlenioList>
              </View>

              <View style={styles.sectionBlock}>
                <SectionHeader label="Workspace tools" />
                <AlenioList>
                  <AlenioListRow
                    leading={
                      <IconTile tint="lavender">
                        <Target
                          size={16}
                          color={
                            hasPaidWorkspaceFeatures
                              ? tintInk("lavender")
                              : palette.inkMuted
                          }
                          strokeWidth={2.1}
                        />
                      </IconTile>
                    }
                    title="Development standards"
                    subtitle="Set expectations and track progress"
                    onPress={
                      !isOwner
                        ? undefined
                        : () => {
                            if (!hasPaidWorkspaceFeatures) {
                              setPaidFeatureCallout("standards");
                              return;
                            }
                            router.push({
                              pathname: "/workspace-standards",
                              params: { teamId },
                            });
                          }
                    }
                    chevron={isOwner && hasPaidWorkspaceFeatures}
                    trailing={
                      !hasPaidWorkspaceFeatures ? (
                        <Lock
                          size={15}
                          color={palette.inkMuted}
                          strokeWidth={2.2}
                        />
                      ) : undefined
                    }
                    style={isOwner ? undefined : styles.rowDisabled}
                    testID="workspace-settings-standards"
                  />
                  <AlenioListRow
                    leading={
                      <IconTile tint="lavender">
                        <ClipboardList
                          size={16}
                          color={
                            hasPaidWorkspaceFeatures
                              ? tintInk("lavender")
                              : palette.inkMuted
                          }
                          strokeWidth={2.1}
                        />
                      </IconTile>
                    }
                    title="Check-in templates"
                    subtitle="Create and manage check-in templates"
                    onPress={
                      !isLeader
                        ? undefined
                        : () => {
                            if (!hasPaidWorkspaceFeatures) {
                              setPaidFeatureCallout("templates");
                              return;
                            }
                            router.push({
                              pathname: "/check-in-templates",
                              params: { teamId },
                            });
                          }
                    }
                    chevron={isLeader && hasPaidWorkspaceFeatures}
                    trailing={
                      !hasPaidWorkspaceFeatures ? (
                        <Lock
                          size={15}
                          color={palette.inkMuted}
                          strokeWidth={2.2}
                        />
                      ) : undefined
                    }
                    style={isLeader ? undefined : styles.rowDisabled}
                    testID="workspace-settings-check-in-templates"
                  />
                </AlenioList>
              </View>

              <View style={styles.sectionBlock}>
                <SectionHeader label="Workspace & billing" />
                <AlenioList>
                  <AlenioListRow
                    leading={
                      <IconTile tint="lavender">
                        <CreditCard
                          size={16}
                          color={tintInk("lavender")}
                          strokeWidth={2}
                        />
                      </IconTile>
                    }
                    title="Subscription & billing"
                    subtitle={billingSubtitle}
                    trailing={
                      <View style={styles.billingTrailing}>
                        {trialDaysLeft != null ? (
                          <View style={styles.trialChip}>
                            <Text style={styles.trialChipText}>
                              {trialDaysLeft} day
                              {trialDaysLeft === 1 ? "" : "s"} left
                            </Text>
                          </View>
                        ) : null}
                        <ChevronRight
                          size={16}
                          color={palette.inkMuted}
                          strokeWidth={2.2}
                        />
                      </View>
                    }
                    onPress={() =>
                      router.push({
                        pathname: "/choose-plan",
                        params: { teamId },
                      })
                    }
                    testID="workspace-settings-plan"
                  />
                  <AlenioListRow
                    leading={
                      <IconTile tint="lavender">
                        <Clock3
                          size={16}
                          color={tintInk("lavender")}
                          strokeWidth={2.1}
                        />
                      </IconTile>
                    }
                    title="Workspace timezone"
                    subtitle={formatTimeZoneLabel(
                      resolveTimeZone(team.timezone),
                    )}
                    onPress={
                      isOwner && access.canWrite
                        ? () =>
                            router.push({
                              pathname: "/workspace-timezone",
                              params: { teamId },
                            })
                        : undefined
                    }
                    chevron={isOwner && access.canWrite}
                    style={
                      isOwner && access.canWrite
                        ? undefined
                        : styles.rowDisabled
                    }
                    testID="workspace-timezone-setting"
                  />
                  <AlenioListRow
                    leading={
                      <IconTile tint="lavender">
                        <Layers
                          size={16}
                          color={tintInk("lavender")}
                          strokeWidth={2}
                        />
                      </IconTile>
                    }
                    title="Ownership & deletion"
                    subtitle="Transfer ownership or delete this workspace"
                    onPress={() =>
                      router.push({
                        pathname: "/workspace-advanced",
                        params: { teamId },
                      })
                    }
                    chevron
                    testID="workspace-settings-advanced"
                  />
                </AlenioList>
              </View>
            </ScrollView>
          </SafeKeyboardAvoidingView>
        )}
      </View>

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
            <Button
              variant="secondary"
              size="md"
              label="Cancel"
              onPress={() => {
                setName(team?.name ?? "");
                setNameEditorOpen(false);
              }}
            />
            <Button
              variant="primary"
              size="md"
              label="Save name"
              loading={updateMutation.isPending}
              disabled={
                updateMutation.isPending ||
                !name.trim() ||
                name.trim() === team?.name
              }
              onPress={saveName}
              testID="save-workspace-name-button"
            />
          </View>
        }
      >
        <AppText variant="sectionLabel" style={{ marginBottom: 6 }}>
          Workspace name
        </AppText>
        <TextInput
          style={styles.nameEditorInput}
          value={name}
          onChangeText={setName}
          placeholder="Workspace name"
          placeholderTextColor={palette.inkMuted}
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
        footer={
          <Button
            variant="primary"
            size="lg"
            fullWidth
            label="Got it"
            onPress={() => setPaidFeatureCallout(null)}
            testID="workspace-paid-feature-dismiss"
          />
        }
      >
        <View style={styles.paidFeatureCallout}>
          <IconTile tint="lavender" size={52} style={{ borderRadius: 18, marginBottom: 12 }}>
            <Lock size={24} color={tintInk("lavender")} strokeWidth={2.2} />
          </IconTile>
          <AppText variant="sectionTitle" style={{ textAlign: "center" }}>
            {paidFeatureCallout === "standards"
              ? "Unlock Development Standards"
              : "Unlock Check-in Templates"}
          </AppText>
          <AppText
            variant="supporting"
            style={{ marginTop: 7, textAlign: "center", maxWidth: 310 }}
          >
            {paidFeatureCallout === "standards"
              ? "Set shared development expectations and track progress across your workspace."
              : "Create reusable templates for consistent, meaningful team check-ins."}
          </AppText>
        </View>
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
  centered: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  settingsScroll: {
    flex: 1,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroPhoto: {
    position: "relative",
  },
  heroPhotoLoading: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tints.lavender.bg,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroName: {
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  heroMeta: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  heroMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroMetaDivider: {
    width: 1,
    height: 12,
    backgroundColor: palette.rowDivider,
  },
  heroEdit: {
    width: 34,
    height: 34,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(109, 40, 217, 0.16)",
    backgroundColor: "#FFFFFF",
  },
  sectionBlock: {
    gap: 0,
  },
  requestsCard: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  requestRow: {
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 46,
    backgroundColor: palette.rowDivider,
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
  rowDisabled: {
    opacity: 0.45,
  },
  billingTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trialChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: tints.lavender.bg,
  },
  trialChipText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: palette.violet,
  },
  nameEditorInput: {
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E0EF",
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: palette.ink,
  },
  nameEditorActions: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  paidFeatureCallout: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 2,
  },
});
