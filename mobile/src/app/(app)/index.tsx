import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Plus, CheckSquare } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import type { Task, TaskStatus, Team } from "@/lib/types";

const FILTERS: { label: string; value: TaskStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "To Do", value: "todo" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "done" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#3B82F6",
  low: "#94A3B8",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "#64748B",
  in_progress: "#3B82F6",
  done: "#10B981",
};

function TaskCard({ task, onPress }: { task: Task; onPress: () => void }) {
  const isDone = task.status === "done";
  const hasDueDate = !!task.dueDate;
  const isOverdue = hasDueDate && !isDone && new Date(task.dueDate!) < new Date();
  const assignees = task.assignments?.slice(0, 3) ?? [];

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-slate-800 rounded-2xl p-4 mb-3 mx-4"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      }}
      testID="task-card"
    >
      <View className="flex-row items-start">
        {/* Priority dot */}
        <View
          className="w-2.5 h-2.5 rounded-full mt-1.5 mr-3 flex-shrink-0"
          style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? "#94A3B8" }}
        />
        <View className="flex-1">
          <Text
            className={`text-base font-semibold mb-1 ${
              isDone
                ? "line-through text-slate-400 dark:text-slate-500"
                : "text-slate-900 dark:text-white"
            }`}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          {task.description ? (
            <Text
              className="text-sm text-slate-500 dark:text-slate-400 mb-2"
              numberOfLines={1}
            >
              {task.description}
            </Text>
          ) : null}

          <View className="flex-row items-center justify-between mt-1">
            <View className="flex-row items-center" style={{ gap: 8 }}>
              {/* Status badge */}
              <View
                className="px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${STATUS_COLORS[task.status]}20` }}
              >
                <Text
                  className="text-xs font-medium capitalize"
                  style={{ color: STATUS_COLORS[task.status] }}
                >
                  {task.status === "in_progress"
                    ? "In Progress"
                    : task.status === "todo"
                    ? "To Do"
                    : "Done"}
                </Text>
              </View>
              {/* Recurrence */}
              {task.recurrenceRule ? (
                <Text className="text-xs text-slate-400">
                  ↺ {task.recurrenceRule.type}
                </Text>
              ) : null}
            </View>

            <View className="flex-row items-center" style={{ gap: 8 }}>
              {/* Due date */}
              {hasDueDate ? (
                <Text
                  className={`text-xs ${
                    isOverdue ? "text-red-500 font-medium" : "text-slate-400"
                  }`}
                >
                  {new Date(task.dueDate!).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              ) : null}
              {/* Assignee avatars */}
              {assignees.length > 0 ? (
                <View className="flex-row">
                  {assignees.map((a, i) => (
                    <View
                      key={a.id}
                      className="w-6 h-6 rounded-full bg-primary-light items-center justify-center border border-white dark:border-slate-800"
                      style={{ marginLeft: i > 0 ? -6 : 0 }}
                    >
                      <Text className="text-white text-xs font-bold">
                        {a.user.name?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function TasksScreen() {
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  // Set active team if none selected
  React.useEffect(() => {
    if (teams && teams.length > 0 && !activeTeamId) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId, setActiveTeamId]);

  const { data: tasks = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["tasks", activeTeamId, filter],
    queryFn: () => {
      const params = filter !== "all" ? `?status=${filter}` : "";
      return api.get<Task[]>(`/api/teams/${activeTeamId}/tasks${params}`);
    },
    enabled: !!activeTeamId,
  });

  // If no teams, show onboarding prompt
  if (!teamsLoading && (!teams || teams.length === 0)) {
    return (
      <SafeAreaView
        className="flex-1 bg-slate-50 dark:bg-slate-900"
        testID="no-teams-screen"
      >
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-4">
            <Text className="text-white text-2xl font-bold">A</Text>
          </View>
          <Text className="text-xl font-bold text-slate-900 dark:text-white mb-2 text-center">
            Welcome to Alenio
          </Text>
          <Text className="text-slate-500 text-center mb-6">
            Create or join a team to start managing tasks together
          </Text>
          <TouchableOpacity
            className="bg-primary rounded-xl px-6 py-3"
            onPress={() => router.push("/onboarding")}
            testID="get-started-button"
          >
            <Text className="text-white font-semibold">Get started</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      testID="tasks-screen"
    >
      {/* Header */}
      <View className="px-4 pt-2 pb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white">
            My Tasks
          </Text>
          {teams && teams.length > 0 ? (
            <TouchableOpacity onPress={() => router.push("/select-team")}>
              <Text className="text-primary text-sm font-medium">
                {teams.find((t) => t.id === activeTeamId)?.name ?? "Select team"}{" "}
                ›
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter tabs */}
      <View className="flex-row px-4 mb-3" style={{ gap: 8 }}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full ${
              filter === f.value
                ? "bg-primary"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            }`}
            testID={`filter-${f.value}`}
          >
            <Text
              className={`text-xs font-semibold ${
                filter === f.value
                  ? "text-white"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Task list */}
      {isLoading ? (
        <View
          className="flex-1 items-center justify-center"
          testID="loading-indicator"
        >
          <ActivityIndicator color="#0F766E" />
        </View>
      ) : tasks.length === 0 ? (
        <View
          className="flex-1 items-center justify-center px-6"
          testID="empty-state"
        >
          <CheckSquare size={48} color="#94A3B8" />
          <Text className="text-lg font-semibold text-slate-500 mt-4">
            No tasks yet
          </Text>
          <Text className="text-slate-400 text-sm mt-1 text-center">
            Tap the + button to create your first task
          </Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onPress={() =>
                router.push({
                  pathname: "/task-detail",
                  params: { taskId: item.id, teamId: activeTeamId! },
                })
              }
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#0F766E"
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          testID="task-list"
        />
      )}

      {/* FAB */}
      {activeTeamId ? (
        <TouchableOpacity
          className="absolute bottom-8 right-6 w-14 h-14 bg-primary rounded-full items-center justify-center"
          onPress={() =>
            router.push({
              pathname: "/create-task",
              params: { teamId: activeTeamId },
            })
          }
          style={{
            shadowColor: "#0F766E",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
          testID="create-task-button"
        >
          <Plus size={24} color="white" />
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}
