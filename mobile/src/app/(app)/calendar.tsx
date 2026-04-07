import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, ChevronRight, Plus, Calendar, UserRound } from "lucide-react-native";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import type { Task, Team } from "@/lib/types";
import { useDemoMode } from "@/lib/useDemo";

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
  isHidden?: boolean;
};

type WeekBar = {
  id: string;
  title: string;
  color: string;
  startCol: number;
  endCol: number;
  isHidden?: boolean;
};

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

    bars.push({ id: event.id, title: event.title, color: event.color, startCol, endCol, isHidden: event.isHidden });
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
  const insets = useSafeAreaInsets();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [weekRowWidth, setWeekRowWidth] = useState(0);

  const currentUserId = session?.user?.id ?? null;

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  const isDemo = useDemoMode();
  const activeTeam = teams?.find((t) => t.id === activeTeamId);
  const myRole = (activeTeam as (Team & { role?: string }) | undefined)?.role ?? "";
  const isOwnerOrLeader = myRole === "owner" || myRole === "team_leader";

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

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["tasks", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["teams"] });
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]} testID="calendar-screen">
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable onPress={prevMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }} testID="prev-month-button">
              <ChevronLeft size={20} color="white" />
            </Pressable>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {isOwnerOrLeader && activeTeamId && !isDemo ? (
                <Pressable
                  onPress={() => router.push({ pathname: "/create-event", params: { teamId: activeTeamId!, startDate: (selectedDate ?? new Date()).toISOString() } })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 }}
                  testID="header-add-event-button"
                >
                  <Plus size={15} color="white" />
                  <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>Add Event</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={nextMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }} testID="next-month-button">
                <ChevronRight size={20} color="white" />
              </Pressable>
              <Image source={require("@/assets/alenio-icon.png")} style={{ width: 30, height: 30, borderRadius: 6 }} />
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />}>
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
                          onPress={() => {
                            if (isOwnerOrLeader) {
                              const event = events.find((e) => e.id === bar.id);
                              if (event) {
                                router.push({ pathname: "/create-event", params: { teamId: activeTeamId!, eventId: event.id, eventTitle: event.title, eventDescription: event.description ?? "", eventColor: event.color, startDate: event.startDate, eventEndDate: event.endDate ?? event.startDate, eventIsHidden: String(event.isHidden ?? false) } });
                              }
                            }
                          }}
                          style={{
                            flex: 1,
                            height: 14,
                            backgroundColor: bar.color,
                            opacity: bar.isHidden ? 0.45 : 1,
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
                          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 4 }}>
                            {bar.isHidden ? <UserRound size={9} color="white" style={{ marginRight: 2 }} /> : null}
                            <Text style={{ color: "white", fontSize: 9, fontWeight: "600", lineHeight: 13, flex: 1 }} numberOfLines={1}>
                              {bar.title}
                            </Text>
                          </View>
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
          {isOwnerOrLeader ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <UserRound size={10} color="#94A3B8" />
              <Text style={{ fontSize: 11, color: "#64748B" }}>Incognito</Text>
            </View>
          ) : null}
        </View>

        {/* Selected day panel */}
        {selectedDate ? (
          <View style={{ marginHorizontal: 12, marginTop: 12, marginBottom: 100 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </Text>
              {isOwnerOrLeader && !isDemo ? (
                <Pressable
                  onPress={() => router.push({ pathname: "/create-event", params: { teamId: activeTeamId!, startDate: selectedDate.toISOString() } })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#4361EE", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
                  testID="add-event-button"
                >
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
                    onPress={() => {
                      if (isOwnerOrLeader) {
                        router.push({ pathname: "/create-event", params: { teamId: activeTeamId!, eventId: event.id, eventTitle: event.title, eventDescription: event.description ?? "", eventColor: event.color, startDate: event.startDate, eventEndDate: event.endDate ?? event.startDate, eventIsHidden: String(event.isHidden ?? false) } });
                      }
                    }}
                    style={{ backgroundColor: "white", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: event.color, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
                    testID={`event-item-${event.id}`}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", flex: 1 }} numberOfLines={1}>{event.title}</Text>
                        {event.isHidden ? <UserRound size={13} color="#94A3B8" style={{ marginLeft: 4 }} /> : null}
                      </View>
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
                    {isOwnerOrLeader ? <Text style={{ fontSize: 11, color: "#CBD5E1", marginTop: 6 }}>Tap to edit</Text> : null}
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
      </ScrollView>
    </SafeAreaView>
  );
}
