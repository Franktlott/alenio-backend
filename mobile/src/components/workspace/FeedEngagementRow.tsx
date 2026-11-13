import { StyleSheet, View } from "react-native";
import { Heart, MessageCircle } from "lucide-react-native";
import type { ActivityReactions } from "@/components/activity/types";
import { FeedActionButton } from "@/components/workspace/FeedActionButton";
import { ReactionFacepile } from "@/components/workspace/ReactionFacepile";
import {
  DEFAULT_FEED_REACTION,
  feedReaction,
  feedReactionLabel,
} from "@/lib/feed-reactions";
import {
  myReactionEmoji,
  totalReactionCount,
} from "@/lib/workspace-updates";

type Props = {
  reactions: ActivityReactions;
  currentUserId?: string;
  /** Quick-tap toggle (Facebook-style default reaction). */
  onToggleReaction?: (emoji: string) => void;
  /** Long-press opens the full emoji picker. */
  onOpenPicker?: () => void;
  /** Facepile → who reacted. */
  onPressReactions?: () => void;
  onPressComment?: () => void;
  commentCount?: number;
  testID?: string;
};

/**
 * Facebook-style engagement: React + Comment on the left, reaction summary on
 * the right. Tap reacts with the default; long-press opens the picker.
 */
export function FeedEngagementRow({
  reactions,
  currentUserId,
  onToggleReaction,
  onOpenPicker,
  onPressReactions,
  onPressComment,
  commentCount = 0,
  testID,
}: Props) {
  const mine = myReactionEmoji(reactions, currentUserId);
  const reactionCount = totalReactionCount(reactions);

  const onReactPress = () => {
    if (!onToggleReaction) {
      onOpenPicker?.();
      return;
    }
    onToggleReaction(mine ?? DEFAULT_FEED_REACTION);
  };

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.actions}>
        {onToggleReaction || onOpenPicker ? (
          <FeedActionButton
            Icon={Heart}
            glyph={mine}
            activeColor={feedReaction(mine)?.color}
            label=""
            active={!!mine}
            filled
            onPress={onReactPress}
            onLongPress={onOpenPicker}
            accessibilityLabel={
              mine
                ? `Your reaction: ${feedReactionLabel(mine)}. Tap to remove, long-press to change.`
                : "React. Long-press for more reactions."
            }
            testID={testID ? `${testID}-react` : undefined}
          />
        ) : null}
        {onPressComment ? (
          <FeedActionButton
            Icon={MessageCircle}
            label={commentCount > 0 ? String(commentCount) : ""}
            onPress={onPressComment}
            accessibilityLabel={
              commentCount > 0
                ? `${commentCount} ${commentCount === 1 ? "comment" : "comments"}`
                : "Comment"
            }
            testID={testID ? `${testID}-comment` : undefined}
          />
        ) : null}
      </View>

      {onPressReactions && reactionCount > 0 ? (
        <ReactionFacepile
          reactions={reactions}
          onPress={onPressReactions}
          testID={testID ? `${testID}-facepile` : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 1,
    paddingTop: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EBEEF3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
});
