import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  type RefreshControlProps,
} from "react-native";
import { router } from "expo-router";
import { videoCallHref } from "@/lib/meeting-navigation";
import { ArrowDown, Check, Clock, Square } from "lucide-react-native";
import { compareAgendaOrder } from "@/lib/calendar-month-view";
import { instantHasPassed, scheduleTimeParts } from "@/lib/schedule-time";
import type { CalendarEvent, HomeTodayItemType, Task, TeamMember } from "@/lib/types";
import { CheckBurst } from "@/components/schedule/CheckBurst";
import { ScheduleKindIcon } from "@/components/schedule/ScheduleKindIcon";
import { TimelineRow } from "@/components/schedule/TimelineRow";
import { TODAY_ITEM_PRESENTATION } from "@/lib/home-today-item";
import { isReminderTask } from "@/lib/task-kind";
import type { USFederalHoliday } from "@/lib/us-federal-holidays";
import { eventShowsScheduledTime } from "@/lib/format-event-time";
import { canShowAgendaVideoJoin } from "@/lib/video-meeting-join";
import { CalendarDayEmptyState } from "@/components/workspace/CalendarDayEmptyState";
import { AgendaRowJoinPill } from "@/components/workspace/AgendaRowJoinPill";
import { colors, radii, typography } from "@/theme";
import { toLocalIso } from "./workspace-utils";
import { WS } from "./workspace-ui";
import { CALENDAR_EVENT_COLORS } from "@/lib/calendar-event-colors";

const SECTION_HORIZONTAL_PADDING = WS.pageGutter;
const CARD_GAP = 0;

type EventAttendee = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type EventRow = {
  key: string;
  title: string;
  /** Location / time / kind line under the title */
  detail: string;
  timeLabel: string;
  timeMeridiem?: string;
  timeEnd?: string | null;
  typeLabel: string;
  accentColor: string;
  kind: "holiday" | "event" | "task";
  iconKind?: HomeTodayItemType;
  isCompleted?: boolean;
  isVideoMeeting?: boolean;
  isReminder?: boolean;
  isPrivate?: boolean;
  isExternal?: boolean;
  allDay?: boolean;
  checkInRecipient?: EventAttendee;
  attendees?: EventAttendee[];
  priority?: string;
  detailColor?: string;
  overdue?: boolean;
  startDate?: string;
  endDate?: string | null;
  canManage?: boolean;
  event?: CalendarEvent;
  task?: Task;
  onLongPress?: () => void;
  onPress?: () => void;
};

type Props = {
  dayEvents: CalendarEvent[];
  dayHolidays: USFederalHoliday[];
  dayTasks?: Task[];
  members?: TeamMember[];
  selectedDayIso?: string | null;
  variant?: "carousel" | "dayList";
  /** Plain stacked-agenda rows: no accent bar and no "All day" time column. */
  plainDayRows?: boolean;
  /** List only — no date header. Use inside a sheet that already has a title. */
  embedded?: boolean;
  fillRemaining?: boolean;
  scrollEnabled?: boolean;
  listPaddingBottom?: number;
  /** Keeps the empty-state card above the tab bar so its art centers in the visible area. */
  emptyStateBottomInset?: number;
  refreshControl?: ReactElement<RefreshControlProps>;
  footer?: ReactNode;
  canManageEvent?: (event: CalendarEvent) => boolean;
  onEventLongPress?: (event: CalendarEvent) => void;
  onEventPress?: (event: CalendarEvent) => void;
  onTaskPress?: (task: Task) => void;
  onTaskLongPress?: (task: Task) => void;
  onToggleTask?: (task: Task) => void;
  onAddEvent?: () => void;
  isOwnerOrLeader?: boolean;
};

/** A timed row that has not ended yet. All-day rows stay above the clock. */
function rowStillAhead(row: EventRow, nowMs: number): boolean {
  if (row.allDay || row.kind === "holiday") return false;
  const end = row.endDate ?? row.startDate;
  if (!end) return false;
  const at = new Date(end).getTime();
  return Number.isFinite(at) && at >= nowMs;
}

function firstName(person?: EventAttendee | null): string | null {
  const name = person?.name?.trim();
  if (!name) return null;
  return name.split(/\s+/)[0] ?? name;
}

function uniqueAttendees(people: EventAttendee[]): EventAttendee[] {
  const seen = new Set<string>();
  const result: EventAttendee[] = [];
  for (const person of people) {
    const key = person.email ?? person.name ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(person);
  }
  return result;
}

function formatClock(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatClockParts(value: string): { time: string; meridiem: string } {
  const formatted = formatClock(value);
  const match = formatted.match(/^(.*)\s+(AM|PM)$/i);
  if (!match) return { time: formatted, meridiem: "" };
  return { time: match[1]!, meridiem: match[2]!.toUpperCase() };
}

function DayListEventCard({
  row,
  nowMs,
  onToggleTask,
  isFirst = false,
  isLast = false,
}: {
  row: EventRow;
  nowMs: number;
  onToggleTask?: (task: Task) => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const showMenu = row.kind !== "holiday" && Boolean(row.onLongPress);
  const isTask = row.kind === "task" && Boolean(row.task);
  const event = row.event;
  const startDate = event?.startDate ?? row.startDate;
  const endDate = event?.endDate ?? row.endDate;
  const isVideo = Boolean(event?.isVideoMeeting || row.isVideoMeeting);
  const showJoin =
    isVideo &&
    Boolean(startDate) &&
    canShowAgendaVideoJoin(startDate, endDate, nowMs);
  const meetingStarted =
    Boolean(startDate) && new Date(startDate).getTime() <= nowMs;
  const meetingId = event?.id ?? row.key;
  const meetingTitle = event?.title ?? row.title;
  const itemKind = row.iconKind ?? (isTask ? "task" : "event");
  const itemPresentation = TODAY_ITEM_PRESENTATION[itemKind];
  const isDone = row.isCompleted === true;

  const handleJoin = () => {
    router.push(videoCallHref(meetingId, meetingTitle));
  };

  const timeMain = row.allDay ? "All day" : row.timeLabel;
  const timeSub = row.allDay ? null : row.timeMeridiem;

  const leading = isTask ? (
    <Pressable
      onPress={(pressEvent) => {
        pressEvent.stopPropagation?.();
        if (row.task && onToggleTask) onToggleTask(row.task);
        else row.onPress?.();
      }}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityState={{ checked: isDone }}
      accessibilityLabel="Open task"
      style={{
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
      }}
      testID={`day-task-toggle-${row.task!.id}`}
    >
      <CheckBurst checked={isDone}>
        {isDone ? (
          <View style={styles.checkboxOn}>
            <Check size={12} color="#FFFFFF" strokeWidth={3} />
          </View>
        ) : (
          <Square size={17} color="#8B95A5" strokeWidth={2.1} />
        )}
      </CheckBurst>
    </Pressable>
  ) : (
    <View
      style={[
        styles.itemTypeIcon,
        { backgroundColor: itemPresentation.surface },
      ]}
    >
      <ScheduleKindIcon
        kind={itemKind}
        size={12}
        color={itemPresentation.color}
      />
    </View>
  );

  const trailing = showJoin ? (
    <AgendaRowJoinPill
      meetingTitle={meetingTitle}
      live={meetingStarted}
      onPress={handleJoin}
      testID={`day-event-join-${meetingId}`}
    />
  ) : null;

  return (
    <TimelineRow
      timeMain={timeMain}
      timeSub={timeSub}
      leading={leading}
      trailing={trailing}
      isFirst={isFirst}
      isLast={isLast}
      onPress={row.onPress}
      onLongPress={showMenu ? row.onLongPress : undefined}
      testID={`day-event-card-${row.key}`}
    >
      <Text
        style={[
          styles.title,
          isDone
            ? { color: colors.textMuted, textDecorationLine: "line-through" }
            : null,
        ]}
        numberOfLines={2}
      >
        {row.title}
      </Text>
      {showJoin ? (
        <Pressable
          onPress={handleJoin}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={
            meetingStarted
              ? `Join active meeting ${meetingTitle}`
              : `Join ${meetingTitle}`
          }
        >
          <Text
            style={
              meetingStarted ? styles.joinActiveLine : styles.joinSoonLine
            }
            numberOfLines={1}
          >
            {meetingStarted ? "Live now" : "Starting soon"}
          </Text>
        </Pressable>
      ) : row.detail || (row.kind === "task" && row.overdue) ? (
        <Text
          style={[
            styles.detail,
            row.detailColor ? { color: row.detailColor } : null,
          ]}
          numberOfLines={1}
        >
          {row.detail}
          {row.kind === "task" && row.overdue ? (
            <Text style={styles.overdue}>
              {row.detail ? " · " : ""}Overdue
            </Text>
          ) : null}
        </Text>
      ) : null}
    </TimelineRow>
  );
}

function CompactEventCard({
  title,
  detail,
  overdue,
  width,
  onLongPress,
}: {
  title: string;
  detail: string;
  overdue?: boolean;
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 13, fontWeight: "600", color: colors.textPrimary }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}
          numberOfLines={1}
        >
          {detail}
          {overdue ? <Text style={styles.overdue}> · Overdue</Text> : null}
        </Text>
      </View>
    </Pressable>
  );
}

function buildEventRows(
  dayHolidays: USFederalHoliday[],
  dayEvents: CalendarEvent[],
  dayTasks: Task[],
  members: TeamMember[],
  onEventLongPress?: (event: CalendarEvent) => void,
  onEventPress?: (event: CalendarEvent) => void,
  canManageEvent?: (event: CalendarEvent) => boolean,
  onTaskPress?: (task: Task) => void,
  onTaskLongPress?: (task: Task) => void,
): EventRow[] {
  const holidayRows: EventRow[] = dayHolidays.map((h) => ({
    key: `holiday-${h.name}`,
    title: h.name,
    detail: "Holiday",
    timeLabel: "All",
    timeMeridiem: "day",
    timeEnd: undefined,
    allDay: true,
    typeLabel: "Holiday",
    accentColor: CALENDAR_EVENT_COLORS.holiday,
    kind: "holiday" as const,
    iconKind: "holiday" as const,
    canManage: false,
  }));

  const eventRows: EventRow[] = dayEvents.map((ev) => {
    const timed = eventShowsScheduledTime(ev);
    const isExternal = ev.isExternal === true;
    const isOneOnOne = !isExternal && ev.isOneOnOne === true;
    const isPrivate = isExternal ? true : ev.isHidden === true;
    const approvalLabel =
      ev.approvalStatus === "pending"
        ? "Pending approval"
        : ev.approvalStatus === "rejected"
          ? "Not approved"
          : null;
    const canManage = isExternal
      ? false
      : canManageEvent
        ? canManageEvent(ev)
        : true;
    const checkInRecipient = isOneOnOne
      ? members.find((member) => member.userId === ev.oneOnOneMemberUserId)
          ?.user
      : undefined;
    const attendees = uniqueAttendees(
      [
        ...(ev.assigneeIds ?? [])
          .map((id) => members.find((member) => member.userId === id)?.user)
          .filter((user): user is NonNullable<typeof user> => Boolean(user)),
        checkInRecipient,
      ].filter((user): user is EventAttendee => Boolean(user)),
    );
    const description = ev.description?.trim().split("\n")[0]?.trim() ?? "";
    const kindHint = isExternal
      ? "Outlook"
      : isOneOnOne
        ? "Check-in"
        : ev.isVideoMeeting
          ? "Meeting"
          : isPrivate
            ? "Private"
            : "Event";
    const clock = timed
      ? formatClockParts(ev.startDate)
      : { time: "All", meridiem: "day" };
    const personLabel =
      firstName(checkInRecipient) ??
      firstName(attendees[0]) ??
      firstName(ev.createdBy);
    const detail = approvalLabel
      ? approvalLabel
      : ev.isVideoMeeting
        ? personLabel
          ? `Meeting · ${personLabel}`
          : "Meeting"
        : isOneOnOne
          ? personLabel
            ? `Check-in · ${personLabel}`
            : "Check-in"
          : personLabel
            ? `Event · ${personLabel}`
            : description
              ? `Event · ${description}`
              : isExternal
                ? "Event · Outlook"
                : "Event";
    const showAttendees =
      attendees.length > 1 || (attendees.length === 1 && Boolean(description));
    return {
      key: ev.id,
      title: ev.title,
      detail,
      timeLabel: clock.time,
      timeMeridiem: clock.meridiem || undefined,
      timeEnd: timed && ev.endDate ? formatClock(ev.endDate) : null,
      typeLabel: kindHint,
      accentColor: colors.brand,
      kind: "event" as const,
      iconKind: isExternal
        ? "external"
        : isOneOnOne
          ? "check_in"
          : ev.isVideoMeeting
            ? "meeting"
            : "event",
      allDay: !timed,
      detailColor:
        ev.approvalStatus === "pending"
          ? "#B45309"
          : ev.approvalStatus === "rejected"
            ? "#B91C1C"
            : undefined,
      overdue: timed && instantHasPassed(ev.endDate ?? ev.startDate),
      isVideoMeeting: ev.isVideoMeeting,
      isPrivate,
      isExternal,
      attendees: showAttendees ? attendees : undefined,
      startDate: ev.startDate,
      endDate: ev.endDate ?? null,
      canManage,
      event: ev,
      onLongPress:
        canManage && onEventLongPress ? () => onEventLongPress(ev) : undefined,
      onPress: onEventPress ? () => onEventPress(ev) : undefined,
    };
  });

  const taskRows: EventRow[] = dayTasks.map((task) => {
    const isReminder = isReminderTask(task);
    const isCompleted = task.status === "done";
    const kindLabel = "Task";
    const time = scheduleTimeParts({
      at: task.dueDate,
      taskLike: true,
      done: isCompleted,
    });
    const person = (task.assignments ?? [])
      .map((assignment) => assignment.user?.name?.trim().split(/\s+/)[0])
      .find((name) => Boolean(name));
    const context = isReminder ? "Only you" : person;
    return {
      key: `task-${task.id}`,
      title: task.title,
      detail: context ? `${kindLabel} · ${context}` : kindLabel,
      timeLabel: time.main,
      timeMeridiem: time.sub || undefined,
      typeLabel: kindLabel,
      accentColor: CALENDAR_EVENT_COLORS.task,
      kind: "task" as const,
      iconKind: isReminder ? "reminder" : "task",
      allDay: false,
      isCompleted,
      overdue: !isCompleted && instantHasPassed(task.dueDate),
      isReminder,
      priority: task.priority,
      startDate: task.dueDate ?? undefined,
      canManage: false,
      task,
      onPress: onTaskPress ? () => onTaskPress(task) : undefined,
      onLongPress: onTaskLongPress ? () => onTaskLongPress(task) : undefined,
    };
  });

  return [...holidayRows, ...eventRows, ...taskRows].sort((a, b) =>
    compareAgendaOrder(
      {
        kind: a.kind,
        allDay: a.allDay,
        startMs: a.startDate ? new Date(a.startDate).getTime() : 0,
        title: a.title,
      },
      {
        kind: b.kind,
        allDay: b.allDay,
        startMs: b.startDate ? new Date(b.startDate).getTime() : 0,
        title: b.title,
      },
    ),
  );
}

export function EventsSection({
  dayEvents,
  dayHolidays,
  dayTasks = [],
  members = [],
  selectedDayIso,
  variant = "carousel",
  plainDayRows: _plainDayRows = false,
  embedded = false,
  fillRemaining = false,
  scrollEnabled = true,
  listPaddingBottom = 4,
  emptyStateBottomInset = 0,
  refreshControl,
  footer,
  canManageEvent,
  onEventLongPress,
  onEventPress,
  onTaskPress,
  onTaskLongPress,
  onToggleTask,
  onAddEvent,
}: Props) {
  const [, setJoinTick] = useState(0);
  const nowMs = Date.now();
  const dayListRef = useRef<ScrollView>(null);
  const rowOffsets = useRef<Record<string, number>>({});
  const scrolledDay = useRef<string | null>(null);
  const [listContentHeight, setListContentHeight] = useState(0);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [listScrollOffset, setListScrollOffset] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setJoinTick((tick) => tick + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = buildEventRows(
    dayHolidays,
    dayEvents,
    variant === "dayList" ? dayTasks : [],
    members,
    onEventLongPress,
    onEventPress,
    canManageEvent,
    onTaskPress,
    onTaskLongPress,
  );
  const eventCount = dayHolidays.length + dayEvents.length;
  const taskCount = variant === "dayList" ? dayTasks.length : 0;
  const estimatedListContentHeight = rows.length * 44 + listPaddingBottom;
  const effectiveListContentHeight = Math.max(
    listContentHeight,
    estimatedListContentHeight,
  );
  const showDayListScrollHint =
    variant === "dayList" &&
    listViewportHeight > 0 &&
    effectiveListContentHeight > listViewportHeight + 8 &&
    listScrollOffset < effectiveListContentHeight - listViewportHeight - 8;

  const viewingToday =
    variant === "dayList" &&
    scrollEnabled &&
    selectedDayIso != null &&
    selectedDayIso === toLocalIso(new Date());

  const scrollDayToNow = (allowEnd = false) => {
    if (!viewingToday || !selectedDayIso || !dayListRef.current) return;
    if (scrolledDay.current === selectedDayIso) return;
    const anchor = rows.find((row) => rowStillAhead(row, Date.now()));
    if (!anchor) {
      if (!allowEnd || rows.length === 0) return;
      dayListRef.current.scrollToEnd({ animated: false });
      scrolledDay.current = selectedDayIso;
      return;
    }
    const y = rowOffsets.current[anchor.key];
    if (y == null) return;
    dayListRef.current.scrollTo({ y: Math.max(0, y), animated: false });
    scrolledDay.current = selectedDayIso;
    setListScrollOffset(y);
  };

  useEffect(() => {
    scrolledDay.current = null;
    setListScrollOffset(0);
  }, [selectedDayIso]);

  useEffect(() => {
    if (!viewingToday) {
      if (variant === "dayList" && selectedDayIso) {
        dayListRef.current?.scrollTo({ y: 0, animated: false });
      }
      return;
    }
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) scrollDayToNow(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [selectedDayIso, variant, viewingToday, rows.length]);

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
        ? "0 events"
        : `${totalItems} event${totalItems === 1 ? "" : "s"}`;

    return (
      <View
        style={{
          marginHorizontal: embedded ? 0 : SECTION_HORIZONTAL_PADDING,
          marginTop: embedded ? 0 : WS.sectionGap,
          marginBottom: 0,
          flex: fillRemaining ? 1 : undefined,
          minHeight: fillRemaining ? 0 : undefined,
        }}
      >
        {embedded ? null : (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
              flexShrink: 0,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: colors.textPrimary,
                flex: 1,
                paddingRight: 8,
              }}
              numberOfLines={1}
            >
              {dayLabel}
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: colors.textPrimary,
              }}
            >
              {countLabel}
            </Text>
          </View>
        )}

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
          <View style={{ flex: fillRemaining ? 1 : undefined, minHeight: 0 }}>
            <ScrollView
              ref={dayListRef}
              style={{ flex: fillRemaining ? 1 : undefined }}
              scrollEnabled={scrollEnabled}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              refreshControl={refreshControl}
              onContentSizeChange={(_width, height) =>
                setListContentHeight(height)
              }
              onLayout={(event) =>
                setListViewportHeight(event.nativeEvent.layout.height)
              }
              onScroll={(event) =>
                setListScrollOffset(event.nativeEvent.contentOffset.y)
              }
              scrollEventThrottle={16}
              contentContainerStyle={{
                paddingBottom: listPaddingBottom,
                gap: CARD_GAP,
                flexGrow: fillRemaining ? 1 : undefined,
              }}
            >
              {rows.map((row, index) => (
                <View
                  key={row.key}
                  onLayout={(event) => {
                    rowOffsets.current[row.key] = event.nativeEvent.layout.y;
                    scrollDayToNow();
                  }}
                >
                  <DayListEventCard
                    row={row}
                    nowMs={nowMs}
                    onToggleTask={onToggleTask}
                    isFirst={index === 0}
                    isLast={index === rows.length - 1}
                  />
                </View>
              ))}
            </ScrollView>
            {showDayListScrollHint ? (
              <Pressable
                onPress={() =>
                  dayListRef.current?.scrollTo({
                    y: Math.min(
                      listScrollOffset + 72,
                      Math.max(
                        0,
                        effectiveListContentHeight - listViewportHeight,
                      ),
                    ),
                    animated: true,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Scroll to more calendar items"
                style={{
                  position: "absolute",
                  left: "50%",
                  marginLeft: -17,
                  bottom: 8,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: "#E2E6EF",
                  shadowColor: "#1E1B4B",
                  shadowOpacity: 0.16,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                  zIndex: 20,
                }}
                testID="calendar-items-scroll-hint"
              >
                <ArrowDown size={16} color="#684BFF" strokeWidth={2.5} />
              </Pressable>
            ) : null}
          </View>
        )}
        {footer}
      </View>
    );
  }

  return (
    <View
      style={{ marginHorizontal: SECTION_HORIZONTAL_PADDING, marginTop: 4 }}
    >
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
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>
            No events for this day
          </Text>
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
              overdue={row.kind === "task" && row.overdue}
              width={220}
              onLongPress={row.onLongPress}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  checkboxOn: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  itemTypeIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  detail: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
    color: colors.textSecondary,
  },
  overdue: {
    color: "#9F1239",
    fontWeight: "600",
  },
  joinActiveLine: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#16A34A",
  },
  joinSoonLine: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#6d28d9",
  },
});
