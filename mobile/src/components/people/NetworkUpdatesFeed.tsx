import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  EyeOff,
  MoreHorizontal,
  SendHorizontal,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { router } from "expo-router";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { UserAvatar } from "@/components/UserAvatar";
import { PostMediaAttachment } from "@/components/PostMediaAttachment";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
} from "@/components/AlenioBottomSheet";
import { ActivityReactionRow } from "@/components/activity/ActivityReactionRow";
import { FeedEngagementRow } from "@/components/workspace/FeedEngagementRow";
import {
  formatFeedTimestamp,
  myReactionEmoji,
} from "@/lib/workspace-updates";
import { useTabBarClearanceFn } from "@/lib/tab-bar";
import type {
  NetworkUpdate,
  NetworkUpdateComment,
  NetworkUpdateCommentsResponse,
  NetworkUpdatesFeedResponse,
} from "@/lib/types";

const FEED_KEY = ["network-updates"] as const;

function updateFeedItem(
  current: InfiniteData<NetworkUpdatesFeedResponse> | undefined,
  id: string,
  update: (item: NetworkUpdate) => NetworkUpdate,
) {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === id ? update(item) : item)),
    })),
  };
}

function removeFeedItem(
  current: InfiniteData<NetworkUpdatesFeedResponse> | undefined,
  id: string,
) {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== id),
    })),
  };
}

export function NetworkUpdatesFeed({
  onFindPeople,
}: {
  onFindPeople: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const currentUserName = session?.user?.name?.trim() || "You";
  const bottomClearance = useTabBarClearanceFn()(14);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionItem, setActionItem] = useState<NetworkUpdate | null>(null);

  const feed = useInfiniteQuery({
    queryKey: FEED_KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<NetworkUpdatesFeedResponse>(
        `/api/network-updates?limit=12${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""
        }`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: 25_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const allItems = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );

  const reactionMutation = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) =>
      api.post(`/api/network-updates/${id}/react`, { emoji }),
    onMutate: ({ id, emoji }) => {
      if (!currentUserId) return;
      queryClient.setQueryData<InfiniteData<NetworkUpdatesFeedResponse>>(
        FEED_KEY,
        (current) =>
          updateFeedItem(current, id, (item) => ({
            ...item,
            reactions: toggleReaction(
              item,
              emoji,
              currentUserId,
              currentUserName,
            ),
          })),
      );
      setPickerId(null);
    },
    onError: () => {
      toast({ title: "Couldn’t update reaction", preset: "error" });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/network-updates/${id}`),
    onSuccess: () => {
      toast({ title: "Update deleted", preset: "done" });
      void queryClient.invalidateQueries({ queryKey: FEED_KEY });
    },
    onError: () => toast({ title: "Couldn’t delete update", preset: "error" }),
  });

  const hideMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<void>(`/api/network-updates/${id}/hide`, undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: FEED_KEY });
      const previous =
        queryClient.getQueryData<InfiniteData<NetworkUpdatesFeedResponse>>(
          FEED_KEY,
        );

      queryClient.setQueryData<InfiniteData<NetworkUpdatesFeedResponse>>(
        FEED_KEY,
        (current) => removeFeedItem(current, id),
      );
      setPickerId((current) => (current === id ? null : current));

      return { previous };
    },
    onSuccess: () => toast({ title: "Update hidden", preset: "done" }),
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(FEED_KEY, context.previous);
      }
      toast({ title: "Couldn’t hide update", preset: "error" });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });

  const confirmDelete = (item: NetworkUpdate) =>
    Alert.alert(
      "Delete network update?",
      "This removes the update and its comments from your network.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(item.id),
        },
      ],
    );

  const confirmHide = (item: NetworkUpdate) =>
    Alert.alert(
      "Hide network update?",
      "Only you will stop seeing this update. The author won’t be notified.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide update",
          style: "destructive",
          onPress: () => hideMutation.mutate(item.id),
        },
      ],
    );

  const openUpdateActions = (item: NetworkUpdate) => {
    if (
      item.canDelete ||
      (currentUserId && item.user?.id && item.user.id !== currentUserId)
    ) {
      setActionItem(item);
    }
  };

  const openComposer = ({
    attach = false,
    draft,
  }: {
    attach?: boolean;
    draft?: string;
  } = {}) =>
    router.push({
      pathname: "/create-post",
      params: {
        scope: "network",
        ...(attach ? { attach: "1" } : {}),
        ...(draft ? { draft } : {}),
      },
    });

  const refreshFeed = async () => {
    setRefreshing(true);
    try {
      queryClient.setQueryData<InfiniteData<NetworkUpdatesFeedResponse>>(
        FEED_KEY,
        (current) =>
          current
            ? {
                pages: current.pages.slice(0, 1),
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      await feed.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const openDetail = (id: string) =>
    router.push({
      pathname: "/network-update-detail",
      params: { activityId: id },
    });

  return (
    <>
      <FlatList
        data={allItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NetworkUpdateCard
            item={item}
            currentUserId={currentUserId}
            pickerOpen={pickerId === item.id}
            commentsOpen={false}
            onTogglePicker={() =>
              setPickerId((current) => (current === item.id ? null : item.id))
            }
            onReact={(emoji) => reactionMutation.mutate({ id: item.id, emoji })}
            onToggleComments={() => openDetail(item.id)}
            onMore={() => openUpdateActions(item)}
            onOpen={() => openDetail(item.id)}
          />
        )}
        ListHeaderComponent={
          <View>
            <View style={styles.composer}>
              <View style={styles.composerTop}>
                <UserAvatar
                  user={{
                    name: session?.user?.name ?? "You",
                    image: session?.user?.image ?? null,
                  }}
                  size={36}
                  radius={18}
                  backgroundColor="#EFE9FF"
                  textColor="#6d28d9"
                />
                <Pressable
                  onPress={() => openComposer()}
                  style={styles.composerPrompt}
                  accessibilityRole="button"
                  accessibilityLabel="Share an update with your network"
                  testID="network-updates-compose"
                >
                  <Text style={styles.composerPlaceholder}>
                    Share an update with your network…
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          feed.isLoading ? (
            <View style={styles.state} testID="network-updates-loading">
              <ActivityIndicator color="#6d28d9" />
              <Text style={styles.stateBody}>Loading your network…</Text>
            </View>
          ) : feed.isError ? (
            <View style={styles.state} testID="network-updates-error">
              <Text style={styles.stateTitle}>Updates are unavailable</Text>
              <Text style={styles.stateBody}>
                Check your connection and try again.
              </Text>
              <Pressable
                onPress={() => void feed.refetch()}
                style={styles.retry}
                testID="network-updates-retry"
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty} testID="network-updates-empty">
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
                <Users size={22} color="#6d28d9" strokeWidth={2.2} />
              </View>
              <Text style={styles.stateTitle}>Your network feed is quiet</Text>
              <Text style={styles.stateBody}>
                Updates from people you connect with will show up here.
              </Text>
              <Pressable
                onPress={onFindPeople}
                style={styles.emptyCta}
                accessibilityRole="button"
                accessibilityLabel="Find people"
                testID="network-updates-find-people"
              >
                <UserPlus size={16} color="#FFFFFF" strokeWidth={2.3} />
                <Text style={styles.emptyCtaText}>Find people</Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator style={styles.footerLoader} color="#6d28d9" />
          ) : null
        }
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) {
            void feed.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.35}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshFeed()}
            tintColor="#6d28d9"
          />
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: bottomClearance },
          allItems.length === 0 ? styles.listEmpty : null,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        testID="network-updates-feed"
      />

      <AlenioBottomSheet
        visible={!!actionItem}
        title="Update options"
        subtitle={
          actionItem?.canDelete
            ? "Manage your network update"
            : "Choose what you want to see in your feed"
        }
        onClose={() => setActionItem(null)}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="network-update-actions-sheet"
      >
        {actionItem?.canDelete ? (
          <AlenioSheetOption
            icon={<Trash2 size={17} color="#FFFFFF" />}
            title="Delete update"
            subtitle="Permanently remove this update"
            destructive
            onPress={() => {
              const item = actionItem;
              setActionItem(null);
              setTimeout(() => confirmDelete(item), 220);
            }}
            testID={`network-update-${actionItem.id}-delete-option`}
          />
        ) : actionItem ? (
          <AlenioSheetOption
            icon={<EyeOff size={17} color="#FFFFFF" />}
            iconColor="#64748B"
            tint="slate"
            title="Hide update"
            subtitle="Only you will stop seeing this update"
            onPress={() => {
              const item = actionItem;
              setActionItem(null);
              setTimeout(() => confirmHide(item), 220);
            }}
            testID={`network-update-${actionItem.id}-hide-option`}
          />
        ) : null}
      </AlenioBottomSheet>
    </>
  );
}

export function NetworkUpdateCard({
  item,
  currentUserId,
  pickerOpen,
  commentsOpen,
  onTogglePicker,
  onReact,
  onToggleComments,
  onMore,
  onOpen,
}: {
  item: NetworkUpdate;
  currentUserId: string;
  pickerOpen: boolean;
  commentsOpen: boolean;
  onTogglePicker: () => void;
  onReact: (emoji: string) => void;
  onToggleComments: () => void;
  onMore: () => void;
  onOpen?: () => void;
}) {
  const body = item.metadata?.body?.trim();
  const imageUrl = item.metadata?.imageUrl;
  const width = item.metadata?.imageWidth;
  const height = item.metadata?.imageHeight;
  const mediaType = item.metadata?.mediaType ?? "image";
  const suppressOpenUntil = useRef(0);
  const openUpdate = () => {
    if (Date.now() < suppressOpenUntil.current) return;
    onOpen?.();
  };

  return (
    <Pressable
      onPress={onOpen ? openUpdate : undefined}
      disabled={!onOpen}
      style={styles.card}
      testID={`network-update-${item.id}`}
      accessibilityRole={onOpen ? "button" : undefined}
      accessibilityHint={onOpen ? "Opens update details" : undefined}
    >
      <View style={styles.cardHeader}>
        <UserAvatar
          user={item.user ?? { name: "Alenio member", image: null }}
          size={36}
          radius={18}
          backgroundColor="#EFE9FF"
          textColor="#6d28d9"
          resetKey={item.id}
        />
        <View style={styles.authorCopy}>
          <Text style={styles.authorName} numberOfLines={1}>
            {item.user?.name ?? "Alenio member"}
          </Text>
          <Text style={styles.timestamp}>
            {formatFeedTimestamp(item.createdAt)}
          </Text>
        </View>
        <Pressable
          onPress={onMore}
          hitSlop={8}
          style={styles.more}
          accessibilityRole="button"
          accessibilityLabel="More update actions"
          testID={`network-update-${item.id}-more`}
        >
          <MoreHorizontal size={19} color="#718096" />
        </Pressable>
      </View>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {imageUrl ? (
        <PostMediaAttachment
          url={imageUrl}
          mediaType={mediaType}
          width={width}
          height={height}
          testID={`network-update-${item.id}-${mediaType === "video" ? "video" : "photo"}`}
          onInteraction={() => {
            suppressOpenUntil.current = Date.now() + 750;
          }}
        />
      ) : null}
      <View style={styles.reactionPicker}>
        <ActivityReactionRow
          activityId={item.id}
          reactions={item.reactions}
          currentUserId={currentUserId}
          onToggleReaction={onReact}
          showPicker={pickerOpen}
          onClosePicker={onTogglePicker}
          floatPicker
          showPills={false}
        />
      </View>
      <FeedEngagementRow
        reactions={item.reactions}
        currentUserId={currentUserId}
        onToggleReaction={onReact}
        onOpenPicker={onTogglePicker}
        onPressReactions={onTogglePicker}
        onPressComment={onToggleComments}
        commentCount={item.commentCount}
        testID={`network-update-${item.id}-engage`}
      />
      {commentsOpen ? <NetworkComments update={item} /> : null}
    </Pressable>
  );
}

export function NetworkComments({ update }: { update: NetworkUpdate }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const commentsKey = ["network-update-comments", update.id] as const;
  const comments = useQuery({
    queryKey: commentsKey,
    queryFn: () =>
      api.get<NetworkUpdateCommentsResponse>(
        `/api/network-updates/${update.id}/comments`,
      ),
  });
  const rows = comments.data ?? [];

  const createComment = useMutation({
    mutationFn: (body: string) =>
      api.post<NetworkUpdateComment>(
        `/api/network-updates/${update.id}/comments`,
        { body },
      ),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: commentsKey });
      void queryClient.invalidateQueries({ queryKey: FEED_KEY });
      void queryClient.invalidateQueries({
        queryKey: ["network-update-detail", update.id],
      });
    },
    onError: () => toast({ title: "Comment not sent", preset: "error" }),
  });
  const deleteComment = useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/api/network-updates/${update.id}/comments/${commentId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentsKey });
      void queryClient.invalidateQueries({ queryKey: FEED_KEY });
      void queryClient.invalidateQueries({
        queryKey: ["network-update-detail", update.id],
      });
    },
    onError: () => toast({ title: "Couldn’t delete comment", preset: "error" }),
  });

  return (
    <View
      style={styles.comments}
      testID={`network-update-${update.id}-comment-panel`}
    >
      {comments.isLoading ? (
        <ActivityIndicator
          style={styles.commentsLoader}
          size="small"
          color="#6d28d9"
        />
      ) : comments.isError ? (
        <Pressable
          onPress={() => void comments.refetch()}
          style={styles.commentError}
        >
          <Text style={styles.commentErrorText}>
            Couldn’t load comments. Tap to retry.
          </Text>
        </Pressable>
      ) : rows.length === 0 ? (
        <Text style={styles.noComments}>
          No comments yet. Start the conversation.
        </Text>
      ) : (
        rows.map((comment) => (
          <View
            key={comment.id}
            style={[
              styles.commentRow,
              comment.parentId ? styles.commentReply : null,
            ]}
          >
            <UserAvatar
              user={comment.author}
              size={28}
              radius={14}
              backgroundColor="#EFE9FF"
              textColor="#6d28d9"
            />
            <View style={styles.commentBubble}>
              <View style={styles.commentMeta}>
                <Text style={styles.commentAuthor}>{comment.author.name}</Text>
                <Text style={styles.commentTime}>
                  {formatFeedTimestamp(comment.createdAt)}
                </Text>
              </View>
              <Text style={styles.commentBody}>{comment.body}</Text>
            </View>
            {comment.canDelete ? (
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Delete comment?",
                    "This removes it from your network update.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => deleteComment.mutate(comment.id),
                      },
                    ],
                  )
                }
                hitSlop={8}
                accessibilityLabel="Delete comment"
                testID={`network-comment-${comment.id}-delete`}
              >
                <X size={14} color="#98A2B3" />
              </Pressable>
            ) : null}
          </View>
        ))
      )}
      <View style={styles.commentComposer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment"
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={1000}
          style={styles.commentInput}
          testID={`network-update-${update.id}-comment-input`}
        />
        <Pressable
          onPress={() => createComment.mutate(draft.trim())}
          disabled={!draft.trim() || createComment.isPending}
          style={[
            styles.commentSend,
            !draft.trim() || createComment.isPending
              ? styles.commentSendDisabled
              : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
          testID={`network-update-${update.id}-comment-send`}
        >
          {createComment.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <SendHorizontal size={16} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function toggleReaction(
  item: NetworkUpdate,
  emoji: string,
  userId: string,
  userName: string,
) {
  const mine = myReactionEmoji(item.reactions, userId);
  const next = { ...item.reactions };
  if (mine) {
    const existing = next[mine];
    if (existing) {
      const userIds = existing.userIds.filter((id) => id !== userId);
      if (userIds.length === 0) delete next[mine];
      else {
        next[mine] = {
          count: userIds.length,
          userIds,
          users: existing.users.filter((user) => user.id !== userId),
        };
      }
    }
  }
  if (mine !== emoji) {
    const existing = next[emoji];
    next[emoji] = {
      count: (existing?.count ?? 0) + 1,
      userIds: [...(existing?.userIds ?? []), userId],
      users: [...(existing?.users ?? []), { id: userId, name: userName }],
    };
  }
  return next;
}

const styles = StyleSheet.create({
  list: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  listEmpty: { flexGrow: 1 },
  composer: {
    marginBottom: 4,
    padding: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DFE5EE",
    backgroundColor: "#FFFFFF",
    shadowColor: "#172554",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  composerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  composerPrompt: {
    flex: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "#FFFFFF",
  },
  composerPlaceholder: { fontSize: 13, color: "#8A96A8" },
  card: {
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DFE5EE",
    backgroundColor: "#FFFFFF",
    shadowColor: "#172554",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  authorCopy: { flex: 1, minWidth: 0 },
  authorName: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "700",
    color: "#101828",
  },
  timestamp: { marginTop: 1, fontSize: 11.5, color: "#8490A2" },
  more: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { marginTop: 8, fontSize: 14.5, lineHeight: 21, color: "#243149" },
  reactionPicker: { position: "relative", zIndex: 5 },
  state: {
    flex: 1,
    minHeight: 250,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  empty: {
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
  stateTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#172033",
    textAlign: "center",
  },
  stateBody: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#718096",
    textAlign: "center",
  },
  retry: {
    marginTop: 14,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#6d28d9",
  },
  retryText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  footerLoader: { paddingVertical: 18 },
  comments: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EBEEF3",
    gap: 6,
  },
  commentsLoader: { paddingVertical: 10 },
  noComments: { paddingVertical: 5, fontSize: 11.5, color: "#7C8899" },
  commentError: { paddingVertical: 7 },
  commentErrorText: { fontSize: 11.5, color: "#B42318" },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  commentReply: { marginLeft: 28 },
  commentBubble: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "#F4F6F9",
  },
  commentMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentAuthor: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "700",
    color: "#263248",
  },
  commentTime: { fontSize: 9.5, color: "#98A2B3" },
  commentBody: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17,
    color: "#344054",
  },
  commentComposer: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
  },
  commentInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 88,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: "#F3F5F8",
    fontSize: 12.5,
    color: "#172033",
  },
  commentSend: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6d28d9",
  },
  commentSendDisabled: { opacity: 0.4 },
});
