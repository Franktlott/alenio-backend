import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Trash2, Bell, Pencil, X, Check } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { toast } from "burnt";
import type { Reminder, TaskStatus, TaskPriority } from "@/lib/types";
import { useDemoMode } from "@/lib/useDemo";

const STATUS_OPTIONS: { label: string; value: TaskStatus; color: string }[] = [
  { label: "To Do", value: "todo", color: "#64748B" },
  { label: "In Progress", value: "in_progress", color: "#3B82F6" },
  { label: "Done", value: "done", color: "#10B981" },
];

const PRIORITY_OPTIONS: { label: string; value: TaskPriority; color: string }[] = [
  { label: "Low", value: "low", color: "#94A3B8" },
  { label: "Medium", value: "medium", color: "#3B82F6" },
  { label: "High", value: "high", color: "#F97316" },
  { label: "Urgent", value: "urgent", color: "#EF4444" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#3B82F6",
  low: "#94A3B8",
};

export default function ReminderDetailScreen() {
  const { reminderId, teamId } = useLocalSearchParams<{ reminderId: string; teamId: string }>();
  const { data: session } = useSession();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [showDoneConfirm, setShowDoneConfirm] = useState<boolean>(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState<boolean>(false);
  const [showAcknowledgeConfirm, setShowAcknowledgeConfirm] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("medium");
  const [editDueDate, setEditDueDate] = useState<string>("");

  const { data: reminder, isLoading } = useQuery({
    queryKey: ["reminder", reminderId, teamId],
    queryFn: () => api.get<Reminder>(`/api/teams/${teamId}/reminders/${reminderId}`),
    enabled: !!reminderId && !!teamId,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Pick<Reminder, "title" | "description" | "priority" | "dueDate" | "status">>) =>
      api.patch<Reminder>(`/api/teams/${teamId}/reminders/${reminderId}`, updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(["reminder", reminderId, teamId], updated);
      queryClient.invalidateQueries({ queryKey: ["reminders", teamId] });
    },
    onError: (error: Error) => {
      toast({ title: error.message, preset: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/teams/${teamId}/reminders/${reminderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders", teamId] });
      router.back();
    },
    onError: (error: Error) => {
      toast({ title: error.message, preset: "error" });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: () => api.post<Reminder>(`/api/teams/${teamId}/reminders/${reminderId}/acknowledge`, {}),
    onSuccess: (updated) => {
      queryClient.setQueryData(["reminder", reminderId, teamId], updated);
      queryClient.invalidateQueries({ queryKey: ["reminders", teamId] });
      toast({ title: "Reminder acknowledged", preset: "done" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, preset: "error" });
    },
  });

  const currentUserId = session?.user?.id ?? null;
  const isCreator = !!currentUserId && reminder?.creatorId === currentUserId && !isDemo;
  const isCompleted = reminder?.status === "done";
  const canEdit = isCreator && !isCompleted;

  const handleEnterEditMode = () => {
    if (!reminder) return;
    setEditTitle(reminder.title);
    setEditDescription(reminder.description ?? "");
    setEditPriority(reminder.priority);
    setEditDueDate(reminder.dueDate ?? "");
    setIsEditMode(true);
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim()) {
      toast({ title: "Title is required", preset: "error" });
      return;
    }
    updateMutation.mutate(
      {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        dueDate: editDueDate || undefined,
      },
      {
        onSuccess: () => {
          setIsEditMode(false);
          toast({ title: "Reminder updated", preset: "done" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-slate-900" edges={["top"]} testID="loading-indicator">
        <LinearGradient colors={["#EA580C", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity onPress={() => router.back()} testID="back-button">
              <ArrowLeft size={22} color="white" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  if (!reminder) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-slate-900 items-center justify-center">
        <Text className="text-slate-500">Reminder not found</Text>
      </SafeAreaView>
    );
  }

  const dueDateObj = reminder.dueDate ? new Date(reminder.dueDate) : null;
  const isOverdue = dueDateObj && !isCompleted && dueDateObj < new Date();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-slate-900" edges={["top"]} testID="reminder-detail-screen">
      {/* Header */}
      <LinearGradient colors={["#EA580C", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity
            onPress={() => { setIsEditMode(false); router.back(); }}
            testID="back-button"
          >
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, marginLeft: 12 }}>
            <Bell size={16} color="white" />
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700", flex: 1 }} numberOfLines={1}>
              {isEditMode ? "Edit Reminder" : reminder.title}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {canEdit && !isEditMode ? (
              <TouchableOpacity onPress={handleEnterEditMode} testID="edit-mode-button">
                <Pencil size={18} color="white" />
              </TouchableOpacity>
            ) : null}
            {isEditMode ? (
              <>
                <TouchableOpacity
                  onPress={() => setIsEditMode(false)}
                  testID="cancel-edit-button"
                >
                  <X size={20} color="white" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveEdit}
                  disabled={updateMutation.isPending}
                  testID="save-edit-button"
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Check size={20} color="white" />
                  )}
                </TouchableOpacity>
              </>
            ) : null}
            {isCreator && !isEditMode ? (
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(true)}
                disabled={deleteMutation.isPending}
                testID="delete-button"
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Trash2 size={20} color="white" />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Reminder badge */}
          <View className="flex-row items-center mt-4 mb-2" style={{ gap: 8 }}>
            <View style={{ backgroundColor: "#FFF7ED", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Bell size={11} color="#F97316" />
              <Text style={{ color: "#F97316", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>Personal Reminder</Text>
            </View>
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[reminder.priority] ?? "#94A3B8" }} />
            <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: PRIORITY_COLORS[reminder.priority] ?? "#94A3B8" }}>
              {reminder.priority}
            </Text>
          </View>

          {/* Edit mode form */}
          {isEditMode ? (
            <View style={{ gap: 16, marginBottom: 16 }}>
              {/* Title */}
              <View>
                <Text className="text-sm font-semibold text-slate-500 mb-1">Title</Text>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="Reminder title..."
                  placeholderTextColor="#94A3B8"
                  className="text-lg font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
                  testID="edit-title-input"
                />
              </View>

              {/* Description */}
              <View>
                <Text className="text-sm font-semibold text-slate-500 mb-1">Description</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Add a description..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  className="text-base text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
                  style={{ minHeight: 72, textAlignVertical: "top" }}
                  testID="edit-description-input"
                />
              </View>

              {/* Priority picker */}
              <View>
                <Text className="text-sm font-semibold text-slate-500 mb-2">Priority</Text>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {PRIORITY_OPTIONS.map((p) => {
                    const isActive = editPriority === p.value;
                    return (
                      <TouchableOpacity
                        key={p.value}
                        onPress={() => setEditPriority(p.value)}
                        className="px-3 py-1.5 rounded-full border"
                        style={isActive ? { backgroundColor: p.color + "20", borderColor: p.color } : { borderColor: "#E2E8F0" }}
                        testID={`priority-option-${p.value}`}
                      >
                        <Text className="text-xs font-semibold" style={{ color: isActive ? p.color : "#94A3B8" }}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Due date */}
              <View>
                <Text className="text-sm font-semibold text-slate-500 mb-1">Due Date</Text>
                <View className="flex-row items-center border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2" style={{ gap: 8 }}>
                  <TextInput
                    value={editDueDate}
                    onChangeText={setEditDueDate}
                    placeholder="YYYY-MM-DD (optional)"
                    placeholderTextColor="#94A3B8"
                    className="flex-1 text-sm text-slate-900 dark:text-white"
                    testID="edit-due-date-input"
                  />
                  {editDueDate ? (
                    <TouchableOpacity onPress={() => setEditDueDate("")} testID="clear-due-date-button">
                      <X size={14} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          ) : (
            <>
              {/* Title */}
              <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{reminder.title}</Text>

              {/* Description */}
              {reminder.description ? (
                <Text className="text-base text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">{reminder.description}</Text>
              ) : null}

              {/* Attachment photo */}
              {reminder.attachmentUrl ? (
                <View className="mb-4 rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: "#F1F5F9" }}>
                  <Image
                    source={{ uri: reminder.attachmentUrl }}
                    style={{ width: "100%", height: 200 }}
                    resizeMode="cover"
                  />
                </View>
              ) : null}
            </>
          )}

          {/* Completed banner */}
          {isCompleted && !isEditMode ? (
            <View className="flex-row items-center bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 mb-4" style={{ gap: 8 }}>
              <Text style={{ fontSize: 16 }}>🔔</Text>
              <Text className="flex-1 text-sm text-emerald-700 dark:text-emerald-400">
                Reminder is done. Reopen it to make edits.
              </Text>
              <TouchableOpacity
                onPress={() => { if (!isDemo) setShowRecallConfirm(true); }}
                disabled={updateMutation.isPending || isDemo}
                className={`px-3 py-1 rounded-full ${isDemo ? "bg-emerald-300 dark:bg-emerald-800" : "bg-emerald-600"}`}
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-xs font-semibold text-white">Reopen</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Acknowledged banner */}
          {reminder.acknowledgedAt && !isEditMode ? (
            <View className="flex-row items-center bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-4" style={{ gap: 8 }}>
              <Text style={{ fontSize: 16 }}>✅</Text>
              <Text className="flex-1 text-sm text-violet-700">
                Acknowledged — will be deleted automatically in 24 hours.
              </Text>
            </View>
          ) : null}

          {/* Status */}
          {!isEditMode ? (
            <View className="mb-4">
              <Text className="text-sm font-semibold text-slate-500 mb-2">Status</Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {STATUS_OPTIONS.map((s) => {
                  const isActive = reminder.status === s.value;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      onPress={() => {
                        if (s.value === "done" && !isCompleted) {
                          setShowDoneConfirm(true);
                        } else if (s.value !== "done" && isCreator && !isCompleted && !isDemo) {
                          updateMutation.mutate({ status: s.value });
                        }
                      }}
                      disabled={
                        s.value === "done"
                          ? (isCompleted || updateMutation.isPending || isDemo)
                          : (!isCreator || isCompleted || updateMutation.isPending || isDemo)
                      }
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
          ) : null}

          {/* Due date display (view mode) */}
          {!isEditMode && dueDateObj ? (
            <View className="mb-4 flex-row items-center" style={{ gap: 8 }}>
              <View
                className="flex-row items-center px-3 py-2 rounded-xl"
                style={{ backgroundColor: isOverdue ? "#FEF2F2" : "#F8FAFC", gap: 6 }}
              >
                <Text style={{ fontSize: 14 }}>{isOverdue ? "⚠️" : "📅"}</Text>
                <Text
                  className="text-sm font-medium"
                  style={{ color: isOverdue ? "#EF4444" : "#64748B" }}
                >
                  Due {dueDateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </Text>
                {isOverdue ? (
                  <Text className="text-xs font-semibold" style={{ color: "#EF4444" }}>Overdue</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Creator info */}
          {!isEditMode ? (
            <View className="mb-4 flex-row items-center" style={{ gap: 8 }}>
              <View
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F97316", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
              >
                {reminder.creator?.image ? (
                  <Image source={{ uri: reminder.creator.image }} style={{ width: 32, height: 32 }} resizeMode="cover" />
                ) : (
                  <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>
                    {reminder.creator?.name?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <View>
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {reminder.creatorId === currentUserId ? "Your reminder" : reminder.creator?.name ?? "Unknown"}
                </Text>
                {reminder.creatorId !== currentUserId && reminder.creator?.email ? (
                  <Text className="text-xs text-slate-400">{reminder.creator.email}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Meta */}
          {!isEditMode ? (
            <View className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800" style={{ gap: 6 }}>
              <Text className="text-xs text-slate-400">
                Created {new Date(reminder.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </Text>
              {reminder.completedAt ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 11, color: "#10B981" }}>✓</Text>
                  <Text className="text-xs text-emerald-500">
                    Completed {new Date(reminder.completedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Acknowledge CTA — only shown if not yet acknowledged and not completed and is creator */}
          {!reminder.acknowledgedAt && !isCompleted && isCreator && !isEditMode ? (
            <TouchableOpacity
              onPress={() => setShowAcknowledgeConfirm(true)}
              disabled={acknowledgeMutation.isPending}
              className="mx-1 rounded-2xl py-4 items-center mb-3"
              style={{ backgroundColor: "#10B981" }}
              testID="acknowledge-button"
            >
              {acknowledgeMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Check size={18} color="white" />
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Acknowledge</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : null}

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete confirmation modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 items-center justify-center px-8" activeOpacity={1} onPress={() => setShowDeleteConfirm(false)}>
          <TouchableOpacity activeOpacity={1} className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <View className="px-5 pt-5 pb-4 items-center">
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Bell size={24} color="#EF4444" />
              </View>
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">Delete reminder?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">This reminder will be permanently removed.</Text>
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

      {/* Done confirmation modal */}
      <Modal visible={showDoneConfirm} transparent animationType="fade" onRequestClose={() => setShowDoneConfirm(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 items-center justify-center px-8" activeOpacity={1} onPress={() => setShowDoneConfirm(false)}>
          <TouchableOpacity activeOpacity={1} className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <View className="px-5 pt-5 pb-4 items-center">
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 24 }}>🔔</Text>
              </View>
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">Mark as Done?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                This will complete the reminder.
              </Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity onPress={() => setShowDoneConfirm(false)} className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700">
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-done-button"
                onPress={() => { setShowDoneConfirm(false); updateMutation.mutate({ status: "done" }); }}
                disabled={updateMutation.isPending}
                className="flex-1 py-3.5 items-center"
              >
                <Text className="text-base font-semibold text-emerald-500">Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Reopen (recall) confirmation modal */}
      <Modal visible={showRecallConfirm} transparent animationType="fade" onRequestClose={() => setShowRecallConfirm(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 items-center justify-center px-8" activeOpacity={1} onPress={() => setShowRecallConfirm(false)}>
          <TouchableOpacity activeOpacity={1} className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <View className="px-5 pt-5 pb-4 items-center">
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 24 }}>↩️</Text>
              </View>
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">Reopen this reminder?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                This will move the reminder back to active.
              </Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity onPress={() => setShowRecallConfirm(false)} className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700">
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-reopen-button"
                onPress={() => { setShowRecallConfirm(false); updateMutation.mutate({ status: "todo" }); }}
                disabled={updateMutation.isPending}
                className="flex-1 py-3.5 items-center"
              >
                <Text className="text-base font-semibold text-amber-500">Reopen</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Acknowledge confirmation modal */}
      <Modal visible={showAcknowledgeConfirm} transparent animationType="fade" onRequestClose={() => setShowAcknowledgeConfirm(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 items-center justify-center px-8" activeOpacity={1} onPress={() => setShowAcknowledgeConfirm(false)}>
          <TouchableOpacity activeOpacity={1} className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <View className="px-5 pt-5 pb-4 items-center">
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Check size={24} color="#10B981" />
              </View>
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">Acknowledge reminder?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                This reminder will be automatically deleted 24 hours after acknowledging.
              </Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity onPress={() => setShowAcknowledgeConfirm(false)} className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700">
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-acknowledge-button"
                onPress={() => { setShowAcknowledgeConfirm(false); acknowledgeMutation.mutate(); }}
                disabled={acknowledgeMutation.isPending}
                className="flex-1 py-3.5 items-center"
              >
                <Text className="text-base font-semibold text-emerald-500">Acknowledge</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
