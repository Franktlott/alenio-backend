import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { UsersRound } from "lucide-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ActivityFeedItem } from "@/components/activity/types";
import { FeedEngagementRow } from "@/components/workspace/FeedEngagementRow";
import { FeedEventPill } from "@/components/workspace/FeedEventPill";
import { WorkspaceFeedCardShell } from "@/components/workspace/WorkspaceFeedCardShell";
import {
  formatFeedTimestamp,
  joinedMemberName,
} from "@/lib/workspace-updates";

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

/** Someone new joined the workspace — the same card for the team and for them. */
export function MemberJoinedUpdateCard({
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
  const name = joinedMemberName(item);
  const firstName = name.trim().split(/\s+/)[0] || name;
  const cardTestID = testID ?? `member-joined-update-card-${item.id}`;

  return (
    <WorkspaceFeedCardShell
      compact
      avatar={item.actor ?? { name }}
      avatarResetKey={item.id}
      meta={formatFeedTimestamp(item.timestamp)}
      onPress={onPressComment}
      onLongPress={onPressReact}
      testID={cardTestID}
      backgroundDecoration={
        <View pointerEvents="none" style={styles.decoration}>
          <View style={styles.decorCircleTop} />
          <View style={styles.decorCircleBottom} />
          <MaterialCommunityIcons
            name="account-group"
            size={32}
            color="rgba(92, 104, 246, 0.72)"
            style={styles.decorIcon}
          />
        </View>
      }
      identity={
        <Text style={styles.identity} numberOfLines={2}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.action}> joined the workspace</Text>
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
        Icon={UsersRound}
        label="NEW MEMBER"
        color="#5368E8"
        testID={`${cardTestID}-pill`}
      />
      <Text style={styles.title} numberOfLines={1}>
        Welcome to the team, {firstName}! 👋
      </Text>
      <Text
        style={styles.subtitle}
        numberOfLines={2}
        testID={`${cardTestID}-message`}
      >
        Say hello and help {name} get started.
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
    marginTop: 5,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    color: "#111C33",
  },
  subtitle: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 17,
    color: "#64748B",
  },
  footer: {
    marginTop: 6,
    gap: 1,
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
    backgroundColor: "rgba(110, 129, 255, 0.13)",
  },
  decorCircleBottom: {
    position: "absolute",
    width: 126,
    height: 126,
    borderRadius: 63,
    top: 61,
    right: 30,
    backgroundColor: "rgba(116, 137, 255, 0.07)",
  },
  decorIcon: {
    position: "absolute",
    top: 20,
    right: 19,
  },
});
