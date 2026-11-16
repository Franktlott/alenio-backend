import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { CornerDownRight, Trash2 } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { ActivityComment } from "@/lib/activity-comments";
import { isPendingComment } from "@/lib/activity-comments";
import { formatFeedTimestamp, myReactionEmoji } from "@/lib/workspace-updates";
import { ReactionFacepile } from "@/components/workspace/ReactionFacepile";
import { feedReaction, feedReactionLabel } from "@/lib/feed-reactions";

type Props = {
  comment: ActivityComment;
  currentUserId?: string;
  onDelete?: (comment: ActivityComment) => void;
  /** Opens the emoji tray for this comment. */
  onPressReact?: (comment: ActivityComment) => void;
  /** Aims the composer at this comment's thread. */
  onPressReply?: (comment: ActivityComment) => void;
  /** Opens the sheet listing everyone who reacted to this comment. */
  onPressReactions?: (comment: ActivityComment) => void;
  /** Emoji tray, rendered under the bubble while it is open. */
  picker?: React.ReactNode;
  /** Replies sit indented under their parent. */
  inset?: boolean;
  /** Parent author shown above a nested reply so its relationship is explicit. */
  replyToName?: string | null;
  /** Denser type and spacing, for the thread pane beside the feed. */
  compact?: boolean;
  /** The parent already provides the horizontal page inset. */
  contained?: boolean;
};

/** One comment: avatar beside a soft bubble, the way chat threads read. */
export function UpdateCommentRow({
  comment,
  currentUserId,
  onDelete,
  onPressReact,
  onPressReply,
  onPressReactions,
  picker,
  inset = false,
  replyToName,
  compact = false,
  contained = false,
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
  const size = compact ? (inset ? 24 : 28) : inset ? 26 : 32;

  return (
    <View
      style={[
        styles.row,
        compact ? styles.rowCompact : null,
        inset ? (compact ? styles.rowInsetCompact : styles.rowInset) : null,
        contained
          ? inset
            ? compact
              ? styles.rowInsetCompactContained
              : styles.rowInsetContained
            : styles.rowContained
          : null,
        pending ? styles.pending : null,
      ]}
      testID={`update-comment-${comment.id}`}
    >
      {inset ? (
        <View
          style={styles.replyConnector}
          accessible={false}
          pointerEvents="none"
        />
      ) : null}
      {comment.author.id === "alenio" ? (
        <Image
          source={require("@/assets/alenio-icon.png")}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="contain"
          accessibilityLabel="Alenio"
          testID={`update-comment-${comment.id}-alenio-avatar`}
        />
      ) : (
        <UserAvatar
          user={{ name, image: comment.author.image }}
          size={size}
          radius={size / 2}
          backgroundColor="#EFE9FF"
          textColor="#6d28d9"
          fontSize={compact ? (inset ? 10 : 11.5) : inset ? 11 : 13}
          workplaceConnected={false}
        />
      )}
      <View style={styles.main}>
        {inset ? (
          <View style={styles.replyContext}>
            <CornerDownRight size={12} color="#7C6FD1" strokeWidth={2.2} />
            <Text style={styles.replyContextText} numberOfLines={1}>
              Reply to {replyToName?.trim() || "this comment"}
            </Text>
          </View>
        ) : null}
        <View style={styles.bubble}>
          <View style={styles.header}>
            <Text
              style={[styles.name, compact ? styles.nameCompact : null]}
              numberOfLines={1}
            >
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
          <Text style={[styles.body, compact ? styles.bodyCompact : null]}>
            {comment.body}
          </Text>
        </View>

        {picker}

        {!pending && (onPressReact || onPressReply || reactionCount > 0) ? (
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
                {mine ? <Text style={styles.actionGlyph}>{mine}</Text> : null}
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
            {reactionCount > 0 && onPressReactions ? (
              <View style={styles.reactionSummary}>
                <ReactionFacepile
                  reactions={reactions}
                  onPress={() => onPressReactions(comment)}
                  compact
                  testID={`update-comment-${comment.id}-reaction-facepile`}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  rowInset: {
    paddingLeft: 46,
  },
  /** A pane sits beside the feed, where the surrounding type is a step smaller. */
  rowCompact: {
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  rowInsetCompact: {
    paddingLeft: 38,
  },
  rowContained: {
    paddingHorizontal: 0,
  },
  rowInsetContained: {
    paddingLeft: 38,
    paddingRight: 0,
  },
  rowInsetCompactContained: {
    paddingLeft: 34,
    paddingRight: 0,
  },
  replyConnector: {
    position: "absolute",
    left: 16,
    top: -2,
    width: 16,
    height: 28,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: "#D8D3F5",
    borderBottomLeftRadius: 9,
  },
  replyContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
    paddingLeft: 2,
  },
  replyContextText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#7C6FD1",
  },
  nameCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  bodyCompact: {
    fontSize: 12.5,
    lineHeight: 17,
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
    // Opposite edge from React, so reading and reacting stay apart.
    marginLeft: "auto",
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
