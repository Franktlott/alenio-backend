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
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Plus, User, ArrowUpDown } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import type { Task, Team } from "@/lib/types";

type FilterTab = "all" | "assigned" | "completed";
type SortMode = "due" | "priority";

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", bg: "#FEE2E2", text: "#DC2626", flagColor: "#DC2626" },
  high: { label: "High", bg: "#FEE2E2", text: "#DC2626", flagColor: "#DC2626" },
  medium: { label: "Medium", bg: "#FEF9C3", text: "#B45309", flagColor: "#F59E0B" },
  low: { label: "Low", bg: "#DCFCE7", text: "#15803D", flagColor: "#16A34A" },
};

function TaskRow({ task, onToggle, onPress }: { task: Task; onToggle: () => void; onPress: () => void }) {
  const isDone = task.status === "done";
  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;

  const getDueText = () => {
    if (isDone) return "Completed";
    if (!task.dueDate) return null;
    const now = new Date();
    const due = new Date(task.dueDate);
    const diffMs = due.getTime() - now.getTime();
    const diffH = Math.round(diffMs / (1000 * 60 * 60));
    if (diffH < 0) return `${Math.abs(diffH)}h overdue`;
    if (diffH < 24) return `${diffH}h left`;
    const diffD = Math.round(diffH / 24);
    return `${diffD}d left`;
  };

  const dueText = getDueText();

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

          {/* Time */}
          {dueText ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 11, marginRight: 2, color: "#94A3B8" }}>⏱</Text>
              <Text style={{
                fontSize: 11,
                color: isDone ? "#94A3B8" : dueText.includes("overdue") ? "#EF4444" : "#64748B",
                fontWeight: dueText.includes("overdue") ? "600" : "400",
              }}>
                {dueText}
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

  const toggleMutation = useMutation({
    mutationFn: (task: Task) =>
      api.patch<Task>(`/api/teams/${activeTeamId}/tasks/${task.id}`, {
        status: task.status === "done" ? "todo" : "done",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", activeTeamId] });
    },
  });

  const currentUserId = session?.user?.id ?? null;
  const activeTeam = teams?.find((t) => t.id === activeTeamId);
  const isOwner = (activeTeam as (Team & { role?: string }) | undefined)?.role === "owner";

  React.useEffect(() => {
    if (filter === "assigned" && !isOwner) setFilter("all");
  }, [isOwner, filter]);

  const isMyTask = (t: Task) =>
    t.creator?.id === currentUserId ||
    (t.assignments ?? []).some((a) => a.userId === currentUserId);

  const tasks = allTasks.filter((t) => {
    if (filter === "assigned") return (
      t.creator?.id === currentUserId &&
      (t.assignments ?? []).some((a) => a.userId !== currentUserId)
    );
    if (filter === "completed") return t.status === "done" && isMyTask(t);
    return t.status !== "done" && isMyTask(t);
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

  const assignedCount = allTasks.filter((t) =>
    t.creator?.id === currentUserId &&
    (t.assignments ?? []).some((a) => a.userId !== currentUserId)
  ).length;
  const completedCount = allTasks.filter((t) => t.status === "done" && isMyTask(t)).length;

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

      {/* Stats cards */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, gap: 10 }}>
        {isOwner ? (
          <View style={{
            flex: 1, backgroundColor: "white", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center",
            shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
          }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "#60A5FA", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#60A5FA" }} />
            </View>
            <View>
              <Text style={{ fontSize: 10, color: "#94A3B8" }}>Assigned</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A", lineHeight: 22 }}>{assignedCount}</Text>
            </View>
          </View>
        ) : null}
        <View style={{
          flex: 1, backgroundColor: "white", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center",
          shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
        }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
            <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>✓</Text>
          </View>
          <View>
            <Text style={{ fontSize: 10, color: "#94A3B8" }}>Completed</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#10B981", lineHeight: 22 }}>{completedCount}</Text>
          </View>
        </View>
      </View>

      {/* Filter tabs + sort */}
      <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
        <View style={{ flexDirection: "row", backgroundColor: "#E2E8F0", borderRadius: 12, padding: 4, marginBottom: 8 }}>
          {(["all", "completed", ...(isOwner ? ["assigned"] : [])] as FilterTab[]).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                backgroundColor: filter === f ? "white" : "transparent",
              }}
              testID={`filter-${f}`}
            >
              <Text style={{
                fontSize: 13, fontWeight: "600",
                color: filter === f ? "#0F172A" : "#94A3B8",
              }}>
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
              style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                backgroundColor: sort === s ? "#4361EE" : "#F1F5F9",
              }}
              testID={`sort-${s}`}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: sort === s ? "white" : "#64748B" }}>
                {s === "due" ? "Due Date" : "Priority"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Task list */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} testID="loading-indicator">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : tasks.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }} testID="empty-state">
          <Text style={{ fontSize: 40, marginBottom: 12 }}>✓</Text>
          <Text style={{ fontSize: 17, fontWeight: "600", color: "#94A3B8" }}>
            {filter === "completed" ? "No completed tasks" : "No tasks yet"}
          </Text>
          {filter === "all" ? (
            <Text style={{ color: "#CBD5E1", fontSize: 13, marginTop: 4, textAlign: "center" }}>
              Tap the + button to create your first task
            </Text>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TaskRow
              task={item}
              onToggle={() => toggleMutation.mutate(item)}
              onPress={() =>
                router.push({
                  pathname: "/task-detail",
                  params: { taskId: item.id, teamId: activeTeamId! },
                })
              }
            />
          )}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#4361EE" />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          style={{ backgroundColor: "white" }}
          testID="task-list"
        />
      )}

      {/* FAB */}
      {activeTeamId ? (
        <TouchableOpacity
          style={{
            position: "absolute", bottom: 32, right: 24,
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: "#4361EE",
            alignItems: "center", justifyContent: "center",
            shadowColor: "#4361EE", shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
          }}
          onPress={() =>
            router.push({
              pathname: "/create-task",
              params: { teamId: activeTeamId },
            })
          }
          testID="create-task-button"
        >
          <Plus size={24} color="white" />
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}
