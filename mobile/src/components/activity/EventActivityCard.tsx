import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import type { ActivityFeedItem } from "./types";
import { formatRelativeTime } from "./types";
import { UserAvatar } from "@/components/UserAvatar";

type Props = {
  item: ActivityFeedItem;
  footer?: ReactNode;
  onLongPress?: () => void;
  testID?: string;
};

function formatEventDateTime(startDate: string, allDay?: boolean): string {
  const date = new Date(startDate);
  const dateLabel = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  if (allDay) return `${dateLabel} · All day`;
  const timeLabel = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dateLabel} · ${timeLabel}`;
}

export function EventActivityCard({
  item,
  footer,
  onLongPress,
  testID,
}: Props) {
  const actorName = item.actor?.name ?? "Someone";
  const eventCount = item.metadata.eventCount ?? 1;
  const eventTitle =
    item.metadata.eventTitle ?? item.metadata.eventTitles?.[0] ?? item.title;

  const description =
    eventCount > 1
      ? `${actorName} added ${eventCount} events`
      : `${actorName} added an event`;

  const metadata = item.metadata.startDate
    ? formatEventDateTime(item.metadata.startDate, item.metadata.allDay)
    : item.metadata.isVideoMeeting
      ? "Video meeting"
      : undefined;
  const eventDate = item.metadata.startDate
    ? new Date(item.metadata.startDate)
    : new Date(item.timestamp);
  const month = eventDate
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
  const day = eventDate.toLocaleDateString("en-US", { day: "numeric" });

  return (
    <View style={styles.outer}>
      <Pressable
        onLongPress={onLongPress}
        disabled={!onLongPress}
        testID={testID ?? `event-activity-card-${item.id}`}
        style={({ pressed }) => [
          styles.card,
          pressed && onLongPress ? styles.pressed : null,
        ]}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerLabel}>
              <CalendarDays size={12} color="#4361EE" strokeWidth={2.2} />
              <Text style={styles.headerText}>CALENDAR EVENT</Text>
            </View>
            <Text style={styles.time}>
              {formatRelativeTime(item.timestamp)}
            </Text>
          </View>

          <View style={styles.eventRow}>
            <View style={styles.dateTile}>
              <Text style={styles.month}>{month}</Text>
              <Text style={styles.day}>{day}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.title} numberOfLines={2}>
                {eventTitle}
              </Text>
              <Text style={styles.eventTime} numberOfLines={1}>
                {metadata ?? "Added to the workspace calendar"}
              </Text>
              <View style={styles.actorRow}>
                {item.actor ? (
                  <UserAvatar
                    user={item.actor}
                    size={20}
                    radius={10}
                    backgroundColor="#EEF2FF"
                    textColor="#4361EE"
                    resetKey={item.id}
                  />
                ) : null}
                <Text style={styles.actorText} numberOfLines={1}>
                  {description}
                </Text>
              </View>
            </View>
          </View>
          {footer}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { marginHorizontal: 14, marginVertical: 4 },
  card: {
    overflow: "hidden",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DFE6F5",
    backgroundColor: "#FFFFFF",
    shadowColor: "#2F4D8F",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  pressed: { opacity: 0.88 },
  content: { paddingHorizontal: 12, paddingTop: 9, paddingBottom: 9 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  headerLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  headerText: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "800",
    letterSpacing: 0.95,
    color: "#4361EE",
  },
  time: { fontSize: 8.5, lineHeight: 11, color: "#98A1B2" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  dateTile: {
    width: 41,
    height: 43,
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F6FF",
    borderWidth: 1,
    borderColor: "#DDE5FF",
  },
  month: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    letterSpacing: 0.75,
    color: "#4361EE",
  },
  day: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "800",
    color: "#182033",
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "800",
    color: "#182033",
  },
  eventTime: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
    color: "#66758A",
  },
  actorRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actorText: {
    flex: 1,
    fontSize: 9.5,
    lineHeight: 13,
    color: "#7A8597",
  },
});
