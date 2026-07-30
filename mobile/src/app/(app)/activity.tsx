import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import {
  Activity,
  Search,
  X,
  Check,
  ChevronDown,
  Building2,
  SlidersHorizontal,
} from "lucide-react-native";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Image as ExpoImage } from "expo-image";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import { resolveUserImageUrl } from "@/lib/user-avatar";
import { NoWorkspaceRedirect } from "@/components/NoWorkspaceRedirect";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { tabBarClearance, SENECA_FAB_SIZE, SENECA_FAB_VISIBLE_SIZE } from "@/lib/tab-bar";
import { CurvedTabLayout } from "@/components/CurvedTabLayout";
import { UserAvatar } from "@/components/UserAvatar";
import { useActivityCelebrateFabListener } from "@/components/seneca/SenecaFloatingLauncher";
import type { Team } from "@/lib/types";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { hasWorkspaceTaskAccess, PAYWALL_TITLE } from "@/lib/plan-access-copy";
import { router, useLocalSearchParams } from "expo-router";
import { toast } from "burnt";
import {
  ActivityFeedCard,
  GroupedActivityRow,
  CelebrationTypePickerCards,
  CelebrationDeleteModal,
  CELEBRATION_TYPE_KEYS,
  mapApiActivityToFeedItem,
  matchesActivityFilter,
  groupRepetitiveActivities,
  groupActivitiesByDate,
  ACTIVITY_FILTER_OPTIONS,
  type ActivityApiEvent,
  type ActivityDateSection,
  type ActivityFeedItem,
  type ActivityFeedGroup,
  type ActivityFilter,
  type CelebrationTypeKey,
} from "@/components/activity";
import { ActivityReactionRow } from "@/components/activity/ActivityReactionRow";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";

const REACTION_HINT_KEY = "reaction_hint_shown";

type CelebrateTeamMember = {
  userId: string;
  user: { id: string; name: string; image: string | null };
};

function sortCelebrateMembers(members: CelebrateTeamMember[]): CelebrateTeamMember[] {
  return [...members].sort((a, b) =>
    (a.user.name?.trim() || "").localeCompare(b.user.name?.trim() || "", undefined, { sensitivity: "base" }),
  );
}

function filterCelebrateMembers(members: CelebrateTeamMember[], query: string): CelebrateTeamMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m) => m.user.name?.toLowerCase().includes(q));
}

type FeedRow =
  | { kind: "section"; section: ActivityDateSection }
  | { kind: "item"; item: ActivityFeedItem; sectionGroup: string; isFirstInFeed: boolean }
  | { kind: "group"; group: ActivityFeedGroup; sectionGroup: string }
  | { kind: "empty-filter" };

function FeedItemCard({
  item,
  currentUserId,
  canDeleteCelebration,
  showPicker,
  onOpenPicker,
  onClosePicker,
  showHint,
  showWorkspaceLabel,
}: {
  item: ActivityFeedItem;
  currentUserId: string | undefined;
  canDeleteCelebration: boolean;
  showPicker: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  showHint?: boolean;
  showWorkspaceLabel?: boolean;
}) {
  const queryClient = useQueryClient();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const itemTeamId = item.teamId;

  const { mutate: toggleReaction } = useMutation({
    mutationFn: (emoji: string) => api.post(`/api/teams/${itemTeamId}/activity/${item.id}/react`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", "all"] });
      onClosePicker();
    },
  });

  const { mutate: deleteCelebration, isPending: isDeleting } = useMutation({
    mutationFn: () => api.delete(`/api/teams/${itemTeamId}/activity/${item.id}`),
    onSuccess: () => {
      setShowDeleteModal(false);
      queryClient.invalidateQueries({ queryKey: ["activity", "all"] });
      onClosePicker();
    },
  });

  const canDelete = item.type === "celebration" && canDeleteCelebration;

  const handleDelete = () => {
    if (isDeleting || !itemTeamId) return;
    onClosePicker();
    setShowDeleteModal(true);
  };

  return (
    <View>
      {showWorkspaceLabel && item.teamName ? (
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: "#64748B",
            marginBottom: 0,
            marginLeft: 14,
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {item.teamName}
        </Text>
      ) : null}
      <ActivityFeedCard
        item={item}
        onLongPress={onOpenPicker}
        footer={
          <ActivityReactionRow
            activityId={item.id}
            reactions={item.reactions ?? {}}
            currentUserId={currentUserId}
            onToggleReaction={toggleReaction}
            showPicker={showPicker}
            onClosePicker={onClosePicker}
            tone="default"
            canDelete={canDelete}
            onDelete={canDelete ? handleDelete : undefined}
          />
        }
      />
      {showHint ? (
        <Text style={{ fontSize: 10, color: "rgba(100,116,139,0.7)", textAlign: "center", marginTop: 4 }}>
          Long press to react
        </Text>
      ) : null}

      <CelebrationDeleteModal
        visible={showDeleteModal}
        celebrationType={item.metadata.celebrationType}
        targetName={item.metadata.targetName}
        isDeleting={isDeleting}
        onCancel={() => {
          if (!isDeleting) setShowDeleteModal(false);
        }}
        onConfirm={() => deleteCelebration()}
      />
    </View>
  );
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const routeParams = useLocalSearchParams<{
    openCelebrate?: string;
    teamId?: string;
    targetUserId?: string;
  }>();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const queryClient = useQueryClient();
  const currentUserId = authReady?.me?.id ?? session?.user?.id;
  const persistedPlan = useSubscriptionStore((s) => s.plan);

  useEffect(() => {
    const uri = resolveUserImageUrl(authReady?.me?.image);
    if (uri) {
      void ExpoImage.prefetch(uri);
    }
  }, [authReady?.me?.image]);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () =>
      api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
        `/api/teams/${activeTeamId}/subscription`,
      ),
    enabled: !!activeTeamId,
  });
  const hasCelebrateAccess = hasWorkspaceTaskAccess(subscription, persistedPlan);

  const [showReactionHint, setShowReactionHint] = useState(false);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [showWorkspaceFilterSheet, setShowWorkspaceFilterSheet] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());

  const [showCelebrateModal, setShowCelebrateModal] = useState(false);
  const [celebrateStep, setCelebrateStep] = useState<1 | 2>(1);
  const [celebrateTeamId, setCelebrateTeamId] = useState<string>("");
  const [celebrateTarget, setCelebrateTarget] = useState<{ id: string; name: string; image: string | null } | null>(null);
  const [celebrateType, setCelebrateType] = useState<CelebrationTypeKey>(CELEBRATION_TYPE_KEYS[0]!);
  const [celebrateMessage, setCelebrateMessage] = useState("");
  const [celebrateMemberSearch, setCelebrateMemberSearch] = useState("");
  const [showCelebrateWorkspaceMenu, setShowCelebrateWorkspaceMenu] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(REACTION_HINT_KEY).then((val) => {
      if (val !== "1") setShowReactionHint(true);
    });
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showReactionHint) return;
    hintTimerRef.current = setTimeout(() => {
      setShowReactionHint(false);
      AsyncStorage.setItem(REACTION_HINT_KEY, "1");
    }, 4000);
  }, [showReactionHint]);

  useEffect(() => {
    if (!openPickerId) return;
    const timer = setTimeout(() => setOpenPickerId(null), 10000);
    return () => clearTimeout(timer);
  }, [openPickerId]);

  const { data: activities = [], isLoading, refetch, isError, error } = useQuery({
    queryKey: ["activity", "all"],
    queryFn: async () => {
      try {
        return await api.get<ActivityApiEvent[]>(`/api/activity`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        const missingCombined =
          /not found|404/i.test(msg) || msg.includes("may not exist or you may not have access");
        if (!missingCombined || teams.length === 0) throw e;
        const chunks = await Promise.all(
          teams.map(async (team) => {
            try {
              const items = await api.get<ActivityApiEvent[]>(`/api/teams/${team.id}/activity`);
              return items.map((item) => ({
                ...item,
                teamId: item.teamId ?? team.id,
                team: item.team ?? { id: team.id, name: team.name },
              }));
            } catch {
              return [] as ActivityApiEvent[];
            }
          }),
        );
        return chunks
          .flat()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 150);
      }
    },
    enabled: teams.length > 0,
    refetchInterval: 15000,
    refetchOnMount: "always",
  });

  const celebrateTeamIdResolved =
    celebrateTeamId || (workspaceFilter !== "all" ? workspaceFilter : activeTeamId ?? teams[0]?.id ?? "");

  const { data: teamMembers = [], isLoading: teamMembersLoading } = useQuery({
    queryKey: ["team-members-feed", celebrateTeamIdResolved],
    queryFn: async () => {
      const team = await api.get<{
        members: { userId: string; user: { id: string; name: string; image: string | null } }[];
      }>(`/api/teams/${celebrateTeamIdResolved}`);
      return (team.members ?? []).filter((m) => m.userId !== currentUserId);
    },
    enabled: !!celebrateTeamIdResolved && showCelebrateModal,
  });

  const workspaceFilteredActivities = useMemo(() => {
    if (workspaceFilter === "all") return activities;
    return activities.filter((a) => a.teamId === workspaceFilter);
  }, [activities, workspaceFilter]);

  const feedItems = useMemo(
    () =>
      workspaceFilteredActivities
        .map(mapApiActivityToFeedItem)
        .map((item) =>
          item.actor?.id && authReady?.me?.id && item.actor.id === authReady.me.id
            ? {
                ...item,
                actor: {
                  ...item.actor,
                  name: authReady.me.name || item.actor.name,
                  image: authReady.me.image ?? item.actor.image,
                },
              }
            : item,
        )
        .filter((item) => matchesActivityFilter(item.type, activityFilter)),
    [workspaceFilteredActivities, activityFilter, authReady?.me],
  );

  const sections = useMemo(() => groupActivitiesByDate(feedItems), [feedItems]);
  const workspaceFilterLabel =
    workspaceFilter === "all"
      ? "All workspaces"
      : teams.find((t) => t.id === workspaceFilter)?.name ?? "Workspace";
  const hasActiveFilters = activityFilter !== "all" || workspaceFilter !== "all";
  const showWorkspaceLabels = workspaceFilter === "all" && teams.length > 1;

  const openCelebrate = useCallback((preferredTeamId?: string) => {
    if (!hasCelebrateAccess) {
      toast({
        title: PAYWALL_TITLE,
        message: "Celebrations are included with Pro. Manage access on the web.",
        preset: "error",
      });
      router.push("/account-hub");
      return;
    }
    const validPreferredTeamId =
      preferredTeamId && teams.some((team) => team.id === preferredTeamId)
        ? preferredTeamId
        : "";
    setCelebrateTeamId(
      validPreferredTeamId ||
        (workspaceFilter !== "all" ? workspaceFilter : activeTeamId ?? teams[0]?.id ?? ""),
    );
    setShowCelebrateModal(true);
    setCelebrateStep(1);
    setCelebrateMemberSearch("");
    setShowCelebrateWorkspaceMenu(false);
  }, [hasCelebrateAccess, workspaceFilter, activeTeamId, teams]);

  useActivityCelebrateFabListener(openCelebrate);

  useEffect(() => {
    if (routeParams.openCelebrate !== "1" || teams.length === 0) return;
    openCelebrate(
      typeof routeParams.teamId === "string" ? routeParams.teamId : undefined,
    );
    router.setParams({ openCelebrate: undefined, teamId: undefined });
  }, [routeParams.openCelebrate, routeParams.teamId, teams.length, openCelebrate]);

  useEffect(() => {
    if (!showCelebrateModal || !routeParams.targetUserId || teamMembers.length === 0) {
      return;
    }
    const member = teamMembers.find((row) => row.userId === routeParams.targetUserId);
    if (!member) return;
    setCelebrateTarget({
      id: member.userId,
      name: member.user.name,
      image: member.user.image,
    });
    setCelebrateStep(2);
    router.setParams({ targetUserId: undefined });
  }, [routeParams.targetUserId, showCelebrateModal, teamMembers]);

  const listRows = useMemo<FeedRow[]>(() => {
    const rows: FeedRow[] = [];
    if (feedItems.length === 0) {
      rows.push({ kind: "empty-filter" });
      return rows;
    }
    let firstItemId: string | null = null;
    for (const section of sections) {
      rows.push({ kind: "section", section });
      for (const entry of groupRepetitiveActivities(section.items)) {
        if (entry.type === "group") {
          rows.push({ kind: "group", group: entry, sectionGroup: section.group });
          if (!expandedGroupIds.has(entry.id)) continue;
          for (const groupedItem of entry.items) {
            if (!firstItemId) firstItemId = groupedItem.id;
            rows.push({
              kind: "item",
              item: groupedItem,
              sectionGroup: section.group,
              isFirstInFeed: groupedItem.id === firstItemId,
            });
          }
          continue;
        }
        const item = entry;
        if (!firstItemId) firstItemId = item.id;
        rows.push({
          kind: "item",
          item,
          sectionGroup: section.group,
          isFirstInFeed: item.id === firstItemId,
        });
      }
    }
    return rows;
  }, [feedItems.length, sections, expandedGroupIds]);

  const sortedCelebrateMembers = useMemo(
    () => sortCelebrateMembers(teamMembers as CelebrateTeamMember[]),
    [teamMembers],
  );
  const filteredCelebrateMembers = useMemo(
    () => filterCelebrateMembers(sortedCelebrateMembers, celebrateMemberSearch),
    [sortedCelebrateMembers, celebrateMemberSearch],
  );

  const closeCelebrateModal = () => {
    setShowCelebrateModal(false);
    setCelebrateStep(1);
    setCelebrateTarget(null);
    setCelebrateType(CELEBRATION_TYPE_KEYS[0]!);
    setCelebrateMessage("");
    setCelebrateMemberSearch("");
    setCelebrateTeamId("");
    setShowCelebrateWorkspaceMenu(false);
  };

  const celebrateMutation = useMutation({
    mutationFn: (payload: { targetUserId: string; celebrationType: string; message?: string }) =>
      api.post(`/api/teams/${celebrateTeamIdResolved}/activity/celebrate`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", "all"] });
      closeCelebrateModal();
    },
  });

  if (!activeTeamId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top"]}>
        <NoWorkspaceRedirect />
      </SafeAreaView>
    );
  }

  return (
    <CurvedTabLayout
      topInset={insets.top}
      title="Activity"
      subtitle="What's happening across your team"
      testID="activity-screen"
      headerTestID="activity-header"
      rightAction={
        <TouchableOpacity
          onPress={() => setShowWorkspaceFilterSheet(true)}
          testID="activity-header-filter"
          accessibilityLabel={`Filter activity. Current workspace: ${workspaceFilterLabel}`}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.16)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.24)",
          }}
        >
          <SlidersHorizontal size={17} color="#FFFFFF" strokeWidth={2.2} />
          {hasActiveFilters ? (
            <View
              style={{
                position: "absolute",
                right: 2,
                top: 2,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "#FBBF24",
                borderWidth: 1,
                borderColor: "#6D4AFF",
              }}
            />
          ) : null}
        </TouchableOpacity>
      }
      overlays={
        <>
      <AlenioBottomSheet
        visible={showWorkspaceFilterSheet}
        title="Filter activity"
        subtitle="Choose the updates and workspace you want to see"
        onClose={() => setShowWorkspaceFilterSheet(false)}
        compact
        footer={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                setActivityFilter("all");
                setWorkspaceFilter("all");
              }}
              style={[alenioSheetStyles.cancelButton, { flex: 1, paddingVertical: 6 }]}
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowWorkspaceFilterSheet(false)}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: "#4361EE",
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Done</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <Text
          style={{
            marginBottom: 6,
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 0.6,
            color: "#64748B",
            textTransform: "uppercase",
          }}
        >
          Activity type
        </Text>
        {ACTIVITY_FILTER_OPTIONS.map((option) => (
          <AlenioSheetOption
            key={option.key}
            compact
            icon={<Check size={14} color="white" strokeWidth={2.5} />}
            iconColor={activityFilter === option.key ? "#4361EE" : "#94A3B8"}
            title={option.label}
            onPress={() => setActivityFilter(option.key)}
          />
        ))}

        {teams.length > 1 ? (
          <Text
            style={{
              marginTop: 10,
              marginBottom: 6,
              fontSize: 10,
              fontWeight: "800",
              letterSpacing: 0.6,
              color: "#64748B",
              textTransform: "uppercase",
            }}
          >
            Workspace
          </Text>
        ) : null}
        <AlenioSheetOption
          compact
          icon={<Check size={14} color="white" strokeWidth={2.5} />}
          iconColor={workspaceFilter === "all" ? "#4361EE" : "#94A3B8"}
          title="All workspaces"
          subtitle="Combined timeline"
          onPress={() => {
            setWorkspaceFilter("all");
          }}
        />
        {teams.length > 1 ? teams.map((team) => (
          <AlenioSheetOption
            key={team.id}
            compact
            icon={<Check size={14} color="white" strokeWidth={2.5} />}
            iconColor={workspaceFilter === team.id ? "#4361EE" : "#94A3B8"}
            title={team.name}
            onPress={() => {
              setWorkspaceFilter(team.id);
            }}
          />
        )) : null}
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={showCelebrateModal}
        title={celebrateStep === 1 ? "Who to celebrate?" : `Celebrate ${celebrateTarget?.name ?? ""}`}
        subtitle={
          celebrateStep === 1
            ? "Pick a teammate for a shoutout"
            : "Choose a type and add a short message"
        }
        onClose={closeCelebrateModal}
        compact
        showCloseButton
        testID="celebrate-sheet"
        footer={
          celebrateStep === 1 ? (
            <TouchableOpacity
              onPress={closeCelebrateModal}
              style={[alenioSheetStyles.cancelButton, { paddingVertical: 4 }]}
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                testID="celebrate-submit"
                onPress={() => {
                  if (!celebrateTarget) return;
                  celebrateMutation.mutate({
                    targetUserId: celebrateTarget.id,
                    celebrationType: celebrateType,
                    message: celebrateMessage.trim(),
                  });
                }}
                disabled={celebrateMutation.isPending || !celebrateMessage.trim()}
                style={[
                  alenioSheetStyles.primaryButton,
                  !celebrateMessage.trim() || celebrateMutation.isPending
                    ? alenioSheetStyles.primaryButtonDisabled
                    : null,
                  { minHeight: 44, paddingVertical: 12, borderRadius: 12 },
                ]}
              >
                {celebrateMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={[alenioSheetStyles.primaryButtonText, { fontSize: 14 }]}>
                    Post Celebration
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCelebrateStep(1)}
                style={[alenioSheetStyles.cancelButton, { paddingVertical: 4 }]}
              >
                <Text style={alenioSheetStyles.cancelButtonText}>Back</Text>
              </TouchableOpacity>
            </>
          )
        }
      >
        {celebrateStep === 1 ? (
          <>
            {teams.length > 1 ? (
              <View>
                <Text style={[alenioSheetStyles.fieldLabel, { marginBottom: 6 }]}>Workspace</Text>
                <TouchableOpacity
                  onPress={() => setShowCelebrateWorkspaceMenu((open) => !open)}
                  activeOpacity={0.85}
                  testID="celebrate-workspace-dropdown"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: showCelebrateWorkspaceMenu ? "#4361EE" : "#E2E8F0",
                  }}
                >
                  <Building2 size={15} color="#64748B" strokeWidth={2.25} />
                  <Text
                    style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#0F172A" }}
                    numberOfLines={1}
                  >
                    {teams.find((t) => t.id === celebrateTeamIdResolved)?.name ?? "Select workspace"}
                  </Text>
                  <ChevronDown
                    size={16}
                    color="#94A3B8"
                    style={{ transform: [{ rotate: showCelebrateWorkspaceMenu ? "180deg" : "0deg" }] }}
                  />
                </TouchableOpacity>

                {showCelebrateWorkspaceMenu ? (
                  <View
                    style={{
                      marginTop: 6,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      backgroundColor: "#FFFFFF",
                      overflow: "hidden",
                    }}
                  >
                    {teams.map((team, index) => {
                      const selected = celebrateTeamIdResolved === team.id;
                      return (
                        <TouchableOpacity
                          key={team.id}
                          onPress={() => {
                            setCelebrateTeamId(team.id);
                            setCelebrateTarget(null);
                            setShowCelebrateWorkspaceMenu(false);
                          }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 11,
                            backgroundColor: selected ? "#EEF2FF" : "#FFFFFF",
                            borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                            borderTopColor: "#E2E8F0",
                          }}
                        >
                          <Text
                            style={{
                              flex: 1,
                              fontSize: 14,
                              fontWeight: selected ? "700" : "500",
                              color: selected ? "#4361EE" : "#334155",
                            }}
                            numberOfLines={1}
                          >
                            {team.name}
                          </Text>
                          {selected ? <Check size={16} color="#4361EE" strokeWidth={2.5} /> : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}

            <AlenioSheetCard tint="slate" compact>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Search size={16} color="#94A3B8" />
                <TextInput
                  value={celebrateMemberSearch}
                  onChangeText={setCelebrateMemberSearch}
                  placeholder="Search teammates"
                  placeholderTextColor="#94A3B8"
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  style={{ flex: 1, fontSize: 14, color: "#0F172A", paddingVertical: 0 }}
                  testID="celebrate-member-search"
                />
                {celebrateMemberSearch.length > 0 ? (
                  <TouchableOpacity onPress={() => setCelebrateMemberSearch("")} hitSlop={8}>
                    <X size={14} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </AlenioSheetCard>

            {teamMembersLoading ? (
              <View style={{ gap: 8, paddingVertical: 4 }} accessibilityLabel="Loading teammates">
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 14,
                      backgroundColor: "#FFFFFF",
                      borderWidth: 1,
                      borderColor: "#E6EAF0",
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#E2E8F0" }} />
                    <View
                      style={{
                        height: 12,
                        borderRadius: 999,
                        backgroundColor: "#E2E8F0",
                        width: i % 2 === 0 ? "55%" : "42%",
                      }}
                    />
                  </View>
                ))}
                <View style={{ alignItems: "center", paddingTop: 10, gap: 8 }}>
                  <ActivityIndicator color="#4361EE" />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B" }}>Loading teammates…</Text>
                </View>
              </View>
            ) : teamMembers.length === 0 ? (
              <AlenioSheetCard tint="slate" compact>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#334155", textAlign: "center" }}>
                  No teammates to celebrate yet
                </Text>
                <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center", marginTop: 4, lineHeight: 17 }}>
                  Add more team members first, then come back to post a celebration.
                </Text>
              </AlenioSheetCard>
            ) : filteredCelebrateMembers.length === 0 ? (
              <AlenioSheetCard tint="slate" compact>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#334155", textAlign: "center" }}>
                  No matches
                </Text>
              </AlenioSheetCard>
            ) : (
              filteredCelebrateMembers.map((m) => (
                <AlenioSheetOption
                  key={m.userId}
                  compact
                  testID={`celebrate-member-${m.userId}`}
                  iconColor="#4361EE"
                  icon={
                    <UserAvatar
                      user={m.user}
                      size={32}
                      radius={16}
                      backgroundColor="#4361EE"
                      textColor="#FFFFFF"
                      fontSize={13}
                    />
                  }
                  title={m.user.name}
                  onPress={() => {
                    setCelebrateTarget(m.user);
                    setShowCelebrateWorkspaceMenu(false);
                    setCelebrateStep(2);
                  }}
                />
              ))
            )}
          </>
        ) : (
          <>
            <View testID="celebrate-type-picker-wrap">
              <Text style={[alenioSheetStyles.fieldLabel, { marginBottom: 8 }]}>Celebration type</Text>
              <CelebrationTypePickerCards selected={celebrateType} onSelect={setCelebrateType} />
            </View>

            <AlenioSheetCard tint="slate" compact>
              <Text style={alenioSheetStyles.fieldLabel}>
                Message <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <TextInput
                testID="celebrate-message-input"
                value={celebrateMessage}
                onChangeText={setCelebrateMessage}
                placeholder={`Say something nice about ${celebrateTarget?.name ?? "them"}...`}
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={300}
                style={[
                  alenioSheetStyles.fieldInput,
                  {
                    minHeight: 72,
                    maxHeight: 120,
                    paddingVertical: 10,
                    fontSize: 14,
                    backgroundColor: "#FFFFFF",
                  },
                ]}
              />
            </AlenioSheetCard>
          </>
        )}
      </AlenioBottomSheet>
        </>
      }
    >
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} testID="loading-indicator">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }} testID="error-state">
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#64748B", textAlign: "center" }}>
            Couldn&apos;t load activity
          </Text>
          <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 8, textAlign: "center" }}>
            {error instanceof Error ? error.message : "Please try again."}
          </Text>
          <TouchableOpacity
            onPress={() => void refetch()}
            style={{
              marginTop: 16,
              backgroundColor: "#4361EE",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1, paddingTop: 28 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 4,
              marginBottom: 4,
            }}
          >
            {ACTIVITY_FILTER_OPTIONS.map((option) => {
              const selected = activityFilter === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setActivityFilter(option.key)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 24,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 2,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: selected ? "#4361EE" : "#F1F5F9",
                  }}
                >
                  <Text
                    style={{ fontSize: 9, lineHeight: 12, fontWeight: "600", color: selected ? "#FFFFFF" : "#64748B" }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {workspaceFilteredActivities.length === 0 ? (
            <View
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}
              testID="empty-state"
            >
              <Activity size={48} color="#CBD5E1" />
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#94A3B8", marginTop: 12, textAlign: "center" }}>
                No activity yet
              </Text>
              <Text style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4, textAlign: "center", lineHeight: 16 }}>
                Team events like completed tasks and new members will appear here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={listRows}
              keyExtractor={(row) => {
                if (row.kind === "empty-filter") return "empty-filter";
                if (row.kind === "section") return `section-${row.section.group}`;
                if (row.kind === "group") return row.group.id;
                return `item-${row.item.id}`;
              }}
              extraData={authReady?.me?.image ?? null}
              initialNumToRender={12}
              windowSize={8}
              removeClippedSubviews={false}
              renderItem={({ item: row, index }) => {
                if (row.kind === "empty-filter") {
                  return (
                    <View style={{ alignItems: "center", paddingHorizontal: 32, paddingVertical: 40 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748B", textAlign: "center" }}>
                        No matching activity
                      </Text>
                      <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 6, textAlign: "center", lineHeight: 18 }}>
                        Try another filter to see more updates.
                      </Text>
                    </View>
                  );
                }
                if (row.kind === "section") {
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: index === 0 ? 4 : 16,
                        marginBottom: 4,
                        paddingHorizontal: 14,
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: "#94A3B8",
                          letterSpacing: 0.6,
                          textTransform: "uppercase",
                        }}
                      >
                        {row.section.label}
                      </Text>
                      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#E2E8F0" }} />
                    </View>
                  );
                }
                if (row.kind === "group") {
                  const expanded = expandedGroupIds.has(row.group.id);
                  return (
                    <GroupedActivityRow
                      group={row.group}
                      expanded={expanded}
                      onToggle={() =>
                        setExpandedGroupIds((current) => {
                          const next = new Set(current);
                          if (next.has(row.group.id)) next.delete(row.group.id);
                          else next.add(row.group.id);
                          return next;
                        })
                      }
                    />
                  );
                }
                return (
                  <FeedItemCard
                    item={row.item}
                    currentUserId={currentUserId}
                    canDeleteCelebration={
                      row.item.actor?.id === currentUserId ||
                      teams.find((t) => t.id === row.item.teamId)?.role === "owner" ||
                      teams.find((t) => t.id === row.item.teamId)?.role === "admin"
                    }
                    showPicker={openPickerId === row.item.id}
                    onOpenPicker={() => setOpenPickerId(row.item.id)}
                    onClosePicker={() => setOpenPickerId(null)}
                    showHint={row.isFirstInFeed && showReactionHint ? true : false}
                    showWorkspaceLabel={showWorkspaceLabels}
                  />
                );
              }}
              onRefresh={refetch}
              refreshing={isLoading}
              contentContainerStyle={{
                paddingTop: 0,
                paddingBottom: tabBarClearance(insets.bottom) + SENECA_FAB_SIZE + SENECA_FAB_VISIBLE_SIZE + 24,
              }}
              showsVerticalScrollIndicator={false}
              testID="activity-list"
            />
          )}
        </View>
      )}
    </CurvedTabLayout>
  );
}
