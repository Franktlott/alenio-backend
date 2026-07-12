import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { UserMinus, UserPlus } from "lucide-react-native";
import { router } from "expo-router";
import type { ActivityFeedItem } from "./types";
import { ACTIVITY_COLORS, getActivityTintTokens, getActivityTypeLabel } from "./activity-ui";
import { ActivityCardShell } from "./ActivityCardShell";
import { ActivityCardBody } from "./ActivityCardBody";
import { ActivityActionButton } from "./ActivityActionButton";
import { AvatarStack } from "./AvatarStack";

type Props = {
  item: ActivityFeedItem;
  footer?: ReactNode;
  onLongPress?: () => void;
  testID?: string;
};

export function TeamActivityCard({ item, footer, onLongPress, testID }: Props) {
  const tint = getActivityTintTokens(item.type);
  const isJoined = item.type === "member_joined";
  const LabelIcon = isJoined ? UserPlus : UserMinus;
  const actorName = item.actor?.name ?? item.metadata.userName ?? "Someone";
  const teamPeople = item.metadata.assignees ?? (item.actor ? [item.actor] : []);

  const navigate = () => {
    if (item.actionRoute) router.push(item.actionRoute as never);
  };

  return (
    <ActivityCardShell
      type={item.type}
      onPress={item.actionRoute ? navigate : undefined}
      onLongPress={onLongPress}
      footer={footer}
      testID={testID ?? `team-activity-card-${item.id}`}
    >
      <ActivityCardBody
        actor={item.actor ?? { name: actorName }}
        label={getActivityTypeLabel(item.type)}
        LabelIcon={LabelIcon}
        tint={tint}
        timestamp={item.timestamp}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: ACTIVITY_COLORS.slate900, lineHeight: 18 }}>
          {isJoined ? `${actorName} joined the team` : item.description ?? item.title}
        </Text>

        {teamPeople.length > 1 ? (
          <View style={{ marginTop: 2 }}>
            <AvatarStack people={teamPeople} size={18} borderColor={ACTIVITY_COLORS.white} maxVisible={4} />
          </View>
        ) : null}

        {item.actionLabel ? (
          <ActivityActionButton
            label={item.actionLabel}
            onPress={navigate}
            accentColor={ACTIVITY_COLORS.primary}
            testID={`${testID ?? item.id}-action`}
          />
        ) : null}
      </ActivityCardBody>
    </ActivityCardShell>
  );
}
