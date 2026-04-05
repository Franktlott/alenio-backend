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
import { Plus, User, ArrowUpDown, ChevronLeft, ChevronRight, X, CalendarDays, CheckSquare, Calendar, Lock } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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

// Always use local date parts — toISOString() returns UTC which shifts the date in UTC+ timezones
function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
      .map((t) => toLocalIso(new Date(t.dueDate!)))
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
                const iso = toLocalIso(day);
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
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: pressed && onLongPress ? "#F8FAFC" : "white",
        flexDirection: "row",
        alignItems: "center",
      })}
    >
      <View style={{ width: 4, borderRadius: 2, alignSelf: "stretch", backgroundColor: event.color, marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", marginBottom: 3 }} numberOfLines={1}>{event.title}</Text>
        {event.description ? (
          <Text numberOfLines={1} style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>{event.description}</Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <CalendarDays size={11} color="#7C3AED" />
          <Text style={{ fontSize: 11, color: "#7C3AED", fontWeight: "500" }}>{dateText}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function TaskRow({ task, onToggle, onPress }: { task: Task; onToggle: () => void; onPress: () => void }) {
  const isDone = task.status === "done";
  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;

  const fmt = (d: string | Date) =>
    new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const completedDate = isDone ? (task.completedAt ?? task.updatedAt) : null;
  const dueDate = task.dueDate ?? null;
  const wasLate = isDone && dueDate && task.completedAt
    ? new Date(task.completedAt) > new Date(dueDate)
    : false;

  const getDueInfo = (): { date: string; overdue: boolean; today: boolean; completed: boolean } | null => {
    if (isDone) return null; // handled separately below
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const overdue = dueStart < todayStart;
    const today = dueStart.getTime() === todayStart.getTime();
    const date = fmt(due);
    return { date, overdue, today, completed: false };
  };

  const dueInfo = getDueInfo();

  return (
    <Pressable
      onPress={onPress}
      style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", backgroundColor: "white", flexDirection: "row", alignItems: "center" }}
      testID="task-row"
    >
      {/* Checkbox */}
      <TouchableOpacity
        onPress={onToggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginRight: 10 }}
      >
        {isDone ? (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontSize: 11, fontWeight: "bold" }}>✓</Text>
          </View>
        ) : (
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#CBD5E1" }} />
        )}
      </TouchableOpacity>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 }}>
          {task.incognito ? <Text style={{ fontSize: 13 }}>🕵️</Text> : null}
          <Text
            numberOfLines={1}
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: isDone ? "#94A3B8" : "#0F172A",
              textDecorationLine: isDone ? "line-through" : "none",
              flex: 1,
            }}
          >
            {task.title}
          </Text>
        </View>

        {/* Meta row */}
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          {/* Priority */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: priority.bg }}>
            <Text style={{ fontSize: 10, marginRight: 2, color: priority.flagColor }}>⚑</Text>
            <Text style={{ fontSize: 10, fontWeight: "600", color: priority.text }}>{priority.label}</Text>
          </View>

          {/* Assignee */}
          {task.assignments?.[0]?.user ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, overflow: "hidden", backgroundColor: "#E0E7FF", alignItems: "center", justifyContent: "center" }}>
                {task.assignments[0].user.image ? (
                  <Image source={{ uri: task.assignments[0].user.image }} style={{ width: 14, height: 14 }} resizeMode="cover" />
                ) : (
                  <Text style={{ fontSize: 7, fontWeight: "700", color: "#4361EE" }}>
                    {task.assignments[0].user.name?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 10, color: "#94A3B8" }}>
                {task.assignments[0].user.name ?? task.assignments[0].user.email ?? "Unknown"}
                {task.assignments.length > 1 ? ` +${task.assignments.length - 1}` : ""}
              </Text>
            </View>
          ) : null}

          {/* Due / completion dates */}
          {isDone ? (
            <>
              {wasLate ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FEF2F2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, color: "#EF4444", fontWeight: "600" }}>⚠ Late</Text>
                </View>
              ) : null}
              {dueDate ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Text style={{ fontSize: 10, color: "#94A3B8" }}>⏱</Text>
                  <Text style={{ fontSize: 10, color: "#94A3B8" }}>Due {fmt(dueDate)}</Text>
                </View>
              ) : null}
              {completedDate ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Text style={{ fontSize: 10, color: wasLate ? "#EF4444" : "#10B981" }}>✓</Text>
                  <Text style={{ fontSize: 10, color: wasLate ? "#EF4444" : "#10B981" }}>Done {fmt(completedDate)}</Text>
                </View>
              ) : null}
            </>
          ) : dueInfo ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Text style={{ fontSize: 10, color: dueInfo.overdue ? "#EF4444" : dueInfo.today ? "#F59E0B" : "#64748B" }}>⏱</Text>
              <Text style={{
                fontSize: 10,
                fontWeight: dueInfo.overdue ? "600" : "400",
                color: dueInfo.overdue ? "#EF4444" : dueInfo.today ? "#F59E0B" : "#64748B",
              }}>
                {dueInfo.today ? `Today · ${dueInfo.date}` : dueInfo.overdue ? `Overdue · ${dueInfo.date}` : dueInfo.date}
              </Text>
            </View>
          ) : null}

          {/* Recurrence */}
          {task.recurrenceRule && !isDone ? (
            <Text style={{ fontSize: 10, color: "#818CF8" }}>↺ {task.recurrenceRule.type}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortMode>("due");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [teamCompletedExpanded, setTeamCompletedExpanded] = useState(false);
  const [confirmCompleteTask, setConfirmCompleteTask] = useState<Task | null>(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState<{ count: number; userName: string } | null>(null);
  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
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

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["tasks", activeTeamId, "mine"] });
    await queryClient.invalidateQueries({ queryKey: ["tasks", activeTeamId, "team"] });
    await queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
    setRefreshing(false);
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
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ["tasks", activeTeamId, "mine"],
    queryFn: () => api.get<Task[]>(`/api/teams/${activeTeamId}/tasks?myTasks=true`),
    enabled: !!activeTeamId,
  });

  // Tasks I created — used for Team tab (will filter client-side for assigned-to-others)
  const { data: teamTasks = [] } = useQuery({
    queryKey: ["tasks", activeTeamId, "team"],
    queryFn: () => api.get<Task[]>(`/api/teams/${activeTeamId}/tasks?creatorId=me`),
    enabled: !!activeTeamId && filter === "assigned",
  });

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
  const isPro = subscription?.plan === "pro";

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
    },
  });

  const handleToggleTask = (task: Task) => {
    // Always confirm before toggling either direction
    setConfirmCompleteTask(task);
  };

  const createEventMutation = useMutation({
    mutationFn: (data: object) =>
      api.post(`/api/teams/${activeTeamId}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      setShowEventModal(false);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE");
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch(`/api/teams/${activeTeamId}/events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      setShowEventModal(false);
      setEditingEvent(null);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE");
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/teams/${activeTeamId}/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      setShowEventModal(false);
      setEditingEvent(null);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE");
    },
  });

  const openEventModal = () => {
    setEditingEvent(null);
    const d = selectedDay ? new Date(selectedDay) : new Date();
    setEventTitle(""); setEventDescription("");
    setEventStart(d); setEventEnd(d);
    setEventColor("#4361EE"); setFormError(null);
    setShowEventModal(true);
  };

  const openEditEventModal = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    setEventTitle(ev.title);
    setEventDescription(ev.description ?? "");
    setEventStart(new Date(ev.startDate));
    setEventEnd(ev.endDate ? new Date(ev.endDate) : new Date(ev.startDate));
    setEventColor(ev.color);
    setFormError(null);
    setConfirmDeleteEvent(false);
    setShowEventModal(true);
  };

  const handleSaveEvent = () => {
    if (!eventTitle.trim()) { setFormError("Please enter a title"); return; }
    const end = eventEnd < eventStart ? eventStart : eventEnd;
    if (editingEvent) {
      updateEventMutation.mutate({
        id: editingEvent.id,
        data: {
          title: eventTitle.trim(),
          description: eventDescription.trim() || undefined,
          startDate: eventStart.toISOString(),
          endDate: end.toISOString(),
          color: eventColor,
        },
      });
    } else {
      createEventMutation.mutate({
        title: eventTitle.trim(),
        description: eventDescription.trim() || undefined,
        startDate: eventStart.toISOString(),
        endDate: end.toISOString(),
        color: eventColor,
        allDay: true,
      });
    }
  };

  const currentUserId = session?.user?.id ?? null;
  const isOwner = teams?.find((t) => t.id === activeTeamId)?.role === "owner";

  React.useEffect(() => {
    if (filter === "assigned" && !currentUserId) setFilter("all");
  }, [currentUserId, filter]);

  // Active: tasks assigned to me (or mine with no assignment), open
  // Completed: same pool, done only
  // Team: tasks I created that are assigned to someone else, open
  const tasks = (filter === "assigned" ? teamTasks : allTasks).filter((t) => {
    if (filter === "assigned") {
      // Show tasks I created that have at least one assignment to someone other than me
      if ((t.assignments ?? []).length === 0) return false;
      if (!(t.assignments ?? []).some((a) => a.userId !== currentUserId)) return false;
      if (t.status === "done") return false;
    } else if (filter === "completed") {
      if (t.status !== "done") return false;
    } else {
      if (t.status === "done") return false;
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

  const targetIso = selectedDay ?? toLocalIso(new Date());
  const dayEvents = calendarEvents.filter((ev) => {
    const evStart = startOfDay(new Date(ev.startDate));
    const evEnd = ev.endDate ? startOfDay(new Date(ev.endDate)) : evStart;
    // Parse as local midnight (not UTC) to match startOfDay output
    const [ty, tm, td] = targetIso.split("-").map(Number);
    const target = new Date(ty, tm - 1, td);
    return evStart <= target && target <= evEnd;
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

  if (!teamsLoading && (!teams || teams.length === 0)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }} testID="no-teams-screen">
        <LinearGradient
          colors={["#4361EE", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Alenio</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Image source={require("@/assets/alenio-icon.png")} style={{ width: 30, height: 30, borderRadius: 6 }} />
            </View>
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
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Tasks</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {activeTeamId ? (
                <Pressable
                  onPress={() => setShowAddModal(true)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 }}
                  testID="header-add-button"
                >
                  <Plus size={15} color="white" />
                  <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>Add</Text>
                </Pressable>
              ) : null}
              <Image source={require("@/assets/alenio-icon.png")} style={{ width: 30, height: 30, borderRadius: 6 }} />
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} stickyHeaderIndices={[2]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />}>
        {/* Mini Calendar */}
        <MiniCalendar tasks={allTasks} events={calendarEvents} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

        {/* Events section — below calendar, above filter tabs */}
        {dayEvents.length > 0 ? (
          <View style={{ marginHorizontal: 16, marginTop: 10, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <View style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "white" }}>
              <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <CalendarDays size={13} color="#7C3AED" />
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.5 }}>Events</Text>
              </View>
              {dayEvents.map((ev, i) => (
                <View key={ev.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#F1F5F9" }}>
                  <EventRow event={ev} onLongPress={isOwner ? () => openEditEventModal(ev) : undefined} />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Sticky section: filter tabs + sort */}
        <View style={{ backgroundColor: "#F8FAFC", paddingTop: 10 }}>
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
                    {f === "all" ? "Active" : f === "assigned" ? "Team" : "Completed"}
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

        {/* Task list — paywall if not pro */}
        {activeTeamId && isPro === false ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 48 }} testID="task-paywall">
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Lock size={32} color="#4361EE" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 8 }}>
              Task Manager
            </Text>
            <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 28, lineHeight: 20 }}>
              Upgrade to Alenio Pro to access the task manager
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/subscription")}
              testID="task-paywall-upgrade-button"
              style={{
                borderRadius: 14,
                overflow: "hidden",
                shadowColor: "#4361EE",
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 5,
              }}
            >
              <LinearGradient
                colors={["#4361EE", "#7C3AED"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ paddingHorizontal: 28, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Upgrade Now</Text>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15 }}>→</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : isLoading ? (
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
          tasks.map((item) => (
            <TaskRow
              key={item.id}
              task={item}
              onToggle={() => handleToggleTask(item)}
              onPress={() => router.push({ pathname: "/task-detail", params: { taskId: item.id, teamId: activeTeamId! } })}
            />
          ))
        )}

        {/* Team tab: collapsed completed section */}
        {filter === "assigned" && teamCompletedTasks.length > 0 && isPro !== false ? (
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
              />
            )) : null}
          </View>
        ) : null}

        <View style={{ height: insets.bottom + 88 }} />
      </ScrollView>

      {/* Task completion confirmation modal */}
      {confirmCompleteTask ? (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", zIndex: 100 }} testID="complete-confirm-overlay">
          <View style={{ backgroundColor: "white", borderRadius: 20, marginHorizontal: 32, padding: 24, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12, width: "85%" }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: confirmCompleteTask.status === "done" ? "#FEF3C7" : "#D1FAE5", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 }}>
              <Text style={{ fontSize: 22 }}>{confirmCompleteTask.status === "done" ? "↩" : "✓"}</Text>
            </View>
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

      {/* Add choice modal */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowAddModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 8 }} />
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", marginBottom: 4 }}>What would you like to add?</Text>
            {isOwner ? (
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
            <Pressable
              onPress={() => { setShowAddModal(false); router.push({ pathname: "/create-task", params: { teamId: activeTeamId! } }); }}
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
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>{editingEvent ? "Edit Event" : "New Event"}</Text>
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
              <View style={{ backgroundColor: "#FFFBEB", borderRadius: 26, padding: 28, alignItems: "center", gap: 12 }}>
                {/* Trophy */}
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 36 }}>🏆</Text>
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
    </SafeAreaView>
  );
}
