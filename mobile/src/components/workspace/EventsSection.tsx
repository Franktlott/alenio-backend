import { useEffect, useState, type ReactElement } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, type RefreshControlProps } from "react-native";
import { router } from "expo-router";
import { Clock, MapPin, Video } from "lucide-react-native";
import type { CalendarEvent, Task } from "@/lib/types";
import type { USFederalHoliday } from "@/lib/us-federal-holidays";
import {
  eventShowsScheduledTime,
  formatEventTimeRange,
} from "@/lib/format-event-time";
import { isWithinMeetingTimeFrame } from "@/lib/video-meeting-join";
import { CalendarDayEmptyState } from "@/components/workspace/CalendarDayEmptyState";
import { colors, radii, space, typography } from "@/theme";
import { WS } from "./workspace-ui";
import { resolveCalendarEventColor } from "@/lib/calendar-event-colors";

const SECTION_HORIZONTAL_PADDING = WS.pageGutter;

type EventRow = {
  key: string;
  title: string;
  /** Location / time / kind line under the title */
  detail: string;
  timeLabel: string;
  accentColor: string;
  kind: "holiday" | "event" | "task";
  isVideoMeeting?: boolean;
  startDate?: string;
  endDate?: string | null;
  canManage?: boolean;
  onLongPress?: () => void;
  onPress?: () => void;
};

type Props = {
  dayEvents: CalendarEvent[];
  dayHolidays: USFederalHoliday[];
  dayTasks?: Task[];
  selectedDayIso?: string | null;
  variant?: "carousel" | "dayList";
  fillRemaining?: boolean;
  listPaddingBottom?: number;
  /** Keeps the empty-state card above the tab bar so its art centers in the visible area. */
  emptyStateBottomInset?: number;
  refreshControl?: ReactElement<RefreshControlProps>;
  canManageEvent?: (event: CalendarEvent) => boolean;
  onEventLongPress?: (event: CalendarEvent) => void;
  onEventPress?: (event: CalendarEvent) => void;
  onTaskPress?: (task: Task) => void;
  onTaskLongPress?: (task: Task) => void;
  onAddEvent?: () => void;
};

function DayListEventCard({
  row,
  showJoin,
  onJoin,
}: {
  row: EventRow;
  showJoin?: boolean;
  onJoin?: () => void;
}) {
  const DetailIcon = row.kind === "task" ? Clock : MapPin;

  return (
    <Pressable
      onPress={row.onPress}
      onLongPress={row.onLongPress}
      delayLongPress={400}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.borderCard,
        paddingVertical: space.cardPadV,
        paddingRight: space.cardPadH,
        paddingLeft: 0,
        overflow: "hidden",
        minHeight: 40,
      }}
      testID={`day-event-card-${row.key}`}
    >
      <View style={{ width: 3, alignSelf: "stretch", backgroundColor: row.accentColor, marginRight: 10 }} />
      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
        <Text style={typography.rowTitle} numberOfLines={1}>
          {row.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 }}>
          <DetailIcon size={10} color={colors.textMuted} strokeWidth={2.2} />
          <Text style={{ fontSize: 11, color: colors.textMuted, flexShrink: 1 }} numberOfLines={1}>
            {row.detail}
          </Text>
        </View>
      </View>
      {showJoin && onJoin ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onJoin();
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: colors.brand,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: radii.full,
            flexShrink: 0,
          }}
          testID={`day-event-join-${row.key}`}
          accessibilityRole="button"
          accessibilityLabel={`Join ${row.title}`}
        >
          <Video size={12} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFFFFF" }}>Join</Text>
        </Pressable>
      ) : (
        <Text
          style={{
            fontSize: 10,
            fontWeight: "600",
            color: colors.textSecondary,
            flexShrink: 0,
            textAlign: "right",
            maxWidth: 72,
          }}
          numberOfLines={2}
        >
          {row.timeLabel}
        </Text>
      )}
    </Pressable>
  );
}

function CompactEventCard({
  title,
  detail,
  accentColor,
  width,
  onLongPress,
}: {
  title: string;
  detail: string;
  accentColor: string;
  width: number;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{
        width,
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        backgroundColor: colors.surface,
        borderRadius: radii.sm,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      <View style={{ width: 3, height: 24, borderRadius: 2, backgroundColor: accentColor, marginRight: 8, flexShrink: 0 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textPrimary }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

function buildEventRows(
  dayHolidays: USFederalHoliday[],
  dayEvents: CalendarEvent[],
  dayTasks: Task[],
  onEventLongPress?: (event: CalendarEvent) => void,
  onEventPress?: (event: CalendarEvent) => void,
  canManageEvent?: (event: CalendarEvent) => boolean,
  onTaskPress?: (task: Task) => void,
  onTaskLongPress?: (task: Task) => void,
): EventRow[] {
  const holidayRows: EventRow[] = dayHolidays.map((h) => ({
    key: `holiday-${h.name}`,
    title: h.name,
    detail: "Federal holiday",
    timeLabel: "All day",
    accentColor: colors.error,
    kind: "holiday" as const,
    canManage: false,
  }));

  const eventRows: EventRow[] = dayEvents.map((ev) => {
    const timed = eventShowsScheduledTime(ev);
    const isExternal = ev.isExternal === true;
    const isOneOnOne = !isExternal && ev.isOneOnOne === true;
    const isPrivate = isExternal ? true : ev.isHidden === true;
    const timeRange = timed ? formatEventTimeRange(ev.startDate, ev.endDate) : "All day";
    const timeLabel = timed ? formatEventTimeRange(ev.startDate, ev.endDate).split("–")[0]?.trim() || "All day" : "All day";
    const canManage = isExternal ? false : canManageEvent ? canManageEvent(ev) : true;
    const description = ev.description?.trim();
    const kindHint = isExternal
      ? "Outlook"
      : ev.isVideoMeeting
        ? "Video meeting"
        : isOneOnOne
          ? "Check-in"
          : isPrivate
            ? "Private"
            : "Calendar event";
    const detail = description || `${timeRange} · ${kindHint}`;
    return {
      key: ev.id,
      title: ev.title,
      detail,
      timeLabel,
      accentColor: resolveCalendarEventColor({
        isExternal,
        isOneOnOne,
        isVideoMeeting: ev.isVideoMeeting,
        isHidden: isPrivate,
      }),
      kind: "event" as const,
      isVideoMeeting: ev.isVideoMeeting,
      startDate: ev.startDate,
      endDate: ev.endDate ?? null,
      canManage,
      onLongPress: canManage && onEventLongPress ? () => onEventLongPress(ev) : undefined,
      onPress: isExternal ? undefined : onEventPress ? () => onEventPress(ev) : undefined,
    };
  });

  const taskRows: EventRow[] = dayTasks.map((task) => {
    const assigneeNames = (task.assignments ?? [])
      .map((a) => a.user?.name?.trim() || a.user?.email)
      .filter(Boolean)
      .slice(0, 2);
    const more = (task.assignments?.length ?? 0) > 2 ? ` +${(task.assignments?.length ?? 0) - 2}` : "";
    const due = task.dueDate ? new Date(task.dueDate) : null;
    const timeLabel = due
      ? due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "Task";
    const detail =
      task.status === "done"
        ? "Completed"
        : assigneeNames.length > 0
          ? `${timeLabel} · ${assigneeNames.join(", ")}${more}`
          : timeLabel === "Task"
            ? "Task"
            : `Due ${timeLabel}`;
    return {
      key: `task-${task.id}`,
      title: task.title,
      detail,
      timeLabel,
      accentColor: task.status === "done" ? colors.textMuted : colors.warning,
      kind: "task" as const,
      canManage: false,
      onPress: onTaskPress ? () => onTaskPress(task) : undefined,
      onLongPress: onTaskLongPress ? () => onTaskLongPress(task) : undefined,
    };
  });

  return [...holidayRows, ...eventRows, ...taskRows];
}

export function EventsSection({
  dayEvents,
  dayHolidays,
  dayTasks = [],
  selectedDayIso,
  variant = "carousel",
  fillRemaining = false,
  listPaddingBottom = 4,
  emptyStateBottomInset = 0,
  refreshControl,
  canManageEvent,
  onEventLongPress,
  onEventPress,
  onTaskPress,
  onTaskLongPress,
  onAddEvent,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const rows = buildEventRows(
    dayHolidays,
    dayEvents,
    variant === "dayList" ? dayTasks : [],
    onEventLongPress,
    onEventPress,
    canManageEvent,
    onTaskPress,
    onTaskLongPress,
  );
  const eventCount = dayHolidays.length + dayEvents.length;
  const taskCount = variant === "dayList" ? dayTasks.length : 0;

  if (variant === "dayList") {
    const dayLabel = selectedDayIso
      ? new Date(`${selectedDayIso}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "Select a day";
    const shortDayLabel = selectedDayIso
      ? new Date(`${selectedDayIso}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : undefined;
    const totalItems = eventCount + taskCount;
    const countLabel =
      totalItems === 0
        ? "0 items"
        : `${totalItems} item${totalItems === 1 ? "" : "s"}`;

    return (
      <View
        style={{
          marginHorizontal: SECTION_HORIZONTAL_PADDING,
          marginTop: WS.sectionGap,
          marginBottom: 0,
          flex: fillRemaining ? 1 : undefined,
          minHeight: fillRemaining ? 0 : undefined,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexShrink: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textPrimary, flex: 1, paddingRight: 8 }} numberOfLines={1}>
            {dayLabel}
          </Text>
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.brand }}>{countLabel}</Text>
        </View>

        {rows.length === 0 ? (
          <View
            style={{
              flex: 1,
              minHeight: 0,
              alignSelf: "stretch",
              marginBottom: emptyStateBottomInset,
            }}
            testID="calendar-day-empty-wrap"
          >
            <CalendarDayEmptyState
              dayLabel={shortDayLabel}
              onAdd={onAddEvent}
            />
          </View>
        ) : (
          <ScrollView
            style={{ flex: fillRemaining ? 1 : undefined }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
            contentContainerStyle={{
              gap: 8,
              paddingBottom: listPaddingBottom,
              flexGrow: fillRemaining ? 1 : undefined,
            }}
          >
            {rows.map((row) => {
              const showJoin =
                !!row.isVideoMeeting &&
                !!row.startDate &&
                isWithinMeetingTimeFrame(row.startDate, row.endDate, nowMs);
              return (
                <DayListEventCard
                  key={row.key}
                  row={row}
                  showJoin={showJoin}
                  onJoin={
                    showJoin
                      ? () =>
                          router.push({
                            pathname: "/video-call",
                            params: { roomId: row.key, roomName: row.title },
                          })
                      : undefined
                  }
                />
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: SECTION_HORIZONTAL_PADDING, marginTop: 4 }}>
      <View style={{ marginBottom: 3, minHeight: 16 }}>
        <Text style={typography.sectionLabel}>Events</Text>
      </View>

      {rows.length === 0 ? (
        <View
          style={{
            minHeight: 48,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 10,
            gap: 6,
            backgroundColor: colors.surface,
            borderRadius: radii.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          }}
        >
          <Clock size={12} color={colors.textMuted} />
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>No events for this day</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 6, paddingRight: 4 }}
        >
          {rows.map((row) => (
            <CompactEventCard
              key={row.key}
              title={row.title}
              detail={row.detail}
              accentColor={row.accentColor}
              width={220}
              onLongPress={row.onLongPress}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
