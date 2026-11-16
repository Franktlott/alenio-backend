import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft, Lock, SendHorizontal } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { ActivityReactionRow } from "@/components/activity/ActivityReactionRow";
import { PostMediaAttachment } from "@/components/PostMediaAttachment";
import { UpdateCommentRow } from "@/components/workspace/UpdateCommentRow";
import {
  activityCommentsKey,
  buildCommentThreads,
  COMMENT_MAX_LENGTH,
  type ActivityComment,
} from "@/lib/activity-comments";
import { ApiError, api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import {
  SafeKeyboardAvoidingView,
  useSafeKeyboardVisible,
} from "@/lib/safe-keyboard-controller";
import type { PersonalFeedItem } from "@/lib/types";
import { formatFeedTimestamp } from "@/lib/workspace-updates";
import { colors, elevation } from "@/theme";

const detailKey = (activityId: string) =>
  ["alenio-post-detail", activityId] as const;

export function AlenioPostDetailScreen({
  activityId,
}: {
  activityId: string;
}) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useSafeKeyboardVisible();
  const inputRef = useRef<TextInput>(null);
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const detail = useQuery({
    queryKey: detailKey(activityId),
    queryFn: () => api.get<PersonalFeedItem>(`/api/feed/${activityId}`),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const comments = useQuery({
    queryKey: activityCommentsKey(activityId),
    queryFn: () =>
      api.get<ActivityComment[]>(`/api/feed/${activityId}/comments`),
    refetchOnMount: "always",
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(
    () =>
      buildCommentThreads(comments.data ?? []).flatMap((thread) => [
        { comment: thread.comment, inset: false, replyToName: null },
        ...thread.replies.map((reply) => ({
          comment: reply,
          inset: true,
          replyToName: thread.comment.author.name,
        })),
      ]),
    [comments.data],
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: detailKey(activityId) }),
      queryClient.invalidateQueries({ queryKey: activityCommentsKey(activityId) }),
      queryClient.invalidateQueries({ queryKey: ["personal-feed"] }),
    ]);
  };

  const reaction = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/api/feed/${activityId}/react`, { emoji }),
    onMutate: () => setPickerOpen(false),
    onSettled: () => void refresh(),
  });

  const createComment = useMutation({
    mutationFn: (body: string) =>
      api.post<ActivityComment>(`/api/feed/${activityId}/comments`, { body }),
    onSuccess: async () => {
      setDraft("");
      await refresh();
    },
    onError: async (error) => {
      if (
        error instanceof ApiError &&
        error.body?.error?.code === "COMMENTS_LOCKED"
      ) {
        await refresh();
        toast({ title: "Comments are locked", preset: "error" });
        return;
      }
      toast({ title: "Comment not sent", preset: "error" });
    },
  });

  const item = detail.data;
  const body =
    typeof item?.metadata?.body === "string" ? item.metadata.body.trim() : "";
  const imageUrl =
    typeof item?.metadata?.imageUrl === "string" ? item.metadata.imageUrl : null;
  const mediaType =
    item?.metadata?.mediaType === "video" ? ("video" as const) : ("image" as const);

  const onSend = () => {
    const bodyToSend = draft.trim();
    if (!bodyToSend || item?.commentsLocked || createComment.isPending) return;
    createComment.mutate(bodyToSend);
  };

  const header = item ? (
    <View>
      <View style={styles.postCard} testID="alenio-post-detail-card">
        <View style={styles.authorRow}>
          <Image
            source={require("@/assets/alenio-icon.png")}
            style={styles.alenioMark}
            resizeMode="contain"
            accessibilityLabel="Alenio"
          />
          <View style={styles.authorCopy}>
            <Text style={styles.author}>Alenio</Text>
            <Text style={styles.time}>{formatFeedTimestamp(item.createdAt)}</Text>
          </View>
        </View>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {imageUrl ? (
          <PostMediaAttachment url={imageUrl} mediaType={mediaType} />
        ) : null}
        <ActivityReactionRow
          activityId={item.id}
          reactions={item.reactions}
          currentUserId={currentUserId}
          onToggleReaction={(emoji) => reaction.mutate(emoji)}
          showPicker={pickerOpen}
          onClosePicker={() => setPickerOpen(false)}
          floatPicker
          showPills
        />
        <Pressable
          onPress={() => setPickerOpen((current) => !current)}
          style={styles.reactButton}
          testID="alenio-post-detail-react"
        >
          <Text style={styles.reactButtonText}>React</Text>
        </Pressable>
      </View>

      <View style={styles.threadHeader}>
        <Text style={styles.threadTitle}>
          {rows.length} {rows.length === 1 ? "comment" : "comments"}
        </Text>
      </View>

      {item.commentsLocked ? (
        <View style={styles.locked} testID="alenio-post-comments-locked">
          <Lock size={16} color="#9A5A18" strokeWidth={2.2} />
          <Text style={styles.lockedText}>
            Comments are locked for this post.
          </Text>
        </View>
      ) : null}

      {!item.commentsLocked && rows.length === 0 && !comments.isLoading ? (
        <Text style={styles.empty}>No comments yet. Start the conversation.</Text>
      ) : null}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="alenio-post-detail-back"
        >
          <ChevronLeft size={22} color="#182238" strokeWidth={2.3} />
        </Pressable>
        <Text style={styles.navTitle}>Post</Text>
        <View style={styles.headerSpacer} />
      </View>

      <SafeKeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {!item && detail.isLoading ? (
          <View style={styles.centered} testID="alenio-post-detail-loading">
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : !item ? (
          <View style={styles.centered} testID="alenio-post-detail-error">
            <Text style={styles.errorTitle}>This post is unavailable</Text>
            <Pressable
              onPress={() => void detail.refetch()}
              style={styles.retry}
              testID="alenio-post-detail-retry"
            >
              <Text style={styles.retryText}>Try again</Text>
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
                contained
              />
            )}
            ListHeaderComponent={header}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            testID="alenio-post-detail-comments"
          />
        )}

        {item && !item.commentsLocked ? (
          <View
            style={[
              styles.composer,
              { paddingBottom: keyboardVisible ? 10 : insets.bottom + 6 },
            ]}
            testID="alenio-post-comment-composer"
          >
            <TextInput
              ref={inputRef}
              placeholder="Add a comment"
              placeholderTextColor="#94A3B8"
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={COMMENT_MAX_LENGTH}
              style={styles.input}
              testID="alenio-post-comment-input"
            />
            <TouchableOpacity
              onPress={onSend}
              disabled={!draft.trim() || createComment.isPending}
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              testID="alenio-post-comment-send"
              style={[
                styles.send,
                !draft.trim() || createComment.isPending
                  ? styles.sendDisabled
                  : null,
              ]}
            >
              <SendHorizontal size={18} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeKeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFFFF" },
  flex: { flex: 1, minHeight: 0 },
  navBar: {
    height: 50,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8ECF2",
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#182238",
  },
  headerSpacer: { width: 38 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
  },
  errorTitle: { fontSize: 16, fontWeight: "700", color: "#27324A" },
  retry: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.brand,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700" },
  listContent: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 28,
    gap: 8,
  },
  postCard: {
    ...elevation.card,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  alenioMark: { width: 38, height: 38, borderRadius: 9 },
  authorCopy: { flex: 1, gap: 3 },
  author: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  time: { fontSize: 11, color: colors.textMuted },
  body: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  reactButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
  },
  reactButtonText: { fontSize: 12, fontWeight: "700", color: colors.brand },
  threadHeader: { paddingTop: 20, paddingBottom: 6 },
  threadTitle: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  locked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF7ED",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FED7AA",
  },
  lockedText: { flex: 1, fontSize: 13, color: "#9A5A18" },
  empty: {
    paddingVertical: 18,
    textAlign: "center",
    fontSize: 13,
    color: colors.textMuted,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8ECF2",
    backgroundColor: "#FFFFFF",
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#F3F5F8",
    color: colors.textPrimary,
    fontSize: 14,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  sendDisabled: { opacity: 0.4 },
});
