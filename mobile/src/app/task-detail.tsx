import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Trash2, RefreshCw } from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Task, TaskStatus } from "@/lib/types";

const STATUS_OPTIONS: { label: string; value: TaskStatus; color: string }[] = [
  { label: "To Do", value: "todo", color: "#64748B" },
  { label: "In Progress", value: "in_progress", color: "#3B82F6" },
  { label: "Done", value: "done", color: "#10B981" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#3B82F6",
  low: "#94A3B8",
};

export default function TaskDetailScreen() {
  const { taskId, teamId } = useLocalSearchParams<{
    taskId: string;
    teamId: string;
  }>();
  const queryClient = useQueryClient();

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", taskId, teamId],
    queryFn: () => api.get<Task>(`/api/teams/${teamId}/tasks/${taskId}`),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Task>) =>
      api.patch<Task>(`/api/teams/${teamId}/tasks/${taskId}`, updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(["task", taskId, teamId], updated);
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/teams/${teamId}/tasks/${taskId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      router.back();
    },
  });

  const handleDelete = () => {
    Alert.alert(
      "Delete task",
      "Are you sure? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  const handleStatusChange = (status: TaskStatus) => {
    updateMutation.mutate({ status });
  };

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-white dark:bg-slate-900"
        edges={["top"]}
        testID="loading-indicator"
      >
        <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <View className="px-4 pt-2 pb-4 flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} testID="back-button">
              <ArrowLeft size={22} color="white" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4361EE" />
        </View>
      </SafeAreaView>
    );
  }

  if (!task) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-slate-900 items-center justify-center">
        <Text className="text-slate-500">Task not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-slate-900"
      edges={["top"]}
      testID="task-detail-screen"
    >
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-bold flex-1 ml-3" numberOfLines={1}>{task?.title ?? "Task"}</Text>
          <TouchableOpacity
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
            testID="delete-button"
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Trash2 size={20} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Priority indicator */}
        <View
          className="flex-row items-center mt-4 mb-2"
          style={{ gap: 8 }}
        >
          <View
            className="w-3 h-3 rounded-full"
            style={{
              backgroundColor: PRIORITY_COLORS[task.priority] ?? "#94A3B8",
            }}
          />
          <Text
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: PRIORITY_COLORS[task.priority] ?? "#94A3B8" }}
          >
            {task.priority} priority
          </Text>
          {task.recurrenceRule ? (
            <View className="flex-row items-center ml-2" style={{ gap: 4 }}>
              <RefreshCw size={12} color="#64748B" />
              <Text className="text-xs text-slate-500 capitalize">
                {task.recurrenceRule.type}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Title */}
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          {task.title}
        </Text>

        {/* Description */}
        {task.description ? (
          <Text className="text-base text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
            {task.description}
          </Text>
        ) : null}

        {/* Status */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-500 mb-2">
            Status
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {STATUS_OPTIONS.map((s) => {
              const isActive = task.status === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  onPress={() => handleStatusChange(s.value)}
                  disabled={updateMutation.isPending}
                  className="px-3 py-1.5 rounded-full border"
                  style={
                    isActive
                      ? {
                          backgroundColor: s.color + "20",
                          borderColor: s.color,
                        }
                      : { borderColor: "#E2E8F0" }
                  }
                  testID={`status-${s.value}`}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: isActive ? s.color : "#94A3B8" }}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Assignees */}
        {task.assignments && task.assignments.length > 0 ? (
          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-500 mb-2">
              Assignees
            </Text>
            <View style={{ gap: 8 }}>
              {task.assignments.map((a) => (
                <View key={a.id} className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-indigo-600 items-center justify-center mr-2">
                    <Text className="text-white text-xs font-bold">
                      {a.user.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <View>
                    <Text className="text-sm font-medium text-slate-900 dark:text-white">
                      {a.user.name}
                    </Text>
                    <Text className="text-xs text-slate-500">
                      {a.user.email}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Meta */}
        <View className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Text className="text-xs text-slate-400">
            Created{" "}
            {new Date(task.createdAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
          {task.completedAt ? (
            <Text className="text-xs text-emerald-500 mt-1">
              Completed{" "}
              {new Date(task.completedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              })}
            </Text>
          ) : null}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
