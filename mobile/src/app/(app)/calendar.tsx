import React, { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Pressable,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ChevronLeft, ChevronRight, Plus, X, Calendar, Trash2, CheckCircle2, Circle, Clock } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";
import type { Task, Team } from "@/lib/types";

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  allDay: boolean;
  color: string;
  teamId: string;
  createdById: string;
  createdAt: string;
};

type WeekBar = {
  id: string;
  title: string;
  color: string;
  startCol: number;
  endCol: number;
};

const EVENT_COLORS = ["#4361EE", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];
const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDaysInMonth(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];

  // Pad start with trailing days from previous month
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push(new Date(year, month - 1, prevMonthDays - i));
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  // Pad end with leading days from next month to complete the last week
  const remaining = days.length % 7;
  if (remaining !== 0) {
    for (let d = 1; d <= 7 - remaining; d++) {
      days.push(new Date(year, month + 1, d));
    }
  }

  return days;
}

function isCurrentMonth(day: Date, month: Date): boolean {
  return day.getFullYear() === month.getFullYear() && day.getMonth() === month.getMonth();
}

// Compute spanning event bars for a week row
function computeWeekBars(week: Date[], events: CalendarEvent[]): WeekBar[][] {
  const bars: WeekBar[] = [];

  for (const event of events) {
    const evStart = startOfDay(new Date(event.startDate));
    const evEnd = event.endDate ? startOfDay(new Date(event.endDate)) : evStart;

    // Find which columns in this week the event covers
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
    if (startCol === -1) continue; // event doesn't touch this week

    bars.push({ id: event.id, title: event.title, color: event.color, startCol, endCol });
  }

  // Sort: longer spans first so they get top tracks
  bars.sort((a, b) => (b.endCol - b.startCol) - (a.endCol - a.startCol) || a.startCol - b.startCol);

  // Greedy track assignment — no two bars in the same track can overlap
  const tracks: WeekBar[][] = [];
  for (const bar of bars) {
    let placed = false;
    for (const track of tracks) {
      const overlaps = track.some((b) => b.startCol <= bar.endCol && b.endCol >= bar.startCol);
      if (!overlaps) {
        track.push(bar);
        placed = true;
        break;
      }
    }
    if (!placed) tracks.push([bar]);
  }

  return tracks;
}

export default function CalendarScreen() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [weekRowWidth, setWeekRowWidth] = useState(0);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form state
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStart, setEventStart] = useState<Date>(new Date());
  const [eventEnd, setEventEnd] = useState<Date>(new Date());
  const [eventColor, setEventColor] = useState("#4361EE");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const currentUserId = session?.user?.id ?? null;

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  const activeTeam = teams?.find((t) => t.id === activeTeamId);
  const isOwner = (activeTeam as (Team & { role?: string }) | undefined)?.role === "owner";

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["calendar-events", activeTeamId],
    queryFn: () => api.get<CalendarEvent[]>(`/api/teams/${activeTeamId}/events`),
    enabled: !!activeTeamId,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", activeTeamId],
    queryFn: () => api.get<Task[]>(`/api/teams/${activeTeamId}/tasks`),
    enabled: !!activeTeamId,
  });

  const myTasks = tasks.filter((t) =>
    t.assignments?.some((a) => a.userId === currentUserId)
  );

  const upcomingTasks = [...myTasks]
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      api.post<CalendarEvent>(`/api/teams/${activeTeamId}/events`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] }); closeModal(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch<CalendarEvent>(`/api/teams/${activeTeamId}/events/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] }); closeModal(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/teams/${activeTeamId}/events/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] }); closeModal(); },
  });

  const openAddModal = (date?: Date) => {
    const d = date ?? selectedDate ?? new Date();
    setEditingEvent(null);
    setEventTitle(""); setEventDescription("");
    setEventStart(d); setEventEnd(d);
    setEventColor("#4361EE"); setFormError(null);
    setShowEventModal(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEventTitle(event.title);
    setEventDescription(event.description ?? "");
    setEventStart(new Date(event.startDate));
    setEventEnd(event.endDate ? new Date(event.endDate) : new Date(event.startDate));
    setEventColor(event.color); setFormError(null);
    setShowEventModal(true);
  };

  const closeModal = () => {
    setShowEventModal(false); setEditingEvent(null);
    setShowStartPicker(false); setShowEndPicker(false); setFormError(null);
  };

  const handleSave = () => {
    if (!eventTitle.trim()) { setFormError("Please enter an event title"); return; }
    const end = eventEnd < eventStart ? eventStart : eventEnd;
    const payload = {
      title: eventTitle.trim(),
      description: eventDescription.trim() || undefined,
      startDate: eventStart.toISOString(),
      endDate: end.toISOString(),
      color: eventColor,
      allDay: true,
    };
    if (editingEvent) updateMutation.mutate({ id: editingEvent.id, data: payload });
    else createMutation.mutate(payload);
  };

  const prevMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const getEventsForDay = (day: Date) =>
    events.filter((e) => {
      const s = startOfDay(new Date(e.startDate));
      const en = e.endDate ? startOfDay(new Date(e.endDate)) : s;
      const d = startOfDay(day);
      return d >= s && d <= en;
    });

  const getTasksForDay = (day: Date): Task[] =>
    myTasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), day));

  const days = getDaysInMonth(currentMonth);
  const today = new Date();

  // Group into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const selectedEvents = selectedDate ? getEventsForDay(selectedDate) : [];
  const selectedTasks = selectedDate ? getTasksForDay(selectedDate) : [];
  const isLoading = eventsLoading || tasksLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]} testID="calendar-screen">
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable onPress={prevMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }} testID="prev-month-button">
              <ChevronLeft size={20} color="white" />
            </Pressable>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
            <Pressable onPress={nextMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }} testID="next-month-button">
              <ChevronRight size={20} color="white" />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Calendar grid */}
        <View style={{ backgroundColor: "white", marginHorizontal: 12, marginTop: 12, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: "hidden" }}>
          {/* Day of week headers */}
          <View style={{ flexDirection: "row", paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            {DAYS_OF_WEEK.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8" }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Week rows */}
          {weeks.map((week, weekIndex) => {
            const tracks = computeWeekBars(week, events);
            const numTracks = tracks.length;
            const rowHeight = 32 + numTracks * 18 + 6;

            return (
              <View
                key={weekIndex}
                onLayout={(e) => {
                  if (weekRowWidth === 0) setWeekRowWidth(e.nativeEvent.layout.width);
                }}
                style={{
                  flexDirection: "column",
                  borderTopWidth: weekIndex === 0 ? 0 : 0.5,
                  borderTopColor: "#F1F5F9",
                  minHeight: rowHeight,
                }}
              >
                {/* Day number row */}
                <View style={{ flexDirection: "row" }}>
                  {week.map((day, dayIndex) => {
                    const inMonth = isCurrentMonth(day, currentMonth);
                    const isToday = isSameDay(day, today);
                    const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                    const hasTask = inMonth ? getTasksForDay(day).length > 0 : false;

                    return (
                      <Pressable
                        key={dayIndex}
                        onPress={() => setSelectedDate(day)}
                        style={{
                          flex: 1,
                          borderLeftWidth: dayIndex === 0 ? 0 : 0.5,
                          borderLeftColor: "#F1F5F9",
                          paddingTop: 4,
                          paddingBottom: 2,
                          alignItems: "center",
                          backgroundColor: isSelected && !isToday ? "#F5F7FF" : "white",
                        }}
                        testID={`calendar-day-${day.getDate()}`}
                      >
                        <View style={{
                          width: 26, height: 26, borderRadius: 13,
                          backgroundColor: isToday ? "#4361EE" : "transparent",
                          alignItems: "center", justifyContent: "center",
                          borderWidth: isSelected && !isToday ? 1.5 : 0,
                          borderColor: "#4361EE",
                        }}>
                          <Text style={{
                            fontSize: 12,
                            fontWeight: isToday || isSelected ? "700" : "400",
                            color: isToday ? "white" : isSelected ? "#4361EE" : inMonth ? "#334155" : "#CBD5E1",
                          }}>
                            {day.getDate()}
                          </Text>
                        </View>
                        {/* Task dot */}
                        {hasTask && !isToday ? (
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#10B981", marginTop: 2 }} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Event tracks — spanning bars */}
                {tracks.map((track, trackIndex) => (
                  <View key={trackIndex} style={{ flexDirection: "row", height: 16, marginBottom: 2 }}>
                    {week.map((day, colIndex) => {
                      const bar = track.find((b) => b.startCol <= colIndex && b.endCol >= colIndex);

                      if (!bar) {
                        return <View key={colIndex} style={{ flex: 1, borderLeftWidth: colIndex === 0 ? 0 : 0, borderLeftColor: "transparent" }} />;
                      }

                      const isBarStart = colIndex === bar.startCol;
                      const isBarEnd = colIndex === bar.endCol;

                      return (
                        <Pressable
                          key={colIndex}
                          onPress={() => isOwner ? openEditModal(events.find(e => e.id === bar.id)!) : null}
                          style={{
                            flex: 1,
                            height: 14,
                            backgroundColor: bar.color,
                            borderTopLeftRadius: isBarStart ? 3 : 0,
                            borderBottomLeftRadius: isBarStart ? 3 : 0,
                            borderTopRightRadius: isBarEnd ? 3 : 0,
                            borderBottomRightRadius: isBarEnd ? 3 : 0,
                            marginLeft: isBarStart ? 2 : 0,
                            marginRight: isBarEnd ? 2 : 0,
                            justifyContent: "center",
                            overflow: "hidden",
                          }}
                        />
                      );
                    })}
                    {/* Title overlays — one per bar, spanning full bar width */}
                    {track.map((bar) => {
                      if (weekRowWidth === 0) return null;
                      const colWidth = weekRowWidth / 7;
                      const left = bar.startCol * colWidth + 2; // +2 for marginLeft
                      const width = (bar.endCol - bar.startCol + 1) * colWidth - 4; // -4 for margins
                      return (
                        <View
                          key={`title-${bar.id}`}
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            left,
                            width,
                            top: 0,
                            height: 14,
                            justifyContent: "center",
                            overflow: "hidden",
                          }}
                        >
                          <Text style={{ color: "white", fontSize: 9, fontWeight: "600", paddingHorizontal: 4, lineHeight: 13 }} numberOfLines={1}>
                            {bar.title}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 10, gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 20, height: 8, borderRadius: 2, backgroundColor: "#4361EE" }} />
            <Text style={{ fontSize: 11, color: "#64748B" }}>Team events</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" }} />
            <Text style={{ fontSize: 11, color: "#64748B" }}>Your tasks</Text>
          </View>
        </View>

        {/* Selected day panel */}
        {selectedDate ? (
          <View style={{ marginHorizontal: 12, marginTop: 12, marginBottom: 100 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </Text>
              {isOwner ? (
                <Pressable onPress={() => openAddModal(selectedDate)} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#4361EE", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }} testID="add-event-button">
                  <Plus size={14} color="white" />
                  <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>Add Event</Text>
                </Pressable>
              ) : null}
            </View>

            {isLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }} testID="loading-indicator">
                <ActivityIndicator color="#4361EE" />
              </View>
            ) : selectedEvents.length === 0 && selectedTasks.length === 0 ? (
              <View style={{ backgroundColor: "white", borderRadius: 14, padding: 24, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }} testID="empty-day-state">
                <Calendar size={28} color="#CBD5E1" />
                <Text style={{ color: "#94A3B8", marginTop: 8, fontSize: 14 }}>Nothing scheduled</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {selectedEvents.map((event) => (
                  <Pressable
                    key={event.id}
                    onPress={() => isOwner ? openEditModal(event) : null}
                    style={{ backgroundColor: "white", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: event.color, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
                    testID={`event-item-${event.id}`}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", flex: 1 }} numberOfLines={1}>{event.title}</Text>
                      <View style={{ backgroundColor: event.color + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: event.color }}>
                          {event.endDate && !isSameDay(new Date(event.startDate), new Date(event.endDate))
                            ? `${new Date(event.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(event.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                            : "Event"}
                        </Text>
                      </View>
                    </View>
                    {event.description ? (
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }} numberOfLines={2}>{event.description}</Text>
                    ) : null}
                    {isOwner ? <Text style={{ fontSize: 11, color: "#CBD5E1", marginTop: 6 }}>Tap to edit</Text> : null}
                  </Pressable>
                ))}

                {selectedTasks.map((task) => (
                  <View key={task.id} style={{ backgroundColor: "white", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: "#10B981", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }} testID={`task-item-${task.id}`}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: task.status === "done" ? "#94A3B8" : "#0F172A", flex: 1, textDecorationLine: task.status === "done" ? "line-through" : "none" }} numberOfLines={1}>{task.title}</Text>
                      <View style={{ backgroundColor: task.status === "done" ? "#D1FAE5" : "#F0FDF4", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: "#10B981" }}>{task.status === "done" ? "Done" : "Task"}</Text>
                      </View>
                    </View>
                    {task.description ? <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }} numberOfLines={2}>{task.description}</Text> : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* Upcoming Tasks */}
        <View style={{ marginHorizontal: 12, marginTop: 24, marginBottom: 110 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>Upcoming Tasks</Text>
            <Text style={{ fontSize: 12, color: "#94A3B8" }}>{upcomingTasks.length} remaining</Text>
          </View>

          {tasksLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <ActivityIndicator color="#10B981" />
            </View>
          ) : upcomingTasks.length === 0 ? (
            <View style={{ backgroundColor: "white", borderRadius: 14, padding: 24, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
              <CheckCircle2 size={28} color="#CBD5E1" />
              <Text style={{ color: "#94A3B8", marginTop: 8, fontSize: 14 }}>All caught up!</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {upcomingTasks.map((task) => {
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
                const dueDateLabel = task.dueDate
                  ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : null;
                const priorityColor = task.priority === "urgent" ? "#EF4444" : task.priority === "high" ? "#F97316" : task.priority === "medium" ? "#EAB308" : "#94A3B8";

                return (
                  <Pressable
                    key={task.id}
                    onPress={() => router.push({ pathname: "/task-detail", params: { taskId: task.id, teamId: task.teamId } })}
                    style={{ backgroundColor: "white", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: priorityColor, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
                    testID={`upcoming-task-${task.id}`}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Circle size={18} color="#CBD5E1" />
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", flex: 1 }} numberOfLines={1}>{task.title}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8, marginLeft: 28 }}>
                      {dueDateLabel ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: isOverdue ? "#FEF2F2" : "#F8FAFC", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                          <Clock size={11} color={isOverdue ? "#EF4444" : "#94A3B8"} />
                          <Text style={{ fontSize: 11, fontWeight: "500", color: isOverdue ? "#EF4444" : "#64748B" }}>{dueDateLabel}</Text>
                        </View>
                      ) : null}
                      <View style={{ backgroundColor: priorityColor + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: priorityColor, textTransform: "capitalize" }}>{task.priority}</Text>
                      </View>
                      {task.team ? (
                        <Text style={{ fontSize: 11, color: "#94A3B8" }} numberOfLines={1}>{task.team.name}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      {isOwner && activeTeamId ? (
        <Pressable onPress={() => openAddModal()} style={{ position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center", shadowColor: "#4361EE", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 }} testID="fab-add-event">
          <Plus size={24} color="white" />
        </Pressable>
      ) : null}

      {/* Add/Edit Event Modal */}
      <Modal visible={showEventModal} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={closeModal} testID="modal-backdrop">
            <Pressable style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }} onPress={(e) => e.stopPropagation()} testID="event-modal">
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>{editingEvent ? "Edit Event" : "New Event"}</Text>
                <Pressable onPress={closeModal} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }} testID="close-modal-button">
                  <X size={16} color="#64748B" />
                </Pressable>
              </View>

              {/* Title */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Title</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 14 }}
                placeholder="Event title..."
                placeholderTextColor="#CBD5E1"
                value={eventTitle}
                onChangeText={(t) => { setEventTitle(t); setFormError(null); }}
                testID="event-title-input"
              />

              {/* Description */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Description (optional)</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#0F172A", marginBottom: 14, minHeight: 60, textAlignVertical: "top" }}
                placeholder="Add a description..."
                placeholderTextColor="#CBD5E1"
                value={eventDescription}
                onChangeText={setEventDescription}
                multiline
                numberOfLines={2}
                testID="event-description-input"
              />

              {/* Start / End dates */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Start Date</Text>
                  <Pressable onPress={() => setShowStartPicker(true)} style={{ borderWidth: 1.5, borderColor: "#4361EE", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#4361EE0D" }} testID="event-start-date-button">
                    <Calendar size={13} color="#4361EE" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#4361EE" }}>
                      {eventStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>End Date</Text>
                  <Pressable onPress={() => setShowEndPicker(true)} style={{ borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#7C3AED0D" }} testID="event-end-date-button">
                    <Calendar size={13} color="#7C3AED" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#7C3AED" }}>
                      {eventEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* iOS date pickers */}
              {Platform.OS === "ios" ? (
                <>
                  <Modal visible={showStartPicker} transparent animationType="slide">
                    <View style={{ flex: 1, justifyContent: "flex-end" }}>
                      <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                          <Pressable onPress={() => setShowStartPicker(false)}><Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text></Pressable>
                          <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>Start Date</Text>
                          <Pressable onPress={() => setShowStartPicker(false)}><Text style={{ color: "#4361EE", fontWeight: "600", fontSize: 15 }}>Done</Text></Pressable>
                        </View>
                        <DateTimePicker value={eventStart} mode="date" display="inline" onChange={(_e, d) => { if (d) { setEventStart(d); if (d > eventEnd) setEventEnd(d); } }} testID="start-date-picker" />
                        <View style={{ height: 20 }} />
                      </View>
                    </View>
                  </Modal>
                  <Modal visible={showEndPicker} transparent animationType="slide">
                    <View style={{ flex: 1, justifyContent: "flex-end" }}>
                      <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                          <Pressable onPress={() => setShowEndPicker(false)}><Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text></Pressable>
                          <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>End Date</Text>
                          <Pressable onPress={() => setShowEndPicker(false)}><Text style={{ color: "#7C3AED", fontWeight: "600", fontSize: 15 }}>Done</Text></Pressable>
                        </View>
                        <DateTimePicker value={eventEnd} mode="date" display="inline" minimumDate={eventStart} onChange={(_e, d) => { if (d) setEventEnd(d); }} testID="end-date-picker" />
                        <View style={{ height: 20 }} />
                      </View>
                    </View>
                  </Modal>
                </>
              ) : (
                <>
                  {showStartPicker ? <DateTimePicker value={eventStart} mode="date" display="calendar" onChange={(_e, d) => { setShowStartPicker(false); if (d) { setEventStart(d); if (d > eventEnd) setEventEnd(d); } }} testID="start-date-picker" /> : null}
                  {showEndPicker ? <DateTimePicker value={eventEnd} mode="date" display="calendar" minimumDate={eventStart} onChange={(_e, d) => { setShowEndPicker(false); if (d) setEventEnd(d); }} testID="end-date-picker" /> : null}
                </>
              )}

              {/* Color picker */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 10 }}>Color</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                {EVENT_COLORS.map((color) => (
                  <Pressable key={color} onPress={() => setEventColor(color)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color, borderWidth: eventColor === color ? 3 : 0, borderColor: "white", shadowColor: color, shadowOpacity: eventColor === color ? 0.5 : 0, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: eventColor === color ? 4 : 0 }} testID={`color-swatch-${color}`} />
                ))}
              </View>

              {formError ? <Text style={{ color: "#EF4444", fontSize: 13, marginBottom: 12 }} testID="form-error">{formError}</Text> : null}

              <View style={{ flexDirection: "row", gap: 10 }}>
                {editingEvent ? (
                  <Pressable onPress={() => deleteMutation.mutate(editingEvent.id)} disabled={deleteMutation.isPending} style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }} testID="delete-event-button">
                    {deleteMutation.isPending ? <ActivityIndicator size="small" color="#EF4444" /> : <Trash2 size={18} color="#EF4444" />}
                  </Pressable>
                ) : null}
                <Pressable onPress={handleSave} disabled={createMutation.isPending || updateMutation.isPending} style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center" }} testID="save-event-button">
                  {createMutation.isPending || updateMutation.isPending ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>{editingEvent ? "Save Changes" : "Create Event"}</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
