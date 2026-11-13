import { useRef, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ActivityFeedItem } from "@/components/activity/types";
import { FeedEngagementRow } from "@/components/workspace/FeedEngagementRow";
import { WorkspaceFeedCardShell } from "@/components/workspace/WorkspaceFeedCardShell";
import { formatFeedTimestamp } from "@/lib/workspace-updates";
import { PostMediaAttachment } from "@/components/PostMediaAttachment";

type Props = {
  item: ActivityFeedItem;
  currentUserId?: string;
  onPressReact?: () => void;
  onToggleReaction?: (emoji: string) => void;
  /** Only shown when the reader may delete this post. */
  onPressMore?: () => void;
  onPressComment?: () => void;
  /** Opens the sheet listing everyone who reacted. */
  onPressReactions?: () => void;
  commentCount?: number;
  picker?: ReactNode;
  testID?: string;
};

/** Something a teammate wrote for the workspace: their words, maybe a photo. */
export function PostUpdateCard({
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
  const body = item.metadata.body?.trim() || null;
  const imageUrl = item.metadata.imageUrl || null;
  const width = item.metadata.imageWidth ?? null;
  const height = item.metadata.imageHeight ?? null;
  const mediaType = item.metadata.mediaType ?? "image";
  const cardTestID = testID ?? `post-update-card-${item.id}`;
  const suppressOpenUntil = useRef(0);
  const openPost = () => {
    if (Date.now() < suppressOpenUntil.current) return;
    onPressComment?.();
  };

  return (
    <WorkspaceFeedCardShell
      avatar={item.actor}
      avatarResetKey={item.id}
      meta={formatFeedTimestamp(item.timestamp)}
      onMore={onPressMore}
      onPress={onPressComment ? openPost : undefined}
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
      {body ? (
        <Text style={styles.body} testID={`${cardTestID}-body`}>
          {body}
        </Text>
      ) : null}

      {imageUrl ? (
        <PostMediaAttachment
          url={imageUrl}
          mediaType={mediaType}
          width={width}
          height={height}
          testID={`${cardTestID}-${mediaType === "video" ? "video" : "photo"}`}
          onInteraction={() => {
            suppressOpenUntil.current = Date.now() + 750;
          }}
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
    marginTop: 6,
    fontSize: 14,
    lineHeight: 19,
    color: "#1E293B",
  },
  footer: {
    marginTop: 4,
    gap: 2,
  },
});
