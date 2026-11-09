import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Heart, MessageCircle } from "lucide-react-native";
import type { ActivityReactions } from "@/components/activity/types";
import { FeedActionButton } from "@/components/workspace/FeedActionButton";
import { ReactionFacepile } from "@/components/workspace/ReactionFacepile";
import { WorkspaceFeedCardShell } from "@/components/workspace/WorkspaceFeedCardShell";
import {
  commentActionLabel,
  reactionActionLabel,
} from "@/lib/workspace-updates";
import { feedReaction, feedReactionLabel } from "@/lib/feed-reactions";

type Props = {
  author: { name: string; image?: string | null };
  /** Role, workspace, or other author context shown before the timestamp. */
  authorMeta?: string | null;
  timestamp: string;
  headline: string;
  body?: string | null;
  reactionCount: number;
  /** Everyone who reacted, for the facepile and its sheet. */
  reactions?: ActivityReactions;
  /** Emoji the signed-in person left, so the button can wear it. */
  myReaction?: string | null;
  /** Opens the sheet listing everyone who reacted. */
  onPressReactions?: () => void;
  onPressLike: () => void;
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
  reactionCount,
  reactions,
  myReaction,
  onPressReactions,
  onPressLike,
  onMore,
  onLongPress,
  onPressComment,
  commentCount = 0,
  picker,
  avatarResetKey,
  children,
  testID,
}: Props) {
  const meta = [authorMeta, timestamp].filter(Boolean).join(" · ");

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
          <View style={styles.actions}>
            <FeedActionButton
              Icon={Heart}
              glyph={myReaction}
              activeColor={feedReaction(myReaction)?.color}
              // The facepile carries the count, so the button stays an icon.
              label={onPressReactions ? "" : reactionActionLabel(reactionCount)}
              active={!!myReaction}
              filled
              onPress={onPressLike}
              accessibilityLabel={
                myReaction
                  ? `Your reaction: ${feedReactionLabel(myReaction)}. Change or remove it.`
                  : "React to this update"
              }
              testID={testID ? `${testID}-react` : undefined}
            />
            {onPressComment ? (
              <FeedActionButton
                Icon={MessageCircle}
                label={commentActionLabel(commentCount)}
                onPress={onPressComment}
                accessibilityLabel="Comment on this update"
                testID={testID ? `${testID}-comment` : undefined}
              />
            ) : null}
            {onPressReactions && reactionCount > 0 ? (
              <View style={styles.summary}>
                <ReactionFacepile
                  reactions={reactions ?? {}}
                  onPress={onPressReactions}
                  testID={testID ? `${testID}-reaction-facepile` : undefined}
                />
              </View>
            ) : null}
          </View>
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
    marginTop: 8,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
    color: "#0F172A",
  },
  body: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 19,
    color: "#475569",
  },
  footer: {
    gap: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  summary: {
    marginLeft: "auto",
  },
});
