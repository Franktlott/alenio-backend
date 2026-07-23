import type { ReactNode } from "react";
import { UserMinus, UserPlus } from "lucide-react-native";
import type { ActivityFeedItem } from "./types";
import { getActivityTintTokens, getActivityTypeLabel } from "./activity-ui";
import { ActivityCardShell } from "./ActivityCardShell";
import { ActivityCardBody } from "./ActivityCardBody";

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

  return (
    <ActivityCardShell
      type={item.type}
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
      />
    </ActivityCardShell>
  );
}
