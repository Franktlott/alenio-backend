import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { palette } from "@/theme";
import {
  Award,
  ImagePlus,
  PenSquare,
  UserPlus,
  type LucideIcon,
} from "lucide-react-native";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import type {
  PersonalRecognition,
  PersonalRecognitionsResponse,
  Team,
} from "@/lib/types";
import {
  applyReactionToggle,
  formatFeedTimestamp,
  isWorkspaceUpdateActivity,
  myReactionEmoji,
  totalReactionCount,
  workspaceUpdateBody,
  workspaceUpdateHeadline,
} from "@/lib/workspace-updates";
import { MilestoneUpdateCard } from "@/components/workspace/MilestoneUpdateCard";
import { MemberJoinedUpdateCard } from "@/components/workspace/MemberJoinedUpdateCard";
import { PostComposerRow } from "@/components/workspace/PostComposerRow";
import { ReactionListSheet } from "@/components/workspace/ReactionListSheet";
import { PostUpdateCard } from "@/components/workspace/PostUpdateCard";
import { RecognitionUpdateCard } from "@/components/workspace/RecognitionUpdateCard";
import { WorkspaceUpdateCard } from "@/components/workspace/WorkspaceUpdateCard";
import {
  WORKSPACE_FEED_GAP,
  WORKSPACE_FEED_HORIZONTAL_INSET,
  WORKSPACE_FEED_MAX_WIDTH,
  WORKSPACE_FEED_SECTION_GAP,
} from "@/components/workspace/WorkspaceFeedCardShell";
import {
  CelebrationDeleteModal,
  mapApiActivityToFeedItem,
  type ActivityApiEvent,
  type ActivityFeedItem,
} from "@/components/activity";
import type { ActivityReactions } from "@/components/activity/types";
import { ActivityReactionRow } from "@/components/activity/ActivityReactionRow";
import { UpdateDetailScreen } from "@/components/workspace/UpdateDetailScreen";
import { WorkspaceSpotlight } from "@/components/workspace/WorkspaceSpotlight";
import { useAdaptiveLayout } from "@/lib/adaptive-layout";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useWorkspaceSpotlight } from "@/lib/state/workspace-spotlight-store";
import type {
  SpotlightActivity,
  SpotlightSource,
} from "@/lib/workspace-spotlight";

type Props = {
  teamId: string | null;
  canManageWorkspace: boolean;
  /** Invites live in the Workspace screen's modal, so the rail asks for one. */
  onInvite?: () => void;
};

type WorkspaceActivityPage = {
  items: ActivityApiEvent[];
  nextCursor: string | null;
};

/**
 * Past this a line of post text is more travel than reading, which is why a
 * feed on a wide screen centres its column instead of filling the window.
 */
const RAIL_WIDTH = 304;
const RAIL_GAP = 16;

function ActionTile({
  Icon,
  tint,
  surface,
  label,
  accessibilityLabel,
  onPress,
  testID,
}: {
  Icon: LucideIcon;
  tint: string;
  surface: string;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        pressed ? styles.tilePressed : null,
      ]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.tileIcon, { backgroundColor: surface }]}>
        <Icon size={17} color={tint} strokeWidth={2.2} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function UpdatesRail({
  teamId,
  canManageWorkspace,
  canWrite,
  onInvite,
  spotlight,
}: {
  teamId: string;
  canManageWorkspace: boolean;
  canWrite: boolean;
  onInvite?: () => void;
  spotlight: ReactNode;
}) {
  if (!canWrite) return null;
  return (
    <ScrollView
      style={styles.rail}
      contentContainerStyle={styles.railContent}
      showsVerticalScrollIndicator={false}
      testID="workspace-updates-rail"
    >
      <View style={styles.railCard}>
        <Text style={styles.railEyebrow}>QUICK ACTIONS</Text>
        <View style={styles.tileGrid}>
          <ActionTile
            Icon={PenSquare}
            tint="#6d28d9"
            surface="#EFE9FF"
            label="Write a post"
            accessibilityLabel="Write a post"
            onPress={() =>
              router.push({ pathname: "/create-post", params: { teamId } })
            }
            testID="workspace-rail-write-post"
          />
          <ActionTile
            Icon={Award}
            tint="#D97706"
            surface="#FEF3E2"
            label="Celebrate"
            accessibilityLabel="Celebrate someone"
            onPress={() =>
              router.push({
                pathname: "/recognition-hub",
                params: { openGive: "1", teamId },
              })
            }
            testID="workspace-rail-celebrate"
          />
          <ActionTile
            Icon={ImagePlus}
            tint="#6366F1"
            surface="#EEF0FF"
            label="Add a photo"
            accessibilityLabel="Add a photo"
            onPress={() =>
              router.push({
                pathname: "/create-post",
                params: { teamId, attach: "1" },
              })
            }
            testID="workspace-rail-photo"
          />
          {canManageWorkspace && onInvite ? (
            <ActionTile
              Icon={UserPlus}
              tint="#0F9D6E"
              surface="#E4F6EE"
              label="Invite"
              accessibilityLabel="Invite a teammate"
              onPress={onInvite}
              testID="workspace-rail-invite"
            />
          ) : null}
        </View>
      </View>
      <View style={styles.spotlightWrap}>{spotlight}</View>
    </ScrollView>
  );
}

function UpdatesFeedItem({
  item,
  teamId,
  currentUser,
  canManageWorkspace,
  canWrite,
  showPicker,
  selected,
  onOpenPicker,
  onClosePicker,
  onOpenThread,
}: {
  item: ActivityFeedItem;
  teamId: string;
  currentUser: { id: string; name: string } | null;
  canManageWorkspace: boolean;
  canWrite: boolean;
  showPicker: boolean;
  /** True when the detail pane is showing this update. */
  selected: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  /** The feed decides whether a thread opens in the pane or on its own screen. */
  onOpenThread: (activityId: string) => void;
}) {
  const queryClient = useQueryClient();
  const currentUserId = currentUser?.id;
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const openReactions = () => {
    onClosePicker();
    setShowReactions(true);
  };
  const canDelete =
    canWrite &&
    (item.type === "celebration" || item.type === "post") &&
    (item.actor?.id === currentUserId || canManageWorkspace);
  const invalidateActivity = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["team-activity", teamId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["personal-recognitions"],
      }),
    ]);
  };

  // Show the reaction on the card right away; the refetch below confirms it.
  const applyLocalReaction = (emoji: string) => {
    if (!currentUser) return;
    const toggle = (reactions: ActivityReactions | null | undefined) =>
      applyReactionToggle(reactions, emoji, currentUser);

    queryClient.setQueryData<InfiniteData<WorkspaceActivityPage>>(
      ["team-activity", teamId, "feed"],
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map((event) =>
                  event.id === item.id
                    ? { ...event, reactions: toggle(event.reactions) }
                    : event,
                ),
              })),
            }
          : data,
    );
    queryClient.setQueriesData<PersonalRecognitionsResponse>(
      { queryKey: ["personal-recognitions"] },
      (data) => {
        if (!data) return data;
        const patch = (recognition: PersonalRecognition) =>
          recognition.id === item.id
            ? { ...recognition, reactions: toggle(recognition.reactions) }
            : recognition;
        return {
          ...data,
          items: data.items.map(patch),
          givenItems: data.givenItems.map(patch),
        };
      },
    );
  };

  const reactionMutation = useMutation({
    mutationFn: (emoji: string) => {
      if (!canWrite) return Promise.resolve();
      return api.post(`/api/teams/${teamId}/activity/${item.id}/react`, {
        emoji,
      });
    },
    onMutate: (emoji: string) => {
      applyLocalReaction(emoji);
      onClosePicker();
    },
    onSettled: async () => {
      await invalidateActivity();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/teams/${teamId}/activity/${item.id}`),
    onSuccess: async () => {
      setShowDeleteModal(false);
      await invalidateActivity();
      onClosePicker();
    },
  });

  /** Recognition keeps its own confirm sheet; a post just asks in place. */
  const onPressDelete = !canDelete
    ? undefined
    : () => {
        onClosePicker();
        if (item.type !== "post") {
          setShowDeleteModal(true);
          return;
        }
        Alert.alert("Delete post?", "This removes it for everyone.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteMutation.mutate(),
          },
        ]);
      };

  const openThread = () => {
    onClosePicker();
    onOpenThread(item.id);
  };

  const react = canWrite ? onOpenPicker : undefined;
  const picker = canWrite && showPicker ? (
    <ActivityReactionRow
      activityId={item.id}
      reactions={item.reactions ?? {}}
      currentUserId={currentUserId}
      onToggleReaction={(emoji) => reactionMutation.mutate(emoji)}
      showPicker
      onClosePicker={onClosePicker}
      floatPicker
      showPills={false}
      tone="default"
    />
  ) : null;

  return (
    <View>
      {/* Marks the post the pane is showing, on a feed of full-bleed bands. */}
      {selected ? (
        <View pointerEvents="none" style={styles.selectedAccent} />
      ) : null}
      {item.type === "celebration" ? (
        <RecognitionUpdateCard
          item={item}
          currentUserId={currentUserId}
          onPressReact={react}
          onPressMore={onPressDelete}
          onPressComment={openThread}
          onPressReactions={openReactions}
          commentCount={item.commentCount ?? 0}
          picker={picker}
        />
      ) : item.type === "member_joined" ? (
        <MemberJoinedUpdateCard
          item={item}
          currentUserId={currentUserId}
          onPressReact={react}
          onPressComment={openThread}
          onPressReactions={openReactions}
          commentCount={item.commentCount ?? 0}
          picker={picker}
        />
      ) : item.type === "task_milestone" ? (
        <MilestoneUpdateCard
          item={item}
          currentUserId={currentUserId}
          onPressReact={react}
          onPressComment={openThread}
          onPressReactions={openReactions}
          commentCount={item.commentCount ?? 0}
          picker={picker}
        />
      ) : item.type === "post" ? (
        <PostUpdateCard
          item={item}
          currentUserId={currentUserId}
          onPressReact={react}
          onPressMore={onPressDelete}
          onPressComment={openThread}
          onPressReactions={openReactions}
          commentCount={item.commentCount ?? 0}
          picker={picker}
        />
      ) : (
        <WorkspaceUpdateCard
          author={item.actor ?? { name: "Someone" }}
          timestamp={formatFeedTimestamp(item.timestamp)}
          headline={workspaceUpdateHeadline(item)}
          body={workspaceUpdateBody(item)}
          reactionCount={totalReactionCount(item.reactions)}
          reactions={item.reactions ?? {}}
          myReaction={myReactionEmoji(item.reactions, currentUserId)}
          onPressReactions={openReactions}
          onPressLike={react}
          onMore={react}
          onLongPress={react}
          onPressComment={openThread}
          commentCount={item.commentCount ?? 0}
          avatarResetKey={item.id}
          picker={picker}
          testID={`workspace-update-card-${item.id}`}
        />
      )}
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
      <ReactionListSheet
        visible={showReactions}
        reactions={item.reactions ?? {}}
        currentUserId={currentUserId}
        onClose={() => setShowReactions(false)}
      />
    </View>
  );
}

export function WorkspaceUpdatesFeed({
  teamId,
  canManageWorkspace,
  onInvite,
}: Props) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const currentUserId = authReady?.me?.id ?? session?.user?.id;
  const currentUserName = authReady?.me?.name ?? session?.user?.name ?? "You";
  const signedInUser = useMemo(
    () => (currentUserId ? { id: currentUserId, name: currentUserName } : null),
    [currentUserId, currentUserName],
  );
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const adaptive = useAdaptiveLayout();
  const { columnWidth } = adaptive;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /**
   * A wide screen keeps one centred feed and spends the leftover width on a
   * rail. A post is the content, so there is nothing left to put in a second
   * pane — splitting only shrinks the post and leaves a placeholder beside it.
   */
  const splitFeed = adaptive.isSplit;
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  /** Wide enough to read a thread, narrow enough to stay a card over the feed. */
  const overlayWidth = Math.min(660, windowWidth - 120);

  const openThread = useCallback(
    (activityId: string) => {
      if (splitFeed) {
        setOpenActivityId(activityId);
        return;
      }
      router.push({
        pathname: "/update-detail",
        params: { teamId: teamId ?? "", activityId },
      });
    },
    [splitFeed, teamId],
  );

  /**
   * Folding the screen takes the pane away; carry the open thread onto the full
   * screen rather than dropping the conversation someone was reading.
   */
  useEffect(() => {
    if (!openActivityId || splitFeed) return;
    setOpenActivityId(null);
    if (!teamId) return;
    router.push({
      pathname: "/update-detail",
      params: { teamId, activityId: openActivityId },
    });
  }, [openActivityId, splitFeed, teamId]);
  /**
   * The chrome above keeps the full width; only the reading column is capped,
   * so an iPad portrait feed stays a feed instead of a row of stranded text.
   */
  const column = {
    width: "100%",
    maxWidth: columnWidth,
    alignSelf: "center",
  } as const;

  const activityQuery = useInfiniteQuery({
    queryKey: ["team-activity", teamId ?? "", "feed"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const response = await api.get<
        WorkspaceActivityPage | ActivityApiEvent[]
      >(
        `/api/teams/${teamId}/activity?limit=12${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""
        }`,
      );
      // During a rolling deploy, an older server still returns the legacy
      // array. Keep the first load safe until cursor support reaches it.
      return Array.isArray(response)
        ? { items: response.slice(0, 12), nextCursor: null }
        : response;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!teamId,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    // Polling pauses while the app is backgrounded, so catch up on return.
    refetchOnWindowFocus: true,
  });
  const activityEvents = useMemo(
    () => activityQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [activityQuery.data],
  );
  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
    // Recognition rows are filtered by workspace membership, so a stale
    // roster silently hides updates about whoever just joined.
    refetchOnWindowFocus: true,
  });
  const spotlightActivities = useMemo<SpotlightActivity[]>(
    () =>
      activityEvents.map((event) => ({
        id: event.id,
        type: event.type,
        createdAt: event.createdAt,
        actorId: event.user?.id ?? null,
        actorName: event.user?.name ?? null,
        metadataName: event.metadata?.userName ?? null,
      })),
    [activityEvents],
  );
  const spotlightStatus: SpotlightSource = !teamId
    ? "loading"
    : activityQuery.isLoading ||
        (activityQuery.isSuccess && teamQuery.isLoading)
      ? "loading"
      : activityQuery.isError
        ? "unavailable"
        : "ready";
  const { spotlight, dismiss: dismissSpotlight } = useWorkspaceSpotlight({
    teamId,
    viewerId: currentUserId ?? null,
    workspaceCreatedAt: teamQuery.isSuccess
      ? teamQuery.data?.createdAt
      : undefined,
    activities: spotlightActivities,
    status: spotlightStatus,
  });
  const { access } = useWorkspaceAccess(teamId);
  const canWrite = access.canWrite;
  const openComposer = useCallback(
    (draft?: string, attach = false) => {
      if (!teamId || !canWrite) return;
      router.push({
        pathname: "/create-post",
        params: {
          teamId,
          ...(draft ? { draft } : {}),
          ...(attach ? { attach: "1" } : {}),
        },
      });
    },
    [canWrite, teamId],
  );
  const sayHello = useCallback(
    (name: string) => {
      const who = name.trim();
      openComposer(
        who && who !== "a teammate" ? `Welcome, ${who}! ` : "Welcome! ",
      );
    },
    [openComposer],
  );
  const celebrateSomeone = useCallback(() => {
    if (!teamId || !canWrite) return;
    router.push({
      pathname: "/recognition-hub",
      params: { openGive: "1", teamId },
    });
  }, [canWrite, teamId]);
  const spotlightCard =
    canWrite && teamId && splitFeed ? (
      <WorkspaceSpotlight
        spotlight={spotlight}
        variant="rail"
        onSayHello={sayHello}
        onCelebrate={celebrateSomeone}
        onShare={() => openComposer()}
        onDismiss={dismissSpotlight}
      />
    ) : null;

  const items = useMemo(() => {
    const currentUser = authReady?.me;
    const visibleEvents = activityEvents.filter((event) =>
      isWorkspaceUpdateActivity(event.type),
    );

    return visibleEvents
      .map(mapApiActivityToFeedItem)
      .map((item): ActivityFeedItem => {
        const actor = item.actor;
        if (!actor || !currentUser || actor.id !== currentUser.id) return item;
        return {
          ...item,
          actor: {
            ...actor,
            name: currentUser.name || actor.name,
            image: currentUser.image ?? actor.image,
          },
        };
      });
  }, [activityEvents, authReady?.me]);

  const onRefresh = useCallback(() => {
    if (!teamId) return;
    setRefreshing(true);
    queryClient.setQueryData<InfiniteData<WorkspaceActivityPage>>(
      ["team-activity", teamId, "feed"],
      (current) =>
        current
          ? {
              pages: current.pages.slice(0, 1),
              pageParams: current.pageParams.slice(0, 1),
            }
          : current,
    );
    void queryClient
      .invalidateQueries({
        queryKey: ["team-activity", teamId, "feed"],
        exact: true,
      })
      .finally(() => setRefreshing(false));
  }, [queryClient, teamId]);

  if (!teamId) {
    return (
      <View
        style={[styles.page, styles.pageInset, column]}
        testID="workspace-updates-feed"
      >
        <Text style={styles.empty}>No updates yet</Text>
      </View>
    );
  }

  if (activityQuery.isLoading || teamQuery.isLoading) {
    return (
      <View
        style={[styles.page, styles.pageInset, column]}
        testID="workspace-updates-feed"
      >
        <View style={styles.centered} testID="workspace-updates-loading">
          <ActivityIndicator color="#6d28d9" />
        </View>
      </View>
    );
  }

  if (activityQuery.isError) {
    return (
      <View
        style={[styles.page, styles.pageInset, column]}
        testID="workspace-updates-feed"
      >
        <View style={styles.centered} testID="workspace-updates-error">
          <Text style={styles.errorTitle}>Couldn&apos;t load updates</Text>
          <Pressable
            onPress={() => void activityQuery.refetch()}
            style={styles.retry}
            testID="workspace-updates-retry"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const feed = (
    <View
      style={[styles.page, splitFeed ? null : column]}
      testID="workspace-updates-feed"
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UpdatesFeedItem
            item={item}
            teamId={teamId}
            currentUser={signedInUser}
            canManageWorkspace={canManageWorkspace}
            canWrite={canWrite}
            showPicker={openPickerId === item.id}
            onOpenPicker={() =>
              setOpenPickerId((open) => (open === item.id ? null : item.id))
            }
            onClosePicker={() => setOpenPickerId(null)}
            selected={item.id === openActivityId}
            onOpenThread={openThread}
          />
        )}
        ListHeaderComponent={
          canWrite ? (
            <View style={styles.composerWrap}>
              <PostComposerRow
                author={{
                  name: currentUserName,
                  image: authReady?.me?.image ?? session?.user?.image ?? null,
                }}
                onPress={() => openComposer()}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <UpdatesEmptyState teamId={teamId} canWrite={canWrite} />
        }
        ListFooterComponent={
          activityQuery.isFetchingNextPage ? (
            <ActivityIndicator
              style={styles.footerLoader}
              color="#6d28d9"
            />
          ) : null
        }
        onEndReached={() => {
          if (
            activityQuery.hasNextPage &&
            !activityQuery.isFetchingNextPage
          ) {
            void activityQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.35}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6d28d9"
            colors={["#6d28d9"]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        testID="workspace-updates-list"
      />
    </View>
  );

  if (!splitFeed) return feed;

  return (
    <View style={styles.wideRow} testID="workspace-updates-wide">
      <View style={styles.wideFeedArea}>
        <View style={styles.wideFeedColumn}>{feed}</View>
      </View>
      <UpdatesRail
        teamId={teamId}
        canManageWorkspace={canManageWorkspace}
        canWrite={canWrite}
        onInvite={onInvite}
        spotlight={spotlightCard}
      />
      {/* The thread opens over the feed, the way a post does on Facebook. */}
      <Modal
        visible={!!openActivityId}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenActivityId(null)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpenActivityId(null)}
            accessibilityRole="button"
            accessibilityLabel="Close update"
          />
          <View
            style={[
              styles.overlayCard,
              { width: overlayWidth, maxHeight: windowHeight * 0.86 },
            ]}
            testID="update-thread-overlay"
          >
            {openActivityId ? (
              <UpdateDetailScreen
                key={openActivityId}
                teamId={teamId}
                activityId={openActivityId}
                onClose={() => setOpenActivityId(null)}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Openers that seed the composer, so nobody faces an empty box. */
const STARTER_PROMPTS: { label: string; draft: string }[] = [
  { label: "Introduce yourself", draft: "Hi everyone — I'm " },
  { label: "This week's focus", draft: "This week I'm focused on " },
  { label: "Celebrate someone", draft: "Shout out to " },
];

function UpdatesEmptyState({
  teamId,
  canWrite,
}: {
  teamId: string;
  canWrite: boolean;
}) {
  const openComposer = (draft?: string) => {
    if (!canWrite) return;
    router.push({
      pathname: "/create-post",
      params: draft ? { teamId, draft } : { teamId },
    });
  };

  if (!canWrite) {
    return (
      <View style={styles.emptyWrap} testID="workspace-updates-empty">
        <ExpoImage
          source={require("@/assets/alenio-empty-activity-people.png")}
          style={styles.emptyArt}
          contentFit="contain"
          accessibilityLabel="Updates from your workspace"
        />
        <Text style={styles.emptyTitle}>Your workspace is ready</Text>
        <Text style={styles.emptyBody}>
          Updates and conversations will appear here when posting is enabled.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyWrap} testID="workspace-updates-empty">
      <ExpoImage
        source={require("@/assets/alenio-empty-activity-people.png")}
        style={styles.emptyArt}
        contentFit="contain"
        accessibilityLabel="Updates from your workspace"
      />
      <Text style={styles.emptyTitle}>Start the conversation</Text>
      <Text style={styles.emptyBody}>
        Posts, wins, and questions live here. Be the first to say something.
      </Text>

      <TouchableOpacity
        onPress={() => openComposer()}
        activeOpacity={0.85}
        style={styles.emptyPrimary}
        accessibilityRole="button"
        accessibilityLabel="Write the first post"
        testID="workspace-updates-empty-post"
      >
        <Text style={styles.emptyPrimaryText}>Write the first post</Text>
      </TouchableOpacity>

      <Text style={styles.emptyEyebrow}>OR TRY ONE OF THESE</Text>
      <View style={styles.emptyChips}>
        {STARTER_PROMPTS.map((prompt) => (
          <TouchableOpacity
            key={prompt.label}
            onPress={() => openComposer(prompt.draft)}
            activeOpacity={0.7}
            style={styles.emptyChip}
            accessibilityRole="button"
            accessibilityLabel={prompt.label}
          >
            <Text style={styles.emptyChipText}>{prompt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.emptyFootnote}>
        Completed tasks, new members, and celebrations show up here on their
        own.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    backgroundColor: palette.page,
  },
  pageInset: {
    paddingHorizontal: WORKSPACE_FEED_HORIZONTAL_INSET,
  },
  listContent: {
    width: "100%",
    maxWidth: WORKSPACE_FEED_MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: WORKSPACE_FEED_HORIZONTAL_INSET,
    paddingTop: 6,
    gap: WORKSPACE_FEED_GAP,
    // Clears the fixed bottom navigation so the last card stays reachable.
    paddingBottom: 28,
    flexGrow: 1,
  },
  composerWrap: {
    marginBottom: WORKSPACE_FEED_SECTION_GAP - WORKSPACE_FEED_GAP,
  },
  footerLoader: {
    marginVertical: 14,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  empty: {
    paddingTop: 28,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 18,
    paddingHorizontal: 28,
  },
  emptyArt: {
    width: 210,
    height: 210,
    marginBottom: -12,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111A2B",
    textAlign: "center",
  },
  emptyBody: {
    marginTop: 8,
    maxWidth: 270,
    fontSize: 13,
    lineHeight: 19,
    color: "#7A8699",
    textAlign: "center",
  },
  emptyPrimary: {
    marginTop: 20,
    minWidth: 220,
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 22,
    backgroundColor: "#6d28d9",
    shadowColor: "#24324A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 11,
    elevation: 2,
  },
  emptyPrimaryText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptyEyebrow: {
    marginTop: 22,
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: "#A2ACBC",
  },
  emptyChips: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  emptyChip: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F8FAFD",
    borderWidth: 1,
    borderColor: "#E8ECF4",
  },
  emptyChipText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#3E4A5C",
  },
  emptyFootnote: {
    marginTop: 26,
    maxWidth: 280,
    fontSize: 11,
    lineHeight: 16,
    color: "#A8B2C0",
    textAlign: "center",
  },
  wideRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
  },
  wideFeedArea: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  wideFeedColumn: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    maxWidth: WORKSPACE_FEED_MAX_WIDTH,
    alignSelf: "center",
  },
  rail: {
    flexGrow: 0,
    flexShrink: 0,
    width: RAIL_WIDTH,
    marginLeft: RAIL_GAP,
    marginRight: 16,
  },
  railContent: {
    paddingTop: 8,
    paddingBottom: 28,
  },
  railCard: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: "#24324A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 11,
    elevation: 2,
  },
  railEyebrow: {
    paddingHorizontal: 16,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "#8A93A8",
  },
  /** Equal columns, so each icon and its label share the same width. */
  tileGrid: {
    marginTop: 10,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-evenly",
  },
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 8,
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    width: "100%",
    marginTop: 8,
    height: 26,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: "#2E3A4C",
    textAlign: "center",
  },
  spotlightWrap: {
    marginTop: 12,
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  overlayCard: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  selectedAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 2,
    backgroundColor: "#6d28d9",
    zIndex: 1,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#27324A",
    textAlign: "center",
  },
  retry: {
    marginTop: 14,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#6d28d9",
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
