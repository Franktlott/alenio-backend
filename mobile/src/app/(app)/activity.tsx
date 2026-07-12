import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import {
  Activity,
  Users,
  Search,
  X,
  Check,
} from "lucide-react-native";
import { Image as ExpoImage } from "expo-image";
import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "@/lib/auth/use-session";
import { NoWorkspaceRedirect } from "@/components/NoWorkspaceRedirect";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { tabBarClearance } from "@/lib/tab-bar";
import { AppTabHeader } from "@/components/AppTabHeader";
import type { Team } from "@/lib/types";
import {
  ActivityIntroHeader,
  ActivitySummaryChips,
  ActivityFeedCard,
  ACTIVITY_FILTER_OPTIONS,
  CelebrationTypePickerCards,
  CelebrationDeleteModal,
  CELEBRATION_TYPE_KEYS,
  mapApiActivityToFeedItem,
  matchesActivityFilter,
  buildActivitySummary,
  groupActivitiesByDate,
  type ActivityApiEvent,
  type ActivityDateSection,
  type ActivityFeedItem,
  type ActivityFilter,
  type CelebrationTypeKey,
} from "@/components/activity";
import { ActivityReactionRow } from "@/components/activity/ActivityReactionRow";
import { AlenioBottomSheet, AlenioSheetOption, alenioSheetStyles } from "@/components/AlenioBottomSheet";

const REACTION_HINT_KEY = "reaction_hint_shown";
const CELEBRATE_SHEET_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.8);
const CELEBRATE_HEADER_HEIGHT = 73;
const CELEBRATE_MEMBER_SEARCH_HEIGHT = 56;

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
  activeTeamId,
  currentUserId,
  canDeleteCelebration,
  showPicker,
  onOpenPicker,
  onClosePicker,
  onCelebrate,
  showHint,
}: {
  item: ActivityFeedItem;
  activeTeamId: string | null;
  currentUserId: string | undefined;
  canDeleteCelebration: boolean;
  showPicker: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onCelebrate?: () => void;
  showHint?: boolean;
}) {
  const queryClient = useQueryClient();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { mutate: toggleReaction } = useMutation({
    mutationFn: (emoji: string) => api.post(`/api/teams/${activeTeamId}/activity/${item.id}/react`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", activeTeamId] });
      onClosePicker();
    },
  });

  const { mutate: deleteCelebration, isPending: isDeleting } = useMutation({
    mutationFn: () => api.delete(`/api/teams/${activeTeamId}/activity/${item.id}`),
    onSuccess: () => {
      setShowDeleteModal(false);
      queryClient.invalidateQueries({ queryKey: ["activity", activeTeamId] });
      onClosePicker();
    },
  });

  const canDelete = item.type === "celebration" && canDeleteCelebration;

  const handleDelete = () => {
    if (isDeleting || !activeTeamId) return;
    onClosePicker();
    setShowDeleteModal(true);
  };

  return (
    <View>
      <ActivityFeedCard
        item={item}
        onLongPress={onOpenPicker}
        onCelebrate={onCelebrate ? () => onCelebrate() : undefined}
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

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
  });
  const myTeamRole = teams.find((t) => t.id === activeTeamId)?.role;
  const isWorkspaceOwnerOrAdmin = myTeamRole === "owner" || myTeamRole === "admin";

  const [showReactionHint, setShowReactionHint] = useState(false);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  const [showCelebrateModal, setShowCelebrateModal] = useState(false);
  const [celebrateStep, setCelebrateStep] = useState<1 | 2>(1);
  const [celebrateTarget, setCelebrateTarget] = useState<{ id: string; name: string; image: string | null } | null>(null);
  const [celebrateType, setCelebrateType] = useState<CelebrationTypeKey>(CELEBRATION_TYPE_KEYS[0]!);
  const [celebrateMessage, setCelebrateMessage] = useState("");
  const [celebrateMemberSearch, setCelebrateMemberSearch] = useState("");
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
    queryKey: ["activity", activeTeamId],
    queryFn: () => api.get<ActivityApiEvent[]>(`/api/teams/${activeTeamId}/activity`),
    enabled: !!activeTeamId,
    refetchInterval: 15000,
  });

  const { data: teamMembers = [], isLoading: teamMembersLoading } = useQuery({
    queryKey: ["team-members-feed", activeTeamId],
    queryFn: async () => {
      const team = await api.get<{
        members: { userId: string; user: { id: string; name: string; image: string | null } }[];
      }>(`/api/teams/${activeTeamId}`);
      return (team.members ?? []).filter((m) => m.userId !== currentUserId);
    },
    enabled: !!activeTeamId && showCelebrateModal,
  });

  const feedItems = useMemo(
    () =>
      activities
        .map(mapApiActivityToFeedItem)
        .filter((item) => matchesActivityFilter(item.type, activityFilter)),
    [activities, activityFilter],
  );

  const summary = useMemo(() => buildActivitySummary(activities.map(mapApiActivityToFeedItem)), [activities]);
  const sections = useMemo(() => groupActivitiesByDate(feedItems), [feedItems]);
  const filterLabel = ACTIVITY_FILTER_OPTIONS.find((o) => o.key === activityFilter)?.label ?? "All Activity";

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
  };

  const celebrateMutation = useMutation({
    mutationFn: (payload: { targetUserId: string; celebrationType: string; message?: string }) =>
      api.post(`/api/teams/${activeTeamId}/activity/celebrate`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", activeTeamId] });
      closeCelebrateModal();
    },
  });

  const celebrateMemberListMaxHeight =
    CELEBRATE_SHEET_MAX_HEIGHT - CELEBRATE_HEADER_HEIGHT - CELEBRATE_MEMBER_SEARCH_HEIGHT - insets.bottom - 16;

  if (!activeTeamId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
        <NoWorkspaceRedirect />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={[]} testID="activity-screen">
      <AppTabHeader
        topInset={insets.top}
        testID="activity-header"
        rightAction={
          <TouchableOpacity
            testID="celebrate-button"
            onPress={() => {
              setShowCelebrateModal(true);
              setCelebrateStep(1);
              setCelebrateMemberSearch("");
            }}
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 5,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Text style={{ fontSize: 12 }}>🎉</Text>
            <Text style={{ color: "white", fontSize: 12, fontWeight: "700" }}>Celebrate</Text>
          </TouchableOpacity>
        }
      />

      <AlenioBottomSheet
        visible={showFilterSheet}
        title="Filter activity"
        subtitle="Choose what to show in your feed"
        onClose={() => setShowFilterSheet(false)}
        compact
        footer={
          <TouchableOpacity onPress={() => setShowFilterSheet(false)} style={[alenioSheetStyles.cancelButton, { paddingVertical: 4 }]}>
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        }
      >
        {ACTIVITY_FILTER_OPTIONS.map((option) => (
          <AlenioSheetOption
            key={option.key}
            compact
            icon={<Check size={14} color="white" strokeWidth={2.5} />}
            iconColor={activityFilter === option.key ? "#4361EE" : "#94A3B8"}
            title={option.label}
            subtitle={
              option.key === "all"
                ? "Everything from your team"
                : option.key === "tasks"
                  ? "Assignments and completions"
                  : option.key === "calendar"
                    ? "Events and meetings"
                    : option.key === "team"
                      ? "Joins and departures"
                      : "Milestones and shoutouts"
            }
            onPress={() => {
              setActivityFilter(option.key);
              setShowFilterSheet(false);
            }}
          />
        ))}
      </AlenioBottomSheet>

      {/* Celebrate modal */}
      <Modal visible={showCelebrateModal} transparent animationType="slide" onRequestClose={closeCelebrateModal}>
        <SafeKeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} activeOpacity={1} onPress={closeCelebrateModal} />
          <View
            style={{
              backgroundColor: "white",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: CELEBRATE_SHEET_MAX_HEIGHT,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: "#F1F5F9",
              }}
            >
              <TouchableOpacity
                onPress={celebrateStep === 2 ? () => setCelebrateStep(1) : closeCelebrateModal}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 14, color: "#64748B", fontWeight: "600" }}>
                  {celebrateStep === 2 ? "← Back" : "Cancel"}
                </Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>
                {celebrateStep === 1 ? "Who to celebrate? 🎉" : `Celebrate ${celebrateTarget?.name ?? ""}`}
              </Text>
              <TouchableOpacity onPress={closeCelebrateModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {celebrateStep === 1 ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginHorizontal: 16,
                    marginTop: 12,
                    marginBottom: 8,
                    paddingHorizontal: 12,
                    height: CELEBRATE_MEMBER_SEARCH_HEIGHT - 12,
                    borderRadius: 12,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    gap: 8,
                  }}
                >
                  <Search size={18} color="#94A3B8" />
                  <TextInput
                    value={celebrateMemberSearch}
                    onChangeText={setCelebrateMemberSearch}
                    placeholder="Search teammates"
                    placeholderTextColor="#94A3B8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                    style={{ flex: 1, fontSize: 15, color: "#0F172A", paddingVertical: 0 }}
                    testID="celebrate-member-search"
                  />
                  {celebrateMemberSearch.length > 0 ? (
                    <TouchableOpacity onPress={() => setCelebrateMemberSearch("")} hitSlop={8}>
                      <X size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {teamMembersLoading ? (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <ActivityIndicator color="#4361EE" />
                  </View>
                ) : teamMembers.length === 0 ? (
                  <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 44, paddingBottom: insets.bottom + 16 }}>
                    <Text style={{ fontSize: 36, marginBottom: 10 }}>🎉</Text>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#334155", textAlign: "center" }}>
                      No teammates to celebrate yet
                    </Text>
                    <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", marginTop: 8, lineHeight: 20 }}>
                      Add more team members first, then come back to post a celebration.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={filteredCelebrateMembers}
                    keyExtractor={(m) => m.userId}
                    style={{ maxHeight: Math.max(180, celebrateMemberListMaxHeight) }}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                    testID="celebrate-member-list"
                    ListEmptyComponent={
                      <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 32 }}>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#334155" }}>No matches</Text>
                      </View>
                    }
                    renderItem={({ item: m }) => (
                      <TouchableOpacity
                        testID={`celebrate-member-${m.userId}`}
                        onPress={() => {
                          setCelebrateTarget(m.user);
                          setCelebrateStep(2);
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 20,
                          paddingVertical: 14,
                          borderBottomWidth: 1,
                          borderBottomColor: "#F8FAFC",
                        }}
                      >
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: "#EEF2FF",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 14,
                            overflow: "hidden",
                          }}
                        >
                          {m.user.image ? (
                            <ExpoImage source={{ uri: m.user.image }} style={{ width: 44, height: 44 }} contentFit="cover" />
                          ) : (
                            <Text style={{ fontSize: 18, fontWeight: "700", color: "#4361EE" }}>
                              {m.user.name[0]?.toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 16, fontWeight: "600", color: "#1E293B", flex: 1 }}>{m.user.name}</Text>
                        <Text style={{ fontSize: 18 }}>→</Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </>
            ) : (
              <ScrollView
                style={{ maxHeight: CELEBRATE_SHEET_MAX_HEIGHT - CELEBRATE_HEADER_HEIGHT }}
                contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: "#64748B",
                    marginBottom: 12,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Choose a celebration
                </Text>
                <View style={{ marginBottom: 20 }} testID="celebrate-type-picker-wrap">
                  <CelebrationTypePickerCards
                    selected={celebrateType}
                    onSelect={setCelebrateType}
                  />
                </View>

                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: "#64748B",
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Message <Text style={{ color: "#EF4444" }}>*</Text>
                </Text>
                <TextInput
                  testID="celebrate-message-input"
                  value={celebrateMessage}
                  onChangeText={setCelebrateMessage}
                  placeholder={`Say something nice about ${celebrateTarget?.name ?? "them"}...`}
                  placeholderTextColor="#CBD5E1"
                  multiline
                  maxLength={300}
                  style={{
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: "#1E293B",
                    minHeight: 80,
                    maxHeight: 140,
                    marginBottom: 20,
                  }}
                />

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
                  style={{
                    backgroundColor: celebrateMessage.trim() ? "#4361EE" : "#CBD5E1",
                    borderRadius: 14,
                    paddingVertical: 15,
                    alignItems: "center",
                  }}
                >
                  {celebrateMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "white" }}>🎉 Post Celebration</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </SafeKeyboardAvoidingView>
      </Modal>

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
          <View
            style={{
              backgroundColor: "#F8FAFC",
              borderBottomWidth: 1,
              borderBottomColor: "#E8EDF3",
              paddingBottom: 10,
            }}
          >
            <ActivityIntroHeader
              filter={activityFilter}
              filterLabel={filterLabel}
              onPressFilter={() => setShowFilterSheet(true)}
            />
            {activities.length > 0 ? (
              <ActivitySummaryChips summary={summary} testID="activity-summary-chips" />
            ) : null}
          </View>

          {activities.length === 0 ? (
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
              renderItem={({ item: row }) => {
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
                    <View style={{ marginTop: 8, marginBottom: 4, paddingHorizontal: 16 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: "#64748B",
                          letterSpacing: 0.8,
                        }}
                      >
                        {row.section.label}
                      </Text>
                    </View>
                  );
                }
                return (
                  <View style={{ marginBottom: 6 }}>
                    <FeedItemCard
                      item={row.item}
                      activeTeamId={activeTeamId}
                      currentUserId={currentUserId}
                      canDeleteCelebration={
                        isWorkspaceOwnerOrAdmin || row.item.actor?.id === currentUserId
                      }
                      showPicker={openPickerId === row.item.id}
                      onOpenPicker={() => setOpenPickerId(row.item.id)}
                      onClosePicker={() => setOpenPickerId(null)}
                      onCelebrate={() => {
                        setShowCelebrateModal(true);
                        setCelebrateStep(1);
                      }}
                      showHint={row.isFirstInFeed && showReactionHint}
                    />
                  </View>
                );
              }}
              onRefresh={refetch}
              refreshing={isLoading}
              contentContainerStyle={{ paddingTop: 6, paddingBottom: tabBarClearance(insets.bottom) + 8 }}
              showsVerticalScrollIndicator={false}
              testID="activity-list"
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
