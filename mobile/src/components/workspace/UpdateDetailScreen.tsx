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
import { ChevronLeft, SendHorizontal } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import {
  activityCommentsKey,
  activityDetailKey,
  commentCountLabel,
  COMMENT_MAX_LENGTH,
  pendingComment,
  reactionCountLabel,
  type ActivityComment,
} from "@/lib/activity-comments";
import {
  applyReactionToggle,
  formatFeedTimestamp,
  myReactionEmoji,
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
import { PostUpdateCard } from "@/components/workspace/PostUpdateCard";
import { RecognitionUpdateCard } from "@/components/workspace/RecognitionUpdateCard";
import { UpdateCommentRow } from "@/components/workspace/UpdateCommentRow";
import { WorkspaceUpdateCard } from "@/components/workspace/WorkspaceUpdateCard";

type Props = {
  teamId: string;
  activityId: string;
};

export function UpdateDetailScreen({ teamId, activityId }: Props) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useSafeKeyboardVisible();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const currentUserId = authReady?.me?.id ?? session?.user?.id;
  const currentUserName = authReady?.me?.name ?? session?.user?.name ?? "You";
  const currentUserImage = authReady?.me?.image ?? session?.user?.image ?? null;

  const [draft, setDraft] = useState("");
  const [showPicker, setShowPicker] = useState(false);

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
  });

  const item: ActivityFeedItem | null = useMemo(
    () =>
      activityQuery.data
        ? mapApiActivityToFeedItem(activityQuery.data)
        : cachedItem,
    [activityQuery.data, cachedItem],
  );

  const comments = commentsQuery.data ?? [];

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
    mutationFn: (emoji: string) =>
      api.post(`/api/teams/${teamId}/activity/${activityId}/react`, { emoji }),
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
    mutationFn: (body: string) =>
      api.post<ActivityComment>(
        `/api/teams/${teamId}/activity/${activityId}/comments`,
        { body },
      ),
    onMutate: (body: string) => {
      if (!currentUserId) return;
      queryClient.setQueryData<ActivityComment[]>(
        activityCommentsKey(activityId),
        (rows) => [
          ...(rows ?? []),
          pendingComment(body, {
            id: currentUserId,
            name: currentUserName,
            image: currentUserImage,
          }),
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

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      api.delete(
        `/api/teams/${teamId}/activity/${activityId}/comments/${commentId}`,
      ),
    onMutate: (commentId: string) => {
      queryClient.setQueryData<ActivityComment[]>(
        activityCommentsKey(activityId),
        (rows) => rows?.filter((row) => row.id !== commentId),
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
    if (!body || commentMutation.isPending) return;
    setDraft("");
    commentMutation.mutate(body);
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
            onPressReact={() => setShowPicker((open) => !open)}
            picker={picker}
          />
        ) : item.type === "post" ? (
          <PostUpdateCard
            item={item}
            currentUserId={currentUserId}
            onPressReact={() => setShowPicker((open) => !open)}
            picker={picker}
          />
        ) : (
          <WorkspaceUpdateCard
            author={item.actor ?? { name: "Someone" }}
            timestamp={formatFeedTimestamp(item.timestamp)}
            headline={workspaceUpdateHeadline(item)}
            body={workspaceUpdateBody(item)}
            reactionCount={totalReactionCount(item.reactions)}
            myReaction={myReactionEmoji(item.reactions, currentUserId)}
            onPressLike={() => setShowPicker((open) => !open)}
            onLongPress={() => setShowPicker((open) => !open)}
            picker={picker}
          />
        )}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {reactionCountLabel(totalReactionCount(item.reactions))}
          {"  ·  "}
          {commentCountLabel(comments.length)}
        </Text>
      </View>

      {comments.length === 0 && !commentsQuery.isLoading ? (
        <Text style={styles.empty} testID="update-comments-empty">
          No comments yet. Start the conversation.
        </Text>
      ) : null}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="update-detail-back"
        >
          <ChevronLeft size={26} color="#0F172A" strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>
          {item?.actor?.name ?? "Update"}
        </Text>
      </View>

      <SafeKeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {!item && activityQuery.isLoading ? (
          <View style={styles.centered} testID="update-detail-loading">
            <ActivityIndicator color="#4361EE" />
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
            data={comments}
            keyExtractor={(comment) => comment.id}
            renderItem={({ item: comment }) => (
              <UpdateCommentRow comment={comment} onDelete={confirmDelete} />
            )}
            ListHeaderComponent={header}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            testID="update-detail-comments"
          />
        )}

        <View
          style={[
            styles.composer,
            { paddingBottom: keyboardVisible ? 10 : insets.bottom + 6 },
          ]}
          testID="update-comment-composer"
        >
          <TextInput
            placeholder="Add a comment"
            placeholderTextColor="#94A3B8"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={COMMENT_MAX_LENGTH}
            style={styles.input}
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
      </SafeKeyboardAvoidingView>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F6",
  },
  navTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: "#0F172A",
  },
  listContent: {
    paddingBottom: 16,
    flexGrow: 1,
  },
  postWrap: {
    paddingTop: 0,
  },
  summary: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 6,
  },
  summaryText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#8A94A6",
  },
  empty: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
    backgroundColor: "#4361EE",
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  composer: {
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
    backgroundColor: "#4361EE",
  },
  sendDisabled: {
    opacity: 0.4,
  },
});
