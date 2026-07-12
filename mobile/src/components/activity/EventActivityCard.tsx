import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { CalendarDays, Video } from "lucide-react-native";
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

function formatEventDateTime(startDate: string, allDay?: boolean): string {
  const date = new Date(startDate);
  const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (allDay) return `${dateLabel} · All day`;
  const timeLabel = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dateLabel} · ${timeLabel}`;
}

export function EventActivityCard({ item, footer, onLongPress, testID }: Props) {
  const tint = getActivityTintTokens(item.type);
  const actorName = item.actor?.name ?? "Someone";
  const eventCount = item.metadata.eventCount ?? 1;
  const eventChips: string[] = [];

  if (item.metadata.startDate) {
    eventChips.push(formatEventDateTime(item.metadata.startDate, item.metadata.allDay));
  }
  if (item.metadata.endDate && item.metadata.endDate !== item.metadata.startDate) {
    eventChips.push(formatEventDateTime(item.metadata.endDate, item.metadata.allDay));
  }

  const visibleChips = eventChips.slice(0, 2);
  const overflow = Math.max(0, eventCount - visibleChips.length);

  const navigate = () => {
    if (item.actionRoute) router.push(item.actionRoute as never);
  };

  return (
    <ActivityCardShell
      type={item.type}
      onPress={item.actionRoute ? navigate : undefined}
      onLongPress={onLongPress}
      footer={footer}
      testID={testID ?? `event-activity-card-${item.id}`}
    >
      <ActivityCardBody
        actor={item.actor ?? { name: actorName }}
        label={getActivityTypeLabel(item.type, { eventCount })}
        LabelIcon={CalendarDays}
        tint={tint}
        timestamp={item.timestamp}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: ACTIVITY_COLORS.slate900, lineHeight: 18 }}>
          {eventCount > 1 ? `${actorName} added ${eventCount} events` : item.description ?? item.title}
        </Text>

        {visibleChips.length > 0 || item.metadata.isVideoMeeting ? (
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 1 }}>
            {visibleChips.map((chip) => (
              <Text key={chip} style={{ fontSize: 11, fontWeight: "500", color: ACTIVITY_COLORS.slate500 }}>
                {chip}
              </Text>
            ))}
            {overflow > 0 ? (
              <Text style={{ fontSize: 11, fontWeight: "500", color: ACTIVITY_COLORS.slate400 }}>
                +{overflow} more
              </Text>
            ) : null}
            {item.metadata.isVideoMeeting ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Video size={11} color={ACTIVITY_COLORS.slate500} />
                <Text style={{ fontSize: 11, fontWeight: "500", color: ACTIVITY_COLORS.slate500 }}>Video</Text>
              </View>
            ) : null}
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
