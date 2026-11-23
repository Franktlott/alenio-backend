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
  /** Quick-tap toggle (default reaction). */
  onToggleReaction?: (emoji: string) => void;
  /** Long-press opens the full emoji picker. */
  onOpenPicker?: () => void;
  /** Facepile → who reacted. */
  onPressReactions?: () => void;
  onPressComment?: () => void;
  commentCount?: number;
  /** Continuous feeds: tighter spacing under media. */
  flat?: boolean;
  testID?: string;
};

/**
 * LinkedIn-style engagement: icon actions on the left, reaction summary on the
 * right. Tap the facepile to see who reacted and with what.
 */
export function FeedEngagementRow({
  reactions,
  currentUserId,
  onToggleReaction,
  onOpenPicker,
  onPressReactions,
  onPressComment,
  commentCount = 0,
  flat = false,
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
    <View style={[styles.row, flat ? styles.rowFlat : null]} testID={testID}>
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
            label=""
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
          compact
          testID={testID ? `${testID}-facepile` : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 0,
    paddingTop: 0,
    paddingBottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 24,
  },
  rowFlat: {
    marginTop: 0,
    paddingTop: 0,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
});
