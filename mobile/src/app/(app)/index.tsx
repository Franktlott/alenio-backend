import React, { useState } from "react";
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
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Plus, User, ArrowUpDown, Clock, AlertTriangle, ChevronLeft, ChevronRight, X, CalendarDays, CheckSquare, Calendar } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import type { Task, Team, CalendarEvent } from "@/lib/types";

type FilterTab = "all" | "assigned" | "completed";
type SortMode = "due" | "priority";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type WeekBar ={ id: string; title: string; color: string; startCol: number; endCol: number };

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

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
    bars.push({ id: event.id, title: event.title, color: event.color, startCol, endCol });
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

function MiniCalendar({
  tasks,
  events,
  selectedDay,
  onSelectDay,
}: {
  tasks: Task[];
  events: CalendarEvent[];
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
      .map((t) => new Date(t.dueDate!).toISOString().slice(0, 10))
  );

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
                const iso = day.toISOString().slice(0, 10);
                const isToday = isSameDay(day, today);
                const isSelected = selectedDay === iso;
                const hasTasks = taskDays.has(iso);
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
                    {hasTasks && !isSelected ? (
                      <View style={{ position: "absolute", bottom: 3, width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#4361EE" }} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Event bars */}
            {tracks.length > 0 ? (
              <View
                onLayout={(e) => setWeekRowWidth(e.nativeEvent.layout.width)}
                style={{ position: "relative", marginBottom: 3 }}
              >
                {tracks.map((track, trackIdx) => (
                  <View key={trackIdx} style={{ flexDirection: "row", height: 15, marginBottom: 2 }}>
                    {week.map((_, colIdx) => {
                      const bar = track.find((b) => b.startCol <= colIdx && b.endCol >= colIdx);
                      if (!bar) return <View key={colIdx} style={{ flex: 1 }} />;
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
                    {weekRowWidth > 0 && track.map((bar) => {
                      const colWidth = weekRowWidth / 7;
                      return (
                        <View
                          key={`t-${bar.id}`}
                          pointerEvents="none"
                          style={{ position: "absolute", left: bar.startCol * colWidth + 2, width: (bar.endCol - bar.startCol + 1) * colWidth - 4, top: 0, height: 15, justifyContent: "center", overflow: "hidden" }}
                        >
                          <Text style={{ color: "white", fontSize: 9, fontWeight: "600", paddingHorizontal: 4, lineHeight: 14 }} numberOfLines={1}>
                            {bar.title}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : <View style={{ height: 2 }} />}
          </View>
        );
      })}
    </View>
  );
}

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", bg: "#FEE2E2", text: "#DC2626", flagColor: "#DC2626" },
  high: { label: "High", bg: "#FEE2E2", text: "#DC2626", flagColor: "#DC2626" },
  medium: { label: "Medium", bg: "#FEF9C3", text: "#B45309", flagColor: "#F59E0B" },
  low: { label: "Low", bg: "#DCFCE7", text: "#15803D", flagColor: "#16A34A" },
};

function EventRow({ event }: { event: CalendarEvent }) {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : start;
  const isSingleDay = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
  const dateText = isSingleDay
    ? start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", backgroundColor: "white", flexDirection: "row", alignItems: "center" }}>
      {/* Color accent bar */}
      <View style={{ width: 4, borderRadius: 2, alignSelf: "stretch", backgroundColor: event.color, marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", marginBottom: 3 }}>{event.title}</Text>
        {event.description ? (
          <Text numberOfLines={1} style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>{event.description}</Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <CalendarDays size={11} color="#7C3AED" />
          <Text style={{ fontSize: 11, color: "#7C3AED", fontWeight: "500" }}>{dateText}</Text>
        </View>
      </View>
    </View>
  );
}

function TaskRow({ task, onToggle, onPress }: { task: Task; onToggle: () => void; onPress: () => void }) {
  const isDone = task.status === "done";
  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;

  const getDueInfo = (): { date: string; overdue: boolean; today: boolean } | null => {
    if (!task.dueDate) return null;
    const due = new Date(task.dueDate);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const overdue = !isDone && dueStart < todayStart;
    const today = dueStart.getTime() === todayStart.getTime();
    const date = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { date, overdue, today };
  };

  const dueInfo = getDueInfo();

  return (
    <Pressable
      onPress={onPress}
      style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", backgroundColor: "white", flexDirection: "row", alignItems: "flex-start" }}
      testID="task-row"
    >
      {/* Checkbox */}
      <TouchableOpacity
        onPress={onToggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginRight: 12, marginTop: 2 }}
      >
        {isDone ? (
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontSize: 12, fontWeight: "bold" }}>✓</Text>
          </View>
        ) : (
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#CBD5E1" }} />
        )}
      </TouchableOpacity>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 14,
            fontWeight: "700",
            marginBottom: 2,
            color: isDone ? "#94A3B8" : "#0F172A",
            textDecorationLine: isDone ? "line-through" : "none",
          }}
        >
          {task.title}
        </Text>
        {task.description ? (
          <Text numberOfLines={1} style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8 }}>
            {task.description}
          </Text>
        ) : null}

        {/* Meta row */}
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          {/* Priority */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: priority.bg }}>
            <Text style={{ fontSize: 11, marginRight: 3, color: priority.flagColor }}>⚑</Text>
            <Text style={{ fontSize: 11, fontWeight: "600", color: priority.text }}>{priority.label}</Text>
          </View>

          {/* Assignee */}
          {task.assignments?.[0]?.user ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, overflow: "hidden", backgroundColor: "#E0E7FF", alignItems: "center", justifyContent: "center" }}>
                {task.assignments[0].user.image ? (
                  <Image source={{ uri: task.assignments[0].user.image }} style={{ width: 16, height: 16 }} resizeMode="cover" />
                ) : (
                  <Text style={{ fontSize: 8, fontWeight: "700", color: "#4361EE" }}>
                    {task.assignments[0].user.name?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 11, color: "#94A3B8" }}>
                {task.assignments[0].user.name ?? task.assignments[0].user.email ?? "Unknown"}
                {task.assignments.length > 1 ? ` +${task.assignments.length - 1}` : ""}
              </Text>
            </View>
          ) : null}

          {/* Due date */}
          {dueInfo ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 11, color: isDone ? "#94A3B8" : dueInfo.overdue ? "#EF4444" : dueInfo.today ? "#F59E0B" : "#64748B" }}>⏱</Text>
              <Text style={{
                fontSize: 11,
                fontWeight: dueInfo.overdue ? "600" : "400",
                color: isDone ? "#94A3B8" : dueInfo.overdue ? "#EF4444" : dueInfo.today ? "#F59E0B" : "#64748B",
              }}>
                {isDone ? "Completed" : dueInfo.today ? `Today · ${dueInfo.date}` : dueInfo.overdue ? `Overdue · ${dueInfo.date}` : dueInfo.date}
              </Text>
            </View>
          ) : null}

          {/* Recurrence */}
          {task.recurrenceRule && !isDone ? (
            <Text style={{ fontSize: 11, color: "#818CF8" }}>↺ {task.recurrenceRule.type}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function TasksScreen() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortMode>("due");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStart, setEventStart] = useState<Date>(new Date());
  const [eventEnd, setEventEnd] = useState<Date>(new Date());
  const [eventColor, setEventColor] = useState("#4361EE");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const queryClient = useQueryClient();

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

  const { data: allTasks = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["tasks", activeTeamId],
    queryFn: () => api.get<Task[]>(`/api/teams/${activeTeamId}/tasks`),
    enabled: !!activeTeamId,
  });

  const { data: calendarEvents = [] } = useQuery({
    queryKey: ["calendar-events", activeTeamId],
    queryFn: () => api.get<CalendarEvent[]>(`/api/teams/${activeTeamId}/events`),
    enabled: !!activeTeamId,
  });

  const toggleMutation = useMutation({
    mutationFn: (task: Task) =>
      api.patch<Task>(`/api/teams/${activeTeamId}/tasks/${task.id}`, {
        status: task.status === "done" ? "todo" : "done",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", activeTeamId] });
    },
  });

  const createEventMutation = useMutation({
    mutationFn: (data: object) =>
      api.post(`/api/teams/${activeTeamId}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      setShowEventModal(false);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE");
    },
  });

  const openEventModal = () => {
    const d = selectedDay ? new Date(selectedDay) : new Date();
    setEventTitle(""); setEventDescription("");
    setEventStart(d); setEventEnd(d);
    setEventColor("#4361EE"); setFormError(null);
    setFabOpen(false);
    setShowEventModal(true);
  };

  const handleSaveEvent = () => {
    if (!eventTitle.trim()) { setFormError("Please enter a title"); return; }
    const end = eventEnd < eventStart ? eventStart : eventEnd;
    createEventMutation.mutate({
      title: eventTitle.trim(),
      description: eventDescription.trim() || undefined,
      startDate: eventStart.toISOString(),
      endDate: end.toISOString(),
      color: eventColor,
      allDay: true,
    });
  };

  const currentUserId = session?.user?.id ?? null;
  const activeTeam = teams?.find((t) => t.id === activeTeamId);

  React.useEffect(() => {
    if (filter === "assigned" && !currentUserId) setFilter("all");
  }, [currentUserId, filter]);

  const isMyCreatedTask = (t: Task) => t.creator?.id === currentUserId;
  const isAssignedToMe = (t: Task) =>
    (t.assignments ?? []).some((a) => a.userId === currentUserId) &&
    t.creator?.id !== currentUserId;

  const tasks = allTasks.filter((t) => {
    if (filter === "assigned") { if (!(isAssignedToMe(t) && t.status !== "done")) return false; }
    else if (filter === "completed") { if (!(t.status === "done" && isMyCreatedTask(t))) return false; }
    else { if (!(t.status !== "done" && isMyCreatedTask(t))) return false; }
    if (selectedDay) {
      if (!t.dueDate) return false;
      return new Date(t.dueDate).toISOString().slice(0, 10) === selectedDay;
    }
    return true;
  }).sort((a, b) => {
    if (sort === "priority") {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
    }
    // due date: tasks with no due date go last
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const targetIso = selectedDay ?? new Date().toISOString().slice(0, 10);
  const dayEvents = calendarEvents.filter((ev) => {
    const evStart = startOfDay(new Date(ev.startDate));
    const evEnd = ev.endDate ? startOfDay(new Date(ev.endDate)) : evStart;
    // Parse as local midnight (not UTC) to match startOfDay output
    const [ty, tm, td] = targetIso.split("-").map(Number);
    const target = new Date(ty, tm - 1, td);
    return evStart <= target && target <= evEnd;
  });

  const assignedCount = allTasks.filter((t) =>
    t.creator?.id === currentUserId &&
    (t.assignments ?? []).some((a) => a.userId !== currentUserId)
  ).length;
  const completedCount = allTasks.filter((t) => t.status === "done" && isMyCreatedTask(t)).length;

  const myActiveTasks = allTasks.filter((t) => t.status !== "done" && isMyCreatedTask(t));
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const dueTodayCount = myActiveTasks.filter((t) => t.dueDate && new Date(t.dueDate) >= todayStart && new Date(t.dueDate) <= todayEnd).length;
  const overdueCount = myActiveTasks.filter((t) => t.dueDate && new Date(t.dueDate) < todayStart).length;

  if (!teamsLoading && (!teams || teams.length === 0)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }} testID="no-teams-screen">
        <LinearGradient
          colors={["#4361EE", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>Alenio</Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/profile")}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
            >
              <User size={18} color="white" />
            </TouchableOpacity>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]} testID="tasks-screen">
      {/* Blue/purple gradient header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>Tasks</Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/profile")}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
            >
              <User size={18} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        {/* Mini Calendar */}
        <MiniCalendar tasks={allTasks} events={calendarEvents} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

        {/* Sticky section: stats + filter tabs */}
        <View style={{ backgroundColor: "#F8FAFC" }}>
          {/* Stats pills */}
          <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, gap: 8, flexWrap: "wrap" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "white", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
              <Clock size={13} color="#F59E0B" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#F59E0B" }}>{dueTodayCount} due today</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: overdueCount > 0 ? "#FEF2F2" : "white", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
              <AlertTriangle size={13} color={overdueCount > 0 ? "#EF4444" : "#CBD5E1"} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: overdueCount > 0 ? "#EF4444" : "#CBD5E1" }}>{overdueCount} overdue</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "white", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
              <Text style={{ fontSize: 12, color: "#10B981" }}>✓</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#10B981" }}>{completedCount} done</Text>
            </View>
          </View>

          {/* Filter tabs + sort */}
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", backgroundColor: "#E2E8F0", borderRadius: 12, padding: 4, marginBottom: 8 }}>
              {(["all", "completed", "assigned"] as FilterTab[]).map((f) => (
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
                    {f === "all" ? "All" : f === "assigned" ? "Assigned" : "Completed"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <ArrowUpDown size={12} color="#94A3B8" />
              <Text style={{ fontSize: 12, color: "#94A3B8", marginRight: 6 }}>Sort:</Text>
              {(["due", "priority"] as SortMode[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSort(s)}
                  style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: sort === s ? "#4361EE" : "#F1F5F9" }}
                  testID={`sort-${s}`}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: sort === s ? "white" : "#64748B" }}>
                    {s === "due" ? "Due Date" : "Priority"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Events + Task list */}
        {isLoading ? (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }} testID="loading-indicator">
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : (
          <>
            {dayEvents.length > 0 ? (
              <>
                <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.5 }}>Events</Text>
                </View>
                {dayEvents.map((ev) => <EventRow key={ev.id} event={ev} />)}
                {tasks.length > 0 ? (
                  <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>Tasks</Text>
                  </View>
                ) : null}
              </>
            ) : null}
            {tasks.length === 0 && dayEvents.length === 0 ? (
              <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 }} testID="empty-state">
                <Text style={{ fontSize: 40, marginBottom: 12 }}>✓</Text>
                <Text style={{ fontSize: 17, fontWeight: "600", color: "#94A3B8" }}>
                  {selectedDay ? "Nothing scheduled this day" : filter === "completed" ? "No completed tasks" : "No tasks yet"}
                </Text>
                {filter === "all" && !selectedDay ? (
                  <Text style={{ color: "#CBD5E1", fontSize: 13, marginTop: 4, textAlign: "center" }}>
                    Tap the + button to create your first task or event
                  </Text>
                ) : null}
              </View>
            ) : null}
            {tasks.map((item) => (
              <TaskRow
                key={item.id}
                task={item}
                onToggle={() => toggleMutation.mutate(item)}
                onPress={() => router.push({ pathname: "/task-detail", params: { taskId: item.id, teamId: activeTeamId! } })}
              />
            ))}
          </>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB */}
      {activeTeamId ? (
        <>
          {/* Scrim */}
          {fabOpen ? (
            <Pressable onPress={() => setFabOpen(false)} style={{ position: "absolute", inset: 0 }} />
          ) : null}

          {/* FAB menu options */}
          {fabOpen ? (
            <View style={{ position: "absolute", bottom: 100, right: 24, gap: 12, alignItems: "flex-end" }}>
              <TouchableOpacity
                onPress={() => { setFabOpen(false); router.push({ pathname: "/create-task", params: { teamId: activeTeamId } }); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "white", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
                testID="fab-new-task"
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>New Task</Text>
                <CheckSquare size={20} color="#4361EE" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openEventModal}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "white", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
                testID="fab-new-event"
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>New Event</Text>
                <CalendarDays size={20} color="#7C3AED" />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Main FAB */}
          <TouchableOpacity
            style={{
              position: "absolute", bottom: 32, right: 24,
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: fabOpen ? "#7C3AED" : "#4361EE",
              alignItems: "center", justifyContent: "center",
              shadowColor: "#4361EE", shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
            }}
            onPress={() => setFabOpen((o) => !o)}
            testID="create-task-button"
          >
            <Plus size={24} color="white" style={{ transform: [{ rotate: fabOpen ? "45deg" : "0deg" }] }} />
          </TouchableOpacity>
        </>
      ) : null}

      {/* New Event Modal */}
      <Modal visible={showEventModal} transparent animationType="slide" onRequestClose={() => setShowEventModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setShowEventModal(false)} />
          <Pressable style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }} onPress={(e) => e.stopPropagation()}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 8, marginBottom: 16 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingHorizontal: 20 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>New Event</Text>
              <Pressable onPress={() => setShowEventModal(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
                <X size={16} color="#64748B" />
              </Pressable>
            </View>

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
                  <Pressable onPress={() => setShowStartPicker(true)} style={{ borderWidth: 1.5, borderColor: "#4361EE", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#4361EE0D" }}>
                    <Calendar size={13} color="#4361EE" />
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#4361EE", marginLeft: 6 }}>
                      {eventStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>End Date</Text>
                  <Pressable onPress={() => setShowEndPicker(true)} style={{ borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#7C3AED0D" }}>
                    <Calendar size={13} color="#7C3AED" />
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#7C3AED", marginLeft: 6 }}>
                      {eventEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {showStartPicker && Platform.OS === "ios" ? (
                <Modal visible transparent animationType="slide">
                  <View style={{ flex: 1, justifyContent: "flex-end" }}>
                    <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                        <Pressable onPress={() => setShowStartPicker(false)}><Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text></Pressable>
                        <Pressable onPress={() => setShowStartPicker(false)}><Text style={{ color: "#4361EE", fontWeight: "600", fontSize: 15 }}>Done</Text></Pressable>
                      </View>
                      <DateTimePicker value={eventStart} mode="date" display="inline" onChange={(_e, d) => { if (d) { setEventStart(d); if (d > eventEnd) setEventEnd(d); } }} />
                      <View style={{ height: 20 }} />
                    </View>
                  </View>
                </Modal>
              ) : showStartPicker ? (
                <DateTimePicker value={eventStart} mode="date" display="default" onChange={(_e, d) => { setShowStartPicker(false); if (d) { setEventStart(d); if (d > eventEnd) setEventEnd(d); } }} />
              ) : null}

              {showEndPicker && Platform.OS === "ios" ? (
                <Modal visible transparent animationType="slide">
                  <View style={{ flex: 1, justifyContent: "flex-end" }}>
                    <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                        <Pressable onPress={() => setShowEndPicker(false)}><Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text></Pressable>
                        <Pressable onPress={() => setShowEndPicker(false)}><Text style={{ color: "#7C3AED", fontWeight: "600", fontSize: 15 }}>Done</Text></Pressable>
                      </View>
                      <DateTimePicker value={eventEnd} mode="date" display="inline" onChange={(_e, d) => { if (d) setEventEnd(d); }} />
                      <View style={{ height: 20 }} />
                    </View>
                  </View>
                </Modal>
              ) : showEndPicker ? (
                <DateTimePicker value={eventEnd} mode="date" display="default" onChange={(_e, d) => { setShowEndPicker(false); if (d) setEventEnd(d); }} />
              ) : null}

              {formError ? <Text style={{ color: "#EF4444", fontSize: 13, marginBottom: 12 }}>{formError}</Text> : null}

              <TouchableOpacity
                onPress={handleSaveEvent}
                disabled={createEventMutation.isPending}
                style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
                testID="save-event-button"
              >
                {createEventMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>Save Event</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
