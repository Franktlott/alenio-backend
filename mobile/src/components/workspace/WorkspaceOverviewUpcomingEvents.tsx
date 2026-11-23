import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowRight, ChevronRight } from "lucide-react-native";
import type { CalendarEvent } from "@/lib/types";
import {
  eventShowsScheduledTime,
  formatEventTimeRange,
} from "@/lib/format-event-time";
import { resolveCalendarEventColor } from "@/lib/calendar-event-colors";
import { toLocalIso } from "@/components/workspace/workspace-utils";

type Props = {
  events: CalendarEvent[];
  onViewCalendar: () => void;
  onEventPress: (event: CalendarEvent) => void;
  /** Hard cap on events loaded into the card. */
  limit?: number;
  /** Rows visible before the list scrolls. */
  visibleCount?: number;
};

const PURPLE = "#6d28d9";
const TILE = "#EDE7FF";
const DAY_INK = "#3730A3";
/** Approx row height (padding + badge) for the scroll viewport. */
const ROW_HEIGHT = 66;
const DEFAULT_LIMIT = 5;
const DEFAULT_VISIBLE = 3;

function weekdayShort(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
}

function dayNumber(iso: string): string {
  return String(new Date(iso).getDate());
}

function eventSubtitle(event: CalendarEvent): string {
  const parts: string[] = [];
  if (eventShowsScheduledTime(event)) {
    parts.push(formatEventTimeRange(event.startDate, event.endDate));
  } else {
    parts.push("All day");
  }
  const detail = event.description?.trim().split("\n")[0]?.trim();
  if (detail) parts.push(detail);
  return parts.join(" · ");
}

/**
 * Overview upcoming events — matches mock: date badge, accent bar, title + meta, chevron.
 */
export function WorkspaceOverviewUpcomingEvents({
  events,
  onViewCalendar,
  onEventPress,
  limit = DEFAULT_LIMIT,
  visibleCount = DEFAULT_VISIBLE,
}: Props) {
  const todayIso = toLocalIso(new Date());
  const upcoming = events
    .filter((event) => event.startDate.slice(0, 10) >= todayIso)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    )
    .slice(0, limit);

  const scrollable = upcoming.length > visibleCount;
  const listMaxHeight = ROW_HEIGHT * visibleCount;

  return (
    <View style={styles.card} testID="workspace-overview-upcoming-events">
      <View style={styles.header}>
        <Text style={styles.title}>Upcoming Events</Text>
        <Pressable
          onPress={onViewCalendar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="View calendar"
          testID="workspace-overview-view-calendar"
          style={({ pressed }) => [
            styles.viewLinkPress,
            pressed ? styles.viewLinkPressed : null,
          ]}
        >
          <View style={styles.viewLink}>
            <Text style={styles.viewLinkText}>View calendar</Text>
            <ArrowRight size={14} color={PURPLE} strokeWidth={2.4} />
          </View>
        </Pressable>
      </View>

      {upcoming.length === 0 ? (
        <Text style={styles.empty}>No upcoming events yet.</Text>
      ) : (
        <ScrollView
          style={scrollable ? { maxHeight: listMaxHeight } : undefined}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={scrollable}
          nestedScrollEnabled
          scrollEnabled={scrollable}
          bounces={scrollable}
        >
          {upcoming.map((event, index) => {
            const accent = resolveCalendarEventColor(event);
            const isLast = index === upcoming.length - 1;
            return (
              <Pressable
                key={event.id}
                onPress={() => onEventPress(event)}
                accessibilityRole="button"
                accessibilityLabel={event.title}
                testID={`workspace-overview-event-${event.id}`}
                style={({ pressed }) => [
                  styles.rowPress,
                  !isLast ? styles.rowDivider : null,
                  pressed ? styles.rowPressed : null,
                ]}
              >
                <View style={styles.row}>
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateDow}>
                      {weekdayShort(event.startDate)}
                    </Text>
                    <Text style={styles.dateDay}>
                      {dayNumber(event.startDate)}
                    </Text>
                  </View>
                  <View style={[styles.accent, { backgroundColor: accent }]} />
                  <View style={styles.copy}>
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={styles.eventMeta} numberOfLines={1}>
                      {eventSubtitle(event)}
                    </Text>
                  </View>
                  <View style={styles.chevron}>
                    <ChevronRight size={18} color="#9CA3AF" strokeWidth={2.2} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111827",
  },
  viewLinkPress: {
    paddingLeft: 8,
  },
  viewLink: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewLinkPressed: {
    opacity: 0.65,
  },
  viewLinkText: {
    marginRight: 4,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: PURPLE,
  },
  empty: {
    paddingVertical: 14,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: "#6B7280",
  },
  list: {
    width: "100%",
  },
  rowPress: {
    width: "100%",
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  rowPressed: {
    opacity: 0.7,
  },
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  dateBadge: {
    width: 40,
    borderRadius: 10,
    backgroundColor: TILE,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    marginRight: 10,
    flexShrink: 0,
  },
  dateDow: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: DAY_INK,
  },
  dateDay: {
    marginTop: 1,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    color: DAY_INK,
  },
  accent: {
    width: 3,
    height: 28,
    borderRadius: 2,
    marginRight: 10,
    flexShrink: 0,
  },
  copy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    marginRight: 6,
  },
  eventTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#111827",
  },
  eventMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "500",
    color: "#6B7280",
  },
  chevron: {
    flexShrink: 0,
    marginLeft: 2,
  },
});
