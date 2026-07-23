import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Image,
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
  Plus,
} from "lucide-react-native";
import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "@/lib/auth/use-session";
import { NoWorkspaceRedirect } from "@/components/NoWorkspaceRedirect";
import { ProFeatureLockedView } from "@/components/ProFeatureLockedView";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { tabBarClearance, SENECA_FAB_SIZE, SENECA_FAB_RIGHT_INSET } from "@/lib/tab-bar";
import { AppTabHeader } from "@/components/AppTabHeader";
import type { Team } from "@/lib/types";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { hasWorkspaceTaskAccess } from "@/lib/plan-access-copy";
import {
  ActivityIntroHeader,
  ActivityFeedCard,
  CelebrationTypePickerCards,
  CelebrationDeleteModal,
  CELEBRATION_TYPE_KEYS,
  mapApiActivityToFeedItem,
  matchesActivityFilter,
  groupActivitiesByDate,
  type ActivityApiEvent,
  type ActivityDateSection,
  type ActivityFeedItem,
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
            tone={item.type === "celebration" ? "onDark" : "default"}
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
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id;
  const persistedPlan = useSubscriptionStore((s) => s.plan);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
  });

  const { data: subscription, isFetched: subscriptionFetched } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () =>
      api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
        `/api/teams/${activeTeamId}/subscription`,
      ),
    enabled: !!activeTeamId,
  });
  const hasActivityAccess = hasWorkspaceTaskAccess(subscription, persistedPlan);

  const [showReactionHint, setShowReactionHint] = useState(false);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [showWorkspaceFilterSheet, setShowWorkspaceFilterSheet] = useState(false);

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
    refetchOnMount: false,
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
        .filter((item) => matchesActivityFilter(item.type, activityFilter)),
    [workspaceFilteredActivities, activityFilter],
  );

  const sections = useMemo(() => groupActivitiesByDate(feedItems), [feedItems]);
  const workspaceFilterLabel =
    workspaceFilter === "all"
      ? "All workspaces"
      : teams.find((t) => t.id === workspaceFilter)?.name ?? "Workspace";
  const showWorkspaceLabels = workspaceFilter === "all" && teams.length > 1;

  const openCelebrate = () => {
    setCelebrateTeamId(workspaceFilter !== "all" ? workspaceFilter : activeTeamId ?? teams[0]?.id ?? "");
    setShowCelebrateModal(true);
    setCelebrateStep(1);
    setCelebrateMemberSearch("");
    setShowCelebrateWorkspaceMenu(false);
  };

  const listRows = useMemo<FeedRow[]>(() => {
    const rows: FeedRow[] = [];
    if (feedItems.length === 0) {
      rows.push({ kind: "empty-filter" });
      return rows;
    }
    let firstItemId: string | null = null;
    for (const section of sections) {
      rows.push({ kind: "section", section });
      for (const item of section.items) {
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
  }, [feedItems.length, sections]);

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

  if (!hasActivityAccess && !subscriptionFetched) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }} edges={["top"]}>
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  if (!hasActivityAccess && subscriptionFetched) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top"]} testID="activity-paywall-screen">
        <ProFeatureLockedView
          title="Pro plan required"
          body="Activity is included with the Pro plan. View what is included in Workplace Access."
          testID="activity-paywall"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={[]} testID="activity-screen">
      <AppTabHeader
        topInset={insets.top}
        testID="activity-header"
        rightAction={
          teams.length > 1 ? (
            <TouchableOpacity
              onPress={() => setShowWorkspaceFilterSheet(true)}
              testID="activity-intro-header-workspace-filter"
              accessibilityLabel={workspaceFilterLabel}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                maxWidth: 160,
                backgroundColor: "rgba(255,255,255,0.2)",
                borderRadius: 16,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Building2 size={13} color="white" strokeWidth={2.25} />
              <Text style={{ flexShrink: 1, color: "white", fontSize: 12, fontWeight: "700" }} numberOfLines={1}>
                {workspaceFilterLabel}
              </Text>
              <ChevronDown size={14} color="white" />
            </TouchableOpacity>
          ) : null
        }
      />

      <AlenioBottomSheet
        visible={showWorkspaceFilterSheet}
        title="Workspace"
        subtitle="Filter activity by workspace"
        onClose={() => setShowWorkspaceFilterSheet(false)}
        compact
        footer={
          <TouchableOpacity
            onPress={() => setShowWorkspaceFilterSheet(false)}
            style={[alenioSheetStyles.cancelButton, { paddingVertical: 4 }]}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        }
      >
        <AlenioSheetOption
          compact
          icon={<Check size={14} color="white" strokeWidth={2.5} />}
          iconColor={workspaceFilter === "all" ? "#4361EE" : "#94A3B8"}
          title="All workspaces"
          subtitle="Combined timeline"
          onPress={() => {
            setWorkspaceFilter("all");
            setShowWorkspaceFilterSheet(false);
          }}
        />
        {teams.map((team) => (
          <AlenioSheetOption
            key={team.id}
            compact
            icon={<Check size={14} color="white" strokeWidth={2.5} />}
            iconColor={workspaceFilter === team.id ? "#4361EE" : "#94A3B8"}
            title={team.name}
            onPress={() => {
              setWorkspaceFilter(team.id);
              setShowWorkspaceFilterSheet(false);
            }}
          />
        ))}
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
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <ActivityIndicator color="#4361EE" />
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
                    m.user.image ? (
                      <Image source={{ uri: m.user.image }} style={{ width: 32, height: 32 }} />
                    ) : (
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>
                        {m.user.name[0]?.toUpperCase()}
                      </Text>
                    )
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

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} testID="loading-indicator">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }} testID="error-state">
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#64748B", textAlign: "center" }}>
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
        <View style={{ flex: 1 }}>
          <ActivityIntroHeader
            filter={activityFilter}
            onSelectFilter={setActivityFilter}
            onPressFilterIcon={
              teams.length > 1 ? () => setShowWorkspaceFilterSheet(true) : undefined
            }
          />

          {workspaceFilteredActivities.length === 0 ? (
            <View
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}
              testID="empty-state"
            >
              <Activity size={48} color="#CBD5E1" />
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#94A3B8", marginTop: 16, textAlign: "center" }}>
                No activity yet
              </Text>
              <Text style={{ fontSize: 14, color: "#CBD5E1", marginTop: 6, textAlign: "center", lineHeight: 20 }}>
                Team events like completed tasks and new members will appear here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={listRows}
              keyExtractor={(row, index) => {
                if (row.kind === "empty-filter") return "empty-filter";
                if (row.kind === "section") return `section-${row.section.group}`;
                return `item-${row.item.id}-${index}`;
              }}
              renderItem={({ item: row, index }) => {
                if (row.kind === "empty-filter") {
                  return (
                    <View style={{ alignItems: "center", paddingHorizontal: 32, paddingVertical: 40 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#64748B", textAlign: "center" }}>
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
                        marginTop: index === 0 ? 4 : 8,
                        marginBottom: 1,
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
                    showHint={row.isFirstInFeed && showReactionHint}
                    showWorkspaceLabel={showWorkspaceLabels}
                  />
                );
              }}
              onRefresh={refetch}
              refreshing={isLoading}
              contentContainerStyle={{
                paddingTop: 0,
                paddingBottom: tabBarClearance(insets.bottom) + SENECA_FAB_SIZE * 2 + 24,
              }}
              showsVerticalScrollIndicator={false}
              testID="activity-list"
            />
          )}

          <TouchableOpacity
            testID="celebrate-button"
            onPress={openCelebrate}
            accessibilityLabel="Celebrate"
            activeOpacity={0.9}
            style={{
              position: "absolute",
              right: SENECA_FAB_RIGHT_INSET,
              // Sit above the global Seneca FAB so the two don't overlap
              bottom: tabBarClearance(insets.bottom, 12) + SENECA_FAB_SIZE + 10,
              width: SENECA_FAB_SIZE,
              height: SENECA_FAB_SIZE,
              borderRadius: SENECA_FAB_SIZE / 2,
              backgroundColor: "#4361EE",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#1E293B",
              shadowOpacity: 0.2,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
              zIndex: 20,
            }}
          >
            <Plus size={28} color="white" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
