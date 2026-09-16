import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Flame, Heart, MessageCircle } from "lucide-react-native";
import type { ActivityFeedItem } from "@/components/activity/types";
import { FeedActionButton } from "@/components/workspace/FeedActionButton";
import { WorkspaceFeedCardShell } from "@/components/workspace/WorkspaceFeedCardShell";
import {
  commentActionLabel,
  formatFeedTimestamp,
  milestoneStreakCount,
  milestoneSubtitle,
  myReactionEmoji,
  nextMilestoneTarget,
  reactionActionLabel,
  totalReactionCount,
} from "@/lib/workspace-updates";
import { feedReaction, feedReactionLabel } from "@/lib/feed-reactions";

const ACCENT = "#4361EE";

type Props = {
  item: ActivityFeedItem;
  currentUserId?: string;
  onPressReact: () => void;
  onPressComment?: () => void;
  commentCount?: number;
  picker?: ReactNode;
  testID?: string;
};

/** A momentum milestone: the Alenio flame, the streak, and what comes next. */
export function MilestoneUpdateCard({
  item,
  currentUserId,
  onPressReact,
  onPressComment,
  commentCount = 0,
  picker,
  testID,
}: Props) {
  const name = item.actor?.name ?? "Someone";
  const streak = milestoneStreakCount(item.metadata.count);
  const target = nextMilestoneTarget(item.metadata.count);
  const reactionCount = totalReactionCount(item.reactions);
  const mine = myReactionEmoji(item.reactions, currentUserId);
  const cardTestID = testID ?? `milestone-update-card-${item.id}`;

  return (
    <WorkspaceFeedCardShell
      avatar={item.actor}
      avatarResetKey={item.id}
      meta={formatFeedTimestamp(item.timestamp)}
      onPress={onPressComment}
      onLongPress={onPressReact}
      testID={cardTestID}
      identity={
        <Text style={styles.identity} numberOfLines={2}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.action}> hit a momentum milestone</Text>
        </Text>
      }
      footer={
        <View style={styles.footer}>
          {picker}
          <View style={styles.actions}>
            <FeedActionButton
              Icon={Heart}
              glyph={mine}
              activeColor={feedReaction(mine)?.color}
              label={reactionActionLabel(reactionCount)}
              active={!!mine}
              filled
              onPress={onPressReact}
              accessibilityLabel={
                mine
                  ? `Your reaction: ${feedReactionLabel(mine)}. Change or remove it.`
                  : "React to this milestone"
              }
              testID={`${cardTestID}-react`}
            />
            {onPressComment ? (
              <FeedActionButton
                Icon={MessageCircle}
                label={commentActionLabel(commentCount)}
                onPress={onPressComment}
                accessibilityLabel="Comment on this milestone"
                testID={`${cardTestID}-comment`}
              />
            ) : null}
          </View>
        </View>
      }
    >
      <View style={styles.body}>
        <View style={styles.iconSlot}>
          <Flame size={19} color={ACCENT} strokeWidth={2.2} />
        </View>
        <View style={styles.bodyCopy}>
          <Text style={styles.title} numberOfLines={1}>
            {streak > 0 ? `${streak} tasks completed` : "On-time streak"}
          </Text>
          <Text
            style={styles.subtitle}
            numberOfLines={2}
            testID={`${cardTestID}-message`}
          >
            {milestoneSubtitle(item.metadata.count)}
          </Text>
        </View>
      </View>

      {/* No progress bar: the card is a record of a moment, and a bar would
          imply live state that a broken streak silently invalidates. */}
      <Text style={styles.next} numberOfLines={1}>
        Next milestone: {target} tasks
      </Text>
    </WorkspaceFeedCardShell>
  );
}

const styles = StyleSheet.create({
  identity: {
    fontSize: 14.5,
    lineHeight: 19,
    color: "#0F172A",
  },
  name: {
    fontWeight: "600",
    color: "#0F172A",
  },
  action: {
    fontWeight: "400",
    color: "#64748B",
  },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  iconSlot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  bodyCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 17,
    color: "#64748B",
  },
  next: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 16,
    color: "#94A3B8",
  },
  footer: {
    marginTop: 6,
    gap: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
});
