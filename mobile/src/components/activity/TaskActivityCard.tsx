import type { ReactNode } from "react";
import { CheckCircle, ClipboardList } from "lucide-react-native";
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

export function TaskActivityCard({ item, footer, onLongPress, testID }: Props) {
  const tint = getActivityTintTokens(item.type);
  const isAssigned = item.type === "task_assigned";
  const Icon = isAssigned ? ClipboardList : CheckCircle;
  const actorName = item.actor?.name ?? "Someone";
  const taskTitle = item.metadata.taskTitle ?? item.metadata.taskTitles?.[0] ?? item.title;
  const count = item.metadata.taskCount ?? 1;

  const description = isAssigned
    ? count > 1
      ? `Assigned ${count} tasks`
      : `Assigned '${taskTitle}'`
    : `Completed '${taskTitle}'`;

  const metadata = isAssigned
    ? `${count} task${count === 1 ? "" : "s"}`
    : undefined;

  return (
    <ActivityCardShell
      type={item.type}
      onLongPress={onLongPress}
      footer={footer}
      testID={testID ?? `task-activity-card-${item.id}`}
    >
      <ActivityCardBody
        actor={item.actor ?? { name: actorName }}
        label={getActivityTypeLabel(item.type)}
        LabelIcon={Icon}
        tint={tint}
        timestamp={item.timestamp}
        memberName={actorName}
        description={description}
        metadata={metadata}
      />
    </ActivityCardShell>
  );
}
