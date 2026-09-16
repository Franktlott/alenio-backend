import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Heart, MessageCircle } from "lucide-react-native";
import type { ActivityFeedItem } from "@/components/activity/types";
import {
  CELEBRATION_CARD_THEMES,
  getCelebrationCardTheme,
} from "@/components/activity/celebration-themes";
import { FeedActionButton } from "@/components/workspace/FeedActionButton";
import { WorkspaceFeedCardShell } from "@/components/workspace/WorkspaceFeedCardShell";
import {
  commentActionLabel,
  formatFeedTimestamp,
  myReactionEmoji,
  reactionActionLabel,
  recognitionCategoryLabel,
  recognitionParticipants,
  totalReactionCount,
} from "@/lib/workspace-updates";
import { feedReaction, feedReactionLabel } from "@/lib/feed-reactions";

function themeLabel(key: string): string | null {
  return key in CELEBRATION_CARD_THEMES
    ? CELEBRATION_CARD_THEMES[key as keyof typeof CELEBRATION_CARD_THEMES].label
    : null;
}

type Props = {
  item: ActivityFeedItem;
  currentUserId?: string;
  /** Opens the reaction menu so people can pick an emoji, same as chat. */
  onPressReact: () => void;
  /** Card actions; the overflow button hides when there is nothing to do. */
  onPressMore?: () => void;
  /** Opens the thread, from the comment button or from the card itself. */
  onPressComment?: () => void;
  commentCount?: number;
  /** Emoji picker rendered above the action row while it is open. */
  picker?: ReactNode;
  testID?: string;
};

export function RecognitionUpdateCard({
  item,
  currentUserId,
  onPressReact,
  onPressMore,
  onPressComment,
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
  const message = item.metadata.message?.trim() || null;
  const reactionCount = totalReactionCount(item.reactions);
  const mine = myReactionEmoji(item.reactions, currentUserId);
  const cardTestID = testID ?? `recognition-update-card-${item.id}`;

  return (
    <WorkspaceFeedCardShell
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
                  : "React to this recognition"
              }
              testID={`${cardTestID}-react`}
            />
            {onPressComment ? (
              <FeedActionButton
                Icon={MessageCircle}
                label={commentActionLabel(commentCount)}
                onPress={onPressComment}
                accessibilityLabel="Comment on this recognition"
                testID={`${cardTestID}-comment`}
              />
            ) : null}
          </View>
        </View>
      }
    >
      {category ? (
        <View
          style={[
            styles.pill,
            {
              backgroundColor: `${theme.chip}14`,
              borderColor: `${theme.chip}3D`,
            },
          ]}
          testID={`${cardTestID}-category`}
        >
          <TypeIcon size={10} color={theme.chip} strokeWidth={2.6} />
          <Text
            style={[styles.pillText, { color: theme.chip }]}
            numberOfLines={1}
          >
            {category}
          </Text>
        </View>
      ) : null}

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
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  message: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
    color: "#111C33",
  },
  footer: {
    gap: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
});
