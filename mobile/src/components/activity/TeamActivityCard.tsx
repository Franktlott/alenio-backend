import type { ReactNode } from "react";
import { UserMinus, UserPlus } from "lucide-react-native";
import { router } from "expo-router";
import type { ActivityFeedItem } from "./types";
import { ACTIVITY_COLORS, getActivityTintTokens, getActivityTypeLabel } from "./activity-ui";
import { ActivityCardShell } from "./ActivityCardShell";
import { ActivityCardBody } from "./ActivityCardBody";
import { ActivityActionButton } from "./ActivityActionButton";

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

  const description = isJoined ? "Joined the team" : "Left the team";

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
        memberName={actorName}
        description={description}
        action={
          item.actionLabel ? (
            <ActivityActionButton
              label={item.actionLabel}
              onPress={navigate}
              accentColor={ACTIVITY_COLORS.primary}
              variant="ghost"
              testID={`${testID ?? item.id}-action`}
            />
          ) : null
        }
      />
    </ActivityCardShell>
  );
}
