import { Pressable, StyleSheet, Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { ActivityComment } from "@/lib/activity-comments";
import { isPendingComment } from "@/lib/activity-comments";
import { formatFeedTimestamp, myReactionEmoji } from "@/lib/workspace-updates";
import { feedReaction, feedReactionLabel } from "@/lib/feed-reactions";

type Props = {
  comment: ActivityComment;
  currentUserId?: string;
  onDelete?: (comment: ActivityComment) => void;
  /** Opens the emoji tray for this comment. */
  onPressReact?: (comment: ActivityComment) => void;
  /** Aims the composer at this comment's thread. */
  onPressReply?: (comment: ActivityComment) => void;
  /** Emoji tray, rendered under the bubble while it is open. */
  picker?: React.ReactNode;
  /** Replies sit indented under their parent. */
  inset?: boolean;
};

/** One comment: avatar beside a soft bubble, the way chat threads read. */
export function UpdateCommentRow({
  comment,
  currentUserId,
  onDelete,
  onPressReact,
  onPressReply,
  picker,
  inset = false,
}: Props) {
  const pending = isPendingComment(comment);
  const name = comment.author.name?.trim() || "Someone";
  const reactions = comment.reactions ?? {};
  const mine = myReactionEmoji(reactions, currentUserId);
  const reactionCount = Object.values(reactions).reduce(
    (total, group) => total + group.count,
    0,
  );
  const mineColor = feedReaction(mine)?.color;
  const size = inset ? 26 : 32;

  return (
    <View
      style={[
        styles.row,
        inset ? styles.rowInset : null,
        pending ? styles.pending : null,
      ]}
      testID={`update-comment-${comment.id}`}
    >
      <UserAvatar
        user={{ name, image: comment.author.image }}
        size={size}
        radius={size / 2}
        backgroundColor="#EEF2FF"
        textColor="#4361EE"
        fontSize={inset ? 11 : 13}
        workplaceConnected={false}
      />
      <View style={styles.main}>
        <View style={styles.bubble}>
          <View style={styles.header}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.time}>
              {pending ? "Sending" : formatFeedTimestamp(comment.createdAt)}
            </Text>
            {onDelete && comment.canDelete ? (
              <Pressable
                onPress={() => onDelete(comment)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Delete your comment"
                testID={`delete-update-comment-${comment.id}`}
              >
                <Trash2 size={14} color="#98A2B3" strokeWidth={2.1} />
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.body}>{comment.body}</Text>

          {reactionCount > 0 ? (
            <View style={styles.reactionSummary}>
              {Object.entries(reactions)
                .filter(([, group]) => group.count > 0)
                .map(([emoji, group]) => (
                  <View key={emoji} style={styles.reactionChip}>
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    <Text style={styles.reactionCount}>{group.count}</Text>
                  </View>
                ))}
            </View>
          ) : null}
        </View>

        {picker}

        {!pending && (onPressReact || onPressReply) ? (
          <View style={styles.actions}>
            {onPressReact ? (
              <Pressable
                onPress={() => onPressReact(comment)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  mine
                    ? `Your reaction: ${feedReactionLabel(mine)}. Change or remove it.`
                    : "React to this comment"
                }
                testID={`react-update-comment-${comment.id}`}
                style={styles.actionBtn}
              >
                {mine ? (
                  <Text style={styles.actionGlyph}>{mine}</Text>
                ) : null}
                <Text
                  style={[
                    styles.actionText,
                    mine && mineColor ? { color: mineColor } : null,
                  ]}
                >
                  {mine ? feedReactionLabel(mine) : "React"}
                </Text>
              </Pressable>
            ) : null}
            {onPressReply ? (
              <Pressable
                onPress={() => onPressReply(comment)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Reply to ${name}`}
                testID={`reply-update-comment-${comment.id}`}
                style={styles.actionBtn}
              >
                <Text style={styles.actionText}>Reply</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  rowInset: {
    paddingLeft: 46,
  },
  pending: {
    opacity: 0.6,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  bubble: {
    borderRadius: 14,
    backgroundColor: "#F3F5F9",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  name: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: "#0F172A",
  },
  time: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: "#8A94A6",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: "#1E293B",
  },
  reactionSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 7,
  },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 11,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "#FFFFFF",
  },
  reactionEmoji: {
    fontSize: 12,
    lineHeight: 16,
  },
  reactionCount: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 3,
    paddingLeft: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    justifyContent: "center",
  },
  actionGlyph: {
    fontSize: 13,
    lineHeight: 17,
  },
  actionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#7A879B",
  },
});
