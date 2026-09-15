import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Heart, MessageCircle } from "lucide-react-native";
import type { ActivityFeedItem } from "@/components/activity/types";
import { FeedActionButton } from "@/components/workspace/FeedActionButton";
import { WorkspaceFeedCardShell } from "@/components/workspace/WorkspaceFeedCardShell";
import {
  commentActionLabel,
  formatFeedTimestamp,
  myReactionEmoji,
  reactionActionLabel,
  totalReactionCount,
} from "@/lib/workspace-updates";
import { feedReaction, feedReactionLabel } from "@/lib/feed-reactions";

type Props = {
  item: ActivityFeedItem;
  currentUserId?: string;
  onPressReact: () => void;
  /** Only shown when the reader may delete this post. */
  onPressMore?: () => void;
  onPressComment?: () => void;
  commentCount?: number;
  picker?: ReactNode;
  testID?: string;
};

/** Something a teammate wrote for the workspace: their words, maybe a photo. */
export function PostUpdateCard({
  item,
  currentUserId,
  onPressReact,
  onPressMore,
  onPressComment,
  commentCount = 0,
  picker,
  testID,
}: Props) {
  const body = item.metadata.body?.trim() || null;
  const imageUrl = item.metadata.imageUrl || null;
  const width = item.metadata.imageWidth ?? null;
  const height = item.metadata.imageHeight ?? null;
  const reactionCount = totalReactionCount(item.reactions);
  const mine = myReactionEmoji(item.reactions, currentUserId);
  const cardTestID = testID ?? `post-update-card-${item.id}`;

  return (
    <WorkspaceFeedCardShell
      avatar={item.actor}
      avatarResetKey={item.id}
      meta={formatFeedTimestamp(item.timestamp)}
      onMore={onPressMore}
      onPress={onPressComment}
      onLongPress={onPressReact}
      testID={cardTestID}
      identity={
        <Text style={styles.author} numberOfLines={1}>
          {item.actor?.name ?? "Someone"}
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
                  : "React to this post"
              }
              testID={`${cardTestID}-react`}
            />
            {onPressComment ? (
              <FeedActionButton
                Icon={MessageCircle}
                label={commentActionLabel(commentCount)}
                onPress={onPressComment}
                accessibilityLabel="Comment on this post"
                testID={`${cardTestID}-comment`}
              />
            ) : null}
          </View>
        </View>
      }
    >
      {body ? (
        <Text style={styles.body} testID={`${cardTestID}-body`}>
          {body}
        </Text>
      ) : null}

      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          // Keep the photo's own shape when we know it, so nothing is cropped.
          style={[
            styles.photo,
            { aspectRatio: width && height ? width / height : 4 / 3 },
          ]}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          testID={`${cardTestID}-photo`}
        />
      ) : null}
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
  body: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 19,
    color: "#1E293B",
  },
  photo: {
    marginTop: 10,
    width: "100%",
    borderRadius: 12,
    backgroundColor: "#EEF1F6",
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
