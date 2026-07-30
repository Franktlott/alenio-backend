import type { ReactNode } from "react";
import { Star } from "lucide-react-native";
import type { ActivityFeedItem } from "./types";
import { getActivityTintTokens } from "./activity-ui";
import { ActivityCardShell } from "./ActivityCardShell";
import { ActivityCardBody } from "./ActivityCardBody";

export function RecognitionActivityCard({
  item,
  footer,
  onLongPress,
  testID,
}: {
  item: ActivityFeedItem;
  footer?: ReactNode;
  onLongPress?: () => void;
  testID?: string;
}) {
  const actorName = item.actor?.name ?? "Someone";
  return (
    <ActivityCardShell
      type={item.type}
      onLongPress={onLongPress}
      footer={footer}
      testID={testID ?? `recognition-activity-card-${item.id}`}
    >
      <ActivityCardBody
        actor={item.actor ?? { name: actorName }}
        label="Updates"
        LabelIcon={Star}
        tint={getActivityTintTokens(item.type)}
        timestamp={item.timestamp}
        description={item.description ?? `${actorName} recognized a teammate`}
        metadata="Recognition"
      />
    </ActivityCardShell>
  );
}
