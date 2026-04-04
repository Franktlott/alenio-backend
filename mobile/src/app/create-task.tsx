import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { X } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import type { Task, TaskPriority, RecurrenceType, Team, TeamMember } from "@/lib/types";

const PRIORITIES: { label: string; value: TaskPriority; color: string }[] = [
  { label: "Low", value: "low", color: "#94A3B8" },
  { label: "Medium", value: "medium", color: "#3B82F6" },
  { label: "High", value: "high", color: "#F97316" },
  { label: "Urgent", value: "urgent", color: "#EF4444" },
];

const RECURRENCE_TYPES: { label: string; value: RecurrenceType }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

export default function CreateTaskScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
  const [recurrenceInterval, setRecurrenceInterval] = useState("1");
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | null>(null);
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);  const [error, setError] = useState<string | null>(null);

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const members = team?.members ?? [];

  const createMutation = useMutation({
    mutationFn: (input: unknown) =>
      api.post<Task>(`/api/teams/${teamId}/tasks`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      router.back();
    },
    onError: () => setError("Failed to create task. Please try again."),
  });

  const handleCreate = () => {
    if (!title.trim()) {
      setError("Please enter a task title");
      return;
    }
    if (!dueDate) {
      setError("Please select a due date");
      return;
    }
    setError(null);
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate.toISOString(),
      assigneeIds: selectedAssignees,
      recurrence: isRecurring
        ? {
            type: recurrenceType,
            interval: parseInt(recurrenceInterval) || 1,
            daysOfWeek: recurrenceType === "weekly" && selectedDayOfWeek !== null
              ? String(selectedDayOfWeek)
              : undefined,
            dayOfMonth: recurrenceType === "monthly" && selectedDayOfMonth !== null
              ? selectedDayOfMonth
              : undefined,
          }
        : undefined,
    });
  };

  const toggleAssignee = (userId: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-slate-900"
      edges={["top"]}
      testID="create-task-screen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Header */}
        <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <View className="px-4 pt-3 pb-4 flex-row items-center justify-between">
            <TouchableOpacity onPress={() => router.back()} testID="close-button">
              <X size={22} color="white" />
            </TouchableOpacity>
            <Text className="text-white text-lg font-bold">New Task</Text>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={createMutation.isPending}
              testID="create-button"
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white font-semibold text-base">Create</Text>
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          {/* Title */}
          <TextInput
            className="text-xl font-semibold text-slate-900 dark:text-white py-4 border-b border-slate-100 dark:border-slate-800"
            placeholder="Task title..."
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              setError(null);
            }}
            multiline
            returnKeyType="next"
            testID="title-input"
          />

          {/* Description */}
          <TextInput
            className="text-base text-slate-600 dark:text-slate-400 py-3 border-b border-slate-100 dark:border-slate-800"
            placeholder="Add description (optional)"
            placeholderTextColor="#94A3B8"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            testID="description-input"
          />

          {error ? (
            <Text className="text-red-500 text-sm mt-2">{error}</Text>
          ) : null}

          {/* Due Date */}
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
            <Text className="text-sm font-semibold text-slate-500 mb-3">
              Due Date <Text className="text-red-500">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              className="flex-row items-center px-4 py-3 rounded-xl border"
              style={{ borderColor: dueDate ? "#4361EE" : "#E2E8F0", backgroundColor: dueDate ? "#4361EE0D" : "#F8FAFC" }}
              testID="due-date-picker-button"
            >
              <Text className="text-lg mr-3">📅</Text>
              <Text className="flex-1 text-sm font-medium" style={{ color: dueDate ? "#4361EE" : "#94A3B8" }}>
                {dueDate
                  ? dueDate.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })
                  : "Select a due date"}
              </Text>
              {dueDate ? (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setDueDate(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text className="text-slate-400 text-base">✕</Text>
                </TouchableOpacity>
              ) : (
                <Text className="text-slate-400">›</Text>
              )}
            </TouchableOpacity>

            {/* iOS inline picker shown in modal */}
            {Platform.OS === "ios" ? (
              <Modal visible={showDatePicker} transparent animationType="slide">
                <View className="flex-1 justify-end">
                  <View className="bg-white dark:bg-slate-900 rounded-t-3xl" style={{ shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20 }}>
                    <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
                      <TouchableOpacity onPress={() => { setShowDatePicker(false); setDueDate(null); }}>
                        <Text className="text-slate-500 text-base">Cancel</Text>
                      </TouchableOpacity>
                      <Text className="text-base font-semibold text-slate-900 dark:text-white">Due Date</Text>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text className="text-indigo-600 font-semibold text-base">Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={dueDate ?? new Date()}
                      mode="date"
                      display="spinner"
                      minimumDate={new Date()}
                      onChange={(_e, date) => { if (date) { setDueDate(date); setError(null); } }}
                      style={{ height: 200 }}
                      testID="date-time-picker"
                    />
                    <View style={{ height: 20 }} />
                  </View>
                </View>
              </Modal>
            ) : (
              showDatePicker ? (
                <DateTimePicker
                  value={dueDate ?? new Date()}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(_e, date) => { setShowDatePicker(false); if (date) { setDueDate(date); setError(null); } }}
                  testID="date-time-picker"
                />
              ) : null
            )}
          </View>

          {/* Priority */}
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
            <Text className="text-sm font-semibold text-slate-500 mb-3">
              Priority
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  onPress={() => setPriority(p.value)}
                  className="px-3 py-1.5 rounded-full border"
                  style={
                    priority === p.value
                      ? {
                          backgroundColor: p.color + "20",
                          borderColor: p.color,
                        }
                      : { borderColor: "#E2E8F0", backgroundColor: "transparent" }
                  }
                  testID={`priority-${p.value}`}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{
                      color: priority === p.value ? p.color : "#94A3B8",
                    }}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Assignees */}
          {members.length > 0 ? (
            <View className="py-4 border-b border-slate-100 dark:border-slate-800">
              <Text className="text-sm font-semibold text-slate-500 mb-3">
                Assign to
              </Text>
              <View style={{ gap: 8 }}>
                {members.map((m: TeamMember) => {
                  const isSelected = selectedAssignees.includes(m.userId);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => toggleAssignee(m.userId)}
                      className="flex-row items-center p-3 rounded-xl border"
                      style={{
                        borderColor: isSelected ? "#4361EE" : "#E2E8F0",
                        backgroundColor: isSelected ? "#4361EE0D" : "transparent",
                      }}
                      testID={`assignee-${m.userId}`}
                    >
                      <View className="w-8 h-8 rounded-full bg-indigo-600 items-center justify-center mr-3">
                        <Text className="text-white text-xs font-bold">
                          {m.user.name?.[0]?.toUpperCase() ?? m.user.email?.[0]?.toUpperCase() ?? "?"}
                        </Text>
                      </View>
                      <Text
                        className="flex-1 font-medium"
                        style={{ color: isSelected ? "#4361EE" : "#334155" }}
                      >
                        {m.user.name ?? m.user.email ?? "Unknown"}{m.userId === session?.user?.id ? " (You)" : ""}
                      </Text>
                      {isSelected ? (
                        <View className="w-5 h-5 rounded-full bg-indigo-600 items-center justify-center">
                          <Text className="text-white text-xs">✓</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Recurring */}
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-semibold text-slate-500">
                  Recurring task
                </Text>
                <Text className="text-xs text-slate-400 mt-0.5">
                  Auto-create next occurrence when done
                </Text>
              </View>
              <Switch
                value={isRecurring}
                onValueChange={setIsRecurring}
                trackColor={{ false: "#E2E8F0", true: "#6B8EF6" }}
                thumbColor="white"
                testID="recurring-switch"
              />
            </View>
            {isRecurring ? (
              <View style={{ gap: 12, marginTop: 8 }}>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {RECURRENCE_TYPES.map((r) => (
                    <TouchableOpacity
                      key={r.value}
                      onPress={() => setRecurrenceType(r.value)}
                      className="px-3 py-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          recurrenceType === r.value ? "#4361EE" : "#F1F5F9",
                      }}
                      testID={`recurrence-${r.value}`}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{
                          color:
                            recurrenceType === r.value ? "white" : "#64748B",
                        }}
                      >
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text className="text-sm text-slate-500">Every</Text>
                  <TextInput
                    className="w-12 text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 text-slate-900 dark:text-white font-semibold"
                    value={recurrenceInterval}
                    onChangeText={(t) =>
                      setRecurrenceInterval(t.replace(/[^0-9]/g, ""))
                    }
                    keyboardType="numeric"
                    maxLength={2}
                    testID="interval-input"
                  />
                  <Text className="text-sm text-slate-500">
                    {recurrenceType === "daily"
                      ? "day(s)"
                      : recurrenceType === "weekly"
                      ? "week(s)"
                      : "month(s)"}
                  </Text>
                </View>

                {/* Day of week picker for weekly */}
                {recurrenceType === "weekly" ? (
                  <View>
                    <Text className="text-xs text-slate-500 mb-2">On</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                        <TouchableOpacity
                          key={i}
                          testID={`day-of-week-${i}`}
                          onPress={() => setSelectedDayOfWeek(selectedDayOfWeek === i ? null : i)}
                          className="w-10 h-10 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: selectedDayOfWeek === i ? "#4361EE" : "#F1F5F9",
                          }}
                        >
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: selectedDayOfWeek === i ? "white" : "#64748B" }}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Day of month picker for monthly */}
                {recurrenceType === "monthly" ? (
                  <View>
                    <Text className="text-xs text-slate-500 mb-2">On day</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <TouchableOpacity
                          key={day}
                          testID={`day-of-month-${day}`}
                          onPress={() => setSelectedDayOfMonth(selectedDayOfMonth === day ? null : day)}
                          className="w-9 h-9 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: selectedDayOfMonth === day ? "#4361EE" : "#F1F5F9",
                          }}
                        >
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: selectedDayOfMonth === day ? "white" : "#64748B" }}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
