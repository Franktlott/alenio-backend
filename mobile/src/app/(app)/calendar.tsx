import React, { useState } from "react";
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
import { ChevronLeft, ChevronRight, Plus, X, Calendar, Trash2 } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
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

function getDaysInMonth(date: Date): (Date | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  return days;
}

export default function CalendarScreen() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form state
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [eventColor, setEventColor] = useState("#4361EE");
  const [showDatePicker, setShowDatePicker] = useState(false);
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

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description?: string; startDate: string; color: string; allDay: boolean }) =>
      api.post<CalendarEvent>(`/api/teams/${activeTeamId}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CalendarEvent> }) =>
      api.patch<CalendarEvent>(`/api/teams/${activeTeamId}/events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/teams/${activeTeamId}/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      closeModal();
    },
  });

  const openAddModal = (date?: Date) => {
    setEditingEvent(null);
    setEventTitle("");
    setEventDescription("");
    setEventDate(date ?? selectedDate ?? new Date());
    setEventColor("#4361EE");
    setFormError(null);
    setShowEventModal(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEventTitle(event.title);
    setEventDescription(event.description ?? "");
    setEventDate(new Date(event.startDate));
    setEventColor(event.color);
    setFormError(null);
    setShowEventModal(true);
  };

  const closeModal = () => {
    setShowEventModal(false);
    setEditingEvent(null);
    setShowDatePicker(false);
    setFormError(null);
  };

  const handleSave = () => {
    if (!eventTitle.trim()) {
      setFormError("Please enter an event title");
      return;
    }
    const payload = {
      title: eventTitle.trim(),
      description: eventDescription.trim() || undefined,
      startDate: eventDate.toISOString(),
      color: eventColor,
      allDay: true,
    };
    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = () => {
    if (editingEvent) {
      deleteMutation.mutate(editingEvent.id);
    }
  };

  const prevMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  };

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    return events.filter((e) => isSameDay(new Date(e.startDate), day));
  };

  const getTasksForDay = (day: Date): Task[] => {
    return myTasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), day));
  };

  const days = getDaysInMonth(currentMonth);
  const today = new Date();

  // Group into weeks for row-by-row rendering
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Events/tasks for selected day
  const selectedEvents = selectedDate ? getEventsForDay(selectedDate) : [];
  const selectedTasks = selectedDate ? getTasksForDay(selectedDate) : [];

  const isLoading = eventsLoading || tasksLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]} testID="calendar-screen">
      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            {/* Month navigation */}
            <Pressable
              onPress={prevMonth}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
              testID="prev-month-button"
            >
              <ChevronLeft size={20} color="white" />
            </Pressable>

            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>

            <Pressable
              onPress={nextMonth}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
              testID="next-month-button"
            >
              <ChevronRight size={20} color="white" />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Calendar grid */}
        <View style={{ backgroundColor: "white", marginHorizontal: 12, marginTop: 12, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: "hidden" }}>
          {/* Day of week headers */}
          <View style={{ flexDirection: "row", paddingTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            {DAYS_OF_WEEK.map((day) => (
              <View key={day} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8" }}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Week rows */}
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={{ flexDirection: "row", borderTopWidth: weekIndex === 0 ? 0 : 0.5, borderTopColor: "#F1F5F9", minHeight: 64 }}>
              {week.map((day, dayIndex) => {
                if (!day) {
                  return <View key={`empty-${dayIndex}`} style={{ flex: 1, borderLeftWidth: dayIndex === 0 ? 0 : 0.5, borderLeftColor: "#F1F5F9", backgroundColor: "#FAFAFA" }} />;
                }

                const isToday = isSameDay(day, today);
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                const dayEvents = getEventsForDay(day);
                const dayTasks = getTasksForDay(day);
                const allItems = [
                  ...dayEvents.map((e) => ({ type: "event" as const, color: e.color, title: e.title, id: e.id })),
                  ...dayTasks.map((t) => ({ type: "task" as const, color: "#10B981", title: t.title, id: t.id })),
                ];
                const visibleItems = allItems.slice(0, 3);
                const hiddenCount = allItems.length - visibleItems.length;

                return (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() => setSelectedDate(day)}
                    style={{
                      flex: 1,
                      borderLeftWidth: dayIndex === 0 ? 0 : 0.5,
                      borderLeftColor: "#F1F5F9",
                      paddingHorizontal: 2,
                      paddingTop: 4,
                      paddingBottom: 4,
                      backgroundColor: isSelected && !isToday ? "#F5F7FF" : "white",
                    }}
                    testID={`calendar-day-${day.getDate()}`}
                  >
                    {/* Day number */}
                    <View style={{ alignItems: "center", marginBottom: 3 }}>
                      <View style={{
                        width: 24, height: 24, borderRadius: 12,
                        backgroundColor: isToday ? "#4361EE" : "transparent",
                        alignItems: "center", justifyContent: "center",
                        borderWidth: isSelected && !isToday ? 1.5 : 0,
                        borderColor: "#4361EE",
                      }}>
                        <Text style={{
                          fontSize: 12,
                          fontWeight: isToday || isSelected ? "700" : "400",
                          color: isToday ? "white" : isSelected ? "#4361EE" : "#334155",
                        }}>
                          {day.getDate()}
                        </Text>
                      </View>
                    </View>

                    {/* Event / task bars */}
                    {visibleItems.map((item) => (
                      <View
                        key={item.id}
                        style={{
                          backgroundColor: item.color,
                          borderRadius: 3,
                          paddingHorizontal: 3,
                          marginBottom: 2,
                          height: 14,
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "white", fontSize: 9, fontWeight: "600", lineHeight: 12 }} numberOfLines={1}>
                          {item.title}
                        </Text>
                      </View>
                    ))}

                    {hiddenCount > 0 ? (
                      <Text style={{ fontSize: 9, color: "#94A3B8", paddingHorizontal: 2 }}>+{hiddenCount} more</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* Legend */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 10, gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 20, height: 8, borderRadius: 2, backgroundColor: "#4361EE" }} />
            <Text style={{ fontSize: 11, color: "#64748B" }}>Team events</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 20, height: 8, borderRadius: 2, backgroundColor: "#10B981" }} />
            <Text style={{ fontSize: 11, color: "#64748B" }}>Your tasks</Text>
          </View>
        </View>

        {/* Selected day panel */}
        {selectedDate ? (
          <View style={{ marginHorizontal: 12, marginTop: 12, marginBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </Text>
              {isOwner ? (
                <Pressable
                  onPress={() => openAddModal(selectedDate)}
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
                {/* Team events */}
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
                        <Text style={{ fontSize: 10, fontWeight: "600", color: event.color }}>Event</Text>
                      </View>
                    </View>
                    {event.description ? (
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }} numberOfLines={2}>{event.description}</Text>
                    ) : null}
                    {isOwner ? (
                      <Text style={{ fontSize: 11, color: "#CBD5E1", marginTop: 6 }}>Tap to edit</Text>
                    ) : null}
                  </Pressable>
                ))}

                {/* User tasks */}
                {selectedTasks.map((task) => (
                  <View
                    key={task.id}
                    style={{ backgroundColor: "white", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: "#10B981", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
                    testID={`task-item-${task.id}`}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: task.status === "done" ? "#94A3B8" : "#0F172A", flex: 1, textDecorationLine: task.status === "done" ? "line-through" : "none" }} numberOfLines={1}>
                        {task.title}
                      </Text>
                      <View style={{ backgroundColor: task.status === "done" ? "#D1FAE5" : "#F0FDF4", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: "#10B981" }}>
                          {task.status === "done" ? "Done" : "Task"}
                        </Text>
                      </View>
                    </View>
                    {task.description ? (
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }} numberOfLines={2}>{task.description}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* FAB — owner only */}
      {isOwner && activeTeamId ? (
        <Pressable
          onPress={() => openAddModal()}
          style={{
            position: "absolute", bottom: 32, right: 24,
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: "#4361EE",
            alignItems: "center", justifyContent: "center",
            shadowColor: "#4361EE", shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
          }}
          testID="fab-add-event"
        >
          <Plus size={24} color="white" />
        </Pressable>
      ) : null}

      {/* Add/Edit Event Modal */}
      <Modal
        visible={showEventModal}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={closeModal} testID="modal-backdrop">
            <Pressable
              style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
              onPress={(e) => e.stopPropagation()}
              testID="event-modal"
            >
              {/* Handle bar */}
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />

              {/* Modal header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>
                  {editingEvent ? "Edit Event" : "New Event"}
                </Text>
                <Pressable onPress={closeModal} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }} testID="close-modal-button">
                  <X size={16} color="#64748B" />
                </Pressable>
              </View>

              {/* Title input */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Title</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 14 }}
                placeholder="Event title..."
                placeholderTextColor="#CBD5E1"
                value={eventTitle}
                onChangeText={(t) => { setEventTitle(t); setFormError(null); }}
                testID="event-title-input"
              />

              {/* Description input */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Description (optional)</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#0F172A", marginBottom: 14, minHeight: 72, textAlignVertical: "top" }}
                placeholder="Add a description..."
                placeholderTextColor="#CBD5E1"
                value={eventDescription}
                onChangeText={setEventDescription}
                multiline
                numberOfLines={3}
                testID="event-description-input"
              />

              {/* Date picker */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Date</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={{ borderWidth: 1.5, borderColor: "#4361EE", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", marginBottom: 14, backgroundColor: "#4361EE0D" }}
                testID="event-date-picker-button"
              >
                <Calendar size={16} color="#4361EE" style={{ marginRight: 8 }} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: "#4361EE" }}>
                  {eventDate.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                </Text>
              </Pressable>

              {/* iOS date picker modal */}
              {Platform.OS === "ios" ? (
                <Modal visible={showDatePicker} transparent animationType="slide">
                  <View style={{ flex: 1, justifyContent: "flex-end" }}>
                    <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                        <Pressable onPress={() => setShowDatePicker(false)}>
                          <Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text>
                        </Pressable>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>Event Date</Text>
                        <Pressable onPress={() => setShowDatePicker(false)}>
                          <Text style={{ color: "#4361EE", fontWeight: "600", fontSize: 15 }}>Done</Text>
                        </Pressable>
                      </View>
                      <DateTimePicker
                        value={eventDate}
                        mode="date"
                        display="inline"
                        onChange={(_e, date) => { if (date) setEventDate(date); }}
                        testID="event-date-time-picker"
                      />
                      <View style={{ height: 20 }} />
                    </View>
                  </View>
                </Modal>
              ) : (
                showDatePicker ? (
                  <DateTimePicker
                    value={eventDate}
                    mode="date"
                    display="calendar"
                    onChange={(_e, date) => { setShowDatePicker(false); if (date) setEventDate(date); }}
                    testID="event-date-time-picker"
                  />
                ) : null
              )}

              {/* Color picker */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 10 }}>Color</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                {EVENT_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setEventColor(color)}
                    style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: color,
                      borderWidth: eventColor === color ? 3 : 0,
                      borderColor: "white",
                      shadowColor: color,
                      shadowOpacity: eventColor === color ? 0.5 : 0,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: eventColor === color ? 4 : 0,
                    }}
                    testID={`color-swatch-${color}`}
                  />
                ))}
              </View>

              {/* Error */}
              {formError ? (
                <Text style={{ color: "#EF4444", fontSize: 13, marginBottom: 12 }} testID="form-error">{formError}</Text>
              ) : null}

              {/* Action buttons */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {editingEvent ? (
                  <Pressable
                    onPress={handleDelete}
                    disabled={deleteMutation.isPending}
                    style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}
                    testID="delete-event-button"
                  >
                    {deleteMutation.isPending ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Trash2 size={18} color="#EF4444" />
                    )}
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center" }}
                  testID="save-event-button"
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>
                      {editingEvent ? "Save Changes" : "Create Event"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
