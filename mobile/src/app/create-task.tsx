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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { X } from "lucide-react-native";
import { api } from "@/lib/api/api";
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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
  const [recurrenceInterval, setRecurrenceInterval] = useState("1");
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      assigneeIds: selectedAssignees,
      recurrence: isRecurring
        ? {
            type: recurrenceType,
            interval: parseInt(recurrenceInterval) || 1,
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
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <TouchableOpacity onPress={() => router.back()} testID="close-button">
            <X size={22} color="#64748B" />
          </TouchableOpacity>
          <Text className="text-base font-semibold text-slate-900 dark:text-white">
            New Task
          </Text>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={createMutation.isPending}
            testID="create-button"
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color="#0F766E" />
            ) : (
              <Text className="text-primary font-semibold text-base">Create</Text>
            )}
          </TouchableOpacity>
        </View>

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
                        borderColor: isSelected ? "#0F766E" : "#E2E8F0",
                        backgroundColor: isSelected ? "#0F766E0D" : "transparent",
                      }}
                      testID={`assignee-${m.userId}`}
                    >
                      <View className="w-8 h-8 rounded-full bg-primary items-center justify-center mr-3">
                        <Text className="text-white text-xs font-bold">
                          {m.user.name?.[0]?.toUpperCase() ?? "?"}
                        </Text>
                      </View>
                      <Text
                        className="flex-1 font-medium"
                        style={{ color: isSelected ? "#0F766E" : "#334155" }}
                      >
                        {m.user.name}
                      </Text>
                      {isSelected ? (
                        <View className="w-5 h-5 rounded-full bg-primary items-center justify-center">
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
                trackColor={{ false: "#E2E8F0", true: "#14B8A6" }}
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
                          recurrenceType === r.value ? "#0F766E" : "#F1F5F9",
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
              </View>
            ) : null}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
