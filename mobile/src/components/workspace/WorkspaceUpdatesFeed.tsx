import {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Megaphone, PenSquare } from "lucide-react-native";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import type {
  PersonalRecognition,
  PersonalRecognitionsResponse,
} from "@/lib/types";
import {
  applyReactionToggle,
  formatFeedTimestamp,
  isWorkspaceUpdateActivity,
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
import { useWorkspaceAccess } from "@/lib/workspace-access";

type Props = {
  teamId: string | null;
  canManageWorkspace: boolean;
  /** Kept for Workspace screen call sites; invites live in the header modal. */
  onInvite?: () => void;
};

type WorkspaceActivityPage = {
  items: ActivityApiEvent[];
  nextCursor: string | null;
};

function UpdatesFeedItem({
  item,
  teamId,
  currentUser,
  canManageWorkspace,
  canWrite,
  showPicker,
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
  onOpenPicker: () => void;
  onClosePicker: () => void;
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
      {item.type === "celebration" ? (
        <RecognitionUpdateCard
          item={item}
          currentUserId={currentUserId}
          onPressReact={react}
          onToggleReaction={
            canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
          }
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
          onToggleReaction={
            canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
          }
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
          onToggleReaction={
            canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
          }
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
          onToggleReaction={
            canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
          }
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
          currentUserId={currentUserId}
          onPressReactions={openReactions}
          onPressLike={react}
          onToggleReaction={
            canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
          }
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
  // Same centred column as Network — no wide rail beside the feed.
  const column = {
    width: "100%",
    maxWidth: WORKSPACE_FEED_MAX_WIDTH,
    alignSelf: "center",
  } as const;

  const openThread = useCallback(
    (activityId: string) => {
      router.push({
        pathname: "/update-detail",
        params: { teamId: teamId ?? "", activityId },
      });
    },
    [teamId],
  );

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
  const { access } = useWorkspaceAccess(teamId);
  const canWrite = access.canWrite;
  const openComposer = useCallback(() => {
    if (!teamId || !canWrite) return;
    router.push({
      pathname: "/create-post",
      params: { teamId },
    });
  }, [canWrite, teamId]);

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

  if (activityQuery.isLoading) {
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

  return (
    <View style={[styles.page, column]} testID="workspace-updates-feed">
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
                onPress={openComposer}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <UpdatesEmptyState canWrite={canWrite} onCompose={openComposer} />
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
        contentContainerStyle={[
          styles.listContent,
          items.length === 0 ? styles.listEmpty : null,
        ]}
        showsVerticalScrollIndicator={false}
        testID="workspace-updates-list"
      />
    </View>
  );
}

/** Quiet empty — same language as Network, without the wide promo art. */
function UpdatesEmptyState({
  canWrite,
  onCompose,
}: {
  canWrite: boolean;
  onCompose: () => void;
}) {
  return (
    <View style={styles.emptyQuiet} testID="workspace-updates-empty">
      <View style={styles.emptySkeletons} accessibilityElementsHidden>
        <View style={styles.emptySkeletonCard}>
          <View style={styles.emptySkeletonAvatar} />
          <View style={styles.emptySkeletonCopy}>
            <View style={[styles.emptySkeletonLine, { width: "42%" }]} />
            <View style={[styles.emptySkeletonLine, { width: "78%" }]} />
            <View style={[styles.emptySkeletonLine, { width: "58%" }]} />
          </View>
        </View>
        <View style={[styles.emptySkeletonCard, styles.emptySkeletonCardMuted]}>
          <View style={styles.emptySkeletonAvatar} />
          <View style={styles.emptySkeletonCopy}>
            <View style={[styles.emptySkeletonLine, { width: "36%" }]} />
            <View style={[styles.emptySkeletonLine, { width: "70%" }]} />
          </View>
        </View>
      </View>
      <View style={styles.emptyIcon}>
        <Megaphone size={22} color="#6d28d9" strokeWidth={2.2} />
      </View>
      <Text style={styles.emptyTitle}>Your workspace feed is quiet</Text>
      <Text style={styles.emptyBody}>
        {canWrite
          ? "Posts, wins, and team updates will show up here."
          : "Updates and conversations will appear here when posting is enabled."}
      </Text>
      {canWrite ? (
        <Pressable
          onPress={onCompose}
          style={styles.emptyCta}
          accessibilityRole="button"
          accessibilityLabel="Write the first post"
          testID="workspace-updates-empty-post"
        >
          <PenSquare size={16} color="#FFFFFF" strokeWidth={2.3} />
          <Text style={styles.emptyCtaText}>Write the first post</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#FFFFFF",
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
  listEmpty: {
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
  emptyQuiet: {
    flex: 1,
    minHeight: 300,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  emptySkeletons: {
    alignSelf: "stretch",
    gap: 8,
    marginBottom: 18,
  },
  emptySkeletonCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F7F8FB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ECEEF3",
  },
  emptySkeletonCardMuted: {
    opacity: 0.55,
  },
  emptySkeletonAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E6E8EE",
  },
  emptySkeletonCopy: {
    flex: 1,
    gap: 7,
    paddingTop: 4,
  },
  emptySkeletonLine: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E6E8EE",
  },
  emptyIcon: {
    width: 52,
    height: 52,
    marginBottom: 12,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFE9FF",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#172033",
    textAlign: "center",
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#718096",
    textAlign: "center",
  },
  emptyCta: {
    marginTop: 16,
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#6d28d9",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emptyCtaText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#FFFFFF",
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
