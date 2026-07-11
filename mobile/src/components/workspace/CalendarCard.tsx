import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ChevronLeft, ChevronRight, Video } from "lucide-react-native";
import type { CalendarEvent, Task } from "@/lib/types";
import type { USFederalHoliday } from "@/lib/us-federal-holidays";
import { isSameDay, startOfDay, toLocalIso } from "./workspace-utils";
import { WS } from "./workspace-ui";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Compact Workspace calendar — keep card short so agenda fits on screen */
const DAY_CELL_HEIGHT = 20;
const DAY_CIRCLE_SIZE = 20;
const EVENT_SLOT_HEIGHT = 13;
const EVENT_PILL_HEIGHT = 11;
const WEEK_ROW_HEIGHT = DAY_CELL_HEIGHT + EVENT_SLOT_HEIGHT + 1;

type WeekBar = { id: string; title: string; color: string; startCol: number; endCol: number; isVideoMeeting?: boolean };

function softTint(hex: string, alpha = "26"): string {
  const clean = hex.replace("#", "");
  if (clean.length === 6) return `#${clean}${alpha}`;
  return hex;
}

function computeWeekBars(week: (Date | null)[], events: CalendarEvent[]): WeekBar[][] {
  const bars: WeekBar[] = [];
  for (const event of events) {
    const evStart = startOfDay(new Date(event.startDate));
    const evEnd = event.endDate ? startOfDay(new Date(event.endDate)) : evStart;
    let startCol = -1;
    let endCol = -1;
    for (let i = 0; i < week.length; i++) {
      const day = week[i];
      if (!day) continue;
      const d = startOfDay(day);
      if (d >= evStart && d <= evEnd) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    }
    if (startCol === -1) continue;
    bars.push({
      id: event.id,
      title: event.title,
      color: event.color,
      startCol,
      endCol,
      isVideoMeeting: event.isVideoMeeting,
    });
  }
  bars.sort((a, b) => b.endCol - b.startCol - (a.endCol - a.startCol) || a.startCol - b.startCol);
  const tracks: WeekBar[][] = [];
  for (const bar of bars) {
    let placed = false;
    for (const track of tracks) {
      if (!track.some((b) => b.startCol <= bar.endCol && b.endCol >= bar.startCol)) {
        track.push(bar);
        placed = true;
        break;
      }
    }
    if (!placed) tracks.push([bar]);
  }
  return tracks;
}

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
  const [weekRowWidth, setWeekRowWidth] = useState(0);
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  const taskDays = new Set(
    tasks.filter((t) => t.dueDate && t.status !== "done").map((t) => toLocalIso(new Date(t.dueDate!))),
  );
  const dayEventMap = new Map<string, { count: number; color: string; title: string }>();
  for (const ev of events) {
    const evStart = startOfDay(new Date(ev.startDate));
    const evEnd = ev.endDate ? startOfDay(new Date(ev.endDate)) : evStart;
    const cur = new Date(evStart);
    while (cur <= evEnd) {
      const iso = toLocalIso(cur);
      const existing = dayEventMap.get(iso);
      dayEventMap.set(iso, {
        count: (existing?.count ?? 0) + 1,
        color: existing?.color ?? ev.color,
        title: existing?.title ?? ev.title,
      });
      cur.setDate(cur.getDate() + 1);
    }
  }

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
        backgroundColor: WS.surface,
        marginHorizontal: WS.pageGutter,
        marginTop: 2,
        marginBottom: 0,
        borderRadius: WS.cardRadius,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 6,
        borderWidth: 1,
        borderColor: WS.cardBorder,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, minHeight: 26 }}>
        <Text style={{ fontSize: WS.title + 2, fontWeight: WS.titleWeight, color: WS.ink, letterSpacing: -0.2 }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <TouchableOpacity
            onPress={() => (viewMonth === 0 ? onViewMonthChange(viewYear - 1, 11) : onViewMonthChange(viewYear, viewMonth - 1))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              backgroundColor: "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
            }}
            testID="workspace-calendar-prev-month"
          >
            <ChevronLeft size={14} color="#475569" />
          </TouchableOpacity>
          {showTodayButton ? (
            <TouchableOpacity
              onPress={goToToday}
              hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
              style={{
                height: 26,
                paddingHorizontal: 9,
                borderRadius: 7,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center",
              }}
              testID="workspace-calendar-today-button"
            >
              <Text style={{ color: "#0F172A", fontSize: 11, fontWeight: "700" }}>Today</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => (viewMonth === 11 ? onViewMonthChange(viewYear + 1, 0) : onViewMonthChange(viewYear, viewMonth + 1))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              backgroundColor: "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
            }}
            testID="workspace-calendar-next-month"
          >
            <ChevronRight size={14} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: "row", marginBottom: 2 }}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: "600", color: "#94A3B8" }}>
            {d}
          </Text>
        ))}
      </View>

      <View style={{ height: WEEK_ROW_HEIGHT * weeks.length }}>
        {weeks.map((week, weekIdx) => {
          const tracks = computeWeekBars(week, events);
          return (
            <View key={weekIdx} style={{ height: WEEK_ROW_HEIGHT }}>
              <View style={{ flexDirection: "row" }}>
                {week.map((day, colIdx) => {
                  const iso = toLocalIso(day);
                  const inMonth = day.getMonth() === viewMonth;
                  const isToday = isSameDay(day, today);
                  const isSelected = selectedDay === iso;
                  const hasTasks = taskDays.has(iso);
                  const isHoliday = holidays.some((h) => isSameDay(h.date, day));
                  return (
                    <TouchableOpacity
                      key={`${iso}-${colIdx}`}
                      onPress={() => {
                        if (!inMonth) {
                          onViewMonthChange(day.getFullYear(), day.getMonth());
                        }
                        onSelectDay(isSelected ? null : iso);
                      }}
                      style={{ flex: 1, height: DAY_CELL_HEIGHT, alignItems: "center", justifyContent: "center" }}
                    >
                      <View
                        style={{
                          width: DAY_CIRCLE_SIZE,
                          height: DAY_CIRCLE_SIZE,
                          borderRadius: DAY_CIRCLE_SIZE / 2,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: isSelected ? "#4361EE" : isToday ? "#EEF2FF" : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: isToday || isSelected ? "700" : "500",
                            color: isSelected
                              ? "white"
                              : !inMonth
                                ? "#CBD5E1"
                                : isToday
                                  ? "#4361EE"
                                  : "#334155",
                          }}
                        >
                          {day.getDate()}
                        </Text>
                      </View>
                      <View style={{ position: "absolute", bottom: 1, flexDirection: "row", gap: 2, alignItems: "center" }}>
                        {hasTasks && !isSelected && inMonth ? (
                          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#4361EE" }} />
                        ) : null}
                        {isHoliday && !isSelected && inMonth ? (
                          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#EF4444" }} />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View
                onLayout={(e) => setWeekRowWidth(e.nativeEvent.layout.width)}
                style={{ height: EVENT_SLOT_HEIGHT, justifyContent: "center" }}
              >
                {tracks.length > 0 ? (
                  <View style={{ flexDirection: "row", height: EVENT_PILL_HEIGHT, position: "relative", alignItems: "center" }}>
                    {week.map((day, colIdx) => {
                      const track0 = tracks[0] ?? [];
                      const bar = track0.find((b) => b.startCol <= colIdx && b.endCol >= colIdx);
                      const iso = toLocalIso(day);
                      const evInfo = dayEventMap.get(iso);
                      if (!bar) {
                        if (evInfo && evInfo.count === 1) {
                          return (
                            <View
                              key={colIdx}
                              style={{
                                flex: 1,
                                height: EVENT_PILL_HEIGHT,
                                backgroundColor: softTint(evInfo.color),
                                borderRadius: 4,
                                marginHorizontal: 2,
                              }}
                            />
                          );
                        }
                        if (evInfo && evInfo.count > 1) {
                          return (
                            <View key={colIdx} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                              <View
                                style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: 7,
                                  backgroundColor: softTint(evInfo.color, "40"),
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Text style={{ color: evInfo.color, fontSize: 8, fontWeight: "700", lineHeight: 14 }}>
                                  {evInfo.count}
                                </Text>
                              </View>
                            </View>
                          );
                        }
                        return <View key={colIdx} style={{ flex: 1 }} />;
                      }
                      const evCount = evInfo?.count ?? 1;
                      if (evCount > 1) {
                        return (
                          <View key={colIdx} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <View
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 7,
                                backgroundColor: softTint(evInfo?.color ?? bar.color, "40"),
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Text style={{ color: evInfo?.color ?? bar.color, fontSize: 8, fontWeight: "700", lineHeight: 14 }}>
                                {evCount}
                              </Text>
                            </View>
                          </View>
                        );
                      }
                      const isStart = colIdx === bar.startCol;
                      const isEnd = colIdx === bar.endCol;
                      return (
                        <View
                          key={colIdx}
                          style={{
                            flex: 1,
                            height: EVENT_PILL_HEIGHT,
                            backgroundColor: softTint(bar.color),
                            borderTopLeftRadius: isStart ? 4 : 0,
                            borderBottomLeftRadius: isStart ? 4 : 0,
                            borderTopRightRadius: isEnd ? 4 : 0,
                            borderBottomRightRadius: isEnd ? 4 : 0,
                            marginLeft: isStart ? 2 : 0,
                            marginRight: isEnd ? 2 : 0,
                          }}
                        />
                      );
                    })}

                    {weekRowWidth > 0 &&
                      (tracks[0] ?? []).map((bar) => {
                        const colWidth = weekRowWidth / 7;
                        let effectiveEndCol = bar.startCol - 1;
                        for (let col = bar.startCol; col <= bar.endCol; col++) {
                          const d = week[col];
                          const count = d ? (dayEventMap.get(toLocalIso(d))?.count ?? 1) : 1;
                          if (count > 1) break;
                          effectiveEndCol = col;
                        }
                        if (effectiveEndCol < bar.startCol) return null;
                        const titleWidth = (effectiveEndCol - bar.startCol + 1) * colWidth - 4;
                        const showTitle = titleWidth >= 40;
                        return (
                          <View
                            key={`t-${bar.id}`}
                            pointerEvents="none"
                            style={{
                              position: "absolute",
                              left: bar.startCol * colWidth + 2,
                              width: titleWidth,
                              top: 0,
                              height: EVENT_PILL_HEIGHT,
                              justifyContent: "center",
                              overflow: "hidden",
                            }}
                          >
                            {showTitle ? (
                              <View
                                style={{
                                  height: EVENT_PILL_HEIGHT,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  paddingHorizontal: 3,
                                }}
                              >
                                {bar.isVideoMeeting ? (
                                  <Video size={8} color={bar.color} style={{ marginRight: 2 }} />
                                ) : null}
                                <Text
                                  style={{
                                    color: bar.color,
                                    fontSize: 8,
                                    fontWeight: "700",
                                    lineHeight: EVENT_PILL_HEIGHT,
                                    includeFontPadding: false,
                                    textAlignVertical: "center",
                                    flex: 1,
                                  }}
                                  numberOfLines={1}
                                  allowFontScaling={false}
                                >
                                  {bar.title}
                                </Text>
                              </View>
                            ) : bar.isVideoMeeting ? (
                              <View style={{ height: EVENT_PILL_HEIGHT, alignItems: "center", justifyContent: "center" }}>
                                <Video size={8} color={bar.color} />
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
