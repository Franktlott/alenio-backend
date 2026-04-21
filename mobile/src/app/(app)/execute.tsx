import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Image,
  ScrollView,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Switch,
  Alert,
  Dimensions,
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams, Redirect, useFocusEffect } from "expo-router";
import { Plus, User, Users, ArrowUpDown, ChevronLeft, ChevronRight, X, CalendarDays, CheckSquare, Calendar, Check, UserRound, Video, VideoOff, Clock, Lock, Globe } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { useTaskStore } from "@/lib/state/task-store";
import type { Task, Team, TeamMember, CalendarEvent } from "@/lib/types";
import { NoTeamPlaceholder } from "@/components/NoTeamPlaceholder";
import { useDemoMode, showDemoAlert } from "@/lib/useDemo";

type FilterTab = "all" | "assigned" | "completed";
type SortMode = "due" | "priority" | "completed";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type WeekBar = { id: string; title: string; color: string; startCol: number; endCol: number; isVideoMeeting?: boolean };

function computeWeekBars(week: (Date | null)[], events: CalendarEvent[]): WeekBar[][] {
  const bars: WeekBar[] = [];
  for (const event of events) {
    const evStart = startOfDay(new Date(event.startDate));
    const evEnd = event.endDate ? startOfDay(new Date(event.endDate)) : evStart;
    let startCol = -1, endCol = -1;
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
    bars.push({ id: event.id, title: event.title, color: event.color, startCol, endCol, isVideoMeeting: event.isVideoMeeting });
  }
  bars.sort((a, b) => (b.endCol - b.startCol) - (a.endCol - a.startCol) || a.startCol - b.startCol);
  const tracks: WeekBar[][] = [];
  for (const bar of bars) {
    let placed = false;
    for (const track of tracks) {
      if (!track.some((b) => b.startCol <= bar.endCol && b.endCol >= bar.startCol)) {
        track.push(bar); placed = true; break;
      }
    }
    if (!placed) tracks.push([bar]);
  }
  return tracks;
}

// Returns the date of the Nth weekday in a given month/year
// weekday: 0=Sun, 1=Mon ... 6=Sat; nth: 1-based (use -1 for last)
function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  if (nth > 0) {
    const d = new Date(year, month, 1);
    let count = 0;
    while (true) {
      if (d.getDay() === weekday) { count++; if (count === nth) return new Date(d); }
      d.setDate(d.getDate() + 1);
    }
  } else {
    // last occurrence
    const d = new Date(year, month + 1, 0);
    while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
    return new Date(d);
  }
}

interface Holiday { name: string; date: Date }

function getUSHolidays(year: number): Holiday[] {
  return [
    { name: "New Year's Day", date: new Date(year, 0, 1) },
    { name: "MLK Day", date: nthWeekday(year, 0, 1, 3) },
    { name: "Presidents' Day", date: nthWeekday(year, 1, 1, 3) },
    { name: "Memorial Day", date: nthWeekday(year, 4, 1, -1) },
    { name: "Juneteenth", date: new Date(year, 5, 19) },
    { name: "Independence Day", date: new Date(year, 6, 4) },
    { name: "Labor Day", date: nthWeekday(year, 8, 1, 1) },
    { name: "Columbus Day", date: nthWeekday(year, 9, 1, 2) },
    { name: "Veterans Day", date: new Date(year, 10, 11) },
    { name: "Thanksgiving", date: nthWeekday(year, 10, 4, 4) },
    { name: "Christmas Day", date: new Date(year, 11, 25) },
  ];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Always use local date parts — toISOString() returns UTC which shifts the date in UTC+ timezones
function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


function MiniCalendar({
  tasks,
  events,
  holidays,
  selectedDay,
  onSelectDay,
}: {
  tasks: Task[];
  events: CalendarEvent[];
  holidays: Holiday[];
  selectedDay: string | null;
  onSelectDay: (iso: string | null) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [weekRowWidth, setWeekRowWidth] = useState(0);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Build set of days that have tasks due
  const taskDays = new Set(
    tasks
      .filter((t) => t.dueDate && t.status !== "done")
      .map((t) => toLocalIso(new Date(t.dueDate!)))
  );

  // Build per-day event count map
  const dayEventMap = new Map<string, { count: number; color: string; title: string }>();
  for (const ev of events) {
    const evStart = startOfDay(new Date(ev.startDate));
    const evEnd = ev.endDate ? startOfDay(new Date(ev.endDate)) : evStart;
    const cur = new Date(evStart);
    while (cur <= evEnd) {
      const iso = toLocalIso(cur);
      const existing = dayEventMap.get(iso);
      dayEventMap.set(iso, { count: (existing?.count ?? 0) + 1, color: existing?.color ?? ev.color, title: existing?.title ?? ev.title });
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Build day cells padded into full weeks
  const allCells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];
  while (allCells.length % 7 !== 0) allCells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < allCells.length; i += 7) weeks.push(allCells.slice(i, i + 7));

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  return (
    <View style={{ backgroundColor: "white", marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
      {/* Month nav */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={18} color="#64748B" />
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronRight size={18} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={{ flexDirection: "row", marginBottom: 2 }}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", color: "#94A3B8" }}>{d}</Text>
        ))}
      </View>

      {/* Week rows */}
      {weeks.map((week, weekIdx) => {
        const tracks = computeWeekBars(week, events);
        return (
          <View key={weekIdx}>
            {/* Day numbers */}
            <View style={{ flexDirection: "row" }}>
              {week.map((day, colIdx) => {
                if (!day) return <View key={`e-${weekIdx}-${colIdx}`} style={{ flex: 1, height: 34 }} />;
                const iso = toLocalIso(day);
                const isToday = isSameDay(day, today);
                const isSelected = selectedDay === iso;
                const hasTasks = taskDays.has(iso);
                const isHoliday = holidays.some((h) => isSameDay(h.date, day));
                const evInfo = dayEventMap.get(iso);
                return (
                  <TouchableOpacity
                    key={iso}
                    onPress={() => onSelectDay(isSelected ? null : iso)}
                    style={{ flex: 1, height: 34, alignItems: "center", justifyContent: "center" }}
                  >
                    <View style={{
                      width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center",
                      backgroundColor: isSelected ? "#4361EE" : isToday ? "#EEF2FF" : "transparent",
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: isToday || isSelected ? "700" : "400", color: isSelected ? "white" : isToday ? "#4361EE" : "#334155" }}>
                        {day.getDate()}
                      </Text>
                    </View>
                    <View style={{ position: "absolute", bottom: 3, flexDirection: "row", gap: 2, alignItems: "center" }}>
                      {hasTasks && !isSelected ? <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#4361EE" }} /> : null}
                      {isHoliday && !isSelected ? <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#EF4444" }} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Event bars — title bar for 1 event, count pill for multiple */}
            {tracks.length > 0 ? (
              <View
                onLayout={(e) => setWeekRowWidth(e.nativeEvent.layout.width)}
                style={{ position: "relative", marginBottom: 3 }}
              >
                {/* Only render the first track — avoids multi-row stacking */}
                <View style={{ flexDirection: "row", height: 15, marginBottom: 2 }}>
                  {week.map((day, colIdx) => {
                    const track0 = tracks[0] ?? [];
                    const bar = track0.find((b) => b.startCol <= colIdx && b.endCol >= colIdx);
                    const iso = day ? toLocalIso(day) : null;
                    const evInfo = iso ? dayEventMap.get(iso) : null;

                    if (!bar) {
                      if (evInfo && evInfo.count === 1) {
                        // Single event not in track 0 — show a proper bar segment
                        return (
                          <View key={colIdx} style={{ flex: 1, height: 15, backgroundColor: evInfo.color, borderRadius: 4, marginHorizontal: 2 }} />
                        );
                      }
                      if (evInfo && evInfo.count > 1) {
                        // Multiple events, none in track 0 — show count circle
                        return (
                          <View key={colIdx} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <View style={{ width: 15, height: 15, borderRadius: 7.5, backgroundColor: evInfo.color, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ color: "white", fontSize: 8, fontWeight: "700", lineHeight: 15 }}>{evInfo.count}</Text>
                            </View>
                          </View>
                        );
                      }
                      return <View key={colIdx} style={{ flex: 1 }} />;
                    }

                    const evCount = evInfo?.count ?? 1;
                    if (evCount > 1) {
                      // Multi-event day: show a small filled count circle
                      return (
                        <View key={colIdx} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                          <View style={{ width: 15, height: 15, borderRadius: 7.5, backgroundColor: evInfo?.color ?? bar.color, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ color: "white", fontSize: 8, fontWeight: "700", lineHeight: 15 }}>{evCount}</Text>
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
                          flex: 1, height: 15,
                          backgroundColor: bar.color,
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
                  {weekRowWidth > 0 && (tracks[0] ?? []).map((bar) => {
                    const colWidth = weekRowWidth / 7;
                    // Clip title width to contiguous single-event columns from bar.startCol
                    let effectiveEndCol = bar.startCol - 1;
                    for (let col = bar.startCol; col <= bar.endCol; col++) {
                      const d = week[col];
                      const count = d ? (dayEventMap.get(toLocalIso(d))?.count ?? 1) : 1;
                      if (count > 1) break;
                      effectiveEndCol = col;
                    }
                    if (effectiveEndCol < bar.startCol) return null;
                    const titleWidth = (effectiveEndCol - bar.startCol + 1) * colWidth - 4;
                    return (
                      <View
                        key={`t-${bar.id}`}
                        pointerEvents="none"
                        style={{ position: "absolute", left: bar.startCol * colWidth + 2, width: titleWidth, top: 0, height: 15, justifyContent: "center", overflow: "hidden" }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 4 }}>
                          {bar.isVideoMeeting ? <Video size={8} color="white" style={{ marginRight: 2 }} /> : null}
                          <Text style={{ color: "white", fontSize: 9, fontWeight: "600", lineHeight: 14, flex: 1 }} numberOfLines={1}>
                            {bar.title}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : <View style={{ height: 2 }} />}
          </View>
        );
      })}
    </View>
  );
}

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", bg: "#FEE2E2", text: "#DC2626", flagColor: "#DC2626", accentColor: "#DC2626" },
  high: { label: "High", bg: "#FEE2E2", text: "#DC2626", flagColor: "#DC2626", accentColor: "#DC2626" },
  medium: { label: "Medium", bg: "#FEF9C3", text: "#B45309", flagColor: "#F59E0B", accentColor: "#F59E0B" },
  low: { label: "Low", bg: "#DCFCE7", text: "#15803D", flagColor: "#16A34A", accentColor: "#16A34A" },
};

function EventRow({ event, onLongPress }: { event: CalendarEvent; onLongPress?: () => void }) {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : start;
  const isSingleDay = toLocalIso(start) === toLocalIso(end);
  const dateText = isSingleDay
    ? start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", backgroundColor: "white", flexDirection: "row", alignItems: "center" }}
    >
      <View style={{ width: 4, borderRadius: 2, alignSelf: "stretch", backgroundColor: event.color, marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
          {event.isVideoMeeting ? <Video size={13} color="#4361EE" style={{ marginRight: 5 }} /> : null}
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", flex: 1 }} numberOfLines={1}>{event.title}</Text>
        </View>
        {event.description ? (
          <Text numberOfLines={1} style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>{event.description}</Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <CalendarDays size={11} color="#64748B" />
          <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "500" }}>{dateText}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function TaskRow({ task, onToggle, onPress, onLongPress }: { task: Task; onToggle: () => void; onPress: () => void; onLongPress?: () => void }) {
  const isDone = task.status === "done";
  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const fmtTime = (d: string | Date) =>
    new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const completedDate = isDone ? (task.completedAt ?? task.updatedAt) : null;
  const dueDate = task.dueDate ?? null;

  const getDueStatus = (): { overdue: boolean; today: boolean } => {
    if (!dueDate) return { overdue: false, today: false };
    const due = new Date(dueDate);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    return {
      overdue: dueStart < todayStart,
      today: dueStart.getTime() === todayStart.getTime(),
    };
  };

  const { overdue, today } = getDueStatus();

  // Icon circle background: priority accent at 15% opacity
  const iconCircleBg = priority.accentColor + "26"; // 26 hex = ~15% opacity

  // First assignee name
  const firstAssigneeName = task.assignments?.[0]?.user?.name ?? null;

  // Due time color
  const dueTimeColor = overdue || today ? "#EF4444" : "#64748B";

  // Done status label
  const getDoneLabel = (): { label: string; color: string } => {
    const wasLate = task.dueDate && task.completedAt && new Date(task.completedAt) > new Date(task.dueDate);
    const color = wasLate ? "#F97316" : "#10B981";
    const label = wasLate
      ? (completedDate ? `Done overdue · ${fmtDate(completedDate)}` : "Done overdue")
      : (completedDate ? `Done · ${fmtDate(completedDate)}` : "Done");
    return { label, color };
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      testID="task-row"
      style={{
        marginHorizontal: 12,
        marginBottom: 6,
        borderRadius: 14,
        backgroundColor: "white",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.07,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View style={{ paddingHorizontal: 12, paddingVertical: 9 }}>

        {/* Row 1: Icon circle + Title + 3-dot menu */}
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          {/* Icon circle — tapping toggles done state */}
          <Pressable
            onPress={onToggle}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: isDone ? "#D1FAE5" : iconCircleBg,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
              marginTop: 1,
              flexShrink: 0,
            }}
          >
            {isDone ? (
              <Text style={{ fontSize: 14, color: "#10B981", fontWeight: "700" }}>✓</Text>
            ) : (
              <Text style={{ fontSize: 13, fontWeight: "700", color: priority.accentColor }}>
                {priority.label[0]}
              </Text>
            )}
          </Pressable>

          {/* Title + assignee */}
          <View style={{ flex: 1, marginRight: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {task.incognito ? <Text style={{ fontSize: 12, marginRight: 3 }}>🕵️</Text> : null}
              {task.isJoint ? <Text style={{ fontSize: 12, marginRight: 3 }}>🤝</Text> : null}
              <Text
                numberOfLines={2}
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: isDone ? "#94A3B8" : "#0F172A",
                  textDecorationLine: isDone ? "line-through" : "none",
                  lineHeight: 19,
                  flex: 1,
                }}
              >
                {task.title}
              </Text>
            </View>
            {firstAssigneeName ? (
              <Text numberOfLines={1} style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                {"Assigned to: "}
                {firstAssigneeName}
              </Text>
            ) : null}
          </View>

          {/* 3-dot menu */}
          <Pressable
            onPress={(e) => { e.stopPropagation(); onLongPress?.(); }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ paddingLeft: 4, paddingTop: 2 }}
          >
            <Text style={{ fontSize: 18, color: "#94A3B8", lineHeight: 20 }}>{"⋮"}</Text>
          </Pressable>
        </View>

        {/* Row 2: Priority pill | star placeholder | status/done badge | clock + due time | recurrence */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 7, gap: 6 }}>
          {/* Priority pill */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 20,
            backgroundColor: priority.bg,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: priority.accentColor, marginRight: 4 }} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: priority.text }}>{priority.label}</Text>
          </View>

          {/* Done status badge */}
          {isDone ? (
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 20,
              backgroundColor: "#D1FAE5",
            }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#059669" }}>
                {getDoneLabel().label}
              </Text>
            </View>
          ) : null}

          {/* Due date */}
          {dueDate && !isDone ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Clock size={11} color={dueTimeColor} />
              <Text style={{ fontSize: 11, fontWeight: "500", color: dueTimeColor }}>
                {overdue
                  ? `Overdue · ${fmtDate(dueDate)}`
                  : today
                  ? `Today · ${fmtTime(dueDate)}`
                  : fmtDate(dueDate)}
              </Text>
            </View>
          ) : null}

          {/* Recurrence indicator */}
          {task.recurrenceRule && !isDone ? (
            <Text style={{ fontSize: 11, color: "#818CF8" }}>{"↺"}</Text>
          ) : null}
        </View>

      </View>
    </Pressable>
  );
}


export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { openModal } = useLocalSearchParams<{ openModal?: string }>();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortMode>("due");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [teamCompletedExpanded, setTeamCompletedExpanded] = useState(false);
  const [confirmCompleteTask, setConfirmCompleteTask] = useState<Task | null>(null);
  const [actionMenuTask, setActionMenuTask] = useState<Task | null>(null);
  const [reassignTask, setReassignTask] = useState<Task | null>(null);
  const [confirmReassign, setConfirmReassign] = useState<{ task: Task; newUserId: string; newUserName: string } | null>(null);
  const [subtaskBlockMessage, setSubtaskBlockMessage] = useState<string | null>(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState<{ count: number; userName: string } | null>(null);
  const [personalBestModal, setPersonalBestModal] = useState<{ count: number; userName: string } | null>(null);
  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStart, setEventStart] = useState<Date>(new Date());
  const [eventEnd, setEventEnd] = useState<Date>(new Date());
  const [eventColor, setEventColor] = useState("#4361EE");
  const [eventIsHidden, setEventIsHidden] = useState(true);
  const [eventIsVideoMeeting, setEventIsVideoMeeting] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(5);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const { data: session } = useSession();
  const isDemo = useDemoMode();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const queryClient = useQueryClient();
  const acknowledge = useTaskStore((s) => s.acknowledge);

  // Clear the task badge when this page is opened
  useFocusEffect(
    useCallback(() => {
      if (!activeTeamId) return;
      const count = queryClient.getQueryData<number>(["tasks-count", activeTeamId]) ?? 0;
      acknowledge(activeTeamId, count);
    }, [activeTeamId, acknowledge, queryClient])
  );

  const [refreshing, setRefreshing] = useState(false);

  // Auto-open event modal when navigated from another tab
  useEffect(() => {
    if (openModal === "event") {
      openEventModal();
      router.setParams({ openModal: undefined });
    }
  }, [openModal]);

  const onRefresh = async () => {
    setRefreshing(true);
    setNextCursor(null);
    await queryClient.invalidateQueries({ queryKey: ["tasks", activeTeamId, "mine"] });
    await queryClient.invalidateQueries({ queryKey: ["tasks", activeTeamId, "team"] });
    await queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!activeTeamId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api.get<{ tasks: Task[]; nextCursor: string | null }>(
        `/api/teams/${activeTeamId}/tasks?myTasks=true&cursor=${nextCursor}&limit=50`
      );
      queryClient.setQueryData<{ tasks: Task[]; nextCursor: string | null }>(
        ["tasks", activeTeamId, "mine"],
        (prev) => ({
          tasks: [...(prev?.tasks ?? []), ...result.tasks],
          nextCursor: result.nextCursor,
        })
      );
      setNextCursor(result.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  React.useEffect(() => {
    if (teams && teams.length > 0 && !activeTeamId) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId, setActiveTeamId]);

  // My tasks (assigned to me, or created by me with no assignment) — Active & Completed tabs
  const { data: myTasksData, isLoading } = useQuery({
    queryKey: ["tasks", activeTeamId, "mine"],
    queryFn: async () => {
      const result = await api.get<{ tasks: Task[]; nextCursor: string | null }>(`/api/teams/${activeTeamId}/tasks?myTasks=true`);
      setNextCursor(result.nextCursor);
      return result;
    },
    enabled: !!activeTeamId,
  });
  const allTasks: Task[] = myTasksData?.tasks ?? [];

  // Tasks I created — used for Team tab (will filter client-side for assigned-to-others)
  const { data: teamTasksData } = useQuery({
    queryKey: ["tasks", activeTeamId, "team"],
    queryFn: async () => {
      const result = await api.get<{ tasks: Task[]; nextCursor: string | null }>(`/api/teams/${activeTeamId}/tasks?creatorId=me`);
      return result;
    },
    enabled: !!activeTeamId && filter === "assigned",
  });
  const teamTasks: Task[] = teamTasksData?.tasks ?? [];

  // Team members for the member filter (Team tab only)
  const { data: teamData } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });
  const nonOwnerMembers: TeamMember[] = (teamData?.members ?? []).filter(
    (m) => m.role !== "owner"
  );

  const { data: calendarEvents = [] } = useQuery({
    queryKey: ["calendar-events", activeTeamId],
    queryFn: () => api.get<CalendarEvent[]>(`/api/teams/${activeTeamId}/events`),
    enabled: !!activeTeamId,
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () => api.get<{ plan: string; status: string }>(`/api/teams/${activeTeamId}/subscription`),
    enabled: !!activeTeamId,
  });
  const plan = useSubscriptionStore((s) => s.plan);
  const isPro = plan === "team";
  React.useEffect(() => {
    if (subscription) {}
  }, [subscription]);

  const toggleMutation = useMutation({
    mutationFn: (task: Task) =>
      api.patchFull<Task>(`/api/teams/${activeTeamId}/tasks/${task.id}`, {
        status: task.status === "done" ? "todo" : "done",
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", activeTeamId] });
      if (result.milestone) {
        setMilestoneModal({ count: result.milestone, userName: session?.user?.name ?? "You" });
      }
      if (result.comeback) {
        setPersonalBestModal({ count: result.comeback, userName: session?.user?.name ?? "You" });
      }
    },
    onError: (error: Error) => {
      setSubtaskBlockMessage(error.message);
    },
  });

  const handleToggleTask = (task: Task) => {
    if (isDemo) { showDemoAlert(); return; }
    // Always confirm before toggling either direction
    setConfirmCompleteTask(task);
  };

  const reassignMutation = useMutation({
    mutationFn: async ({ task, newUserId }: { task: Task; newUserId: string }) => {
      for (const assignment of task.assignments) {
        await api.delete(`/api/teams/${activeTeamId}/tasks/${task.id}/assign/${assignment.userId}`);
      }
      await api.post(`/api/teams/${activeTeamId}/tasks/${task.id}/assign`, { userIds: [newUserId] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", activeTeamId] });
      setReassignTask(null);
    },
  });

  const createEventMutation = useMutation({
    mutationFn: (data: object) =>
      api.post(`/api/teams/${activeTeamId}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      setShowEventModal(false);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE"); setEventIsHidden(true); setEventIsVideoMeeting(false);
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch(`/api/teams/${activeTeamId}/events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      setShowEventModal(false);
      setEditingEvent(null);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE"); setEventIsHidden(true); setEventIsVideoMeeting(false);
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/teams/${activeTeamId}/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      setShowEventModal(false);
      setEditingEvent(null);
      setConfirmDeleteEvent(false);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE"); setEventIsHidden(true); setEventIsVideoMeeting(false);
    },
  });

  const openEventModal = () => {
    setEditingEvent(null);
    const d = selectedDay
      ? (() => { const [y, m, day] = selectedDay.split("-").map(Number); return new Date(y, m - 1, day); })()
      : new Date();
    setEventTitle(""); setEventDescription("");
    setEventStart(d); setEventEnd(d);
    setEventColor("#4361EE"); setEventIsHidden(true); setEventIsVideoMeeting(false); setFormError(null); setConfirmDeleteEvent(false);
    setShowEventModal(true);
  };

  const openEditEventModal = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    setEventTitle(ev.title);
    setEventDescription(ev.description ?? "");
    setEventStart(new Date(ev.startDate));
    setEventEnd(ev.endDate ? new Date(ev.endDate) : new Date(ev.startDate));
    setEventColor(ev.color);
    setEventIsHidden(ev.isHidden ?? false);
    setEventIsVideoMeeting(ev.isVideoMeeting ?? false);
    setFormError(null);
    setConfirmDeleteEvent(false);
    setShowEventModal(true);
  };

  const handleSaveEvent = () => {
    if (!eventTitle.trim()) { setFormError("Please enter a title"); return; }
    const end = eventEnd < eventStart ? eventStart : eventEnd;
    if (eventIsVideoMeeting) {
      const currentEventId = editingEvent?.id;
      const hasOverlap = calendarEvents
        .filter((e) => e.isVideoMeeting && e.id !== currentEventId)
        .some((e) => {
          const eStart = new Date(e.startDate);
          const eEnd = e.endDate ? new Date(e.endDate) : eStart;
          return eventStart < eEnd && end > eStart;
        });
      if (hasOverlap) {
        Alert.alert("Scheduling Conflict", "This time overlaps with another video meeting. Please choose a different time.");
        return;
      }
    }
    if (editingEvent) {
      updateEventMutation.mutate({
        id: editingEvent.id,
        data: {
          title: eventTitle.trim(),
          description: eventDescription.trim() || undefined,
          startDate: eventStart.toISOString(),
          endDate: end.toISOString(),
          color: eventColor,
          allDay: !eventIsVideoMeeting,
          isHidden: eventIsHidden,
          isVideoMeeting: eventIsVideoMeeting,
        },
      });
    } else {
      createEventMutation.mutate({
        title: eventTitle.trim(),
        description: eventDescription.trim() || undefined,
        startDate: eventStart.toISOString(),
        endDate: end.toISOString(),
        color: eventColor,
        allDay: !eventIsVideoMeeting,
        isHidden: eventIsHidden,
        isVideoMeeting: eventIsVideoMeeting,
      });
    }
  };

  const currentUserId = session?.user?.id ?? null;
  const isOwner = teams?.find((t) => t.id === activeTeamId)?.role === "owner";
  const currentRole = teams?.find((t) => t.id === activeTeamId)?.role ?? "member";
  const isRegularMember = currentRole === "member";
  const isOwnerOrLeader = currentRole === "owner" || currentRole === "team_leader";

  React.useEffect(() => {
    if (filter === "assigned" && isRegularMember) setFilter("all");
    if (filter === "assigned" && !currentUserId) setFilter("all");
    if (filter !== "assigned") setSelectedMemberId(null);
  }, [currentUserId, filter, isRegularMember]);

  useEffect(() => {
    if (filter === "completed") setSort("completed");
    else if (sort === "completed") setSort("due");
  }, [filter]);

  useEffect(() => {
    setVisibleCount(5);
  }, [filter]);

  // Active: tasks assigned to me (or mine with no assignment), open
  // Completed: same pool, done only
  // Team: tasks I created that are assigned to someone else, open
  const filteredTasks = (filter === "assigned" ? teamTasks : allTasks).filter((t) => {
    if (filter === "assigned") {
      // Show tasks I created that have at least one assignment to someone other than me
      if ((t.assignments ?? []).length === 0) return false;
      if (!(t.assignments ?? []).some((a) => a.userId !== currentUserId)) return false;
      if (t.status === "done") return false;
      // Member filter
      if (selectedMemberId && !(t.assignments ?? []).some((a) => a.userId === selectedMemberId)) return false;
    } else if (filter === "completed") {
      if (t.status !== "done") return false;
    } else {
      if (t.status === "done") return false;
    }
    return true;
  });

  const tasks: Task[] = filteredTasks.slice().sort((a, b) => {
    if (sort === "priority") {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
    }
    if (sort === "completed") {
      const aDate = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bDate = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bDate - aDate;
    }
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const currentYear = new Date().getFullYear();
  const holidays = [...getUSHolidays(currentYear), ...getUSHolidays(currentYear + 1)];

  const targetIso = selectedDay ?? toLocalIso(new Date());
  const dayEvents = calendarEvents.filter((ev) => {
    const evStart = startOfDay(new Date(ev.startDate));
    const evEnd = ev.endDate ? startOfDay(new Date(ev.endDate)) : evStart;
    // Parse as local midnight (not UTC) to match startOfDay output
    const [ty, tm, td] = targetIso.split("-").map(Number);
    const target = new Date(ty, tm - 1, td);
    return evStart <= target && target <= evEnd;
  });

  const dayHolidays = holidays.filter((h) => {
    const [ty, tm, td] = targetIso.split("-").map(Number);
    return isSameDay(h.date, new Date(ty, tm - 1, td));
  });

  // Completed tasks delegated to others (for Team tab collapsed section)
  const teamCompletedTasks = teamTasks.filter((t) => {
    if (t.status !== "done") return false;
    if ((t.assignments ?? []).length === 0) return false;
    if (!(t.assignments ?? []).some((a) => a.userId !== currentUserId)) return false;
    return true;
  });

  const assignedCount = allTasks.filter((t) =>
    t.creator?.id === currentUserId &&
    (t.assignments ?? []).some((a) => a.userId !== currentUserId)
  ).length;
  const completedCount = allTasks.filter((t) => t.status === "done").length;

  const myActiveTasks = allTasks.filter((t) => t.status !== "done");
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const dueTodayCount = myActiveTasks.filter((t) => t.dueDate && new Date(t.dueDate) >= todayStart && new Date(t.dueDate) <= todayEnd).length;
  const overdueCount = myActiveTasks.filter((t) => t.dueDate && new Date(t.dueDate) < todayStart).length;

  if (!activeTeamId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
        <NoTeamPlaceholder />
      </SafeAreaView>
    );
  }

  if (!isPro) {
    return <Redirect href="/(app)/team" />;
  }

  if (!teamsLoading && (!teams || teams.length === 0)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }} edges={[]} testID="no-teams-screen">
        <LinearGradient
          colors={["#4361EE", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: "white", fontSize: 20, fontWeight: "800", flex: 1 }}>Execute</Text>
            <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
              <Image source={require("@/assets/alenio-logo-white.png")} style={{ height: 30, width: 104, resizeMode: "contain" }} />
            </View>
            <View />
          </View>
        </LinearGradient>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <Image
            source={require("@/assets/alenio-logo.png")}
            style={{ width: 180, height: 68, marginBottom: 16 }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A", marginBottom: 8, textAlign: "center" }}>
            Welcome to Alenio
          </Text>
          <Text style={{ color: "#64748B", textAlign: "center", marginBottom: 24 }}>
            Create or join a team to start managing tasks together
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: "#4361EE", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
            onPress={() => router.push("/onboarding")}
            testID="get-started-button"
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Get started</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={[]} testID="tasks-screen">
      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "800", flex: 1 }}>Execute</Text>
          <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
            <Image source={require("@/assets/alenio-logo-white.png")} style={{ height: 30, width: 104, resizeMode: "contain" }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {activeTeamId && !isDemo ? (
              <Pressable
                onPress={() => setShowAddModal(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}
                testID="header-add-button"
              >
                <Plus size={13} color="white" />
                <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>Add</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      <View style={{ flex: 1 }}>
        {/* Fixed top section: calendar, events, filter tabs */}
        <View style={{ flexShrink: 0 }}>
          {/* Mini Calendar */}
          <MiniCalendar tasks={allTasks} events={calendarEvents} holidays={holidays} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

          {/* Events section — below calendar, above filter tabs */}
          {(dayEvents.length > 0 || dayHolidays.length > 0) ? (
          <View style={{ backgroundColor: "white", marginTop: 10 }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <CalendarDays size={13} color="#64748B" />
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>Events</Text>
              </View>
              {(dayEvents.length + dayHolidays.length) > 1 ? (
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#4361EE" }}>{dayEvents.length + dayHolidays.length} events</Text>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: "row" }}>
              {dayHolidays.map((h) => (
                <View key={h.name} style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, minWidth: 180, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 3, borderRadius: 2, alignSelf: "stretch", backgroundColor: "#EF4444" }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>{h.name}</Text>
                    <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Federal Holiday 🇺🇸</Text>
                  </View>
                </View>
              ))}
              {dayEvents.map((ev) => {
                const start = new Date(ev.startDate);
                const end = ev.endDate ? new Date(ev.endDate) : start;
                const isSingleDay = toLocalIso(start) === toLocalIso(end);
                const dateText = isSingleDay
                  ? start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                return (
                  <Pressable
                    key={ev.id}
                    onLongPress={isOwnerOrLeader && !isDemo ? () => openEditEventModal(ev) : undefined}
                    delayLongPress={400}
                    style={{ backgroundColor: ev.isHidden ? "#F8FAFC" : `${ev.color}18`, borderRadius: 12, padding: 12, minWidth: 180, flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <View style={{ width: 3, borderRadius: 2, alignSelf: "stretch", backgroundColor: ev.isHidden ? "#94A3B8" : ev.color }} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 }}>
                        {ev.isVideoMeeting ? <Video size={12} color="#4361EE" /> : null}
                        <Text style={{ fontSize: 13, fontWeight: "600", color: ev.isHidden ? "#64748B" : "#0F172A", flex: 1 }} numberOfLines={1}>{ev.title}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: ev.isHidden ? "#E2E8F0" : "#DCFCE7", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                          {ev.isHidden ? <Lock size={8} color="#64748B" /> : <Globe size={8} color="#16A34A" />}
                          <Text style={{ fontSize: 9, fontWeight: "700", color: ev.isHidden ? "#64748B" : "#16A34A" }}>{ev.isHidden ? "Private" : "Public"}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <CalendarDays size={10} color="#64748B" />
                        <Text style={{ fontSize: 11, color: "#64748B" }}>{dateText}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Sticky section: filter tabs + sort */}
        <View style={{ backgroundColor: "#F8FAFC", paddingTop: 10 }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", backgroundColor: "#E2E8F0", borderRadius: 12, padding: 4, marginBottom: 8 }}>
              {(["all", "completed", ...(isRegularMember ? [] : ["assigned"])] as FilterTab[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                    backgroundColor: filter === f ? "white" : "transparent",
                  }}
                  testID={`filter-${f}`}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: filter === f ? "#0F172A" : "#94A3B8" }}>
                    {f === "all" ? "Active" : f === "assigned" ? "Team" : "Completed"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <ArrowUpDown size={12} color="#94A3B8" />
              <Text style={{ fontSize: 12, color: "#94A3B8" }}>Sort:</Text>
              {filter === "assigned" && nonOwnerMembers.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setMemberDropdownOpen(true)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 4,
                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                    backgroundColor: selectedMemberId ? "#EEF2FF" : "#F1F5F9",
                    borderWidth: selectedMemberId ? 1 : 0, borderColor: "#4361EE",
                  }}
                  testID="member-dropdown-trigger"
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: selectedMemberId ? "#4361EE" : "#64748B" }}>
                    {selectedMemberId ? nonOwnerMembers.find((m) => m.userId === selectedMemberId)?.user.name ?? "Member" : "All Members"}
                  </Text>
                  <ChevronRight size={11} color={selectedMemberId ? "#4361EE" : "#94A3B8"} style={{ transform: [{ rotate: "90deg" }] }} />
                </TouchableOpacity>
              ) : null}
              {(filter === "completed"
                ? (["completed", "priority"] as SortMode[])
                : (["due", "priority"] as SortMode[])
              ).map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSort(s)}
                  style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: sort === s ? "#4361EE" : "#F1F5F9" }}
                  testID={`sort-${s}`}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: sort === s ? "white" : "#64748B" }}>
                    {s === "due" ? "Due Date" : s === "completed" ? "Completion" : "Priority"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Member dropdown modal */}
            {filter === "assigned" && nonOwnerMembers.length > 0 ? (
              <Modal visible={memberDropdownOpen} transparent animationType="fade" onRequestClose={() => setMemberDropdownOpen(false)}>
                <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => setMemberDropdownOpen(false)}>
                  <Pressable onPress={(e) => e.stopPropagation()}>
                    <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 32 }}>
                      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 8 }}>Filter by Member</Text>
                      <TouchableOpacity
                        onPress={() => { setSelectedMemberId(null); setMemberDropdownOpen(false); }}
                        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, gap: 12, backgroundColor: !selectedMemberId ? "#F5F7FF" : "transparent" }}
                        testID="member-option-all"
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                          <Users size={16} color="#4361EE" />
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: !selectedMemberId ? "#4361EE" : "#0F172A", flex: 1 }}>All Members</Text>
                        {!selectedMemberId ? <Check size={16} color="#4361EE" /> : null}
                      </TouchableOpacity>
                      <View style={{ height: 1, backgroundColor: "#F1F5F9", marginHorizontal: 20, marginBottom: 4 }} />
                      {nonOwnerMembers.map((m) => {
                        const isSelected = selectedMemberId === m.userId;
                        return (
                          <TouchableOpacity
                            key={m.userId}
                            onPress={() => { setSelectedMemberId(m.userId); setMemberDropdownOpen(false); }}
                            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, gap: 12, backgroundColor: isSelected ? "#F5F7FF" : "transparent" }}
                            testID={`member-option-${m.userId}`}
                          >
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#EEF2FF", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                              {m.user.image
                                ? <Image source={{ uri: m.user.image }} style={{ width: 36, height: 36 }} resizeMode="cover" />
                                : <Text style={{ fontSize: 15, fontWeight: "700", color: "#4361EE" }}>{m.user.name?.[0]?.toUpperCase()}</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: "600", color: isSelected ? "#4361EE" : "#0F172A" }}>{m.user.name}</Text>
                              <Text style={{ fontSize: 12, color: "#94A3B8" }}>{m.user.email}</Text>
                            </View>
                            {isSelected ? <Check size={16} color="#4361EE" /> : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </Pressable>
                </Pressable>
              </Modal>
            ) : null}
          </View>
        </View>
        </View>

        {/* Scrollable task list */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />}>
          {/* Task list */}
          {isLoading ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }} testID="loading-indicator">
              <ActivityIndicator color="#4361EE" />
            </View>
          ) : tasks.length === 0 ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 }} testID="empty-state">
              <Text style={{ fontSize: 40, marginBottom: 12 }}>✓</Text>
              <Text style={{ fontSize: 17, fontWeight: "600", color: "#94A3B8" }}>
                {filter === "completed" ? "No completed tasks" : filter === "assigned" ? "No tasks assigned to others" : "No active tasks"}
              </Text>
              {filter === "all" && !selectedDay ? (
                <Text style={{ color: "#CBD5E1", fontSize: 13, marginTop: 4, textAlign: "center" }}>
                  Tap the + button to create your first task or event
                </Text>
              ) : null}
            </View>
          ) : (
            tasks.slice(0, visibleCount).map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => handleToggleTask(task)}
                onPress={() => router.push({ pathname: "/task-detail", params: { taskId: task.id, teamId: activeTeamId! } })}
                onLongPress={!isDemo ? () => setActionMenuTask(task) : undefined}
              />
            ))
          )}
          {tasks.length > visibleCount ? (
            <Pressable
              onPress={() => setVisibleCount(v => v + 5)}
              className="mx-4 mb-2 py-3 rounded-2xl items-center"
              style={{ backgroundColor: '#F1F5F9' }}
              testID="show-more-button"
            >
              <Text className="text-sm font-semibold text-slate-600">
                Show {Math.min(5, tasks.length - visibleCount)} more
              </Text>
            </Pressable>
          ) : null}
          {filter !== "assigned" && nextCursor !== null ? (
            <Pressable
              onPress={handleLoadMore}
              style={{ marginHorizontal: 16, marginBottom: 4, paddingVertical: 12, borderRadius: 16, alignItems: "center", backgroundColor: "#EEF2FF", flexDirection: "row", justifyContent: "center", gap: 8 }}
              testID="load-more-button"
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color="#4361EE" testID="load-more-indicator" />
              ) : null}
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#4361EE" }}>
                {loadingMore ? "Loading..." : "Load more tasks"}
              </Text>
            </Pressable>
          ) : null}

          {/* Team tab: collapsed completed section */}
          {filter === "assigned" && teamCompletedTasks.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              <Pressable
                onPress={() => setTeamCompletedExpanded((v) => !v)}
                style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
                testID="team-completed-toggle"
              >
                <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>✓</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B" }}>
                    Completed ({teamCompletedTasks.length})
                  </Text>
                  <Text style={{ fontSize: 12, color: "#94A3B8" }}>{teamCompletedExpanded ? "▲" : "▼"}</Text>
                </View>
                <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
              </Pressable>
              {teamCompletedExpanded ? teamCompletedTasks.map((item) => (
                <TaskRow
                  key={item.id}
                  task={item}
                  onToggle={() => handleToggleTask(item)}
                  onPress={() => router.push({ pathname: "/task-detail", params: { taskId: item.id, teamId: activeTeamId! } })}
                  onLongPress={isOwnerOrLeader && !isDemo && item.assignments.length > 0 && item.status !== "done" ? () => setReassignTask(item) : undefined}
                />
              )) : null}
            </View>
          ) : null}

          <View style={{ height: insets.bottom + 88 }} />
        </ScrollView>
      </View>

      {/* Task completion confirmation modal */}
      {confirmCompleteTask ? (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", zIndex: 100 }} testID="complete-confirm-overlay">
          <View style={{ backgroundColor: "white", borderRadius: 20, marginHorizontal: 32, padding: 24, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12, width: "85%" }}>
            <Image source={require("@/assets/alenio-icon.png")} style={{ width: 44, height: 44, borderRadius: 10, alignSelf: "center", marginBottom: 14 }} />
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 6 }}>
              {confirmCompleteTask.status === "done" ? "Mark as Incomplete?" : "Mark as Complete?"}
            </Text>
            <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24 }} numberOfLines={2}>
              "{confirmCompleteTask.title}"
            </Text>
            <Pressable
              onPress={() => { toggleMutation.mutate(confirmCompleteTask); setConfirmCompleteTask(null); }}
              style={{ backgroundColor: confirmCompleteTask.status === "done" ? "#F59E0B" : "#10B981", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}
              testID="complete-confirm-yes"
            >
              <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>
                {confirmCompleteTask.status === "done" ? "Reopen Task" : "Complete Task"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmCompleteTask(null)}
              style={{ borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
              testID="complete-confirm-cancel"
            >
              <Text style={{ color: "#94A3B8", fontSize: 15, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Subtask block modal */}
      {subtaskBlockMessage ? (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", zIndex: 101 }} testID="subtask-block-overlay">
          <View style={{ backgroundColor: "white", borderRadius: 20, marginHorizontal: 32, padding: 24, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12, width: "85%" }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 }}>
              <Text style={{ fontSize: 26 }}>⚠️</Text>
            </View>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 6 }}>Subtasks Incomplete</Text>
            <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24 }}>{subtaskBlockMessage}</Text>
            <Pressable
              onPress={() => setSubtaskBlockMessage(null)}
              style={{ backgroundColor: "#4361EE", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
              testID="subtask-block-ok"
            >
              <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>Got it</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Task action menu */}
      <Modal visible={!!actionMenuTask} transparent animationType="fade" onRequestClose={() => setActionMenuTask(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }} onPress={() => setActionMenuTask(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 36, paddingTop: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#94A3B8", paddingHorizontal: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }} numberOfLines={1}>
              {actionMenuTask?.title}
            </Text>
            {/* View / Edit */}
            <Pressable
              onPress={() => {
                setActionMenuTask(null);
                router.push({ pathname: "/task-detail", params: { taskId: actionMenuTask!.id, teamId: activeTeamId! } });
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 16 }}
            >
              <Text style={{ fontSize: 20 }}>✏️</Text>
              <Text style={{ fontSize: 16, fontWeight: "500", color: "#0F172A" }}>View / Edit</Text>
            </Pressable>
            {/* Reassign — owners/leaders only, undone tasks with assignees */}
            {isOwnerOrLeader && actionMenuTask?.status !== "done" && (actionMenuTask?.assignments.length ?? 0) > 0 ? (
              <Pressable
                onPress={() => {
                  const t = actionMenuTask!;
                  setActionMenuTask(null);
                  setReassignTask(t);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 16 }}
              >
                <Text style={{ fontSize: 20 }}>🔄</Text>
                <Text style={{ fontSize: 16, fontWeight: "500", color: "#0F172A" }}>Reassign</Text>
              </Pressable>
            ) : null}
            {/* Cancel */}
            <Pressable
              onPress={() => setActionMenuTask(null)}
              style={{ marginHorizontal: 20, marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: "#F1F5F9" }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#64748B" }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reassign task modal */}
      <Modal visible={!!reassignTask} transparent animationType="slide" onRequestClose={() => setReassignTask(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setReassignTask(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, width: "100%", paddingBottom: 32, maxHeight: "75%" }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 12, marginBottom: 16 }} />
            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", marginBottom: 4 }}>Reassign Task</Text>
              <Text style={{ fontSize: 13, color: "#64748B" }} numberOfLines={1}>"{reassignTask?.title}"</Text>
              {reassignTask?.assignments[0]?.user ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, backgroundColor: "#F8FAFC", borderRadius: 10, padding: 10, gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#E0E7FF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {reassignTask.assignments[0].user.image ? (
                      <Image source={{ uri: reassignTask.assignments[0].user.image }} style={{ width: 28, height: 28 }} />
                    ) : (
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#4361EE" }}>{reassignTask.assignments[0].user.name?.[0]?.toUpperCase() ?? "?"}</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: "#64748B" }}>Currently: <Text style={{ fontWeight: "600", color: "#0F172A" }}>{reassignTask.assignments[0].user.name}</Text></Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#94A3B8", paddingHorizontal: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Select new assignee</Text>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
              {(teamData?.members ?? [])
                .filter((m) => !reassignTask?.assignments.some((a) => a.userId === m.userId))
                .map((member) => (
                  <Pressable
                    key={member.userId}
                    onPress={() => {
                      if (!reassignTask) return;
                      setConfirmReassign({ task: reassignTask, newUserId: member.userId, newUserName: member.user?.name ?? "this person" });
                      setReassignTask(null);
                    }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, backgroundColor: "#F8FAFC" }}
                    testID="reassign-member-row"
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#E0E7FF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {member.user?.image ? (
                        <Image source={{ uri: member.user.image }} style={{ width: 36, height: 36 }} />
                      ) : (
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#4361EE" }}>{member.user?.name?.[0]?.toUpperCase() ?? "?"}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{member.user?.name}</Text>
                      <Text style={{ fontSize: 12, color: "#94A3B8", textTransform: "capitalize" }}>{member.role.replace("_", " ")}</Text>
                    </View>
                    {reassignMutation.isPending ? null : (
                      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#CBD5E1" }} />
                    )}
                  </Pressable>
                ))}
            </ScrollView>
            <Pressable
              onPress={() => setReassignTask(null)}
              style={{ marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: "#F1F5F9" }}
              testID="reassign-cancel"
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#64748B" }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reassign confirmation modal */}
      <Modal visible={!!confirmReassign} transparent animationType="fade" onRequestClose={() => setConfirmReassign(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }} onPress={() => setConfirmReassign(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderRadius: 20, width: "100%", padding: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", marginBottom: 6 }}>Reassign Task?</Text>
            <Text style={{ fontSize: 14, color: "#64748B", marginBottom: 4 }} numberOfLines={2}>
              {`"${confirmReassign?.task.title}"`}
            </Text>
            <Text style={{ fontSize: 14, color: "#64748B", marginBottom: 20 }}>
              {"Will be reassigned to "}
              <Text style={{ fontWeight: "700", color: "#0F172A" }}>{confirmReassign?.newUserName}</Text>
              {"."}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setConfirmReassign(null)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: "#F1F5F9" }}
                testID="reassign-confirm-cancel"
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#64748B" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!confirmReassign) return;
                  reassignMutation.mutate({ task: confirmReassign.task, newUserId: confirmReassign.newUserId });
                  setConfirmReassign(null);
                  setReassignTask(null);
                }}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: "#4361EE" }}
                testID="reassign-confirm-submit"
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "white" }}>Reassign</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add choice modal */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowAddModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 8 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Image source={require("@/assets/alenio-icon.png")} style={{ width: 32, height: 32, borderRadius: 8 }} />
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>What would you like to add?</Text>
            </View>
            {isOwnerOrLeader ? (
              <Pressable
                onPress={() => { setShowAddModal(false); openEventModal(); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#F5F3FF", borderRadius: 16, padding: 16 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" }}>
                  <CalendarDays size={22} color="white" />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>Add Event</Text>
                  <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Add to the team calendar</Text>
                </View>
              </Pressable>
            ) : null}
            {!isRegularMember ? (
            <Pressable
              onPress={() => { setShowAddModal(false); router.push({ pathname: "/create-task", params: { teamId: activeTeamId!, initialDueDate: selectedDay ?? toLocalIso(new Date()) } }); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#EEF2FF", borderRadius: 16, padding: 16 }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center" }}>
                <CheckSquare size={22} color="white" />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>Add Task</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Create a new task for the team</Text>
              </View>
            </Pressable>
            ) : null}
            <View style={{ height: 16 }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* New / Edit Event Modal */}
      <Modal visible={showEventModal} transparent animationType="slide" onRequestClose={() => { setShowEventModal(false); setEditingEvent(null); setConfirmDeleteEvent(false); }}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => { setShowEventModal(false); setEditingEvent(null); setConfirmDeleteEvent(false); }} />
          <Pressable style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }} onPress={(e) => e.stopPropagation()}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 8, marginBottom: 16 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingHorizontal: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Image source={require("@/assets/alenio-icon.png")} style={{ width: 28, height: 28, borderRadius: 7 }} />
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>{editingEvent ? "Edit Event" : "New Event"}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {editingEvent ? (
                  <Pressable
                    onPress={() => setConfirmDeleteEvent(true)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" }}
                    testID="delete-event-button"
                  >
                    <Text style={{ fontSize: 15 }}>🗑</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => { setShowEventModal(false); setEditingEvent(null); setConfirmDeleteEvent(false); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
                  <X size={16} color="#64748B" />
                </Pressable>
              </View>
            </View>

            {confirmDeleteEvent ? (
              <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: "#FEF2F2", borderRadius: 14, padding: 16, gap: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#991B1B", textAlign: "center" }}>Delete this event?</Text>
                <Text style={{ fontSize: 13, color: "#EF4444", textAlign: "center" }}>This cannot be undone.</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => setConfirmDeleteEvent(false)}
                    style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#F1F5F9" }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B" }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => editingEvent && deleteEventMutation.mutate(editingEvent.id)}
                    disabled={deleteEventMutation.isPending}
                    style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#EF4444" }}
                    testID="confirm-delete-event-button"
                  >
                    {deleteEventMutation.isPending ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>Delete</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            <ScrollView
              style={{ paddingHorizontal: 20 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Title</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 14 }}
                placeholder="Event title..."
                placeholderTextColor="#CBD5E1"
                value={eventTitle}
                onChangeText={(t) => { setEventTitle(t); setFormError(null); }}
                testID="event-title-input"
              />

              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Description (optional)</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#0F172A", marginBottom: 14, minHeight: 60, textAlignVertical: "top" }}
                placeholder="Add a description..."
                placeholderTextColor="#CBD5E1"
                value={eventDescription}
                onChangeText={setEventDescription}
                multiline
              />

              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Start Date</Text>
                  <Pressable onPress={() => { setShowEndPicker(false); setShowStartPicker(true); }} style={{ borderWidth: 1.5, borderColor: "#4361EE", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#4361EE0D" }}>
                    <Calendar size={13} color="#4361EE" />
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#4361EE", marginLeft: 6 }}>
                      {eventStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>End Date</Text>
                  <Pressable onPress={() => { setShowStartPicker(false); setShowEndPicker(true); }} style={{ borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#7C3AED0D" }}>
                    <Calendar size={13} color="#7C3AED" />
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#7C3AED", marginLeft: 6 }}>
                      {eventEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {showStartPicker ? (
                <View style={{ backgroundColor: "#F8FAFC", borderRadius: 16, marginBottom: 14, overflow: "hidden" }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                    <Pressable onPress={() => setShowStartPicker(false)}><Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text></Pressable>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>Start Date</Text>
                    <Pressable onPress={() => setShowStartPicker(false)}><Text style={{ color: "#4361EE", fontWeight: "600", fontSize: 15 }}>Done</Text></Pressable>
                  </View>
                  <DateTimePicker value={eventStart} mode="date" display="spinner" style={{ height: 180 }} onChange={(_e, d) => { if (d) { setEventStart(d); if (d > eventEnd) setEventEnd(d); } }} />
                </View>
              ) : null}

              {showEndPicker ? (
                <View style={{ backgroundColor: "#F8FAFC", borderRadius: 16, marginBottom: 14, overflow: "hidden" }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                    <Pressable onPress={() => setShowEndPicker(false)}><Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text></Pressable>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>End Date</Text>
                    <Pressable onPress={() => setShowEndPicker(false)}><Text style={{ color: "#7C3AED", fontWeight: "600", fontSize: 15 }}>Done</Text></Pressable>
                  </View>
                  <DateTimePicker value={eventEnd} mode="date" display="spinner" minimumDate={eventStart} style={{ height: 180 }} onChange={(_e, d) => { if (d) setEventEnd(d); }} />
                </View>
              ) : null}

              {/* Video Meeting toggle */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F8FAFC", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: eventIsVideoMeeting ? 10 : 14, borderWidth: 1.5, borderColor: eventIsVideoMeeting ? "#4361EE" : "#E2E8F0" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Video size={18} color={eventIsVideoMeeting ? "#4361EE" : "#CBD5E1"} />
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>Video Meeting</Text>
                    <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>Includes a video call link</Text>
                  </View>
                </View>
                <Switch
                  value={eventIsVideoMeeting}
                  onValueChange={(val) => {
                    setEventIsVideoMeeting(val);
                    if (val) {
                      const newEnd = new Date(eventStart);
                      newEnd.setHours(newEnd.getHours() + 1);
                      setEventEnd(newEnd);
                    }
                  }}
                  trackColor={{ false: "#E2E8F0", true: "#4361EE" }}
                  thumbColor="white"
                  testID="video-meeting-toggle"
                />
              </View>

              {/* Time pickers — only shown for video meetings */}
              {eventIsVideoMeeting ? (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Start Time</Text>
                      <Pressable onPress={() => { setShowStartTimePicker(!showStartTimePicker); setShowEndTimePicker(false); }} style={{ borderWidth: 1.5, borderColor: showStartTimePicker ? "#4361EE" : "#4361EE", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: showStartTimePicker ? "#4361EE22" : "#4361EE0D" }}>
                        <Clock size={13} color="#4361EE" />
                        <Text style={{ fontSize: 12, fontWeight: "500", color: "#4361EE", marginLeft: 6 }}>
                          {eventStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>End Time</Text>
                      <Pressable onPress={() => { setShowEndTimePicker(!showEndTimePicker); setShowStartTimePicker(false); }} style={{ borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: showEndTimePicker ? "#7C3AED22" : "#7C3AED0D" }}>
                        <Clock size={13} color="#7C3AED" />
                        <Text style={{ fontSize: 12, fontWeight: "500", color: "#7C3AED", marginLeft: 6 }}>
                          {eventEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  {showStartTimePicker ? (
                    <View style={{ backgroundColor: "#F8FAFC", borderRadius: 14, marginTop: 8, borderWidth: 1, borderColor: "#E2E8F0" }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B" }}>Start Time</Text>
                        <Pressable onPress={() => setShowStartTimePicker(false)}><Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>Done</Text></Pressable>
                      </View>
                      <DateTimePicker value={eventStart} mode="time" display="spinner" onChange={(_e, d) => { if (d) setEventStart(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }} style={{ height: 216 }} />
                    </View>
                  ) : null}
                  {showEndTimePicker ? (
                    <View style={{ backgroundColor: "#F8FAFC", borderRadius: 14, marginTop: 8, borderWidth: 1, borderColor: "#E2E8F0" }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B" }}>End Time</Text>
                        <Pressable onPress={() => setShowEndTimePicker(false)}><Text style={{ fontSize: 13, fontWeight: "700", color: "#7C3AED" }}>Done</Text></Pressable>
                      </View>
                      <DateTimePicker value={eventEnd} mode="time" display="spinner" onChange={(_e, d) => { if (d) setEventEnd(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }} style={{ height: 216 }} />
                    </View>
                  ) : null}
                </View>
              ) : null}


              {formError ? <Text style={{ color: "#EF4444", fontSize: 13, marginBottom: 12 }}>{formError}</Text> : null}

              {/* Visibility toggle */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F8FAFC", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20, borderWidth: 1.5, borderColor: !eventIsHidden ? "#4361EE" : "#E2E8F0" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Users size={18} color={!eventIsHidden ? "#4361EE" : "#CBD5E1"} />
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>Public</Text>
                    <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{!eventIsHidden ? "Visible to the whole team" : "Only visible to you"}</Text>
                  </View>
                </View>
                <Switch
                  value={!eventIsHidden}
                  onValueChange={(v) => setEventIsHidden(!v)}
                  trackColor={{ false: "#E2E8F0", true: "#4361EE" }}
                  thumbColor="white"
                  testID="hidden-toggle"
                />
              </View>

              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 10 }}>Color</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
                {["#4361EE", "#7C3AED", "#EC4899", "#EF4444", "#F59E0B", "#10B981", "#06B6D4", "#64748B"].map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setEventColor(c)}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, alignItems: "center", justifyContent: "center", borderWidth: eventColor === c ? 3 : 0, borderColor: "white", shadowColor: eventColor === c ? c : "transparent", shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: eventColor === c ? 4 : 0 }}
                  >
                    {eventColor === c ? <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>✓</Text> : null}
                  </Pressable>
                ))}
              </View>

              <TouchableOpacity
                onPress={handleSaveEvent}
                disabled={createEventMutation.isPending || updateEventMutation.isPending}
                style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
                testID="save-event-button"
              >
                {createEventMutation.isPending || updateEventMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>{editingEvent ? "Update Event" : "Save Event"}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Milestone Celebration Modal */}
      <Modal visible={!!milestoneModal} transparent animationType="fade" onRequestClose={() => setMilestoneModal(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => setMilestoneModal(null)}
          testID="milestone-modal-backdrop"
        >
          <Pressable onPress={(e) => e.stopPropagation()} testID="milestone-modal">
            <LinearGradient
              colors={["#F59E0B", "#EF4444"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 28, padding: 3 }}
            >
              <View style={{ backgroundColor: "#FCD34D", borderRadius: 26, padding: 28, alignItems: "center", gap: 12 }}>
                {/* Logo + Trophy */}
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Image source={require("@/assets/alenio-icon.png")} style={{ width: 40, height: 40, borderRadius: 10, marginBottom: 4 }} />
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 36 }}>🏆</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 13, fontWeight: "700", color: "#D97706", letterSpacing: 1.5, textTransform: "uppercase" }}>Milestone Reached!</Text>

                <Text style={{ fontSize: 44, fontWeight: "800", color: "#F59E0B", lineHeight: 48 }}>
                  {milestoneModal?.count}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#92400E", textAlign: "center", lineHeight: 22 }}>
                  {milestoneModal?.userName} completed{"\n"}{milestoneModal?.count} tasks on time!
                </Text>

                <Text style={{ fontSize: 13, color: "#B45309", textAlign: "center" }}>
                  Keep up the incredible streak 🔥
                </Text>

                <Pressable
                  onPress={() => setMilestoneModal(null)}
                  style={{ marginTop: 8, backgroundColor: "#F59E0B", paddingHorizontal: 40, paddingVertical: 14, borderRadius: 24 }}
                  testID="milestone-modal-close"
                >
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Let's go! 🎉</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Comeback Celebration Modal */}
      <Modal visible={!!personalBestModal} transparent animationType="fade" onRequestClose={() => setPersonalBestModal(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }}
          onPress={() => setPersonalBestModal(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={["#F97316", "#EF4444"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 28, padding: 3 }}
            >
              <View style={{ backgroundColor: "#FCD34D", borderRadius: 26, padding: 28, alignItems: "center", gap: 14 }}>
                <Image source={require("@/assets/alenio-icon.png")} style={{ width: 36, height: 36, borderRadius: 9 }} />
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 56 }}>🔥</Text>
                  <View style={{ backgroundColor: "#F97316", paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20 }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "white", letterSpacing: 2, textTransform: "uppercase" }}>Comeback</Text>
                  </View>
                </View>
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 64, fontWeight: "900", color: "#F59E0B", lineHeight: 68 }}>
                    {personalBestModal?.count}
                  </Text>
                  <Text style={{ fontSize: 14, color: "#D97706", fontWeight: "600" }}>tasks in a row</Text>
                </View>
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#92400E", textAlign: "center" }}>
                    You're back! 💪
                  </Text>
                  <Text style={{ fontSize: 13, color: "#B45309", textAlign: "center", lineHeight: 20 }}>
                    {personalBestModal?.userName} just matched their{"\n"}personal best streak after a setback.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setPersonalBestModal(null)}
                  style={{ marginTop: 4, backgroundColor: "#F59E0B", paddingHorizontal: 40, paddingVertical: 14, borderRadius: 24, width: "100%" }}
                >
                  <Text style={{ color: "white", fontWeight: "800", fontSize: 16, textAlign: "center" }}>Keep the streak alive 🔥</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}
