import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react-native";
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
  const eventTitle = item.metadata.eventTitle ?? item.metadata.eventTitles?.[0] ?? item.title;

  const description =
    eventCount > 1 ? `Added ${eventCount} events` : `Added '${eventTitle}'`;

  const metadata = item.metadata.startDate
    ? formatEventDateTime(item.metadata.startDate, item.metadata.allDay)
    : item.metadata.isVideoMeeting
      ? "Video meeting"
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
      testID={testID ?? `event-activity-card-${item.id}`}
    >
      <ActivityCardBody
        actor={item.actor ?? { name: actorName }}
        label={getActivityTypeLabel(item.type, { eventCount })}
        LabelIcon={CalendarDays}
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
