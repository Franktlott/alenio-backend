import { View, Text, TouchableOpacity } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import type { CalendarEvent, Task } from "@/lib/types";
import type { USFederalHoliday } from "@/lib/us-federal-holidays";
import { isSameDay, startOfDay, toLocalIso } from "./workspace-utils";
import { WS } from "./workspace-ui";
import { colors, radii, space, surfaces } from "@/theme";
import { CalendarIconKey } from "./CalendarIconKey";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Compact month grid — soft surface, brand selected circle, simple day dots */
const DAY_CELL_HEIGHT = 34;
const DAY_CIRCLE_SIZE = 28;
const WEEK_ROW_HEIGHT = DAY_CELL_HEIGHT + 4;
const DOT_SIZE = 5;

type Props = {
  tasks: Task[];
  events: CalendarEvent[];
  holidays: USFederalHoliday[];
  selectedDay: string | null;
  onSelectDay: (iso: string | null) => void;
  viewYear: number;
  viewMonth: number;
  onViewMonthChange: (year: number, month: number) => void;
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
}: Props) {
  const today = new Date();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  const taskDays = new Set(
    tasks.filter((t) => t.dueDate && t.status !== "done").map((t) => toLocalIso(new Date(t.dueDate!))),
  );
  const eventDays = new Set<string>();
  for (const ev of events) {
    const evStart = startOfDay(new Date(ev.startDate));
    const evEnd = ev.endDate ? startOfDay(new Date(ev.endDate)) : evStart;
    const cur = new Date(evStart);
    while (cur <= evEnd) {
      eventDays.add(toLocalIso(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  const holidayDays = new Set(holidays.map((h) => toLocalIso(h.date)));

  const allCells: Date[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    allCells.push(new Date(viewYear, viewMonth - 1, prevMonthDays - i));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    allCells.push(new Date(viewYear, viewMonth, d));
  }
  while (allCells.length % 7 !== 0) {
    const last = allCells[allCells.length - 1]!;
    allCells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  const weeks: Date[][] = [];
  for (let i = 0; i < allCells.length; i += 7) weeks.push(allCells.slice(i, i + 7));

  const goToToday = () => {
    onViewMonthChange(today.getFullYear(), today.getMonth());
    onSelectDay(toLocalIso(today));
  };
  const showTodayButton =
    viewYear !== today.getFullYear() ||
    viewMonth !== today.getMonth() ||
    selectedDay !== toLocalIso(today);

  return (
    <View
      style={{
        ...surfaces.groupedCard,
        marginHorizontal: WS.pageGutter,
        marginTop: 2,
        marginBottom: 0,
        paddingHorizontal: space.md,
        paddingTop: space.sm,
        paddingBottom: space.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm, minHeight: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.2 }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <CalendarIconKey iconSize={12} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <TouchableOpacity
            onPress={() => (viewMonth === 0 ? onViewMonthChange(viewYear - 1, 11) : onViewMonthChange(viewYear, viewMonth - 1))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={navBtn}
            testID="workspace-calendar-prev-month"
          >
            <ChevronLeft size={14} color={colors.textSecondary} />
          </TouchableOpacity>
          {showTodayButton ? (
            <TouchableOpacity
              onPress={goToToday}
              hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
              style={{
                height: 28,
                paddingHorizontal: 10,
                borderRadius: radii.full,
                backgroundColor: colors.surfaceSecondary,
                alignItems: "center",
                justifyContent: "center",
              }}
              testID="workspace-calendar-today-button"
            >
              <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: "700" }}>Today</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => (viewMonth === 11 ? onViewMonthChange(viewYear + 1, 0) : onViewMonthChange(viewYear, viewMonth + 1))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={navBtn}
            testID="workspace-calendar-next-month"
          >
            <ChevronRight size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", color: colors.textMuted }}>
            {d}
          </Text>
        ))}
      </View>

      <View>
        {weeks.map((week, weekIdx) => (
          <View key={weekIdx} style={{ height: WEEK_ROW_HEIGHT, flexDirection: "row" }}>
            {week.map((day, colIdx) => {
              const iso = toLocalIso(day);
              const inMonth = day.getMonth() === viewMonth;
              const isToday = isSameDay(day, today);
              const isSelected = selectedDay === iso;
              const hasEvent = inMonth && eventDays.has(iso);
              const hasTask = inMonth && taskDays.has(iso);
              const isHoliday = inMonth && holidayDays.has(iso);
              const showDot = hasEvent || hasTask || isHoliday;
              const dotColor = isHoliday
                ? colors.error
                : hasEvent
                  ? colors.brand
                  : colors.warning;

              return (
                <TouchableOpacity
                  key={`${iso}-${colIdx}`}
                  onPress={() => {
                    if (!inMonth) {
                      onViewMonthChange(day.getFullYear(), day.getMonth());
                    }
                    onSelectDay(isSelected ? null : iso);
                  }}
                  style={{ flex: 1, height: WEEK_ROW_HEIGHT, alignItems: "center", justifyContent: "center" }}
                >
                  <View
                    style={{
                      width: DAY_CIRCLE_SIZE,
                      height: DAY_CIRCLE_SIZE,
                      borderRadius: DAY_CIRCLE_SIZE / 2,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? colors.brand : isToday ? colors.brandSoft : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isToday || isSelected ? "700" : "500",
                        color: isSelected
                          ? "#FFFFFF"
                          : !inMonth
                            ? colors.divider
                            : isToday
                              ? colors.brand
                              : colors.textPrimary,
                      }}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                  <View style={{ height: 8, alignItems: "center", justifyContent: "flex-start", marginTop: 1 }}>
                    {showDot && !isSelected ? (
                      <View
                        style={{
                          width: DOT_SIZE,
                          height: DOT_SIZE,
                          borderRadius: DOT_SIZE / 2,
                          backgroundColor: dotColor,
                        }}
                      />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const navBtn = {
  width: 28,
  height: 28,
  borderRadius: radii.full,
  backgroundColor: colors.surfaceSecondary,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
