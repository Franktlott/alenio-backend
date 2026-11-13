import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Flame } from "lucide-react-native";
import type { ActivityFeedItem } from "@/components/activity/types";
import { FeedEngagementRow } from "@/components/workspace/FeedEngagementRow";
import { FeedEventPill } from "@/components/workspace/FeedEventPill";
import { WorkspaceFeedCardShell } from "@/components/workspace/WorkspaceFeedCardShell";
import {
  formatFeedTimestamp,
  milestoneStreakCount,
  milestoneSubtitle,
  nextMilestoneTarget,
} from "@/lib/workspace-updates";

/** Milestones are the one warm note in an otherwise indigo feed. */
const GOLD = "#B7791F";

type Props = {
  item: ActivityFeedItem;
  currentUserId?: string;
  onPressReact?: () => void;
  onToggleReaction?: (emoji: string) => void;
  onPressComment?: () => void;
  /** Opens the sheet listing everyone who reacted. */
  onPressReactions?: () => void;
  commentCount?: number;
  picker?: ReactNode;
  testID?: string;
};

/** A momentum milestone: the Alenio flame, the streak, and what comes next. */
export function MilestoneUpdateCard({
  item,
  currentUserId,
  onPressReact,
  onToggleReaction,
  onPressComment,
  onPressReactions,
  commentCount = 0,
  picker,
  testID,
}: Props) {
  const name = item.actor?.name ?? "Someone";
  const streak = milestoneStreakCount(item.metadata.count);
  const target = nextMilestoneTarget(item.metadata.count);
  const cardTestID = testID ?? `milestone-update-card-${item.id}`;

  return (
    <WorkspaceFeedCardShell
      compact
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
          <FeedEngagementRow
            reactions={item.reactions ?? {}}
            currentUserId={currentUserId}
            onToggleReaction={onToggleReaction}
            onOpenPicker={onPressReact}
            onPressReactions={onPressReactions}
            onPressComment={onPressComment}
            commentCount={commentCount}
            testID={`${cardTestID}-engage`}
          />
        </View>
      }
    >
      <FeedEventPill
        Icon={Flame}
        label="MOMENTUM"
        color={GOLD}
        testID={`${cardTestID}-pill`}
      />
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
  title: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    color: "#111C33",
  },
  subtitle: {
    marginTop: 0,
    fontSize: 13,
    lineHeight: 17,
    color: "#64748B",
  },
  next: {
    marginTop: 3,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: GOLD,
  },
  footer: {
    marginTop: 1,
    gap: 1,
  },
});
