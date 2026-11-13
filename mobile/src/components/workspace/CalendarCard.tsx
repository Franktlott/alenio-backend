import { useState } from "react";
import type { ReactNode } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react-native";
import type { CalendarEvent, Task, TeamMember } from "@/lib/types";
import type { USFederalHoliday } from "@/lib/us-federal-holidays";
import { eventCalendarDayRange } from "@/lib/calendar-grid";
import { isSameDay, startOfWeekSunday, toLocalIso } from "./workspace-utils";
import { WS } from "./workspace-ui";
import { colors, elevation, radii, space, surfaces } from "@/theme";
import {
  CALENDAR_EVENT_COLORS,
  calendarEventSoftBackground,
  resolveCalendarEventColor,
} from "@/lib/calendar-event-colors";
import {
  datedItemLocalIso,
  holidayLocalIso,
  sundayMonthWeeks,
} from "@/lib/calendar-month-view";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEK_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DAY_NUMBER_SIZE = 24;
const ACTIVITY_DOT_SIZE = 4;
const ACTIVITY_SLOT = 8;
const WEEK_ROW_HEIGHT = 46;

/** Titled chips need this much room per row before dots are the better call. */
const CHIP_HEIGHT = 15;
const CHIP_GAP = 2;
const ROW_HEIGHT_FOR_ONE_CHIP = 52;
const ROW_HEIGHT_FOR_TWO_CHIPS = 74;
const ROW_HEIGHT_FOR_TWO_CHIPS_AND_MORE = 91;
/**
 * A phone month cell lands around 46–52pt. That still fits a short title
 * ("Standup", "1:1") the way the wider Duo and iPad cells do. Narrower than
 * this the chip collapses to a couple of letters, so the dot stays.
 */
const CELL_WIDTH_FOR_CHIPS = 44;

export type CalendarDisplayMode = "month" | "week";

type Props = {
  tasks: Task[];
  events: CalendarEvent[];
  members?: TeamMember[];
  holidays: USFederalHoliday[];
  selectedDay: string | null;
  onSelectDay: (iso: string | null) => void;
  viewYear: number;
  viewMonth: number;
  onViewMonthChange: (year: number, month: number) => void;
  onEventPress?: (event: CalendarEvent) => void;
  onTaskPress?: (task: Task) => void;
  onDisplayModeChange?: (mode: CalendarDisplayMode) => void;
  /**
   * Hands the mode to the parent, which is the only place that knows whether
   * the page has the height for a month grid and a day list at once. Left
   * unset, the card keeps its own mode.
   */
  displayMode?: CalendarDisplayMode;
  splitFooter?: boolean;
  /**
   * Let the month grid grow into the space it is given instead of holding
   * 46pt rows. Tall rows show event titles rather than activity dots.
   */
  expanded?: boolean;
  /** Overrides the page gutter when a parent already positions the card. */
  insetHorizontal?: number;
  /** Opens the create flow for events, tasks, and related items. */
  onAddPress?: () => void;
  children?: ReactNode;
};

export function CalendarCard({
  tasks,
  events,
  holidays,
  selectedDay,
  onSelectDay,
  viewYear,
  viewMonth,
  onViewMonthChange,
  onDisplayModeChange,
  displayMode: controlledDisplayMode,
  splitFooter = false,
  expanded = false,
  insetHorizontal,
  onAddPress,
  children,
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  /**
   * Measured rather than assumed: how many titled chips fit depends on the
   * height the parent hands us, which changes with pose and device.
   */
  const [grid, setGrid] = useState({ width: 0, height: 0 });
  const gridLine = isDark ? "rgba(148, 163, 184, 0.28)" : colors.borderStrong;
  const mutedDate = isDark ? "#94A3B8" : colors.textMuted;
  /**
   * Without the month title in the card, the toolbar is mode + New + arrows.
   * Tighten only on very narrow panes so chips and buttons stay one row.
   */
  const [headerWidth, setHeaderWidth] = useState(0);
  const compactHeader = headerWidth > 0 && headerWidth < 280;
  const [ownDisplayMode, setOwnDisplayMode] =
    useState<CalendarDisplayMode>("month");
  const displayMode = controlledDisplayMode ?? ownDisplayMode;
  const selectDisplayMode = (mode: CalendarDisplayMode) => {
    if (controlledDisplayMode == null) setOwnDisplayMode(mode);
    onDisplayModeChange?.(mode);
  };
  const today = new Date();
  const weeks = sundayMonthWeeks(viewYear, viewMonth);

  const taskDays = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const iso = datedItemLocalIso(task.dueDate);
    taskDays.set(iso, [...(taskDays.get(iso) ?? []), task]);
  }

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const { start: evStart, end: evEnd } = eventCalendarDayRange(ev);
    const cur = new Date(evStart);
    while (cur <= evEnd) {
      const iso = toLocalIso(cur);
      eventsByDay.set(iso, [...(eventsByDay.get(iso) ?? []), ev]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const holidaysByDay = new Map<string, USFederalHoliday[]>();
  for (const holiday of holidays) {
    const iso = holidayLocalIso(holiday.date);
    holidaysByDay.set(iso, [...(holidaysByDay.get(iso) ?? []), holiday]);
  }

  const focusDay = selectedDay ? new Date(`${selectedDay}T00:00:00`) : today;
  const weekStart = startOfWeekSunday(focusDay);
  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push(
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + i,
      ),
    );
  }
  const weekEnd = weekDays[6]!;
  const weekRangeLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${SHORT_MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
      : `${SHORT_MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} – ${SHORT_MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

  const moveCalendar = (direction: -1 | 1) => {
    if (displayMode === "week") {
      const next = new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + direction * 7,
      );
      if (next.getFullYear() !== viewYear || next.getMonth() !== viewMonth) {
        onViewMonthChange(next.getFullYear(), next.getMonth());
      }
      onSelectDay(toLocalIso(next));
      return;
    }
    const next = new Date(viewYear, viewMonth + direction, 1);
    onViewMonthChange(next.getFullYear(), next.getMonth());
  };
  const swipeResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => {
      const horizontalDistance = Math.abs(gesture.dx);
      const verticalDistance = Math.abs(gesture.dy);
      return (
        horizontalDistance > 16 && horizontalDistance > verticalDistance * 1.35
      );
    },
    onPanResponderRelease: (_event, gesture) => {
      const horizontalSwipe =
        Math.abs(gesture.dx) > 44 || Math.abs(gesture.vx) > 0.35;
      if (!horizontalSwipe) return;
      moveCalendar(gesture.dx < 0 ? 1 : -1);
    },
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => false,
  });

  const measuredRowHeight =
    expanded && grid.height > 0 && weeks.length > 0
      ? grid.height / weeks.length
      : WEEK_ROW_HEIGHT;
  /**
   * Expanded rows take an explicit slice of the measured grid instead of an
   * even `flex`, which a row can win extra height from by holding taller
   * content — a month whose first week is twice the others reads as a mistake.
   * The leftover pixels go to the earliest rows so the grid still ends flush.
   */
  const expandedRowHeight = (weekIdx: number): number | undefined => {
    if (!expanded || weeks.length === 0) return undefined;
    /** Before the first measurement, the same rows a plain month card has. */
    if (grid.height <= 0) return WEEK_ROW_HEIGHT;
    const base = Math.floor(grid.height / weeks.length);
    const spare = Math.round(grid.height) - base * weeks.length;
    return weekIdx < spare ? base + 1 : base;
  };
  const cellWidth = grid.width > 0 ? grid.width / 7 : 0;
  const chipsPerCell =
    !expanded || cellWidth < CELL_WIDTH_FOR_CHIPS
      ? 0
      : measuredRowHeight >= ROW_HEIGHT_FOR_TWO_CHIPS_AND_MORE
        ? 3
        : measuredRowHeight >= ROW_HEIGHT_FOR_TWO_CHIPS
          ? 2
          : measuredRowHeight >= ROW_HEIGHT_FOR_ONE_CHIP
            ? 1
            : 0;

  /** Holidays, events, then due tasks — the order people scan a day in. */
  const cellChips = (iso: string) => {
    const dayHolidays = holidaysByDay.get(iso) ?? [];
    const dayEvents = eventsByDay.get(iso) ?? [];
    const dayTasks = taskDays.get(iso) ?? [];
    const chips: { key: string; label: string; tint: string; ink: string }[] =
      [];
    for (const [index, holiday] of dayHolidays.entries()) {
      chips.push({
        key: `holiday-${iso}-${index}`,
        label: holiday.name,
        tint: "#FEE2E2",
        ink: CALENDAR_EVENT_COLORS.holiday,
      });
    }
    for (const ev of dayEvents) {
      chips.push({
        key: `event-${ev.id}`,
        label: ev.title,
        tint: calendarEventSoftBackground(ev),
        ink: resolveCalendarEventColor(ev),
      });
    }
    for (const task of dayTasks) {
      chips.push({
        key: `task-${task.id}`,
        label: task.title,
        tint: "#E7F6EE",
        ink: CALENDAR_EVENT_COLORS.task,
      });
    }
    return chips;
  };

  const renderWeekRow = (week: Date[], weekIdx: number, last: boolean) => {
    const rowHeight = expandedRowHeight(weekIdx);
    return (
      <View
        key={weekIdx}
        style={[
          styles.weekRow,
          expanded ? styles.weekRowExpanded : null,
          rowHeight === undefined ? null : { height: rowHeight },
          last ? styles.weekRowLast : null,
          { borderBottomColor: gridLine },
        ]}
      >
        {week.map((day, colIdx) => {
          const iso = toLocalIso(day);
          const inMonth = day.getMonth() === viewMonth;
          const isToday = isSameDay(day, today);
          const isSelected = selectedDay === iso;
          const showTodayRing = isToday && !isSelected;
          const hasHoliday = (holidaysByDay.get(iso)?.length ?? 0) > 0;
          const hasActivity =
            (eventsByDay.get(iso)?.length ?? 0) > 0 ||
            (taskDays.get(iso)?.length ?? 0) > 0;
          const weekday = WEEK_DAY_NAMES[day.getDay()];
          const monthName = MONTH_NAMES[day.getMonth()];
          const chips = cellChips(iso);
          /** At most two titled labels per day; anything past that is the +N chip. */
          const visibleChipCount = Math.min(
            chips.length,
            Math.min(2, chipsPerCell),
          );
          const hasOverflow = chips.length > visibleChipCount;
          const hiddenChipCount = chips.length - visibleChipCount;
          /** Narrow cells carry dots instead of truncated titles: one per
           * kind present, in the day's own colors, capped at three. */
          const dots: string[] = [];
          if (hasHoliday) dots.push(CALENDAR_EVENT_COLORS.holiday);
          for (const ev of eventsByDay.get(iso) ?? []) {
            if (dots.length >= 3) break;
            const color = resolveCalendarEventColor(ev);
            if (!dots.includes(color)) dots.push(color);
          }
          if (
            dots.length < 3 &&
            (taskDays.get(iso)?.length ?? 0) > 0 &&
            !dots.includes(CALENDAR_EVENT_COLORS.task)
          ) {
            dots.push(CALENDAR_EVENT_COLORS.task);
          }

          return (
            <Pressable
              key={`${iso}-${colIdx}`}
              onPress={() => {
                if (!inMonth) {
                  onViewMonthChange(day.getFullYear(), day.getMonth());
                }
                onSelectDay(iso);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${weekday}, ${monthName} ${day.getDate()}${
                hasHoliday ? ", holiday" : ""
              }${hasActivity ? ", has items" : ""}${isToday ? ", today" : ""}`}
              style={[
                styles.dayCell,
                expanded ? styles.dayCellExpanded : null,
                colIdx === 6 ? styles.dayCellLast : null,
                { borderRightColor: gridLine },
              ]}
            >
              <View
                style={[
                  styles.dayNumber,
                  expanded ? styles.dayNumberExpanded : null,
                  showTodayRing ? styles.dayToday : null,
                  isSelected ? styles.daySelected : null,
                ]}
              >
                <Text
                  maxFontSizeMultiplier={1.35}
                  style={[
                    styles.dayNumberText,
                    !inMonth ? { color: mutedDate } : null,
                    showTodayRing ? styles.dayTodayText : null,
                    isSelected ? styles.daySelectedText : null,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </View>
              {chipsPerCell > 0 ? (
                <View style={styles.chipStack}>
                  {chips.slice(0, visibleChipCount).map((chip) => (
                    <View
                      key={chip.key}
                      style={[styles.chip, { backgroundColor: chip.tint }]}
                    >
                      <Text
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                        style={[styles.chipText, { color: chip.ink }]}
                      >
                        {chip.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.dotSlot}>
                  {dots.map((color, dotIndex) => (
                    <View
                      key={`${iso}-dot-${dotIndex}`}
                      style={[styles.activityDot, { backgroundColor: color }]}
                    />
                  ))}
                </View>
              )}
              {chipsPerCell > 0 && hasOverflow ? (
                <View style={styles.overflowChip}>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                    style={styles.moreChipText}
                  >
                    +{hiddenChipCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  };

  const periodLabel =
    displayMode === "week"
      ? weekRangeLabel
      : `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  return (
    <View
      {...swipeResponder.panHandlers}
      style={{
        flex: displayMode === "week" || expanded ? 1 : 0,
        flexGrow: displayMode === "week" || expanded ? 1 : 0,
        flexShrink: displayMode === "week" || expanded ? 1 : 0,
        minHeight: displayMode === "week" || expanded ? 0 : undefined,
        marginHorizontal: insetHorizontal ?? WS.pageGutter,
        marginTop: 2,
        marginBottom: 0,
      }}
    >
      <Text
        style={styles.periodTitle}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        maxFontSizeMultiplier={1.35}
        testID="workspace-calendar-period-label"
      >
        {periodLabel}
      </Text>

      <View
        style={{
          ...surfaces.groupedCard,
          ...elevation.card,
          borderRadius: 18,
          // The grid sits inside the padding, so nothing needs clipping, and
          // clipping would drop the card shadow on iOS.
          overflow: "visible",
          flex: displayMode === "week" || expanded ? 1 : 0,
          flexGrow: displayMode === "week" || expanded ? 1 : 0,
          flexShrink: displayMode === "week" || expanded ? 1 : 0,
          minHeight: displayMode === "week" || expanded ? 0 : undefined,
          paddingHorizontal: space.md,
          paddingTop: space.sm,
          paddingBottom: splitFooter ? 4 : space.sm,
          borderBottomLeftRadius: splitFooter ? 0 : undefined,
          borderBottomRightRadius: splitFooter ? 0 : undefined,
        }}
      >
      <View
        style={styles.header}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setHeaderWidth((current) => (current === next ? current : next));
        }}
      >
        <View style={styles.modeSwitch} testID="workspace-calendar-mode-switch">
          {(["month", "week"] as CalendarDisplayMode[]).map((mode) => {
            const selected = displayMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => selectDisplayMode(mode)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${mode} view`}
                style={[
                  styles.modeChip,
                  compactHeader && styles.modeChipCompact,
                  selected ? styles.modeChipOn : null,
                ]}
                testID={`workspace-calendar-mode-${mode}`}
              >
                <Text
                  style={[
                    styles.modeChipLabel,
                    compactHeader && styles.modeChipLabelCompact,
                    selected ? styles.modeChipLabelOn : null,
                  ]}
                  maxFontSizeMultiplier={1.2}
                >
                  {mode === "month" ? "Month" : "Week"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.headerSpacer} />

        <View style={styles.navRow}>
          {onAddPress ? (
            <TouchableOpacity
              onPress={onAddPress}
              activeOpacity={0.82}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[
                styles.addBtn,
                compactHeader && styles.addBtnCompact,
              ]}
              accessibilityRole="button"
              accessibilityLabel="New"
              testID="workspace-calendar-add"
            >
              <Plus size={compactHeader ? 14 : 15} color="#FFFFFF" strokeWidth={2.6} />
              {compactHeader ? null : (
                <Text style={styles.addBtnLabel} maxFontSizeMultiplier={1.2}>
                  New
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => moveCalendar(-1)}
            activeOpacity={0.82}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.navBtn, compactHeader && styles.navBtnCompact]}
            accessibilityLabel={
              displayMode === "week" ? "Previous week" : "Previous month"
            }
            testID="workspace-calendar-prev-month"
          >
            <ChevronLeft
              size={16}
              color={colors.textPrimary}
              strokeWidth={2.2}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => moveCalendar(1)}
            activeOpacity={0.82}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.navBtn, compactHeader && styles.navBtnCompact]}
            accessibilityLabel={
              displayMode === "week" ? "Next week" : "Next month"
            }
            testID="workspace-calendar-next-month"
          >
            <ChevronRight
              size={16}
              color={colors.textPrimary}
              strokeWidth={2.2}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.weekdayRow}>
        {DAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekday} maxFontSizeMultiplier={1.2}>
            {label}
          </Text>
        ))}
      </View>

      <View
        style={[
          styles.grid,
          expanded && displayMode === "month" ? styles.gridExpanded : null,
          { borderColor: gridLine },
        ]}
        onLayout={
          expanded
            ? (event) => {
                const { width: w, height: h } = event.nativeEvent.layout;
                setGrid((current) =>
                  current.width === w && current.height === h
                    ? current
                    : { width: w, height: h },
                );
              }
            : undefined
        }
        testID={
          displayMode === "week"
            ? "workspace-calendar-week-view"
            : "workspace-calendar-month-grid"
        }
      >
        {displayMode === "week"
          ? renderWeekRow(weekDays, 0, true)
          : weeks.map((week, weekIdx) =>
              renderWeekRow(week, weekIdx, weekIdx === weeks.length - 1),
            )}
      </View>
      {displayMode === "week" ? (
        <View style={{ flex: 1, minHeight: 0, marginTop: 8 }}>{children}</View>
      ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  periodTitle: {
    marginBottom: 8,
    paddingHorizontal: 2,
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  /** One line always: the controls give up size before they give up the row. */
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  headerSpacer: {
    flex: 1,
    minWidth: 8,
  },
  modeSwitch: {
    flexDirection: "row",
    flexShrink: 0,
    padding: 2,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
  },
  modeChip: {
    paddingHorizontal: 10,
    minHeight: 28,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  modeChipCompact: {
    paddingHorizontal: 8,
    minHeight: 26,
  },
  modeChipOn: {
    backgroundColor: colors.brand,
  },
  modeChipLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  modeChipLabelCompact: {
    fontSize: 11,
  },
  modeChipLabelOn: {
    color: "#FFFFFF",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
  },
  addBtnCompact: {
    width: 30,
    height: 30,
    minHeight: 30,
    paddingHorizontal: 0,
  },
  addBtnLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Still past Apple's 44pt target via hitSlop, which the row keeps. */
  navBtnCompact: {
    width: 30,
    height: 30,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 0,
    paddingBottom: 2,
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  grid: {
    flexGrow: 0,
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  gridExpanded: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  weekRow: {
    height: WEEK_ROW_HEIGHT,
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /** Height comes from the measured slice, so the row neither grows nor shrinks. */
  weekRowExpanded: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
  },
  weekRowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayCell: {
    flex: 1,
    minWidth: 0,
    height: WEEK_ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    backgroundColor: "transparent",
  },
  dayCellExpanded: {
    height: "100%",
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingTop: 3,
    paddingHorizontal: 3,
    /** A day with more chips than fit clips rather than pushing its row taller. */
    overflow: "hidden",
  },
  dayCellLast: {
    borderRightWidth: 0,
  },
  chipStack: {
    marginTop: 2,
    gap: CHIP_GAP,
  },
  chip: {
    height: CHIP_HEIGHT,
    borderRadius: 4,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  chipText: {
    flex: 1,
    minWidth: 0,
    fontSize: 9.5,
    fontWeight: "600",
  },
  overflowChip: {
    position: "absolute",
    left: "50%",
    bottom: 4,
    width: 28,
    height: 16,
    transform: [{ translateX: -14 }],
    borderRadius: 8,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F4F8",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D9E0EA",
  },
  moreChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#5F6F85",
    letterSpacing: 0.1,
  },
  dayNumber: {
    width: DAY_NUMBER_SIZE,
    height: DAY_NUMBER_SIZE,
    borderRadius: DAY_NUMBER_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  dayNumberExpanded: {
    alignSelf: "flex-start",
  },
  dayToday: {
    borderColor: colors.brand,
  },
  daySelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  dayNumberText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  dayTodayText: {
    color: colors.brand,
    fontWeight: "700",
  },
  daySelectedText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  dotSlot: {
    height: ACTIVITY_SLOT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  activityDot: {
    width: ACTIVITY_DOT_SIZE,
    height: ACTIVITY_DOT_SIZE,
    borderRadius: ACTIVITY_DOT_SIZE / 2,
    backgroundColor: colors.brand,
  },
});
