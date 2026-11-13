import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ActivityReactions } from "@/components/activity/types";
import { FeedEngagementRow } from "@/components/workspace/FeedEngagementRow";
import { WorkspaceFeedCardShell } from "@/components/workspace/WorkspaceFeedCardShell";

type Props = {
  author: { name: string; image?: string | null };
  /** Role, workspace, or other author context shown before the timestamp. */
  authorMeta?: string | null;
  timestamp: string;
  headline: string;
  body?: string | null;
  reactionCount: number;
  /** Everyone who reacted, for chips and the who-reacted sheet. */
  reactions?: ActivityReactions;
  currentUserId?: string;
  /** Opens the sheet listing everyone who reacted. */
  onPressReactions?: () => void;
  onPressLike?: () => void;
  onToggleReaction?: (emoji: string) => void;
  onMore?: () => void;
  onLongPress?: () => void;
  onPressComment?: () => void;
  commentCount?: number;
  picker?: ReactNode;
  avatarResetKey?: string;
  /** Image, poll, or other post content — same card chrome for every update. */
  children?: ReactNode;
  testID?: string;
};

/** Non-recognition Updates item (completed work today, posts later). */
export function WorkspaceUpdateCard({
  author,
  authorMeta,
  timestamp,
  headline,
  body,
  reactions,
  currentUserId,
  onPressReactions,
  onPressLike,
  onToggleReaction,
  onMore,
  onLongPress,
  onPressComment,
  commentCount = 0,
  picker,
  avatarResetKey,
  children,
  testID,
}: Props) {
  const meta = [authorMeta?.trim() || null, timestamp]
    .filter(Boolean)
    .join(" · ");

  return (
    <WorkspaceFeedCardShell
      avatar={author}
      avatarResetKey={avatarResetKey}
      meta={meta}
      onMore={onMore}
      onPress={onPressComment}
      onLongPress={onLongPress}
      testID={testID}
      identity={
        <Text style={styles.author} numberOfLines={1}>
          {author.name}
        </Text>
      }
      footer={
        <View style={styles.footer}>
          {picker}
          <FeedEngagementRow
            reactions={reactions ?? {}}
            currentUserId={currentUserId}
            onToggleReaction={onToggleReaction}
            onOpenPicker={onPressLike}
            onPressReactions={onPressReactions}
            onPressComment={onPressComment}
            commentCount={commentCount}
            testID={testID ? `${testID}-engage` : undefined}
          />
        </View>
      }
    >
      <Text style={styles.headline} numberOfLines={3}>
        {headline}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
    </WorkspaceFeedCardShell>
  );
}

const styles = StyleSheet.create({
  author: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "600",
    color: "#0F172A",
  },
  headline: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
    color: "#0F172A",
  },
  body: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 19,
    color: "#475569",
  },
  footer: {
    gap: 2,
  },
});
