import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Trash2, RefreshCw, UserPlus, X, Check, Plus, Square, CheckSquare, Pencil } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { toast } from "burnt";
import type { Task, TaskStatus, Team, Subtask } from "@/lib/types";

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
  const { taskId, teamId } = useLocalSearchParams<{ taskId: string; teamId: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<string>("");
  const [isEditMode, setIsEditMode] = useState(false);

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", taskId, teamId],
    queryFn: () => api.get<Task>(`/api/teams/${teamId}/tasks/${taskId}`),
    enabled: !!taskId && !!teamId,
  });

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Task>) =>
      api.patch<Task>(`/api/teams/${teamId}/tasks/${taskId}`, updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(["task", taskId, teamId], updated);
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error: Error) => {
      toast({ title: error.message, preset: "error" });
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

  const assignMutation = useMutation({
    mutationFn: (userIds: string[]) =>
      api.post(`/api/teams/${teamId}/tasks/${taskId}/assign`, { userIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/teams/${teamId}/tasks/${taskId}/assign/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
    },
  });

  const createSubtaskMutation = useMutation({
    mutationFn: (title: string) =>
      api.post<Subtask>(`/api/teams/${teamId}/tasks/${taskId}/subtasks`, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
      setNewSubtaskTitle("");
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: ({ subtaskId, completed }: { subtaskId: string; completed: boolean }) =>
      api.patch<Subtask>(`/api/teams/${teamId}/tasks/${taskId}/subtasks/${subtaskId}`, { completed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: (subtaskId: string) =>
      api.delete(`/api/teams/${teamId}/tasks/${taskId}/subtasks/${subtaskId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
    },
  });

  const currentUserId = session?.user?.id ?? null;
  const members = team?.members ?? [];
  const assignedIds = new Set((task?.assignments ?? []).map((a) => a.userId));
  const isSelfAssigned = !!currentUserId && assignedIds.has(currentUserId);
  const isCreator = !!currentUserId && task?.creator?.id === currentUserId;
  const isCompleted = task?.status === "done";
  const canEdit = isCreator && !isCompleted;
  const isEditable = canEdit && isEditMode;

  const handleToggleMember = (userId: string) => {
    if (assignedIds.has(userId)) {
      unassignMutation.mutate(userId);
    } else {
      assignMutation.mutate([userId]);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-slate-900" edges={["top"]} testID="loading-indicator">
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
    <SafeAreaView className="flex-1 bg-white dark:bg-slate-900" edges={["top"]} testID="task-detail-screen">
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => { setIsEditMode(false); router.back(); }} testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-bold flex-1 ml-3" numberOfLines={1}>{task.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {canEdit ? (
              <TouchableOpacity
                onPress={() => setIsEditMode((v) => !v)}
                testID="edit-mode-button"
              >
                {isEditMode ? (
                  <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>Done</Text>
                ) : (
                  <Pencil size={18} color="white" />
                )}
              </TouchableOpacity>
            ) : null}
            {isCreator && !isEditMode ? (
              <TouchableOpacity onPress={() => setShowDeleteConfirm(true)} disabled={deleteMutation.isPending} testID="delete-button">
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Trash2 size={20} color="white" />
                )}
              </TouchableOpacity>
            ) : null}
            {!isCreator ? <View style={{ width: 20 }} /> : null}
          </View>
        </View>
      </LinearGradient>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Priority indicator */}
        <View className="flex-row items-center mt-4 mb-2" style={{ gap: 8 }}>
          <View className="w-3 h-3 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? "#94A3B8" }} />
          <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: PRIORITY_COLORS[task.priority] ?? "#94A3B8" }}>
            {task.priority} priority
          </Text>
          {task.recurrenceRule ? (
            <View className="flex-row items-center ml-2" style={{ gap: 4 }}>
              <RefreshCw size={12} color="#64748B" />
              <Text className="text-xs text-slate-500 capitalize">{task.recurrenceRule.type}</Text>
            </View>
          ) : null}
        </View>

        {/* Title */}
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{task.title}</Text>

        {/* Description */}
        {task.description ? (
          <Text className="text-base text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">{task.description}</Text>
        ) : null}

        {/* Attachment photo */}
        {task.attachmentUrl ? (
          <Image
            source={{ uri: task.attachmentUrl }}
            style={{ width: "100%", height: 200, borderRadius: 12, marginBottom: 16 }}
            resizeMode="cover"
          />
        ) : null}

        {/* Completed banner */}
        {isCompleted ? (
          <View className="flex-row items-center bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 mb-4" style={{ gap: 8 }}>
            <Text style={{ fontSize: 16 }}>🔒</Text>
            <Text className="flex-1 text-sm text-emerald-700 dark:text-emerald-400">
              Task is completed. Recall it to make edits.
            </Text>
            <TouchableOpacity
              onPress={() => setShowRecallConfirm(true)}
              disabled={updateMutation.isPending}
              className="px-3 py-1 rounded-full bg-emerald-600"
            >
              {updateMutation.isPending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-xs font-semibold text-white">Recall</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : canEdit && !isEditMode ? (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, gap: 8 }}>
            <Pencil size={14} color="#3B82F6" />
            <Text style={{ flex: 1, fontSize: 13, color: "#1D4ED8" }}>Tap the pencil icon to edit this task.</Text>
          </View>
        ) : null}

        {/* Status */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-500 mb-2">Status</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {STATUS_OPTIONS.map((s) => {
              const isActive = task.status === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  onPress={() => {
                    const canChange = s.value === "done" ? !isCompleted : isEditable;
                    if (canChange) updateMutation.mutate({ status: s.value });
                  }}
                  disabled={s.value === "done" ? (isCompleted || updateMutation.isPending) : (!isEditable || updateMutation.isPending)}
                  className="px-3 py-1.5 rounded-full border"
                  style={isActive ? { backgroundColor: s.color + "20", borderColor: s.color } : { borderColor: "#E2E8F0" }}
                  testID={`status-${s.value}`}
                >
                  <Text className="text-xs font-semibold" style={{ color: isActive ? s.color : "#94A3B8" }}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Subtasks */}
        {(() => {
          const subtasks = task.subtasks ?? [];
          const completedCount = subtasks.filter((s) => s.completed).length;
          const totalCount = subtasks.length;
          return (
            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-semibold text-slate-500">
                  Subtasks{totalCount > 0 ? ` (${completedCount}/${totalCount})` : ""}
                </Text>
              </View>
              {subtasks.length > 0 && (
                <View className="mb-2" style={{ gap: 4 }}>
                  {subtasks.map((subtask) => (
                    <View key={subtask.id} className="flex-row items-center py-1" style={{ gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => toggleSubtaskMutation.mutate({ subtaskId: subtask.id, completed: !subtask.completed })}
                        disabled={!isEditable || toggleSubtaskMutation.isPending}
                        testID={`subtask-toggle-${subtask.id}`}
                      >
                        {subtask.completed ? (
                          <CheckSquare size={20} color="#10B981" />
                        ) : (
                          <Square size={20} color="#94A3B8" />
                        )}
                      </TouchableOpacity>
                      <Text
                        className="flex-1 text-sm text-slate-900 dark:text-white"
                        style={subtask.completed ? { textDecorationLine: "line-through", color: "#94A3B8" } : undefined}
                      >
                        {subtask.title}
                      </Text>
                      {isEditable ? (
                        <TouchableOpacity
                          onPress={() => deleteSubtaskMutation.mutate(subtask.id)}
                          disabled={deleteSubtaskMutation.isPending}
                          className="w-6 h-6 rounded-full items-center justify-center bg-slate-100 dark:bg-slate-700"
                          testID={`subtask-delete-${subtask.id}`}
                        >
                          <X size={12} color="#94A3B8" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
              {isEditable ? (
              <View className="flex-row items-center border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2" style={{ gap: 8 }}>
                <TextInput
                  value={newSubtaskTitle}
                  onChangeText={setNewSubtaskTitle}
                  placeholder="Add a subtask..."
                  placeholderTextColor="#94A3B8"
                  className="flex-1 text-sm text-slate-900 dark:text-white"
                  onSubmitEditing={() => {
                    if (newSubtaskTitle.trim()) createSubtaskMutation.mutate(newSubtaskTitle.trim());
                  }}
                  returnKeyType="done"
                  testID="new-subtask-input"
                />
                <TouchableOpacity
                  onPress={() => {
                    if (newSubtaskTitle.trim()) createSubtaskMutation.mutate(newSubtaskTitle.trim());
                  }}
                  disabled={!newSubtaskTitle.trim() || createSubtaskMutation.isPending}
                  testID="add-subtask-button"
                >
                  {createSubtaskMutation.isPending ? (
                    <ActivityIndicator size="small" color="#4361EE" />
                  ) : (
                    <Plus size={18} color={newSubtaskTitle.trim() ? "#4361EE" : "#CBD5E1"} />
                  )}
                </TouchableOpacity>
              </View>
              ) : null}
            </View>
          );
        })()}

        {/* Assignees */}
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-semibold text-slate-500">Assignees</Text>
            <View className="flex-row" style={{ gap: 8 }}>
              {isCreator && isEditMode ? (
                <TouchableOpacity
                  testID="assign-to-me-button"
                  onPress={() => currentUserId && handleToggleMember(currentUserId)}
                  disabled={!currentUserId || assignMutation.isPending || unassignMutation.isPending}
                  className={`flex-row items-center px-3 py-1 rounded-full ${isSelfAssigned ? "bg-red-50 dark:bg-red-900/30" : "bg-indigo-50 dark:bg-indigo-900/40"}`}
                  style={{ gap: 4 }}
                >
                  {(assignMutation.isPending || unassignMutation.isPending) ? (
                    <ActivityIndicator size="small" color={isSelfAssigned ? "#EF4444" : "#4361EE"} />
                  ) : isSelfAssigned ? (
                    <>
                      <X size={12} color="#EF4444" />
                      <Text className="text-xs font-semibold text-red-500 dark:text-red-400">Remove me</Text>
                    </>
                  ) : (
                    <>
                      <Check size={12} color="#4361EE" />
                      <Text className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Assign to me</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
              {isCreator && isEditMode ? (
                <TouchableOpacity
                  testID="manage-assignees-button"
                  onPress={() => setShowAssignModal(true)}
                  className="flex-row items-center px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700"
                  style={{ gap: 4 }}
                >
                  <UserPlus size={12} color="#64748B" />
                  <Text className="text-xs font-semibold text-slate-500">Manage</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {task.assignments && task.assignments.length > 0 ? (
            <View style={{ gap: 8 }}>
              {task.assignments.map((a) => (
                <View key={a.id} className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-indigo-600 items-center justify-center mr-2 overflow-hidden">
                    {a.user.image ? (
                      <Image source={{ uri: a.user.image }} style={{ width: 32, height: 32 }} resizeMode="cover" />
                    ) : (
                      <Text className="text-white text-xs font-bold">{a.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-900 dark:text-white">
                      {a.user.name}{a.userId === currentUserId ? " (you)" : ""}
                    </Text>
                    <Text className="text-xs text-slate-500">{a.user.email}</Text>
                  </View>
                  {isCreator && isEditMode ? (
                  <TouchableOpacity
                    onPress={() => unassignMutation.mutate(a.userId)}
                    disabled={unassignMutation.isPending}
                    className="w-6 h-6 rounded-full items-center justify-center bg-slate-100 dark:bg-slate-700"
                    testID={`unassign-${a.userId}`}
                  >
                    <X size={12} color="#94A3B8" />
                  </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-sm text-slate-400 italic">No one assigned yet</Text>
          )}
        </View>

        {/* Meta */}
        <View className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Text className="text-xs text-slate-400">
            Created {new Date(task.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </Text>
          {task.completedAt ? (
            <Text className="text-xs text-emerald-500 mt-1">
              Completed {new Date(task.completedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            </Text>
          ) : null}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Assign members modal */}
      <Modal visible={showAssignModal} transparent animationType="slide" onRequestClose={() => setShowAssignModal(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-end" activeOpacity={1} onPress={() => setShowAssignModal(false)}>
          <TouchableOpacity activeOpacity={1} className="bg-white dark:bg-slate-800 rounded-t-3xl px-4 pt-4 pb-8">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-slate-900 dark:text-white">Manage Assignees</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            {members.map((m) => {
              const isAssigned = assignedIds.has(m.userId);
              const isPending = assignMutation.isPending || unassignMutation.isPending;
              return (
                <TouchableOpacity
                  key={m.id}
                  testID={`assign-member-${m.userId}`}
                  onPress={() => handleToggleMember(m.userId)}
                  disabled={isPending}
                  className="flex-row items-center py-3 border-b border-slate-100 dark:border-slate-700"
                >
                  <View className="w-9 h-9 rounded-full bg-indigo-600 items-center justify-center mr-3 overflow-hidden">
                    {m.user.image ? (
                      <Image source={{ uri: m.user.image }} style={{ width: 36, height: 36 }} resizeMode="cover" />
                    ) : (
                      <Text className="text-white text-sm font-bold">{m.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-slate-900 dark:text-white">
                      {m.user.name}{m.userId === currentUserId ? " (you)" : ""}
                    </Text>
                    <Text className="text-xs text-slate-500">{m.user.email}</Text>
                  </View>
                  <View
                    className="w-6 h-6 rounded-full border-2 items-center justify-center"
                    style={{ backgroundColor: isAssigned ? "#4361EE" : "transparent", borderColor: isAssigned ? "#4361EE" : "#CBD5E1" }}
                  >
                    {isAssigned ? <Check size={14} color="white" /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 items-center justify-center px-8" activeOpacity={1} onPress={() => setShowDeleteConfirm(false)}>
          <TouchableOpacity activeOpacity={1} className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <View className="px-5 pt-5 pb-4 items-center">
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">Delete task?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">This task will be permanently removed.</Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700">
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-delete-button"
                onPress={() => { setShowDeleteConfirm(false); deleteMutation.mutate(); }}
                disabled={deleteMutation.isPending}
                className="flex-1 py-3.5 items-center"
              >
                <Text className="text-base font-semibold text-red-500">Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Recall confirmation modal */}
      <Modal visible={showRecallConfirm} transparent animationType="fade" onRequestClose={() => setShowRecallConfirm(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 items-center justify-center px-8" activeOpacity={1} onPress={() => setShowRecallConfirm(false)}>
          <TouchableOpacity activeOpacity={1} className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <View className="px-5 pt-5 pb-4 items-center">
              <Text style={{ fontSize: 28, marginBottom: 8 }}>⚠️</Text>
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">Recall this task?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                {task?.dueDate && new Date(task.dueDate) < new Date()
                  ? "This task is past its due date and will be marked as overdue once recalled."
                  : "This will move the task back to active and allow edits to be made."}
              </Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity onPress={() => setShowRecallConfirm(false)} className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700">
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-recall-button"
                onPress={() => { setShowRecallConfirm(false); updateMutation.mutate({ status: "todo" }); }}
                disabled={updateMutation.isPending}
                className="flex-1 py-3.5 items-center"
              >
                <Text className="text-base font-semibold text-amber-500">Recall</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
