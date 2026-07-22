import type { ReactNode } from "react";
import { CheckCircle, ClipboardList } from "lucide-react-native";
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

  const navigate = () => {
    if (item.actionRoute) router.push(item.actionRoute as never);
  };

  return (
    <ActivityCardShell
      type={item.type}
      onPress={item.actionRoute ? navigate : undefined}
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
