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
  const title = isAssigned
    ? (item.description ?? item.title)
    : `“${item.metadata.taskTitle ?? item.title}”`;

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
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: ACTIVITY_COLORS.slate900,
            lineHeight: 19,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 2,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {!isAssigned ? (
              <Text style={{ fontSize: 12, color: ACTIVITY_COLORS.slate500 }} numberOfLines={1}>
                {actorName} completed
              </Text>
            ) : null}

            {isAssigned && involvedCount > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {assignees.length > 0 ? (
                  <AvatarStack people={assignees} size={18} borderColor={ACTIVITY_COLORS.white} />
                ) : null}
                <Text style={{ fontSize: 12, color: ACTIVITY_COLORS.slate500, flex: 1 }} numberOfLines={1}>
                  {assignees.length > 0
                    ? `${Math.max(assignees.length, involvedCount)} involved`
                    : `${involvedCount} tasks`}
                </Text>
              </View>
            ) : null}

            {!isAssigned && assignees.length > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AvatarStack people={assignees} size={18} borderColor={ACTIVITY_COLORS.white} />
                <Text style={{ fontSize: 12, color: ACTIVITY_COLORS.slate500, flex: 1 }} numberOfLines={1}>
                  {formatAvatarStackNames(assignees)}
                </Text>
              </View>
            ) : null}
          </View>

          {item.actionLabel ? (
            <ActivityActionButton
              label={item.actionLabel}
              onPress={navigate}
              accentColor={ACTIVITY_COLORS.primary}
              variant="pill"
              testID={`${testID ?? item.id}-action`}
            />
          ) : null}
        </View>
      </ActivityCardBody>
    </ActivityCardShell>
  );
}
