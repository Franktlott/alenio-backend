import { useEffect, useState, type ReactElement } from "react";
import { View, Text, Pressable, ScrollView, Image, useWindowDimensions, type RefreshControlProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Clock,
  Users,
  Video,
  UserRound,
  ClipboardList,
  Plus,
} from "lucide-react-native";
import type { CalendarEvent, Task } from "@/lib/types";
import type { USFederalHoliday } from "@/lib/us-federal-holidays";
import {
  eventShowsScheduledTime,
  formatEventTimeRange,
} from "@/lib/format-event-time";
import { isWithinMeetingTimeFrame } from "@/lib/video-meeting-join";
import { tabBarClearance } from "@/lib/tab-bar";
import { WS } from "./workspace-ui";

const EVENT_CARD_HEIGHT = 44;
const SECTION_HORIZONTAL_PADDING = WS.pageGutter;
const CARD_GAP = 6;

type EventRow = {
  key: string;
  title: string;
  subtitle: string;
  accentColor: string;
  badge: string;
  badgeTone: "meeting" | "oneOnOne" | "task" | "holiday" | "routine" | "outlook";
  timeLabel: string;
  kind: "holiday" | "event" | "task";
  isVideoMeeting?: boolean;
  isOneOnOne?: boolean;
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
  refreshControl?: ReactElement<RefreshControlProps>;
  canManageEvent?: (event: CalendarEvent) => boolean;
  onEventLongPress?: (event: CalendarEvent) => void;
  onEventPress?: (event: CalendarEvent) => void;
  onTaskPress?: (task: Task) => void;
  onTaskLongPress?: (task: Task) => void;
  onAddEvent?: () => void;
};

function badgeColors(tone: EventRow["badgeTone"]) {
  switch (tone) {
    case "oneOnOne":
      return { bg: "#ECFDF5", text: "#047857" };
    case "task":
      return { bg: "#FFF7ED", text: "#C2410C" };
    case "holiday":
      return { bg: "#FEF2F2", text: "#B91C1C" };
    case "routine":
      return { bg: "#F5F3FF", text: "#6D28D9" };
    case "outlook":
      return { bg: "#F1F5F9", text: "#64748B" };
    default:
      return { bg: "#EEF2FF", text: "#4361EE" };
  }
}

function EventBadge({ label, tone }: { label: string; tone: EventRow["badgeTone"] }) {
  const colors = badgeColors(tone);
  return (
    <View style={{ backgroundColor: colors.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, flexShrink: 0 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.text }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function CompactEventCard({
  title,
  subtitle,
  accentColor,
  badge,
  badgeTone,
  width,
  onLongPress,
}: {
  title: string;
  subtitle: string;
  accentColor: string;
  badge: string;
  badgeTone: EventRow["badgeTone"];
  width: number;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{
        width,
        height: EVENT_CARD_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        backgroundColor: "white",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#E8EDF3",
      }}
    >
      <View style={{ width: 3, height: 22, borderRadius: 2, backgroundColor: accentColor, marginRight: 8, flexShrink: 0 }} />
      <View style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ fontSize: 10, color: "#64748B", marginTop: 0 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <EventBadge label={badge} tone={badgeTone} />
    </Pressable>
  );
}

function DayListEventCard({
  row,
  showJoin,
  onJoin,
}: {
  row: EventRow;
  showJoin?: boolean;
  onJoin?: () => void;
}) {
  const Icon = row.kind === "holiday"
    ? Clock
    : row.kind === "task" || row.badgeTone === "task"
      ? ClipboardList
      : row.isOneOnOne
        ? UserRound
        : row.isVideoMeeting
          ? Video
          : Users;
  const iconBg =
    row.kind === "holiday"
      ? "#FEF2F2"
      : row.badgeTone === "oneOnOne"
        ? "#ECFDF5"
        : row.badgeTone === "task"
          ? "#FFF7ED"
          : row.badgeTone === "routine"
            ? "#F5F3FF"
            : softIconBg(row.accentColor);

  return (
    <Pressable
      onPress={row.onPress}
      onLongPress={row.onLongPress}
      delayLongPress={400}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: WS.surface,
        borderRadius: WS.cardRadius,
        borderWidth: 1,
        borderColor: WS.cardBorder,
        paddingVertical: 10,
        paddingRight: 10,
        paddingLeft: 0,
        overflow: "hidden",
      }}
      testID={`day-event-card-${row.key}`}
    >
      <View style={{ width: 3, alignSelf: "stretch", backgroundColor: row.accentColor, marginRight: 10 }} />
      <View style={{ width: 68, paddingRight: 4, flexShrink: 0 }}>
        <Text
          style={{ fontSize: WS.body + 1, fontWeight: "700", color: WS.ink }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {row.timeLabel}
        </Text>
      </View>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 8,
        }}
      >
        <Icon size={13} color={row.accentColor} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
        <Text style={{ fontSize: WS.title, fontWeight: WS.titleWeight, color: WS.ink }} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={{ fontSize: WS.body, color: WS.muted, marginTop: 1 }} numberOfLines={1}>
          {row.subtitle}
        </Text>
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
            backgroundColor: "#4361EE",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            flexShrink: 0,
          }}
          testID={`day-event-join-${row.key}`}
          accessibilityRole="button"
          accessibilityLabel={`Join ${row.title}`}
        >
          <Video size={12} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF" }}>Join</Text>
        </Pressable>
      ) : (
        <EventBadge label={row.badge} tone={row.badgeTone} />
      )}
    </Pressable>
  );
}

function softIconBg(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length === 6) return `#${clean}22`;
  return "#EEF2FF";
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
    subtitle: "Federal Holiday",
    accentColor: "#EF4444",
    badge: "Holiday",
    badgeTone: "holiday" as const,
    timeLabel: "All day",
    kind: "holiday" as const,
    canManage: false,
  }));

  const eventRows: EventRow[] = dayEvents.map((ev) => {
    const timed = eventShowsScheduledTime(ev);
    const isExternal = ev.isExternal === true;
    const isOneOnOne = !isExternal && ev.isOneOnOne === true;
    const badge = isExternal ? "Outlook" : isOneOnOne ? "1:1" : ev.isVideoMeeting ? "Meeting" : "Event";
    const badgeTone = isExternal
      ? ("outlook" as const)
      : isOneOnOne
        ? ("oneOnOne" as const)
        : ("meeting" as const);
    const timeLabel = timed ? formatEventTimeRange(ev.startDate, ev.endDate).split("–")[0]?.trim() || "All day" : "All day";
    const canManage = isExternal ? false : canManageEvent ? canManageEvent(ev) : true;
    return {
      key: ev.id,
      title: ev.title,
      subtitle: isExternal
        ? "Private · Outlook"
        : ev.description?.trim() || (ev.isVideoMeeting ? "Video meeting" : isOneOnOne ? "Check-in" : "Calendar event"),
      accentColor: isExternal ? "#94A3B8" : ev.color,
      badge,
      badgeTone,
      timeLabel,
      kind: "event" as const,
      isVideoMeeting: ev.isVideoMeeting,
      isOneOnOne,
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
    const subtitle =
      task.status === "done"
        ? "Completed"
        : assigneeNames.length > 0
          ? `${assigneeNames.join(", ")}${more}`
          : "Task";
    const due = task.dueDate ? new Date(task.dueDate) : null;
    const timeLabel = due
      ? due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "Task";
    return {
      key: `task-${task.id}`,
      title: task.title,
      subtitle,
      accentColor: task.status === "done" ? "#94A3B8" : "#F59E0B",
      badge: "Task",
      badgeTone: "task" as const,
      timeLabel,
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
  refreshControl,
  canManageEvent,
  onEventLongPress,
  onEventPress,
  onTaskPress,
  onTaskLongPress,
  onAddEvent,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const contentWidth = screenWidth - SECTION_HORIZONTAL_PADDING * 2;
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
  const cardWidth = rows.length <= 1 ? contentWidth : Math.round(contentWidth * 0.78);
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
    const countLabel =
      eventCount === 0 && taskCount === 0
        ? "0 items"
        : [
            eventCount > 0 ? `${eventCount} event${eventCount === 1 ? "" : "s"}` : null,
            taskCount > 0 ? `${taskCount} task${taskCount === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join(" · ");

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
          <Text style={{ fontSize: WS.title + 1, fontWeight: WS.titleWeight, color: WS.ink, flex: 1, paddingRight: 8 }} numberOfLines={1}>
            {dayLabel}
          </Text>
          <Text style={{ fontSize: WS.control, fontWeight: "600", color: WS.accent }}>{countLabel}</Text>
        </View>

        {rows.length === 0 ? (
          <View
            style={{ flex: 1, minHeight: 0, marginBottom: tabBarClearance(insets.bottom, 8) }}
            testID="calendar-day-empty-wrap"
          >
            <View
              style={{
                flex: 1,
                width: "100%",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 20,
                paddingVertical: 28,
              }}
              testID="calendar-day-empty-state"
            >
              <Image
                source={require("@/assets/calendar-empty-day.png")}
                style={{ width: 152, height: 152, marginBottom: 12, alignSelf: "center" }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "800",
                  color: WS.ink,
                  textAlign: "center",
                  alignSelf: "center",
                  letterSpacing: -0.2,
                  marginBottom: 6,
                  width: "100%",
                }}
              >
                Nothing scheduled
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: WS.muted,
                  textAlign: "center",
                  alignSelf: "center",
                  lineHeight: 18,
                  maxWidth: 280,
                  marginBottom: onAddEvent ? 16 : 0,
                  width: "100%",
                }}
              >
                No events or tasks for this day. Tap “+ Add” to get started.
              </Text>
              {onAddEvent ? (
                <Pressable
                  onPress={onAddEvent}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    alignSelf: "center",
                    gap: 5,
                    backgroundColor: WS.accent,
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    paddingVertical: 11,
                    minWidth: 148,
                  }}
                  testID="calendar-empty-add-event"
                  accessibilityRole="button"
                  accessibilityLabel="Add"
                >
                  <Plus size={15} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>Add</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <ScrollView
            style={{ flex: fillRemaining ? 1 : undefined }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
            contentContainerStyle={{
              gap: 6,
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
        <Text style={{ fontSize: 9, fontWeight: "700", color: "#64748B", letterSpacing: 0.5 }}>EVENTS</Text>
      </View>

      {rows.length === 0 ? (
        <View
          style={{
            height: EVENT_CARD_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 10,
            gap: 6,
            backgroundColor: "white",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#E8EDF3",
          }}
        >
          <Clock size={12} color="#94A3B8" />
          <Text style={{ fontSize: 11, color: "#64748B" }}>No events for this day</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: CARD_GAP, paddingRight: 4 }}
        >
          {rows.map((row) => (
            <CompactEventCard
              key={row.key}
              title={row.title}
              subtitle={row.subtitle}
              accentColor={row.accentColor}
              badge={row.badge}
              badgeTone={row.badgeTone}
              width={cardWidth}
              onLongPress={row.onLongPress}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
