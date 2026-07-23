import React, { useState, useEffect, useMemo, useRef } from "react";
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
  Pressable,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Trash2, RefreshCw, UserPlus, X, Check, Plus, Square, CheckSquare, Pencil, AlertTriangle } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { toast } from "burnt";
import type { Task, Team, Subtask, SubtaskCompletion } from "@/lib/types";
import { OneOnOneAssociateFeedbackForm } from "@/components/OneOnOneAssociateFeedbackForm";
import type { OneOnOneAssociateFeedbackContext } from "@/lib/one-on-one-feedback-api";
import { fetchOneOnOneAssociateFeedbackContext } from "@/lib/one-on-one-feedback-api";
import {
  formatTaskDescriptionForDisplay,
  isFeedbackTaskDescription,
  parseFeedbackTaskDescription,
} from "@/lib/one-on-one-feedback";
import { isRecurringTask, earlierIncompleteSeriesTasks, type RecurrenceScope } from "@/lib/recurring-task";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import { isTaskOverdue } from "@/lib/seneca-task-display";
import { calendarDueIso, formatTaskDueDateLabel, resolveTimeZone } from "@/lib/timezone";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { ProFeatureLockedView } from "@/components/ProFeatureLockedView";
import { hasWorkspaceTaskAccess } from "@/lib/plan-access-copy";
import { useSubscriptionStore } from "@/lib/state/subscription-store";

function sameCalendarDay(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#3B82F6",
  low: "#94A3B8",
};

export default function TaskDetailScreen() {
  const { taskId, teamId, startEdit } = useLocalSearchParams<{ taskId: string; teamId: string; startEdit?: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userTimeZone = resolveTimeZone();
  const insets = useSafeAreaInsets();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSeriesList, setShowSeriesList] = useState(false);
  const [recurringScopeMode, setRecurringScopeMode] = useState<"delete" | "edit" | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [showDoneConfirm, setShowDoneConfirm] = useState(false);
  const [showSeriesOrderWarning, setShowSeriesOrderWarning] = useState(false);
  const [showSubtaskBlock, setShowSubtaskBlock] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<string>("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [draftPriority, setDraftPriority] = useState<string>("");
  const [draftDueDate, setDraftDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [feedbackContext, setFeedbackContext] = useState<OneOnOneAssociateFeedbackContext | null>(null);
  const [feedbackContextLoading, setFeedbackContextLoading] = useState(false);
  const [feedbackCompletionActive, setFeedbackCompletionActive] = useState(false);
  const feedbackCompletionActiveRef = useRef(false);
  feedbackCompletionActiveRef.current = feedbackCompletionActive;
  const promptCompleteTaskRef = useRef<() => void>(() => {});

  const persistedPlan = useSubscriptionStore((s) => s.plan);
  const { data: subscription, isFetched: subscriptionFetched } = useQuery({
    queryKey: ["subscription", teamId],
    queryFn: () =>
      api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
        `/api/teams/${teamId}/subscription`,
      ),
    enabled: !!teamId,
  });
  const hasTaskAccess = hasWorkspaceTaskAccess(subscription, persistedPlan);

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", taskId, teamId],
    queryFn: () => api.get<Task>(`/api/teams/${teamId}/tasks/${taskId}`),
    enabled: !!taskId && !!teamId && hasTaskAccess,
  });

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId && hasTaskAccess,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Task> & { scope?: RecurrenceScope }) =>
      api.patch<Task>(`/api/teams/${teamId}/tasks/${taskId}`, updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(["task", taskId, teamId], updated);
      invalidateTaskCaches(queryClient, teamId);
    },
    onError: (error: Error) => {
      toast({ title: error.message, preset: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (scope: RecurrenceScope) =>
      api.delete(`/api/teams/${teamId}/tasks/${taskId}?scope=${scope}`),
    onSuccess: () => {
      invalidateTaskCaches(queryClient, teamId);
      router.back();
    },
  });

  const assignMutation = useMutation({
    mutationFn: (userIds: string[]) =>
      api.post(`/api/teams/${teamId}/tasks/${taskId}/assign`, { userIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
      invalidateTaskCaches(queryClient, teamId);
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/teams/${teamId}/tasks/${taskId}/assign/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
      invalidateTaskCaches(queryClient, teamId);
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
      if (variables.completed && !isCompleted) {
        const subtasks = task?.subtasks ?? [];
        const isJointTask = task?.isJoint === true;
        const incompleteSubtasks = subtasks.filter((s) =>
          isJointTask
            ? !(s.completions ?? []).some((c: SubtaskCompletion) => c.userId === currentUserId)
            : !s.completed
        );
        if (incompleteSubtasks.length === 1 && incompleteSubtasks[0].id === variables.subtaskId && subtasks.length > 0) {
          promptCompleteTaskRef.current();
        }
      }
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
  const feedbackMeta = useMemo(
    () => (task?.description ? parseFeedbackTaskDescription(task.description) : null),
    [task?.description],
  );
  const isFeedbackTask = isFeedbackTaskDescription(task?.description);
  const isFeedbackAssignee = !!feedbackMeta && isSelfAssigned;
  const isCompleted = task?.status === "done";
  const showFeedbackFormLoading =
    !!feedbackMeta &&
    isFeedbackAssignee &&
    !isCompleted &&
    !feedbackCompletionActive &&
    feedbackContextLoading &&
    !feedbackContext;
  const showFocusedFeedbackTask = isFeedbackTask && isFeedbackAssignee;
  const isCreator = !!currentUserId && task?.creator?.id === currentUserId;
  const isOwnerOrLeader = team?.role === "owner" || team?.role === "team_leader" || team?.role === "admin";
  const isRegularMember = !isOwnerOrLeader;
  const canEdit = (isCreator || isOwnerOrLeader) && !isCompleted;
  const canComplete = !isCompleted && !isFeedbackTask && (isSelfAssigned || canEdit || isCreator);
  const isEditable = canEdit && isEditMode;

  const taskIsRecurring = !!task && isRecurringTask(task);
  const seriesId = task?.recurrenceSeriesId ?? null;
  const originalDueDate = task?.dueDate ? new Date(task.dueDate) : null;

  const { data: seriesTasksData, isPending: seriesTasksPending } = useQuery({
    queryKey: ["series-tasks", teamId, seriesId],
    queryFn: () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        `/api/teams/${teamId}/tasks?recurrenceSeriesId=${encodeURIComponent(seriesId!)}&limit=400`,
      ),
    enabled: !!teamId && !!seriesId,
  });
  const seriesTasks = seriesTasksData?.tasks ?? [];
  const seriesCompletedCount = seriesTasks.filter((t) => t.status === "done").length;
  const SERIES_PREVIEW_LIMIT = 5;
  const seriesPreviewTasks = seriesTasks.slice(0, SERIES_PREVIEW_LIMIT);
  const hasMoreSeriesTasks = seriesTasks.length > SERIES_PREVIEW_LIMIT;

  const openSeriesTask = (id: string) => {
    if (id === taskId) return;
    setShowSeriesList(false);
    router.replace({
      pathname: "/task-detail",
      params: { taskId: id, teamId: teamId! },
    });
  };

  const renderSeriesRow = (item: Task, index: number, opts?: { first?: boolean }) => {
    const done = item.status === "done";
    const isCurrent = item.id === taskId;
    return (
      <TouchableOpacity
        key={item.id}
        disabled={isCurrent}
        onPress={() => openSeriesTask(item.id)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          paddingVertical: 6,
          gap: 8,
          backgroundColor: isCurrent ? "#EEF2FF" : "transparent",
          borderTopWidth: opts?.first || index === 0 ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: "#E2E8F0",
        }}
        testID={`series-task-${item.id}`}
      >
        {done ? (
          <Check size={14} color="#10B981" strokeWidth={2.75} />
        ) : (
          <X size={14} color="#EF4444" strokeWidth={2.75} />
        )}
        <Text
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: isCurrent ? "700" : "500",
            color: "#0F172A",
          }}
          numberOfLines={1}
        >
          {formatTaskDueDateLabel(item.dueDate, userTimeZone)}
          {isCurrent ? " · This task" : ""}
        </Text>
      </TouchableOpacity>
    );
  };

  const beginEdit = () => {
    if (!task) return;
    setDraftTitle(task.title);
    setDraftPriority(task.priority);
    setDraftDueDate(task.dueDate ? new Date(task.dueDate) : null);
    setShowDatePicker(false);
    setIsEditMode(true);
  };

  const seriesFieldsChanged = () =>
    !!task &&
    (draftTitle.trim() !== task.title.trim() ||
      draftPriority !== task.priority ||
      !sameCalendarDay(draftDueDate, originalDueDate));

  const earlierOpenSeriesTasks = useMemo(
    () => (taskId ? earlierIncompleteSeriesTasks(seriesTasks, taskId) : []),
    [seriesTasks, taskId],
  );

  const promptCompleteTask = () => {
    if (!task) return;
    if (earlierOpenSeriesTasks.length > 0) {
      setShowSeriesOrderWarning(true);
      return;
    }
    setShowDoneConfirm(true);
  };
  promptCompleteTaskRef.current = promptCompleteTask;

  const confirmCompleteTask = () => {
    setShowSeriesOrderWarning(false);
    setShowDoneConfirm(false);
    updateMutation.mutate({ status: "done" });
  };

  const handleMarkComplete = () => {
    if (!task) return;
    if (isFeedbackTaskDescription(task.description)) return;
    const subtasks = task.subtasks ?? [];
    const isJointTask = task.isJoint === true;
    const incomplete = subtasks.filter((st) =>
      isJointTask
        ? !(st.completions ?? []).some((c: SubtaskCompletion) => c.userId === currentUserId)
        : !st.completed,
    );
    if (incomplete.length > 0) {
      setShowSubtaskBlock(true);
      return;
    }
    promptCompleteTask();
  };

  const saveTaskEdit = (scope: RecurrenceScope = "task") => {
    if (!task) return;
    updateMutation.mutate(
      {
        title: draftTitle.trim() || task.title,
        priority: draftPriority as Task["priority"],
        dueDate: draftDueDate ? calendarDueIso(draftDueDate, userTimeZone) : null,
        ...(scope === "series" ? { scope: "series" } : {}),
      },
      {
        onSuccess: () => {
          setIsEditMode(false);
          setShowDatePicker(false);
          setRecurringScopeMode(null);
        },
      },
    );
  };

  useEffect(() => {
    if (task && startEdit === "1" && canEdit) {
      beginEdit();
    }
  }, [task?.id, startEdit]);

  useEffect(() => {
    if (isEditMode && task) {
      setDraftTitle(task.title);
      setDraftPriority(task.priority);
      setDraftDueDate(task.dueDate ? new Date(task.dueDate) : null);
    }
  }, [isEditMode]);

  useEffect(() => {
    if (feedbackCompletionActive) return;

    if (!feedbackMeta || !isFeedbackAssignee) {
      setFeedbackContext(null);
      setFeedbackContextLoading(false);
      return;
    }
    if (isCompleted && !feedbackCompletionActive) {
      setFeedbackContext(null);
      setFeedbackContextLoading(false);
      return;
    }
    let cancelled = false;
    setFeedbackContextLoading(true);
    void fetchOneOnOneAssociateFeedbackContext(
      feedbackMeta.teamId,
      feedbackMeta.memberUserId,
      feedbackMeta.meetingId,
      feedbackMeta.fieldId,
    )
      .then((context) => {
        if (cancelled || feedbackCompletionActiveRef.current) return;
        setFeedbackContext(context.submitted ? null : context);
      })
      .catch(() => {
        if (!cancelled) setFeedbackContext(null);
      })
      .finally(() => {
        if (!cancelled) setFeedbackContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [feedbackMeta, isFeedbackAssignee, isCompleted, feedbackCompletionActive]);

  const handleToggleMember = (userId: string) => {
    if (assignedIds.has(userId)) {
      unassignMutation.mutate(userId);
    } else {
      assignMutation.mutate([userId]);
    }
  };

  if (!hasTaskAccess && !subscriptionFetched) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "transparent" }} edges={["top"]} testID="loading-indicator">
        <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
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

  if (!hasTaskAccess && subscriptionFetched) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "transparent" }} edges={["top"]} testID="task-detail-paywall-screen">
        <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity onPress={() => router.back()} testID="back-button">
              <ArrowLeft size={22} color="white" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
        <ProFeatureLockedView
          title="Pro plan required"
          body="Task details are included with the Pro plan. View what is included in Workplace Access."
          testID="task-detail-paywall"
        />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "transparent" }} edges={["top"]} testID="loading-indicator">
        <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
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
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: "transparent" }}>
        <Text className="text-slate-500">Task not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]} testID="task-detail-screen" style={{ backgroundColor: "transparent" }}>
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => { setIsEditMode(false); router.back(); }} testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <Text style={{ flex: 1, marginLeft: 12, color: "white", fontSize: 18, fontWeight: "700" }} numberOfLines={1}>
            {task.isJoint ? "🤝 " : ""}{task.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {canEdit && isEditMode ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    setIsEditMode(false);
                    setShowDatePicker(false);
                  }}
                  testID="cancel-edit-button"
                >
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "500" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (taskIsRecurring && seriesFieldsChanged()) {
                      setRecurringScopeMode("edit");
                      return;
                    }
                    saveTaskEdit("task");
                  }}
                  disabled={updateMutation.isPending}
                  testID="save-edit-button"
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
            {canEdit && !isEditMode && !showFocusedFeedbackTask ? (
              <TouchableOpacity onPress={beginEdit} testID="enter-edit-button">
                <Pencil size={18} color="white" />
              </TouchableOpacity>
            ) : null}
            {isCreator && isEditMode ? (
              <TouchableOpacity
                onPress={() => (taskIsRecurring ? setRecurringScopeMode("delete") : setShowDeleteConfirm(true))}
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
            {!isCreator && !showFocusedFeedbackTask ? <View style={{ width: 20 }} /> : null}
            <Image source={require("@/assets/alenio-icon.png")} style={{ width: 30, height: 30, borderRadius: 6 }} />
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        style={showFocusedFeedbackTask ? { backgroundColor: "#F8FAFC" } : undefined}
        contentContainerStyle={
          showFocusedFeedbackTask
            ? isCompleted
              ? { flexGrow: 1, justifyContent: "center", paddingVertical: 32 }
              : { paddingBottom: 32, flexGrow: 1 }
            : undefined
        }
      >
        {/* Priority indicator */}
        {!showFocusedFeedbackTask ? (
        <View className="flex-row items-center mt-4 mb-2" style={{ gap: 8 }}>
          {isEditMode ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginRight: 4 }}>Priority:</Text>
              {["urgent", "high", "medium", "low"].map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setDraftPriority(p)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                    backgroundColor: draftPriority === p ? (PRIORITY_COLORS[p] ?? "#94A3B8") + "20" : "transparent",
                    borderWidth: 1,
                    borderColor: draftPriority === p ? (PRIORITY_COLORS[p] ?? "#94A3B8") : "#E2E8F0",
                  }}
                  testID={`priority-${p}`}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", textTransform: "capitalize", color: draftPriority === p ? (PRIORITY_COLORS[p] ?? "#94A3B8") : "#94A3B8" }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
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
            </>
          )}
        </View>
        ) : null}

        {/* Title — hidden for focused check-in follow-up (title is in the header) */}
        {!showFocusedFeedbackTask ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: task.isJoint ? 8 : 12, marginTop: 0 }}>
          {isEditMode ? (
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              style={{ flex: 1, fontSize: 24, fontWeight: "700", color: "#0F172A", borderBottomWidth: 1, borderBottomColor: "#4361EE", paddingBottom: 4 }}
              placeholder="Task title"
              placeholderTextColor="#94A3B8"
              testID="edit-title-input"
            />
          ) : (
            <Text className="text-2xl font-bold text-slate-900 dark:text-white" style={{ flex: 1 }}>{task.title}</Text>
          )}
        </View>
        ) : null}
        {!showFocusedFeedbackTask && task.isJoint ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: "#4338CA" }}
              testID="joint-task-badge"
            >
              <Text style={{ fontSize: 13 }}>🤝</Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "white", letterSpacing: 0.3 }}>Joint Task</Text>
            </View>
          </View>
        ) : null}

        {feedbackContext && feedbackMeta ? (
          <OneOnOneAssociateFeedbackForm
            teamId={feedbackMeta.teamId}
            memberUserId={feedbackMeta.memberUserId}
            meetingId={feedbackMeta.meetingId}
            context={feedbackContext}
            onCompletionStarted={() => setFeedbackCompletionActive(true)}
            onCompletionFailed={() => setFeedbackCompletionActive(false)}
            onSubmitted={() => {
              setFeedbackCompletionActive(false);
              void queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
              invalidateTaskCaches(queryClient, teamId);
              router.back();
            }}
          />
        ) : null}

        {showFeedbackFormLoading ? (
          <View
            style={{
              borderRadius: 20,
              backgroundColor: "#FFFFFF",
              marginTop: 8,
              marginBottom: 16,
              padding: 28,
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor: "#EEF2FF",
            }}
          >
            <ActivityIndicator color="#7C3AED" />
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B" }}>
              Loading your follow-up…
            </Text>
          </View>
        ) : null}

        {task.description && !feedbackContext && !showFeedbackFormLoading && !isFeedbackTask ? (
          <Text className="text-base text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
            {formatTaskDescriptionForDisplay(task.description)}
          </Text>
        ) : null}

        {/* Attachment photo */}
        {task.attachmentUrl ? (
          <Image
            source={{ uri: task.attachmentUrl }}
            style={{ width: "100%", height: 200, borderRadius: 12, marginBottom: 16 }}
            resizeMode="cover"
          />
        ) : null}

        {/* Completed state */}
        {isCompleted && isFeedbackTask ? (
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 28,
              paddingVertical: 24,
            }}
            testID="feedback-follow-up-complete"
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
                shadowColor: "#0F172A",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#ECFDF5",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={22} color="#059669" strokeWidth={2.5} />
              </View>
            </View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: "#0F172A",
                textAlign: "center",
                letterSpacing: -0.3,
                marginBottom: 8,
              }}
            >
              Follow-up complete
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "500",
                color: "#64748B",
                textAlign: "center",
                lineHeight: 22,
                maxWidth: 280,
              }}
            >
              This check-in follow-up is complete.
            </Text>
          </View>
        ) : isCompleted ? (
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
        ) : null}

        {/* Subtasks */}
        {!showFocusedFeedbackTask ? (() => {
          const subtasks = task.subtasks ?? [];
          const isJointTask = task.isJoint === true;

          const isSubtaskDoneForMe = (s: Subtask) =>
            isJointTask
              ? (s.completions ?? []).some((c: SubtaskCompletion) => c.userId === currentUserId)
              : s.completed;

          const completedCount = isJointTask
            ? subtasks.filter((s) => isSubtaskDoneForMe(s)).length
            : subtasks.filter((s) => s.completed).length;
          const totalCount = subtasks.length;
          return (
            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-semibold text-slate-500">
                  Subtasks{totalCount > 0 ? ` (${completedCount}/${totalCount})` : ""}
                </Text>
              </View>
              {subtasks.length > 0 && (
                <View className="mb-2" style={{ gap: 2 }}>
                  {subtasks.map((subtask) => {
                    const doneForMe = isSubtaskDoneForMe(subtask);
                    const completions = subtask.completions ?? [];
                    return (
                    <TouchableOpacity
                      key={subtask.id}
                      onPress={() => toggleSubtaskMutation.mutate({ subtaskId: subtask.id, completed: !doneForMe })}
                      disabled={isCompleted || toggleSubtaskMutation.isPending}
                      testID={`subtask-toggle-${subtask.id}`}
                      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, gap: 10 }}
                      activeOpacity={0.6}
                    >
                      {doneForMe ? (
                        <CheckSquare size={22} color="#10B981" />
                      ) : (
                        <Square size={22} color="#94A3B8" />
                      )}
                      <Text
                        className="flex-1 text-sm text-slate-900 dark:text-white"
                        style={doneForMe ? { textDecorationLine: "line-through", color: "#94A3B8" } : undefined}
                      >
                        {subtask.title}
                      </Text>
                      {isJointTask && completions.length > 0 ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: -6 }}>
                          {completions.slice(0, 3).map((c: SubtaskCompletion) => (
                            <View
                              key={c.userId}
                              style={{
                                width: 22, height: 22, borderRadius: 11,
                                backgroundColor: "#4361EE",
                                borderWidth: 1.5, borderColor: "white",
                                alignItems: "center", justifyContent: "center",
                                overflow: "hidden",
                              }}
                            >
                              {c.user.image ? (
                                <Image source={{ uri: c.user.image }} style={{ width: 22, height: 22, borderRadius: 11 }} />
                              ) : (
                                <Text style={{ fontSize: 9, fontWeight: "700", color: "white" }}>
                                  {c.user.name?.charAt(0).toUpperCase() ?? "?"}
                                </Text>
                              )}
                            </View>
                          ))}
                          {completions.length > 3 ? (
                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#94A3B8", borderWidth: 1.5, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 8, fontWeight: "700", color: "white" }}>+{completions.length - 3}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      {isEditable ? (
                        <TouchableOpacity
                          onPress={() => deleteSubtaskMutation.mutate(subtask.id)}
                          disabled={deleteSubtaskMutation.isPending}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          className="w-7 h-7 rounded-full items-center justify-center bg-slate-100 dark:bg-slate-700"
                          testID={`subtask-delete-${subtask.id}`}
                        >
                          <X size={12} color="#94A3B8" />
                        </TouchableOpacity>
                      ) : null}
                    </TouchableOpacity>
                    );
                  })}
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
        })() : null}

        {/* Assignees */}
        {!showFocusedFeedbackTask ? (
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-semibold text-slate-500">Assignees</Text>
            <View className="flex-row" style={{ gap: 8 }}>
              {isEditable ? (
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
              {isEditable ? (
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

          {task.isJoint ? (
            <View
              className="mb-2 px-3 py-2 rounded-xl"
              style={{ backgroundColor: "#EFF6FF" }}
              testID="joint-assignees-note"
            >
              <Text className="text-xs text-blue-600">All assignees work on this task together.</Text>
            </View>
          ) : null}
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
                  {isEditable ? (
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
        ) : null}

        {/* Recurring series chain */}
        {!showFocusedFeedbackTask && seriesId ? (
          <View className="mb-4" testID="recurring-series-chain">
            <Text className="text-sm font-semibold text-slate-500 mb-1.5">
              Series
              {seriesTasks.length > 0
                ? ` (${seriesCompletedCount}/${seriesTasks.length})`
                : ""}
            </Text>
            {seriesTasksPending && seriesTasks.length === 0 ? (
              <ActivityIndicator color="#4361EE" style={{ alignSelf: "flex-start", marginVertical: 4 }} />
            ) : seriesTasks.length === 0 ? (
              <Text className="text-sm text-slate-400 italic">No tasks in this series</Text>
            ) : (
              <View
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  overflow: "hidden",
                  backgroundColor: "#F8FAFC",
                }}
              >
                {seriesPreviewTasks.map((item, index) => renderSeriesRow(item, index))}
                {hasMoreSeriesTasks ? (
                  <TouchableOpacity
                    onPress={() => setShowSeriesList(true)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: "#E2E8F0",
                      backgroundColor: "#FFFFFF",
                    }}
                    testID="series-show-more"
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#4361EE", textAlign: "center" }}>
                      Show more ({seriesTasks.length - SERIES_PREVIEW_LIMIT} more)
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        ) : null}

        {/* Due date */}
        {!showFocusedFeedbackTask && isEditMode ? (
          <View className="mb-4">
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 8 }}>Due date</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: draftDueDate ? "#4361EE" : "#E2E8F0",
                backgroundColor: draftDueDate ? "#4361EE0D" : "#F8FAFC",
              }}
              testID="edit-due-date-button"
            >
              <Text style={{ fontSize: 16, marginRight: 10 }}>📅</Text>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: draftDueDate ? "#4361EE" : "#94A3B8" }}>
                {draftDueDate
                  ? draftDueDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Select a due date"}
              </Text>
              {draftDueDate ? (
                <TouchableOpacity
                  onPress={() => setDraftDueDate(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  testID="clear-due-date-button"
                >
                  <Text style={{ color: "#94A3B8", fontSize: 15 }}>✕</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: "#94A3B8" }}>›</Text>
              )}
            </TouchableOpacity>

            {Platform.OS === "ios" ? (
              <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
                <View style={{ flex: 1, justifyContent: "flex-end" }}>
                  <Pressable
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15,23,42,0.35)" }}
                    onPress={() => setShowDatePicker(false)}
                  />
                  <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Math.max(insets.bottom, 16) }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>Due Date</Text>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text style={{ color: "#4361EE", fontSize: 15, fontWeight: "700" }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={draftDueDate ?? new Date()}
                      mode="date"
                      display="inline"
                      minimumDate={isRegularMember ? new Date() : undefined}
                      onChange={(_e, date) => {
                        if (!date) return;
                        const next = new Date(date);
                        next.setHours(23, 59, 59, 0);
                        setDraftDueDate(next);
                      }}
                      testID="edit-date-time-picker"
                      style={{ alignSelf: "center", marginHorizontal: 8 }}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        setDraftDueDate(null);
                        setShowDatePicker(false);
                      }}
                      style={{
                        marginHorizontal: 20,
                        marginTop: 4,
                        marginBottom: 4,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: "#F8FAFC",
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        alignItems: "center",
                      }}
                      testID="clear-due-date-sheet-button"
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#EF4444" }}>Clear date</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            ) : showDatePicker ? (
              <DateTimePicker
                value={draftDueDate ?? new Date()}
                mode="date"
                display="calendar"
                minimumDate={isRegularMember ? new Date() : undefined}
                onChange={(_e, date) => {
                  setShowDatePicker(false);
                  if (!date) return;
                  const next = new Date(date);
                  next.setHours(23, 59, 59, 0);
                  setDraftDueDate(next);
                }}
                testID="edit-date-time-picker"
              />
            ) : null}
          </View>
        ) : !showFocusedFeedbackTask && task.dueDate && !isCompleted ? (() => {
          const overdue = isTaskOverdue(task);
          const dueLabel = formatTaskDueDateLabel(task.dueDate, userTimeZone);
          const dueToday =
            !overdue &&
            task.dueDate &&
            formatTaskDueDateLabel(task.dueDate, userTimeZone) === formatTaskDueDateLabel(new Date(), userTimeZone);
          return (
            <View className="mb-4 flex-row items-center">
              <View
                className="flex-row items-center px-3 py-2 rounded-xl"
                style={{ backgroundColor: overdue ? "#FEF2F2" : dueToday ? "#FFF7ED" : "#F8FAFC", gap: 6 }}
              >
                <Text style={{ fontSize: 14 }}>{overdue ? "⚠️" : "📅"}</Text>
                {dueToday ? (
                  <Text className="text-sm font-medium" style={{ color: "#EA580C" }}>Due today</Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text className="text-sm font-medium" style={{ color: "#0F172A" }}>Due </Text>
                    <Text className="text-sm font-medium" style={{ color: "#0F172A" }}>{dueLabel}</Text>
                  </View>
                )}
                {overdue ? (
                  <Text className="text-xs font-semibold" style={{ color: "#EF4444" }}>Overdue</Text>
                ) : null}
              </View>
            </View>
          );
        })() : null}

        {/* Meta */}
        {!showFocusedFeedbackTask ? (
        <View className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800" style={{ gap: 6 }}>
          <Text className="text-xs text-slate-400">
            Created {new Date(task.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </Text>
          {task.dueDate ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 11, color: "#94A3B8" }}>⏱</Text>
              <Text className="text-xs" style={{ color: "#0F172A" }}>
                Due {formatTaskDueDateLabel(task.dueDate, userTimeZone)}
              </Text>
            </View>
          ) : null}
          {task.completedAt ? (() => {
            const completedOverdue = task.completedAt && task.dueDate
              ? new Date(task.completedAt) > new Date(task.dueDate)
              : false;
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 11, color: completedOverdue ? "#F97316" : "#10B981" }}>✓</Text>
                <Text className="text-xs">
                  <Text style={{ color: completedOverdue ? "#F97316" : "#10B981" }}>
                    {completedOverdue ? "Completed overdue" : "Completed"}
                  </Text>
                  {" "}
                  <Text style={{ color: "#0F172A" }}>
                    {new Date(task.completedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </Text>
                </Text>
              </View>
            );
          })() : null}
        </View>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>

      {!showFocusedFeedbackTask && canComplete ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: 1,
            borderTopColor: "#E2E8F0",
            backgroundColor: "#FFFFFF",
          }}
        >
          <TouchableOpacity
            onPress={handleMarkComplete}
            disabled={updateMutation.isPending}
            style={{
              backgroundColor: "#4361EE",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
            testID="mark-complete-button"
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>Mark as complete</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

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

      {/* Full recurring series list */}
      <Modal visible={showSeriesList} transparent animationType="slide" onRequestClose={() => setShowSeriesList(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowSeriesList(false)} />
          <View
            style={{
              backgroundColor: "white",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "70%",
              paddingBottom: Math.max(insets.bottom, 12),
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 8, marginBottom: 10 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>
                Series ({seriesCompletedCount}/{seriesTasks.length})
              </Text>
              <Pressable
                onPress={() => setShowSeriesList(false)}
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
                testID="series-list-close"
              >
                <X size={14} color="#64748B" />
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
              showsVerticalScrollIndicator
              testID="series-list-scroll"
            >
              <View
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  overflow: "hidden",
                  backgroundColor: "#F8FAFC",
                }}
              >
                {seriesTasks.map((item, index) => renderSeriesRow(item, index))}
              </View>
            </ScrollView>
          </View>
        </View>
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
                onPress={() => {
                  setShowDeleteConfirm(false);
                  deleteMutation.mutate("task");
                }}
                disabled={deleteMutation.isPending}
                className="flex-1 py-3.5 items-center"
              >
                <Text className="text-base font-semibold text-red-500">Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Recurring task scope modal (delete / edit) */}
      <Modal visible={recurringScopeMode !== null} transparent animationType="fade" onRequestClose={() => setRecurringScopeMode(null)}>
        <TouchableOpacity className="flex-1 bg-black/40 items-center justify-center px-8" activeOpacity={1} onPress={() => setRecurringScopeMode(null)}>
          <TouchableOpacity activeOpacity={1} className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <View className="px-5 pt-5 pb-4 items-center">
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1 text-center">
                {recurringScopeMode === "delete" ? "Delete recurring task?" : "Update recurring task?"}
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                {recurringScopeMode === "delete"
                  ? "Delete only this occurrence, or the entire series including future tasks."
                  : "Apply changes to only this occurrence, or to this and all upcoming tasks in the series."}
              </Text>
            </View>
            <View className="border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity onPress={() => setRecurringScopeMode(null)} className="py-3.5 items-center border-b border-slate-100 dark:border-slate-700">
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="recurring-scope-task-button"
                onPress={() => {
                  if (recurringScopeMode === "delete") {
                    setRecurringScopeMode(null);
                    deleteMutation.mutate("task");
                    return;
                  }
                  saveTaskEdit("task");
                }}
                disabled={updateMutation.isPending || deleteMutation.isPending}
                className="py-3.5 items-center border-b border-slate-100 dark:border-slate-700"
              >
                <Text className="text-base font-semibold text-indigo-500">This task only</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="recurring-scope-series-button"
                onPress={() => {
                  if (recurringScopeMode === "delete") {
                    setRecurringScopeMode(null);
                    deleteMutation.mutate("series");
                    return;
                  }
                  saveTaskEdit("series");
                }}
                disabled={updateMutation.isPending || deleteMutation.isPending}
                className="py-3.5 items-center"
              >
                <Text className={`text-base font-semibold ${recurringScopeMode === "delete" ? "text-red-500" : "text-indigo-500"}`}>
                  Entire series
                </Text>
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
                {task?.dueDate && isTaskOverdue(task)
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

      {/* Subtask blocker modal */}
      <Modal visible={showSubtaskBlock} transparent animationType="fade" onRequestClose={() => setShowSubtaskBlock(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 items-center justify-center px-8" activeOpacity={1} onPress={() => setShowSubtaskBlock(false)}>
          <TouchableOpacity activeOpacity={1} className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <View className="px-5 pt-5 pb-4 items-center">
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 24 }}>⚠️</Text>
              </View>
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">Subtasks Incomplete</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                Complete all subtasks before marking this task as done.
              </Text>
              <Text className="text-xs text-amber-600 font-semibold text-center mt-2">
                {(task?.subtasks ?? []).filter((s) => !s.completed).length} subtask{(task?.subtasks ?? []).filter((s) => !s.completed).length === 1 ? "" : "s"} remaining
              </Text>
            </View>
            <View className="border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity onPress={() => setShowSubtaskBlock(false)} className="py-3.5 items-center" testID="subtask-block-ok">
                <Text className="text-base font-semibold text-indigo-500">Got it</Text>
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
                <Text style={{ fontSize: 24 }}>✓</Text>
              </View>
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">Mark as Done?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                This will complete the task and lock it from further edits.
              </Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity onPress={() => setShowDoneConfirm(false)} className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700">
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-done-button"
                onPress={confirmCompleteTask}
                disabled={updateMutation.isPending}
                className="flex-1 py-3.5 items-center"
              >
                <Text className="text-base font-semibold text-emerald-500">Complete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <AlenioBottomSheet
        visible={showSeriesOrderWarning}
        title="Earlier tasks still open"
        subtitle="You're completing this out of order"
        onClose={() => setShowSeriesOrderWarning(false)}
        compact
        showCloseButton
        testID="series-order-warning-sheet"
        footer={
          <TouchableOpacity
            onPress={() => setShowSeriesOrderWarning(false)}
            style={alenioSheetStyles.cancelButton}
            activeOpacity={0.8}
            testID="series-order-warning-cancel"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Go back</Text>
          </TouchableOpacity>
        }
      >
        <AlenioSheetCard tint="danger" compact>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#FEE2E2",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={18} color="#EF4444" strokeWidth={2.25} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#991B1B" }}>
                {earlierOpenSeriesTasks.length === 1
                  ? "1 earlier task is still incomplete"
                  : `${earlierOpenSeriesTasks.length} earlier tasks are still incomplete`}
              </Text>
              <Text style={{ fontSize: 12, color: "#B91C1C", marginTop: 4, lineHeight: 17 }}>
                {earlierOpenSeriesTasks[0]
                  ? `The next open date is ${formatTaskDueDateLabel(earlierOpenSeriesTasks[0].dueDate, userTimeZone)}. You can still complete this one if you want.`
                  : "You can still complete this one if you want."}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={confirmCompleteTask}
            disabled={updateMutation.isPending}
            style={[alenioSheetStyles.primaryButton, { marginTop: 14 }]}
            activeOpacity={0.92}
            testID="series-order-warning-continue"
          >
            {updateMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>Complete anyway</Text>
            )}
          </TouchableOpacity>
        </AlenioSheetCard>
      </AlenioBottomSheet>
    </SafeAreaView>
  );
}
