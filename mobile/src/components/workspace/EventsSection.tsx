import type { ReactElement } from "react";
import { View, Text, Pressable, ScrollView, Image, useWindowDimensions, type RefreshControlProps } from "react-native";
import {
  Clock,
  Users,
  Video,
  UserRound,
  ClipboardList,
  MoreVertical,
  Plus,
} from "lucide-react-native";
import type { CalendarEvent } from "@/lib/types";
import type { USFederalHoliday } from "@/lib/us-federal-holidays";
import {
  eventShowsScheduledTime,
  formatEventTimeRange,
} from "@/lib/format-event-time";
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
  badgeTone: "meeting" | "oneOnOne" | "task" | "holiday" | "routine";
  timeLabel: string;
  kind: "holiday" | "event";
  isVideoMeeting?: boolean;
  isOneOnOne?: boolean;
  canManage?: boolean;
  onLongPress?: () => void;
  onPress?: () => void;
  onMenu?: () => void;
};

type Props = {
  dayEvents: CalendarEvent[];
  dayHolidays: USFederalHoliday[];
  selectedDayIso?: string | null;
  variant?: "carousel" | "dayList";
  fillRemaining?: boolean;
  listPaddingBottom?: number;
  refreshControl?: ReactElement<RefreshControlProps>;
  canManageEvent?: (event: CalendarEvent) => boolean;
  onEventLongPress?: (event: CalendarEvent) => void;
  onEventPress?: (event: CalendarEvent) => void;
  onEventMenu?: (event: CalendarEvent) => void;
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

function DayListEventCard({ row }: { row: EventRow }) {
  const Icon = row.kind === "holiday"
    ? Clock
    : row.isOneOnOne
      ? UserRound
      : row.isVideoMeeting
        ? Video
        : row.badgeTone === "task"
          ? ClipboardList
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
    >
      <View style={{ width: 3, alignSelf: "stretch", backgroundColor: row.accentColor, marginRight: 10 }} />
      <View style={{ width: 52, paddingRight: 4 }}>
        <Text style={{ fontSize: WS.body + 1, fontWeight: "700", color: WS.ink }} numberOfLines={2}>
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
      <EventBadge label={row.badge} tone={row.badgeTone} />
      {row.canManage && row.onMenu ? (
        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            row.onMenu?.();
          }}
          hitSlop={8}
          style={{ marginLeft: 6, padding: 2 }}
          accessibilityRole="button"
          accessibilityLabel="Event actions"
        >
          <MoreVertical size={16} color="#64748B" />
        </Pressable>
      ) : null}
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
  onEventLongPress?: (event: CalendarEvent) => void,
  onEventPress?: (event: CalendarEvent) => void,
  onEventMenu?: (event: CalendarEvent) => void,
  canManageEvent?: (event: CalendarEvent) => boolean,
): EventRow[] {
  return [
    ...dayHolidays.map((h) => ({
      key: `holiday-${h.name}`,
      title: h.name,
      subtitle: "Federal Holiday",
      accentColor: "#EF4444",
      badge: "Holiday",
      badgeTone: "holiday" as const,
      timeLabel: "All day",
      kind: "holiday" as const,
      canManage: false,
    })),
    ...dayEvents.map((ev) => {
      const timed = eventShowsScheduledTime(ev);
      const isOneOnOne = ev.isOneOnOne === true;
      const badge = isOneOnOne ? "1:1" : ev.isVideoMeeting ? "Meeting" : "Event";
      const badgeTone = isOneOnOne ? ("oneOnOne" as const) : ("meeting" as const);
      const timeLabel = timed ? formatEventTimeRange(ev.startDate, ev.endDate).split("–")[0]?.trim() || "All day" : "All day";
      const canManage = canManageEvent ? canManageEvent(ev) : true;
      return {
        key: ev.id,
        title: ev.title,
        subtitle: ev.description?.trim() || (ev.isVideoMeeting ? "Video meeting" : isOneOnOne ? "Check-in" : "Calendar event"),
        accentColor: ev.color,
        badge,
        badgeTone,
        timeLabel,
        kind: "event" as const,
        isVideoMeeting: ev.isVideoMeeting,
        isOneOnOne,
        canManage,
        onLongPress: canManage && onEventLongPress ? () => onEventLongPress(ev) : undefined,
        onPress: onEventPress ? () => onEventPress(ev) : undefined,
        onMenu: canManage && onEventMenu ? () => onEventMenu(ev) : undefined,
      };
    }),
  ];
}

export function EventsSection({
  dayEvents,
  dayHolidays,
  selectedDayIso,
  variant = "carousel",
  fillRemaining = false,
  listPaddingBottom = 4,
  refreshControl,
  canManageEvent,
  onEventLongPress,
  onEventPress,
  onEventMenu,
  onAddEvent,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = screenWidth - SECTION_HORIZONTAL_PADDING * 2;
  const rows = buildEventRows(dayHolidays, dayEvents, onEventLongPress, onEventPress, onEventMenu, canManageEvent);
  const cardWidth = rows.length <= 1 ? contentWidth : Math.round(contentWidth * 0.78);

  if (variant === "dayList") {
    const dayLabel = selectedDayIso
      ? new Date(`${selectedDayIso}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "Select a day";
    const countLabel = `${rows.length} event${rows.length === 1 ? "" : "s"}`;

    return (
      <View
        style={{
          marginHorizontal: SECTION_HORIZONTAL_PADDING,
          marginTop: WS.sectionGap,
          marginBottom: 4,
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
          <ScrollView
            style={{ flex: fillRemaining ? 1 : undefined }}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: listPaddingBottom,
              justifyContent: fillRemaining ? "center" : undefined,
            }}
          >
            <View
              style={{
                alignItems: "center",
                backgroundColor: WS.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: WS.cardBorder,
                paddingHorizontal: 24,
                paddingTop: 28,
                paddingBottom: 24,
              }}
              testID="calendar-day-empty-state"
            >
              <Image
                source={require("@/assets/calendar-empty-day.png")}
                style={{ width: 148, height: 148, marginBottom: 10 }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: WS.ink,
                  textAlign: "center",
                  letterSpacing: -0.2,
                  marginBottom: 8,
                }}
              >
                No events scheduled
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: WS.muted,
                  textAlign: "center",
                  lineHeight: 20,
                  maxWidth: 280,
                  marginBottom: onAddEvent ? 20 : 0,
                }}
              >
                Looks like you have an open day. Tap “+ Add Event” to get started.
              </Text>
              {onAddEvent ? (
                <Pressable
                  onPress={onAddEvent}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: WS.accent,
                    borderRadius: 12,
                    paddingHorizontal: 18,
                    paddingVertical: 12,
                    minWidth: 160,
                  }}
                  testID="calendar-empty-add-event"
                  accessibilityRole="button"
                  accessibilityLabel="Add Event"
                >
                  <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>Add Event</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
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
            {rows.map((row) => (
              <DayListEventCard key={row.key} row={row} />
            ))}
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
