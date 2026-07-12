import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { CheckCircle, ClipboardList } from "lucide-react-native";
import { router } from "expo-router";
import type { ActivityFeedItem } from "./types";
import { ACTIVITY_COLORS, getActivityTintTokens, getActivityTypeLabel } from "./activity-ui";
import { ActivityCardShell } from "./ActivityCardShell";
import { ActivityCardBody } from "./ActivityCardBody";
import { ActivityActionButton } from "./ActivityActionButton";
import { AvatarStack, formatAvatarStackNames } from "./AvatarStack";

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
  const assignees = item.metadata.assignees ?? [];
  const actorName = item.actor?.name ?? "Someone";
  const involvedCount = Math.max(assignees.length, item.metadata.taskCount ?? 1);

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
      >
        {isAssigned ? (
          <Text style={{ fontSize: 13, fontWeight: "600", color: ACTIVITY_COLORS.slate900, lineHeight: 18 }}>
            {item.description ?? item.title}
          </Text>
        ) : (
          <View style={{ gap: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "500", color: ACTIVITY_COLORS.slate500 }}>
              {actorName} completed
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: ACTIVITY_COLORS.slate900, lineHeight: 18 }}>
              “{item.metadata.taskTitle ?? item.title}”
            </Text>
          </View>
        )}

        {isAssigned && involvedCount > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 }}>
            {assignees.length > 0 ? (
              <AvatarStack people={assignees} size={16} borderColor={ACTIVITY_COLORS.white} />
            ) : null}
            <Text style={{ fontSize: 11, color: ACTIVITY_COLORS.slate500 }}>
              {assignees.length > 0
                ? `${Math.max(assignees.length, involvedCount)} involved`
                : `${involvedCount} tasks`}
            </Text>
          </View>
        ) : null}

        {!isAssigned && assignees.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 }}>
            <AvatarStack people={assignees} size={16} borderColor={ACTIVITY_COLORS.white} />
            <Text style={{ fontSize: 11, color: ACTIVITY_COLORS.slate500, flex: 1 }} numberOfLines={1}>
              {formatAvatarStackNames(assignees)}
            </Text>
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
