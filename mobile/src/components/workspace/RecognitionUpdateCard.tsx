import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ActivityFeedItem } from "@/components/activity/types";
import {
  CELEBRATION_CARD_THEMES,
  getCelebrationCardTheme,
} from "@/components/activity/celebration-themes";
import { FeedEngagementRow } from "@/components/workspace/FeedEngagementRow";
import { FeedEventPill } from "@/components/workspace/FeedEventPill";
import { WorkspaceFeedCardShell } from "@/components/workspace/WorkspaceFeedCardShell";
import {
  formatFeedTimestamp,
  recognitionCategoryLabel,
  recognitionParticipants,
} from "@/lib/workspace-updates";

function themeLabel(key: string): string | null {
  return key in CELEBRATION_CARD_THEMES
    ? CELEBRATION_CARD_THEMES[key as keyof typeof CELEBRATION_CARD_THEMES].label
    : null;
}

function celebrationHeadline(
  key: string,
  name: string,
): { text: string; emoji: string } {
  const headlines: Record<string, { text: string; emoji: string }> = {
    shoutout: { text: `Great work, ${name}!`, emoji: "⭐" },
    mvp: { text: `MVP moment, ${name}!`, emoji: "🏆" },
    beyond: { text: `Above and beyond, ${name}!`, emoji: "🏅" },
    rockstar: { text: `You rock, ${name}!`, emoji: "⚡" },
    clutch: { text: `Clutch work, ${name}!`, emoji: "🎯" },
    teamplayer: { text: `Great teamwork, ${name}!`, emoji: "🤝" },
    bigbrain: { text: `Brilliant work, ${name}!`, emoji: "🧠" },
    onfire: { text: `On fire, ${name}!`, emoji: "🔥" },
    milestone: { text: `Milestone achieved, ${name}!`, emoji: "🏁" },
    grateful: { text: `Thank you, ${name}!`, emoji: "💜" },
  };
  return headlines[key] ?? { text: `Great work, ${name}!`, emoji: "⭐" };
}

type Props = {
  item: ActivityFeedItem;
  currentUserId?: string;
  /** Opens the reaction menu so people can pick an emoji, same as chat. */
  onPressReact?: () => void;
  onToggleReaction?: (emoji: string) => void;
  /** Card actions; the overflow button hides when there is nothing to do. */
  onPressMore?: () => void;
  /** Opens the thread, from the comment button or from the card itself. */
  onPressComment?: () => void;
  /** Opens the sheet listing everyone who reacted. */
  onPressReactions?: () => void;
  commentCount?: number;
  /** Emoji picker rendered above the action row while it is open. */
  picker?: ReactNode;
  testID?: string;
};

export function RecognitionUpdateCard({
  item,
  currentUserId,
  onPressReact,
  onToggleReaction,
  onPressMore,
  onPressComment,
  onPressReactions,
  commentCount = 0,
  picker,
  testID,
}: Props) {
  const { giverName, recipientName } = recognitionParticipants(item);
  const category = recognitionCategoryLabel(
    item.metadata.celebrationType,
    themeLabel,
  );
  // Each recognition type already owns a colour and an icon; borrow them so
  // the card carries its own identity instead of a uniform indigo pill.
  const theme = getCelebrationCardTheme(item.metadata.celebrationType);
  const TypeIcon = theme.Icon;
  const firstName = recipientName.trim().split(/\s+/)[0] || recipientName;
  const headline = celebrationHeadline(theme.key, firstName);
  const message = item.metadata.message?.trim() || null;
  const cardTestID = testID ?? `recognition-update-card-${item.id}`;

  return (
    <WorkspaceFeedCardShell
      compact
      avatar={item.actor}
      pairedAvatar={
        recipientName
          ? {
              name: recipientName,
              image: item.metadata.targetUserImage ?? null,
            }
          : null
      }
      avatarResetKey={item.id}
      meta={formatFeedTimestamp(item.timestamp)}
      onMore={onPressMore}
      onPress={onPressComment}
      onLongPress={onPressReact}
      testID={cardTestID}
      backgroundDecoration={
        <View pointerEvents="none" style={styles.decoration}>
          <View
            style={[
              styles.decorCircleTop,
              { backgroundColor: theme.accent },
            ]}
          />
          <View
            style={[
              styles.decorCircleBottom,
              { backgroundColor: theme.accent },
            ]}
          />
          {theme.key === "bigbrain" ? (
            <MaterialCommunityIcons
              name="brain"
              size={31}
              color={theme.chip}
              style={styles.decorIcon}
            />
          ) : (
            <TypeIcon
              size={29}
              color={theme.chip}
              strokeWidth={2}
              style={styles.decorIcon}
            />
          )}
        </View>
      }
      identity={
        <Text style={styles.identity} numberOfLines={3}>
          <Text style={styles.name}>{giverName}</Text>
          <Text style={styles.action}> recognized </Text>
          <Text style={styles.name}>{recipientName}</Text>
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
      {category ? (
        <FeedEventPill
          Icon={TypeIcon}
          label={category}
          color={theme.chip}
          testID={`${cardTestID}-category`}
        />
      ) : null}

      <Text style={styles.headline} numberOfLines={2}>
        {headline.text} {headline.emoji}
      </Text>

      {message ? (
        <Text style={styles.message} testID={`${cardTestID}-message`}>
          {message}
        </Text>
      ) : null}
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
  headline: {
    marginTop: 5,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    color: "#111C33",
  },
  message: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    color: "#64748B",
  },
  footer: {
    marginTop: 6,
    gap: 2,
  },
  decoration: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 180,
    height: 132,
    overflow: "hidden",
    borderTopRightRadius: 16,
  },
  decorCircleTop: {
    position: "absolute",
    width: 142,
    height: 142,
    borderRadius: 71,
    top: -58,
    right: -24,
    opacity: 0.13,
  },
  decorCircleBottom: {
    position: "absolute",
    width: 126,
    height: 126,
    borderRadius: 63,
    top: 61,
    right: 30,
    opacity: 0.07,
  },
  decorIcon: {
    position: "absolute",
    top: 21,
    // Leave the top-right action lane clear for the overflow menu.
    right: 52,
  },
});
