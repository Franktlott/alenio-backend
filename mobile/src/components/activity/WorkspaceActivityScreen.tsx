import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  Check,
  CircleUserRound,
  ClipboardList,
  Clock3,
  Medal,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import {
  useTabBarClearanceFn,
  SENECA_FAB_VISIBLE_SIZE,
  WORKSPACE_CARD_BOTTOM_GAP,
} from "@/lib/tab-bar";
import { CurvedTabLayout } from "@/components/CurvedTabLayout";
import { UserAvatar } from "@/components/UserAvatar";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import {
  ActivityFeedCard,
  GroupedActivityRow,
  CelebrationTypePickerCards,
  CelebrationDeleteModal,
  CELEBRATION_TYPE_KEYS,
  mapApiActivityToFeedItem,
  groupRepetitiveActivities,
  groupActivitiesByDate,
  type ActivityApiEvent,
  type ActivityDateSection,
  type ActivityFeedItem,
  type ActivityFeedGroup,
  type CelebrationTypeKey,
} from "@/components/activity";
import { ActivityReactionRow } from "@/components/activity/ActivityReactionRow";
import { HEADER_LIGHT_ICON_COLOR } from "@/lib/header-brand";

const REACTION_HINT_KEY = "reaction_hint_shown";

type CelebrateTeamMember = {
  userId: string;
  user: { id: string; name: string; image: string | null };
};

type WorkspaceActivityTeam = Pick<Team, "id" | "name" | "image" | "role"> & {
  members?: CelebrateTeamMember[];
};

type FeedRow =
  | { kind: "section"; section: ActivityDateSection }
  | { kind: "item"; item: ActivityFeedItem; isFirstInFeed: boolean }
  | { kind: "group"; group: ActivityFeedGroup }
  | { kind: "empty-filter" };

type ActivityShowFilter =
  | "tasks"
  | "calendar"
  | "team"
  | "recognition"
  | "milestones";
type ActivityPeopleFilter = "everyone" | "mine";
type ActivityTimeFilter = "anytime" | "today" | "week" | "30days";

type AppliedActivityFilters = {
  show: ActivityShowFilter[];
  people: ActivityPeopleFilter;
  time: ActivityTimeFilter;
};

const DEFAULT_ACTIVITY_FILTERS: AppliedActivityFilters = {
  show: [],
  people: "everyone",
  time: "anytime",
};

const SHOW_FILTER_OPTIONS = [
  { key: "tasks", label: "Tasks", Icon: ClipboardList },
  { key: "calendar", label: "Calendar", Icon: CalendarDays },
  { key: "team", label: "Team changes", Icon: Users },
  { key: "recognition", label: "Recognition", Icon: Star },
  { key: "milestones", label: "Milestones", Icon: Medal },
] as const;

const PEOPLE_FILTER_OPTIONS = [
  { key: "everyone", label: "Everyone", Icon: Users },
  { key: "mine", label: "My activity", Icon: CircleUserRound },
] as const;

const TIME_FILTER_OPTIONS = [
  { key: "anytime", label: "Anytime", Icon: Clock3 },
  { key: "today", label: "Today", Icon: CalendarDays },
  { key: "week", label: "This week", Icon: CalendarRange },
  { key: "30days", label: "Last 30 days", Icon: CalendarRange },
] as const;

function matchesShowFilters(
  type: ActivityFeedItem["type"],
  filters: ActivityShowFilter[],
): boolean {
  if (filters.length === 0) return true;
  return filters.some((filter) => {
    if (filter === "tasks") {
      return type === "task_completed" || type === "task_assigned";
    }
    if (filter === "calendar") return type === "calendar_event_added";
    if (filter === "team") {
      return type === "member_joined" || type === "member_removed";
    }
    if (filter === "recognition") return type === "celebration";
    return type === "task_milestone" || type === "personal_best";
  });
}

function matchesTimeFilter(
  timestamp: string,
  filter: ActivityTimeFilter,
): boolean {
  if (filter === "anytime") return true;
  const date = new Date(timestamp);
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (filter === "week") start.setDate(start.getDate() - 6);
  if (filter === "30days") start.setDate(start.getDate() - 29);
  return date >= start;
}

function ActivityFilterTile({
  label,
  Icon,
  selected,
  onPress,
  testID,
}: {
  label: string;
  Icon: typeof Users;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterTile,
        selected ? styles.filterTileSelected : null,
        pressed ? { opacity: 0.72 } : null,
      ]}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Icon
        size={15}
        color={selected ? "#6547E8" : "#7B879D"}
        strokeWidth={2}
      />
      <Text
        style={[
          styles.filterTileText,
          selected ? styles.filterTileTextSelected : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected ? (
        <View style={styles.filterTileCheck}>
          <Check size={9} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

type WorkspaceActivityScreenProps = {
  teamId?: string;
  embedded?: boolean;
};

function WorkspaceActivityLayout({
  embedded,
  topInset,
  title,
  filterActive,
  onOpenFilter,
  overlays,
  children,
}: {
  embedded: boolean;
  topInset: number;
  title: string;
  filterActive: boolean;
  onOpenFilter: () => void;
  overlays: ReactNode;
  children: ReactNode;
}) {
  if (embedded) {
    return (
      <View style={styles.embeddedScreen} testID="workspace-activity-embedded">
        <View style={styles.embeddedToolbar}>
          <Text style={styles.embeddedTitle}>Workspace activity</Text>
          <View style={styles.embeddedActions}>
            <Pressable
              onPress={onOpenFilter}
              style={styles.embeddedAction}
              testID="workspace-feed-filter"
              accessibilityRole="button"
              accessibilityLabel="Filter workspace activity"
            >
              <View>
                <SlidersHorizontal size={14} color="#6547E8" strokeWidth={2.2} />
                {filterActive ? <View style={styles.embeddedFilterDot} /> : null}
              </View>
              <Text style={styles.embeddedActionText}>Filter</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.embeddedFeed}>{children}</View>
        {overlays}
      </View>
    );
  }

  return (
    <CurvedTabLayout
      topInset={topInset}
      title={title}
      testID="workspace-activity-screen"
      headerTestID="workspace-activity-header"
      leftAction={
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(app)/execute");
            }
          }}
          testID="workspace-activity-back"
          accessibilityRole="button"
          accessibilityLabel="Back to workspace"
          style={styles.headerAction}
        >
          <ArrowLeft size={19} color={HEADER_LIGHT_ICON_COLOR} strokeWidth={2.2} />
        </Pressable>
      }
      rightAction={
        <Pressable
          onPress={onOpenFilter}
          testID="workspace-activity-filter"
          accessibilityLabel="Filter workspace activity"
          style={styles.headerAction}
        >
          <SlidersHorizontal
            size={17}
            color={HEADER_LIGHT_ICON_COLOR}
            strokeWidth={2.2}
          />
          {filterActive ? <View style={styles.filterDot} /> : null}
        </Pressable>
      }
      overlays={overlays}
    >
      {children}
    </CurvedTabLayout>
  );
}

function sortCelebrateMembers(members: CelebrateTeamMember[]): CelebrateTeamMember[] {
  return [...members].sort((a, b) =>
    a.user.name.localeCompare(b.user.name, undefined, { sensitivity: "base" }),
  );
}

function filterCelebrateMembers(
  members: CelebrateTeamMember[],
  query: string,
): CelebrateTeamMember[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return members;
  return members.filter((member) =>
    member.user.name.toLowerCase().includes(normalized),
  );
}

function WorkspaceFeedItem({
  item,
  workspaceTeamId,
  currentUserId,
  canManageWorkspace,
  showPicker,
  showHint,
  onOpenPicker,
  onClosePicker,
}: {
  item: ActivityFeedItem;
  workspaceTeamId: string;
  currentUserId: string | undefined;
  canManageWorkspace: boolean;
  showPicker: boolean;
  showHint: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
}) {
  const queryClient = useQueryClient();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const canDelete =
    item.type === "celebration" &&
    (item.actor?.id === currentUserId || canManageWorkspace);

  const invalidateActivity = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["team-activity", workspaceTeamId],
    });
  };

  const reactionMutation = useMutation({
    mutationFn: (emoji: string) =>
      api.post(
        `/api/teams/${workspaceTeamId}/activity/${item.id}/react`,
        { emoji },
      ),
    onSuccess: async () => {
      await invalidateActivity();
      onClosePicker();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.delete(`/api/teams/${workspaceTeamId}/activity/${item.id}`),
    onSuccess: async () => {
      setShowDeleteModal(false);
      await invalidateActivity();
      onClosePicker();
    },
  });

  return (
    <View>
      <ActivityFeedCard
        item={item}
        onLongPress={onOpenPicker}
        footer={
          <ActivityReactionRow
            activityId={item.id}
            reactions={item.reactions ?? {}}
            currentUserId={currentUserId}
            onToggleReaction={(emoji) => reactionMutation.mutate(emoji)}
            showPicker={showPicker}
            onClosePicker={onClosePicker}
            tone="default"
            canDelete={canDelete}
            onDelete={
              canDelete
                ? () => {
                    onClosePicker();
                    setShowDeleteModal(true);
                  }
                : undefined
            }
          />
        }
      />
      {showHint ? (
        <Text style={styles.reactionHint}>Long press to react</Text>
      ) : null}
      <CelebrationDeleteModal
        visible={showDeleteModal}
        celebrationType={item.metadata.celebrationType}
        targetName={item.metadata.targetName}
        isDeleting={deleteMutation.isPending}
        onCancel={() => {
          if (!deleteMutation.isPending) setShowDeleteModal(false);
        }}
        onConfirm={() => deleteMutation.mutate()}
      />
    </View>
  );
}

export function WorkspaceActivityScreen({
  teamId,
  embedded = false,
}: WorkspaceActivityScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearanceFn();
  const queryClient = useQueryClient();
  const routeParams = useLocalSearchParams<{
    teamId?: string;
    openCelebrate?: string;
    targetUserId?: string;
  }>();
  const workspaceTeamId =
    teamId ?? (typeof routeParams.teamId === "string" ? routeParams.teamId : "");
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const currentUserId = authReady?.me?.id ?? session?.user?.id;

  const [activityFilters, setActivityFilters] =
    useState<AppliedActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
  const [draftFilters, setDraftFilters] =
    useState<AppliedActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [showReactionHint, setShowReactionHint] = useState(false);
  const reactionHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [celebrateOpen, setCelebrateOpen] = useState(false);
  const [celebrateStep, setCelebrateStep] = useState<1 | 2>(1);
  const [celebrateTarget, setCelebrateTarget] = useState<{
    id: string;
    name: string;
    image: string | null;
  } | null>(null);
  const [celebrateType, setCelebrateType] = useState<CelebrationTypeKey>(
    CELEBRATION_TYPE_KEYS[0]!,
  );
  const [celebrateMessage, setCelebrateMessage] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  const teamQuery = useQuery({
    queryKey: ["team", workspaceTeamId],
    queryFn: () =>
      api.get<WorkspaceActivityTeam>(`/api/teams/${workspaceTeamId}`),
    enabled: !!workspaceTeamId,
  });
  const workspace = teamQuery.data;
  const canManageWorkspace =
    workspace?.role === "owner" || workspace?.role === "team_leader";

  const activityQuery = useQuery({
    queryKey: ["team-activity", workspaceTeamId],
    queryFn: () =>
      api.get<ActivityApiEvent[]>(
        `/api/teams/${workspaceTeamId}/activity`,
      ),
    enabled: !!workspaceTeamId,
    refetchInterval: 15_000,
    refetchOnMount: "always",
  });

  const teamMembers = useMemo(
    () =>
      (workspace?.members ?? []).filter(
        (member) => member.userId !== currentUserId,
      ),
    [currentUserId, workspace?.members],
  );
  const filteredMembers = useMemo(
    () =>
      filterCelebrateMembers(
        sortCelebrateMembers(teamMembers),
        memberSearch,
      ),
    [memberSearch, teamMembers],
  );

  const feedItems = useMemo(
    () =>
      (activityQuery.data ?? [])
        .map(mapApiActivityToFeedItem)
        .map((item): ActivityFeedItem => {
          const actor = item.actor;
          const currentUser = authReady?.me;
          if (!actor || !currentUser || actor.id !== currentUser.id) return item;
          return {
            ...item,
            actor: {
              ...actor,
              name: currentUser.name || actor.name,
              image: currentUser.image ?? actor.image,
            },
          };
        })
        .filter((item) =>
          matchesShowFilters(item.type, activityFilters.show),
        )
        .filter(
          (item) =>
            activityFilters.people === "everyone" ||
            item.actor?.id === currentUserId,
        )
        .filter((item) =>
          matchesTimeFilter(item.timestamp, activityFilters.time),
        ),
    [activityFilters, activityQuery.data, authReady?.me, currentUserId],
  );

  const sections = useMemo(
    () => groupActivitiesByDate(feedItems),
    [feedItems],
  );
  const rows = useMemo<FeedRow[]>(() => {
    if (feedItems.length === 0) return [{ kind: "empty-filter" }];
    const next: FeedRow[] = [];
    let firstItemId: string | null = null;
    for (const section of sections) {
      next.push({ kind: "section", section });
      for (const entry of groupRepetitiveActivities(section.items)) {
        if (entry.type === "group") {
          next.push({ kind: "group", group: entry });
          if (!expandedGroupIds.has(entry.id)) continue;
          for (const item of entry.items) {
            if (!firstItemId) firstItemId = item.id;
            next.push({
              kind: "item",
              item,
              isFirstInFeed: item.id === firstItemId,
            });
          }
        } else {
          if (!firstItemId) firstItemId = entry.id;
          next.push({
            kind: "item",
            item: entry,
            isFirstInFeed: entry.id === firstItemId,
          });
        }
      }
    }
    return next;
  }, [expandedGroupIds, feedItems.length, sections]);

  useEffect(() => {
    void AsyncStorage.getItem(REACTION_HINT_KEY).then((value) => {
      if (value !== "1") setShowReactionHint(true);
    });
    return () => {
      if (reactionHintTimer.current) clearTimeout(reactionHintTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!showReactionHint) return;
    reactionHintTimer.current = setTimeout(() => {
      setShowReactionHint(false);
      void AsyncStorage.setItem(REACTION_HINT_KEY, "1");
    }, 4_000);
  }, [showReactionHint]);

  useEffect(() => {
    if (!openPickerId) return;
    const timer = setTimeout(() => setOpenPickerId(null), 10_000);
    return () => clearTimeout(timer);
  }, [openPickerId]);

  const closeCelebrate = useCallback(() => {
    setCelebrateOpen(false);
    setCelebrateStep(1);
    setCelebrateTarget(null);
    setCelebrateType(CELEBRATION_TYPE_KEYS[0]!);
    setCelebrateMessage("");
    setMemberSearch("");
  }, []);

  const openCelebrate = useCallback(() => {
    router.push({
      pathname: "/recognition-hub",
      params: { openGive: "1" },
    });
  }, []);


  useEffect(() => {
    if (
      routeParams.openCelebrate !== "1" ||
      !workspaceTeamId
    ) {
      return;
    }
    openCelebrate();
    router.setParams({ openCelebrate: undefined });
  }, [
    openCelebrate,
    routeParams.openCelebrate,
    workspaceTeamId,
  ]);

  useEffect(() => {
    if (
      embedded ||
      !celebrateOpen ||
      !routeParams.targetUserId ||
      teamMembers.length === 0
    ) {
      return;
    }
    const member = teamMembers.find(
      (candidate) => candidate.userId === routeParams.targetUserId,
    );
    if (!member) return;
    setCelebrateTarget(member.user);
    setCelebrateStep(2);
    router.setParams({ targetUserId: undefined });
  }, [
    celebrateOpen,
    embedded,
    routeParams.targetUserId,
    teamMembers,
  ]);

  const celebrateMutation = useMutation({
    mutationFn: (payload: {
      targetUserId: string;
      celebrationType: string;
      message: string;
    }) =>
      api.post(
        `/api/teams/${workspaceTeamId}/activity/celebrate`,
        payload,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["team-activity", workspaceTeamId],
      });
      closeCelebrate();
    },
  });

  const hasActiveFilters =
    activityFilters.show.length > 0 ||
    activityFilters.people !== "everyone" ||
    activityFilters.time !== "anytime";

  const openFilterSheet = () => {
    setDraftFilters({
      ...activityFilters,
      show: [...activityFilters.show],
    });
    setFilterSheetOpen(true);
  };

  const toggleDraftShowFilter = (filter: ActivityShowFilter) => {
    setDraftFilters((current) => ({
      ...current,
      show: current.show.includes(filter)
        ? current.show.filter((value) => value !== filter)
        : [...current.show, filter],
    }));
  };

  return (
    <WorkspaceActivityLayout
      embedded={embedded}
      topInset={insets.top}
      title={workspace?.name ? `${workspace.name} activity` : "Workspace activity"}
      filterActive={hasActiveFilters}
      onOpenFilter={openFilterSheet}
      overlays={
        <>
          <AlenioBottomSheet
            visible={filterSheetOpen}
            title="Filter activity"
            subtitle="Choose which workspace updates to show"
            onClose={() => setFilterSheetOpen(false)}
            compact
            bodyHeightRatio={0.55}
            footer={
              <View style={styles.filterApplyRow}>
                <Pressable
                  onPress={() => setDraftFilters(DEFAULT_ACTIVITY_FILTERS)}
                  style={styles.filterResetButton}
                  testID="workspace-activity-filter-clear"
                >
                  <Text style={styles.filterResetText}>Reset</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setActivityFilters({
                      ...draftFilters,
                      show: [...draftFilters.show],
                    });
                    setFilterSheetOpen(false);
                  }}
                  style={styles.filterApplyButton}
                  testID="workspace-activity-filter-done"
                >
                  <Text style={styles.filterApplyText}>Apply filters</Text>
                </Pressable>
              </View>
            }
          >
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionLabel}>Show</Text>
              <View style={styles.filterGrid}>
                <ActivityFilterTile
                  label="All activity"
                  Icon={SlidersHorizontal}
                  selected={draftFilters.show.length === 0}
                  onPress={() =>
                    setDraftFilters((current) => ({ ...current, show: [] }))
                  }
                  testID="workspace-activity-filter-all"
                />
                {SHOW_FILTER_OPTIONS.map((option) => (
                  <ActivityFilterTile
                    key={option.key}
                    label={option.label}
                    Icon={option.Icon}
                    selected={draftFilters.show.includes(option.key)}
                    onPress={() => toggleDraftShowFilter(option.key)}
                    testID={`workspace-activity-filter-${option.key}`}
                  />
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionLabel}>People</Text>
              <View style={styles.filterGrid}>
                {PEOPLE_FILTER_OPTIONS.map((option) => (
                  <ActivityFilterTile
                    key={option.key}
                    label={option.label}
                    Icon={option.Icon}
                    selected={draftFilters.people === option.key}
                    onPress={() =>
                      setDraftFilters((current) => ({
                        ...current,
                        people: option.key,
                      }))
                    }
                    testID={`workspace-activity-filter-people-${option.key}`}
                  />
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionLabel}>Time</Text>
              <View style={styles.filterGrid}>
                {TIME_FILTER_OPTIONS.map((option) => (
                  <ActivityFilterTile
                    key={option.key}
                    label={option.label}
                    Icon={option.Icon}
                    selected={draftFilters.time === option.key}
                    onPress={() =>
                      setDraftFilters((current) => ({
                        ...current,
                        time: option.key,
                      }))
                    }
                    testID={`workspace-activity-filter-time-${option.key}`}
                  />
                ))}
              </View>
            </View>
          </AlenioBottomSheet>

          <AlenioBottomSheet
            visible={celebrateOpen}
            title={
              celebrateStep === 1
                ? "Who to celebrate?"
                : `Celebrate ${celebrateTarget?.name ?? ""}`
            }
            subtitle={
              celebrateStep === 1
                ? `Pick a teammate from ${workspace?.name ?? "this workspace"}`
                : "Choose a type and add a short message"
            }
            onClose={closeCelebrate}
            compact
            showCloseButton
            testID="celebrate-sheet"
            footer={
              celebrateStep === 1 ? (
                <Pressable
                  onPress={closeCelebrate}
                  style={[
                    alenioSheetStyles.cancelButton,
                    { paddingVertical: 4 },
                  ]}
                  testID="celebrate-cancel"
                >
                  <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    testID="celebrate-submit"
                    onPress={() => {
                      if (!celebrateTarget) return;
                      celebrateMutation.mutate({
                        targetUserId: celebrateTarget.id,
                        celebrationType: celebrateType,
                        message: celebrateMessage.trim(),
                      });
                    }}
                    disabled={
                      celebrateMutation.isPending ||
                      !celebrateMessage.trim()
                    }
                    style={[
                      alenioSheetStyles.primaryButton,
                      !celebrateMessage.trim() ||
                      celebrateMutation.isPending
                        ? alenioSheetStyles.primaryButtonDisabled
                        : null,
                    ]}
                  >
                    {celebrateMutation.isPending ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={alenioSheetStyles.primaryButtonText}>
                        Post Celebration
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => setCelebrateStep(1)}
                    style={alenioSheetStyles.cancelButton}
                    testID="celebrate-back"
                  >
                    <Text style={alenioSheetStyles.cancelButtonText}>Back</Text>
                  </Pressable>
                </>
              )
            }
          >
            {celebrateStep === 1 ? (
              <>
                <AlenioSheetCard tint="slate" compact>
                  <View style={styles.searchRow}>
                    <Search size={16} color="#94A3B8" />
                    <TextInput
                      value={memberSearch}
                      onChangeText={setMemberSearch}
                      placeholder="Search teammates"
                      placeholderTextColor="#94A3B8"
                      autoCorrect={false}
                      autoCapitalize="none"
                      style={styles.searchInput}
                      testID="celebrate-member-search"
                    />
                    {memberSearch ? (
                      <Pressable
                        onPress={() => setMemberSearch("")}
                        hitSlop={8}
                        testID="celebrate-member-search-clear"
                      >
                        <X size={14} color="#94A3B8" />
                      </Pressable>
                    ) : null}
                  </View>
                </AlenioSheetCard>
                {teamQuery.isLoading ? (
                  <ActivityIndicator
                    color="#4361EE"
                    testID="celebrate-members-loading"
                  />
                ) : filteredMembers.length === 0 ? (
                  <AlenioSheetCard tint="slate" compact>
                    <Text style={styles.emptySheetText}>
                      {teamMembers.length === 0
                        ? "No teammates to celebrate yet"
                        : "No matching teammates"}
                    </Text>
                  </AlenioSheetCard>
                ) : (
                  filteredMembers.map((member) => (
                    <AlenioSheetOption
                      key={member.userId}
                      compact
                      testID={`celebrate-member-${member.userId}`}
                      iconColor="#4361EE"
                      icon={
                        <UserAvatar
                          user={member.user}
                          size={32}
                          radius={16}
                          backgroundColor="#4361EE"
                          textColor="#FFFFFF"
                          fontSize={13}
                        />
                      }
                      title={member.user.name}
                      onPress={() => {
                        setCelebrateTarget(member.user);
                        setCelebrateStep(2);
                      }}
                    />
                  ))
                )}
              </>
            ) : (
              <>
                <View testID="celebrate-type-picker-wrap">
                  <Text
                    style={[
                      alenioSheetStyles.fieldLabel,
                      { marginBottom: 8 },
                    ]}
                  >
                    Celebration type
                  </Text>
                  <CelebrationTypePickerCards
                    selected={celebrateType}
                    onSelect={setCelebrateType}
                  />
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
                      styles.messageInput,
                    ]}
                  />
                </AlenioSheetCard>
              </>
            )}
          </AlenioBottomSheet>
        </>
      }
    >
      {activityQuery.isLoading ? (
        <View style={styles.centered} testID="workspace-activity-loading">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : activityQuery.isError ? (
        <View style={styles.centered} testID="workspace-activity-error">
          <Text style={styles.errorTitle}>Couldn&apos;t load activity</Text>
          <Text style={styles.errorBody}>
            {activityQuery.error instanceof Error
              ? activityQuery.error.message
              : "Please try again."}
          </Text>
          <Pressable
            onPress={() => void activityQuery.refetch()}
            style={styles.retryButton}
            testID="workspace-activity-retry"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (activityQuery.data ?? []).length === 0 ? (
        <View
          style={[
            styles.activityEmpty,
            embedded ? styles.activityEmptyEmbedded : null,
            embedded
              ? {
                  marginBottom: tabClearance(WORKSPACE_CARD_BOTTOM_GAP),
                }
              : null,
          ]}
          testID="workspace-activity-empty"
        >
          <View style={styles.activityEmptyContent}>
            <ExpoImage
              source={require("@/assets/alenio-empty-activity-people.png")}
              style={styles.emptyImage}
              contentFit="contain"
              accessibilityLabel="Workspace activity from teammates"
            />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptyBody}>
              Completed tasks, new members, and celebrations from this workspace
              will appear here.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => {
            if (row.kind === "empty-filter") return "empty-filter";
            if (row.kind === "section")
              return `section-${row.section.group}`;
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
                <View style={styles.noMatches}>
                  <Text style={styles.errorTitle}>No matching activity</Text>
                  <Text style={styles.errorBody}>
                    Try another filter to see more updates.
                  </Text>
                </View>
              );
            }
            if (row.kind === "section") {
              return (
                <View
                  style={[
                    styles.sectionRow,
                    { marginTop: index === 0 ? 4 : 16 },
                  ]}
                >
                  <Text style={styles.sectionLabel}>{row.section.label}</Text>
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
              <WorkspaceFeedItem
                item={row.item}
                workspaceTeamId={workspaceTeamId}
                currentUserId={currentUserId}
                canManageWorkspace={canManageWorkspace}
                showPicker={openPickerId === row.item.id}
                onOpenPicker={() => setOpenPickerId(row.item.id)}
                onClosePicker={() => setOpenPickerId(null)}
                showHint={row.isFirstInFeed ? showReactionHint : false}
              />
            );
          }}
          onRefresh={() => {
            setManualRefreshing(true);
            void activityQuery.refetch().finally(() => setManualRefreshing(false));
          }}
          refreshing={manualRefreshing}
          contentContainerStyle={{
            paddingTop: embedded ? 10 : 28,
            paddingBottom: embedded
              ? tabClearance(WORKSPACE_CARD_BOTTOM_GAP)
              : tabClearance() +
                SENECA_FAB_VISIBLE_SIZE +
                24,
          }}
          showsVerticalScrollIndicator={false}
          testID="workspace-activity-list"
        />
      )}
    </WorkspaceActivityLayout>
  );
}

const styles = StyleSheet.create({
  embeddedScreen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#FFFFFF",
  },
  embeddedToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
  },
  embeddedTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#17203A",
  },
  embeddedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  embeddedAction: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  embeddedActionText: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    color: "#6547E8",
  },
  embeddedFilterDot: {
    position: "absolute",
    right: -3,
    top: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F59E0B",
  },
  embeddedFeed: {
    flex: 1,
    minHeight: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  activityEmpty: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  activityEmptyEmbedded: {
    marginHorizontal: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E8ECF5",
  },
  activityEmptyContent: {
    width: "100%",
    alignItems: "center",
    transform: [{ translateY: -56 }],
  },
  emptyImage: {
    width: 230,
    height: 230,
    marginBottom: -30,
  },
  headerAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  filterDot: {
    position: "absolute",
    right: 2,
    top: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FBBF24",
    borderWidth: 1,
    borderColor: "#6D4AFF",
  },
  filterSection: {
    gap: 7,
  },
  filterSectionLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: "#7B879D",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterTile: {
    width: "31.5%",
    minHeight: 40,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDE3EC",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  filterTileSelected: {
    borderColor: "#8067F2",
    backgroundColor: "#F6F4FF",
  },
  filterTileText: {
    flex: 1,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "600",
    color: "#344054",
  },
  filterTileTextSelected: {
    color: "#5137D9",
    fontWeight: "700",
  },
  filterTileCheck: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: "#6547E8",
    alignItems: "center",
    justifyContent: "center",
  },
  filterApplyRow: {
    flexDirection: "row",
    gap: 10,
  },
  filterResetButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E0EA",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  filterResetText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6547E8",
  },
  filterApplyButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#5137E8",
    alignItems: "center",
    justifyContent: "center",
  },
  filterApplyText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    paddingVertical: 0,
  },
  emptySheetText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
  },
  messageInput: {
    minHeight: 72,
    maxHeight: 120,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#FFFFFF",
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "center",
  },
  errorBody: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#4361EE",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  emptyTitle: {
    marginBottom: 2,
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
    textAlign: "center",
  },
  emptyBody: {
    maxWidth: 280,
    fontSize: 11,
    lineHeight: 14,
    color: "#64748B",
    textAlign: "center",
  },
  noMatches: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  sectionRow: {
    marginBottom: 4,
    paddingHorizontal: 18,
  },
  sectionLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.2,
  },
  reactionHint: {
    fontSize: 10,
    color: "rgba(100,116,139,0.7)",
    textAlign: "center",
    marginTop: 4,
  },
});

