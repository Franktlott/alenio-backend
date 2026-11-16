import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft, SendHorizontal, X } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import {
  activityCommentsKey,
  activityDetailKey,
  buildCommentThreads,
  commentCountLabel,
  COMMENT_MAX_LENGTH,
  pendingComment,
  reactionCountLabel,
  type ActivityComment,
} from "@/lib/activity-comments";
import {
  applyReactionToggle,
  formatFeedTimestamp,
  totalReactionCount,
  workspaceUpdateBody,
  workspaceUpdateHeadline,
} from "@/lib/workspace-updates";
import {
  SafeKeyboardAvoidingView,
  useSafeKeyboardVisible,
} from "@/lib/safe-keyboard-controller";
import {
  mapApiActivityToFeedItem,
  type ActivityApiEvent,
  type ActivityFeedItem,
} from "@/components/activity";
import { ActivityReactionRow } from "@/components/activity/ActivityReactionRow";
import { ReactionListSheet } from "@/components/workspace/ReactionListSheet";
import { MemberJoinedUpdateCard } from "@/components/workspace/MemberJoinedUpdateCard";
import { MilestoneUpdateCard } from "@/components/workspace/MilestoneUpdateCard";
import { PostUpdateCard } from "@/components/workspace/PostUpdateCard";
import { RecognitionUpdateCard } from "@/components/workspace/RecognitionUpdateCard";
import { UpdateCommentRow } from "@/components/workspace/UpdateCommentRow";
import { WorkspaceUpdateCard } from "@/components/workspace/WorkspaceUpdateCard";
import { useWorkspaceAccess } from "@/lib/workspace-access";

type Props = {
  teamId: string;
  activityId: string;
  /**
   * Present only when the thread lives in a pane. It stands in for the back
   * navigation the pushed route gets for free, and its presence is what tells
   * the screen it is embedded.
   */
  onClose?: () => void;
};

export function UpdateDetailScreen({ teamId, activityId, onClose }: Props) {
  const embedded = onClose != null;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useSafeKeyboardVisible();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const currentUserId = authReady?.me?.id ?? session?.user?.id;
  const currentUserName = authReady?.me?.name ?? session?.user?.name ?? "You";
  const currentUserImage = authReady?.me?.image ?? session?.user?.image ?? null;
  const { access } = useWorkspaceAccess(teamId);
  const canWrite = access.canWrite;

  const [draft, setDraft] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<ActivityComment | null>(null);
  const [pickerCommentId, setPickerCommentId] = useState<string | null>(null);
  const [reactionsFor, setReactionsFor] = useState<
    { kind: "activity" } | { kind: "comment"; commentId: string } | null
  >(null);

  // Seed from the feed's cache so the post paints before the fetch lands.
  const cachedItem = useMemo(() => {
    const events = queryClient.getQueryData<ActivityApiEvent[]>([
      "team-activity",
      teamId,
    ]);
    const found = events?.find((event) => event.id === activityId);
    return found ? mapApiActivityToFeedItem(found) : null;
  }, [activityId, queryClient, teamId]);

  const activityQuery = useQuery({
    queryKey: activityDetailKey(teamId, activityId),
    queryFn: () =>
      api.get<ActivityApiEvent>(`/api/teams/${teamId}/activity/${activityId}`),
    refetchOnMount: "always",
  });

  const commentsQuery = useQuery({
    queryKey: activityCommentsKey(activityId),
    queryFn: () =>
      api.get<ActivityComment[]>(
        `/api/teams/${teamId}/activity/${activityId}/comments`,
      ),
    refetchOnMount: "always",
    // An open thread is a live conversation: poll it and catch up on return.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const item: ActivityFeedItem | null = useMemo(
    () =>
      activityQuery.data
        ? mapApiActivityToFeedItem(activityQuery.data)
        : cachedItem,
    [activityQuery.data, cachedItem],
  );

  const comments = commentsQuery.data ?? [];

  /** Flattened threads: each parent followed by its replies. */
  const rows = useMemo(
    () =>
      buildCommentThreads(comments).flatMap((thread) => [
        { comment: thread.comment, inset: false, replyToName: null },
        ...thread.replies.map((reply) => ({
          comment: reply,
          inset: true,
          replyToName: thread.comment.author.name,
        })),
      ]),
    [comments],
  );

  /** Whose reactions the sheet is showing: the post's, or one comment's. */
  const sheetReactions = useMemo(() => {
    if (!reactionsFor) return {};
    if (reactionsFor.kind === "activity") return item?.reactions ?? {};
    const comment = comments.find((row) => row.id === reactionsFor.commentId);
    return comment?.reactions ?? {};
  }, [comments, item?.reactions, reactionsFor]);

  const refreshFeeds = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: activityDetailKey(teamId, activityId),
      }),
      queryClient.invalidateQueries({ queryKey: ["team-activity", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["personal-recognitions"] }),
    ]);
  }, [activityId, queryClient, teamId]);

  const reactionMutation = useMutation({
    mutationFn: (emoji: string) => {
      if (!canWrite) return Promise.resolve();
      return api.post(`/api/teams/${teamId}/activity/${activityId}/react`, {
        emoji,
      });
    },
    onMutate: (emoji: string) => {
      if (!currentUserId) return;
      queryClient.setQueryData<ActivityApiEvent>(
        activityDetailKey(teamId, activityId),
        (event) =>
          event
            ? {
                ...event,
                reactions: applyReactionToggle(event.reactions, emoji, {
                  id: currentUserId,
                  name: currentUserName,
                }),
              }
            : event,
      );
      setShowPicker(false);
    },
    onSettled: () => {
      void refreshFeeds();
    },
  });

  const commentMutation = useMutation({
    mutationFn: (input: { body: string; parentId: string | null }) => {
      if (!canWrite) return Promise.resolve(null as unknown as ActivityComment);
      return api.post<ActivityComment>(
        `/api/teams/${teamId}/activity/${activityId}/comments`,
        { body: input.body, parentId: input.parentId ?? undefined },
      );
    },
    onMutate: (input: { body: string; parentId: string | null }) => {
      if (!currentUserId) return;
      queryClient.setQueryData<ActivityComment[]>(
        activityCommentsKey(activityId),
        (existing) => [
          ...(existing ?? []),
          pendingComment(
            input.body,
            {
              id: currentUserId,
              name: currentUserName,
              image: currentUserImage,
            },
            Date.now(),
            input.parentId,
          ),
        ],
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: activityCommentsKey(activityId),
      });
      await refreshFeeds();
    },
    onError: () => {
      Alert.alert("Comment not sent", "Check your connection and try again.");
    },
  });

  const commentReactionMutation = useMutation({
    mutationFn: (input: { commentId: string; emoji: string }) => {
      if (!canWrite) return Promise.resolve();
      return api.post(
        `/api/teams/${teamId}/activity/${activityId}/comments/${input.commentId}/react`,
        { emoji: input.emoji },
      );
    },
    onMutate: (input: { commentId: string; emoji: string }) => {
      if (!currentUserId) return;
      queryClient.setQueryData<ActivityComment[]>(
        activityCommentsKey(activityId),
        (existing) =>
          existing?.map((row) =>
            row.id === input.commentId
              ? {
                  ...row,
                  reactions: applyReactionToggle(
                    row.reactions ?? {},
                    input.emoji,
                    { id: currentUserId, name: currentUserName },
                  ),
                }
              : row,
          ),
      );
      setPickerCommentId(null);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: activityCommentsKey(activityId),
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => {
      if (!canWrite) return Promise.resolve();
      return api.delete(
        `/api/teams/${teamId}/activity/${activityId}/comments/${commentId}`,
      );
    },
    onMutate: (commentId: string) => {
      queryClient.setQueryData<ActivityComment[]>(
        activityCommentsKey(activityId),
        // Replies cascade with their parent, so drop them here too.
        (existing) =>
          existing?.filter(
            (row) => row.id !== commentId && row.parentId !== commentId,
          ),
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: activityCommentsKey(activityId),
      });
      await refreshFeeds();
    },
  });

  const onSend = () => {
    const body = draft.trim();
    if (!canWrite || !body || commentMutation.isPending) return;
    setDraft("");
    commentMutation.mutate({ body, parentId: replyTo?.id ?? null });
    setReplyTo(null);
  };

  const confirmDelete = (comment: ActivityComment) => {
    Alert.alert("Delete comment?", "This removes it for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteCommentMutation.mutate(comment.id),
      },
    ]);
  };

  const picker =
    showPicker && item ? (
      <ActivityReactionRow
        activityId={item.id}
        reactions={item.reactions ?? {}}
        currentUserId={currentUserId}
        onToggleReaction={(emoji) => reactionMutation.mutate(emoji)}
        showPicker
        onClosePicker={() => setShowPicker(false)}
        floatPicker
        showPills={false}
        tone="default"
      />
    ) : null;

  const header = item ? (
    <View>
      <View style={styles.postWrap}>
        {item.type === "celebration" ? (
          <RecognitionUpdateCard
            item={item}
            currentUserId={currentUserId}
            onPressReact={
              canWrite ? () => setShowPicker((open) => !open) : undefined
            }
            onToggleReaction={
              canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
            }
            onPressReactions={() => setReactionsFor({ kind: "activity" })}
            commentCount={item.commentCount ?? 0}
            picker={picker}
          />
        ) : item.type === "member_joined" ? (
          <MemberJoinedUpdateCard
            item={item}
            currentUserId={currentUserId}
            onPressReact={
              canWrite ? () => setShowPicker((open) => !open) : undefined
            }
            onToggleReaction={
              canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
            }
            onPressReactions={() => setReactionsFor({ kind: "activity" })}
            commentCount={item.commentCount ?? 0}
            picker={picker}
          />
        ) : item.type === "task_milestone" ? (
          <MilestoneUpdateCard
            item={item}
            currentUserId={currentUserId}
            onPressReact={
              canWrite ? () => setShowPicker((open) => !open) : undefined
            }
            onToggleReaction={
              canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
            }
            onPressReactions={() => setReactionsFor({ kind: "activity" })}
            commentCount={item.commentCount ?? 0}
            picker={picker}
          />
        ) : item.type === "post" ? (
          <PostUpdateCard
            item={item}
            currentUserId={currentUserId}
            onPressReact={
              canWrite ? () => setShowPicker((open) => !open) : undefined
            }
            onToggleReaction={
              canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
            }
            onPressReactions={() => setReactionsFor({ kind: "activity" })}
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
            currentUserId={currentUserId}
            reactions={item.reactions ?? {}}
            onPressReactions={() => setReactionsFor({ kind: "activity" })}
            onPressLike={
              canWrite ? () => setShowPicker((open) => !open) : undefined
            }
            onToggleReaction={
              canWrite ? (emoji) => reactionMutation.mutate(emoji) : undefined
            }
            onLongPress={
              canWrite ? () => setShowPicker((open) => !open) : undefined
            }
            commentCount={item.commentCount ?? 0}
            picker={picker}
          />
        )}
      </View>

      <View style={styles.summary}>
        <Text
          style={[
            styles.summaryText,
            embedded ? styles.summaryTextCompact : null,
          ]}
        >
          {reactionCountLabel(totalReactionCount(item.reactions))}
          {"  ·  "}
          {commentCountLabel(comments.length)}
        </Text>
      </View>

      {comments.length === 0 && !commentsQuery.isLoading ? (
        <Text
          style={[styles.empty, embedded ? styles.emptyCompact : null]}
          testID="update-comments-empty"
        >
          No comments yet. Start the conversation.
        </Text>
      ) : null}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.page} edges={embedded ? [] : ["top"]}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => (onClose ? onClose() : router.back())}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={embedded ? "Close update" : "Back"}
          testID="update-detail-back"
        >
          {/* A pane is dismissed, not navigated back from. */}
          {embedded ? (
            <X size={20} color="#182238" strokeWidth={2.4} />
          ) : (
            <ChevronLeft size={22} color="#182238" strokeWidth={2.3} />
          )}
        </Pressable>
        <Text
          style={[styles.navTitle, embedded ? styles.navTitleCompact : null]}
          numberOfLines={1}
        >
          Post
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <SafeKeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {!item && activityQuery.isLoading ? (
          <View style={styles.centered} testID="update-detail-loading">
            <ActivityIndicator color="#6d28d9" />
          </View>
        ) : !item ? (
          <View style={styles.centered} testID="update-detail-error">
            <Text style={styles.errorTitle}>
              Couldn&apos;t load this update
            </Text>
            <Pressable
              onPress={() => void activityQuery.refetch()}
              style={styles.retry}
              testID="update-detail-retry"
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.comment.id}
            renderItem={({ item: row }) => (
              <UpdateCommentRow
                comment={row.comment}
                currentUserId={currentUserId}
                inset={row.inset}
                replyToName={row.replyToName}
                compact={embedded}
                contained
                onDelete={canWrite ? confirmDelete : undefined}
                onPressReact={
                  canWrite
                    ? (comment) =>
                        setPickerCommentId((open) =>
                          open === comment.id ? null : comment.id,
                        )
                    : undefined
                }
                onPressReply={
                  canWrite ? (comment) => setReplyTo(comment) : undefined
                }
                onPressReactions={(comment) =>
                  setReactionsFor({ kind: "comment", commentId: comment.id })
                }
                picker={
                  pickerCommentId === row.comment.id ? (
                    <ActivityReactionRow
                      activityId={row.comment.id}
                      reactions={row.comment.reactions ?? {}}
                      currentUserId={currentUserId}
                      onToggleReaction={(emoji) => {
                        if (!canWrite) return;
                        commentReactionMutation.mutate({
                          commentId: row.comment.id,
                          emoji,
                        });
                      }}
                      showPicker
                      onClosePicker={() => setPickerCommentId(null)}
                      floatPicker
                      showPills={false}
                      tone="default"
                    />
                  ) : null
                }
              />
            )}
            ListHeaderComponent={header}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            testID="update-detail-comments"
          />
        )}

        {replyTo ? (
          <View style={styles.replyBanner} testID="update-reply-banner">
            <Text style={styles.replyBannerText} numberOfLines={1}>
              Replying to {replyTo.author.name?.trim() || "Someone"}
            </Text>
            <Pressable
              onPress={() => setReplyTo(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
              testID="update-reply-cancel"
            >
              <X size={15} color="#7A879B" strokeWidth={2.4} />
            </Pressable>
          </View>
        ) : null}

        {canWrite ? (
        <View
          style={[
            styles.composer,
            { paddingBottom: keyboardVisible ? 10 : insets.bottom + 6 },
          ]}
          testID="update-comment-composer"
        >
          <TextInput
            placeholder={
              replyTo
                ? `Reply to ${replyTo.author.name?.trim() || "Someone"}`
                : "Add a comment"
            }
            placeholderTextColor="#94A3B8"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={COMMENT_MAX_LENGTH}
            style={[styles.input, embedded ? styles.inputCompact : null]}
            testID="update-comment-input"
          />
          <TouchableOpacity
            onPress={onSend}
            disabled={!draft.trim() || commentMutation.isPending}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            testID="update-comment-send"
            style={[
              styles.send,
              !draft.trim() || commentMutation.isPending
                ? styles.sendDisabled
                : null,
            ]}
          >
            <SendHorizontal size={18} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
        ) : null}
      </SafeKeyboardAvoidingView>

      <ReactionListSheet
        visible={!!reactionsFor}
        reactions={sheetReactions}
        currentUserId={currentUserId}
        onClose={() => setReactionsFor(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  flex: {
    flex: 1,
    minHeight: 0,
  },
  navBar: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8ECF2",
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * A pane sits beside the feed, inside a page whose type runs a step smaller
   * than a full screen's. These keep the thread from shouting next to it.
   */
  navTitleCompact: {
    fontSize: 14.5,
    lineHeight: 19,
  },
  summaryTextCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  emptyCompact: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  inputCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: "#182238",
  },
  headerSpacer: { width: 38 },
  listContent: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    flexGrow: 1,
  },
  postWrap: {
    paddingTop: 0,
  },
  summary: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  summaryText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#8A94A6",
  },
  empty: {
    paddingTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#8A94A6",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#27324A",
  },
  retry: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#6d28d9",
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: "#F4F6FB",
    borderTopWidth: 1,
    borderTopColor: "#EEF1F6",
  },
  replyBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#64748B",
  },
  composer: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EEF1F6",
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#E4E9F2",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 8,
    fontSize: 14,
    lineHeight: 19,
    color: "#0F172A",
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6d28d9",
  },
  sendDisabled: {
    opacity: 0.4,
  },
});
