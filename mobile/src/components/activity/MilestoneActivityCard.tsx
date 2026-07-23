import type { ReactNode } from "react";
import { Flame, Trophy } from "lucide-react-native";
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

export function MilestoneActivityCard({ item, footer, onLongPress, testID }: Props) {
  const tint = getActivityTintTokens(item.type);
  const actorName = item.actor?.name ?? "Someone";
  const count = item.metadata.count ?? (item.type === "task_milestone" ? 10 : 0);
  const isPersonalBest = item.type === "personal_best";
  const Icon = isPersonalBest ? Flame : Trophy;

  const description = isPersonalBest
    ? `Hit a personal best of ${count} on-time tasks`
    : `Completed ${count} tasks on time`;

  return (
    <ActivityCardShell
      type={item.type}
      onLongPress={onLongPress}
      footer={footer}
      testID={testID ?? `milestone-activity-card-${item.id}`}
    >
      <ActivityCardBody
        actor={item.actor ?? { name: actorName }}
        label={getActivityTypeLabel(item.type)}
        LabelIcon={Icon}
        tint={tint}
        timestamp={item.timestamp}
        memberName={actorName}
        description={description}
        metadata={isPersonalBest ? "Keep it up" : "Great work"}
      />
    </ActivityCardShell>
  );
}