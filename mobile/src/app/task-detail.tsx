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
  Animated,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  X,
  Check,
  Plus,
  Square,
  CheckSquare,
  Pencil,
  MoreHorizontal,
  AlertTriangle,
  CalendarDays,
  Clock3,
  CheckCircle2,
  ChevronRight,
  Lock,
  Sparkles,
  Handshake,
} from "lucide-react-native";
import { useAdaptiveLayout } from "@/lib/adaptive-layout";
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
import {
  isRecurringTask,
  earlierIncompleteSeriesTasks,
  type RecurrenceScope,
} from "@/lib/recurring-task";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import { useTeamTaskRealtime } from "@/lib/use-team-task-realtime";
import { isTaskOverdue } from "@/lib/seneca-task-display";
import {
  formatTaskDueClock,
  formatTaskDueDateLabel,
  resolveTimeZone,
  suggestedDueClock,
  taskDueHasClock,
  taskDuePayload,
  withDueClock,
} from "@/lib/timezone";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { ProFeatureLockedView } from "@/components/ProFeatureLockedView";
import {
  hasWorkspaceTaskAccess,
  workspacePlanHref,
} from "@/lib/plan-access-copy";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { TaskNotesSection } from "@/components/tasks/TaskNotesSection";
import { AssigneeStack } from "@/components/workspace/AssigneeStack";
import { AssigneesSheet } from "@/components/workspace/AssigneesSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { CONTENT_MAX_WIDTH } from "@/lib/adaptive-layout";
import { HEADER_BRAND_COLOR } from "@/lib/header-brand";
import { MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/modal-supported-orientations";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { isReminderTask, ownerCompletingUnassignedTask } from "@/lib/task-kind";
import {
  incompleteSubtasks,
  isSubtaskSharedComplete,
  completedByOtherMember,
} from "@/lib/subtask-completion";
import { StreakCelebrationModal } from "@/components/StreakCelebrationModal";
import { colors, palette, tints } from "@/theme";

function sameCalendarDay(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#3B82F6",
  low: "#94A3B8",
};

export type TaskDetailProps = {
  taskId: string;
  teamId: string;
  startEdit?: string;
  /**
   * Present only when the detail lives in a pane. It stands in for the back
   * navigation the pushed route gets for free, and its presence is what tells
   * the screen it is embedded.
   */
  onClose?: () => void;
  /** Lets a pane swap which task it shows without a navigation. */
  onSelectTask?: (taskId: string) => void;
};

/** The reading column's own side padding, shared by header, body and footer. */
const COLUMN_PADDING = 16;

/**
 * A confirmation is one question and two buttons. Stretched to a tablet it
 * becomes a band across the screen with the answers at opposite corners.
 */
const DIALOG_MAX_WIDTH = 360;

export default function TaskDetailScreen() {
  const { taskId, teamId, startEdit } = useLocalSearchParams<{
    taskId: string;
    teamId: string;
    startEdit?: string;
  }>();
  return (
    <TaskDetail taskId={taskId} teamId={teamId} startEdit={startEdit} />
  );
}

export function TaskDetail({
  taskId,
  teamId,
  startEdit,
  onClose,
  onSelectTask,
}: TaskDetailProps) {
  /** A pane has no stack to pop, so closing has to be handed back to the host. */
  const embedded = onClose != null;
  const { iconRailEdge, iconRailWidth } = useAdaptiveLayout();
  /**
   * This screen covers the window, so the tab bar's camera inset does not
   * apply. The pane already sits inside that inset.
   */
  const cameraPad = embedded ? 0 : iconRailWidth;
  const close = React.useCallback(() => {
    if (onClose) onClose();
    else router.back();
  }, [onClose]);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  useTeamTaskRealtime(teamId);
  const userTimeZone = resolveTimeZone();
  const insets = useSafeAreaInsets();
  /**
   * Measured rather than taken from the window, because the same screen also
   * runs as a pane beside a list and is then far narrower than the device.
   */
  const [paneWidth, setPaneWidth] = useState(0);
  /**
   * Extra padding that holds the header, the body and the footer to one
   * reading column. A task is a short stack of fields; stretched across a
   * tablet it becomes labels on the far left and values on the far right with
   * nothing in between. Padding rather than a narrowed wrapper, so the header
   * rule and the footer border still run the full width.
   */
  const columnGutter = Math.max(
    0,
    Math.round((paneWidth - CONTENT_MAX_WIDTH) / 2),
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReminderActions, setShowReminderActions] = useState(false);
  const [showSeriesList, setShowSeriesList] = useState(false);
  const [recurringScopeMode, setRecurringScopeMode] = useState<
    "delete" | "edit" | null
  >(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showAssigneesSheet, setShowAssigneesSheet] = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [showDoneConfirm, setShowDoneConfirm] = useState(false);
  const [doneConfirmReady, setDoneConfirmReady] = useState(false);
  const [showCompletionSuccess, setShowCompletionSuccess] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState<number | null>(null);
  const [personalBestModal, setPersonalBestModal] = useState<number | null>(
    null,
  );
  const [showSeriesOrderWarning, setShowSeriesOrderWarning] = useState(false);
  const [showSubtaskBlock, setShowSubtaskBlock] = useState(false);
  const [uncheckConfirm, setUncheckConfirm] = useState<{
    subtaskId: string;
    title: string;
    completedByName: string;
  } | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<string>("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [draftPriority, setDraftPriority] = useState<string>("");
  const [draftDueDate, setDraftDueDate] = useState<Date | null>(null);
  const [dueHasTime, setDueHasTime] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [feedbackContext, setFeedbackContext] =
    useState<OneOnOneAssociateFeedbackContext | null>(null);
  const [feedbackContextLoading, setFeedbackContextLoading] = useState(false);
  const [feedbackContextError, setFeedbackContextError] = useState<
    string | null
  >(null);
  const [feedbackContextSubmitted, setFeedbackContextSubmitted] =
    useState(false);
  const [feedbackRetryTick, setFeedbackRetryTick] = useState(0);
  const [feedbackCompletionActive, setFeedbackCompletionActive] =
    useState(false);
  const feedbackCompletionActiveRef = useRef(false);
  feedbackCompletionActiveRef.current = feedbackCompletionActive;
  const promptCompleteTaskRef = useRef<() => void>(() => {});
  const completionScale = useRef(new Animated.Value(0.86)).current;
  const completionRing = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showDoneConfirm) {
      setDoneConfirmReady(false);
      return;
    }
    // Avoid the Mark complete press releasing onto Complete.
    const readyTimer = setTimeout(() => setDoneConfirmReady(true), 420);
    return () => clearTimeout(readyTimer);
  }, [showDoneConfirm]);

  useEffect(() => {
    if (!showCompletionSuccess) return;
    completionScale.setValue(0.86);
    completionRing.setValue(0);
    Animated.parallel([
      Animated.spring(completionScale, {
        toValue: 1,
        damping: 12,
        stiffness: 190,
        mass: 0.75,
        useNativeDriver: true,
      }),
      Animated.timing(completionRing, {
        toValue: 1,
        duration: 780,
        useNativeDriver: true,
      }),
    ]).start();
    const closeTimer = setTimeout(() => {
      setShowCompletionSuccess(false);
      if (!milestoneModal && !personalBestModal) close();
    }, 1600);
    return () => clearTimeout(closeTimer);
  }, [
    completionRing,
    completionScale,
    milestoneModal,
    personalBestModal,
    showCompletionSuccess,
  ]);

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
  const { access } = useWorkspaceAccess(teamId);

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", taskId, teamId],
    queryFn: () => api.get<Task>(`/api/teams/${teamId}/tasks/${taskId}`),
    enabled: !!taskId && !!teamId && hasTaskAccess,
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId && hasTaskAccess,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Task> & { scope?: RecurrenceScope }) =>
      api.patchFull<Task>(`/api/teams/${teamId}/tasks/${taskId}`, updates),
    onSuccess: (result) => {
      const updated = result.data;
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
      close();
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
      api.post<Subtask>(`/api/teams/${teamId}/tasks/${taskId}/subtasks`, {
        title,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId, teamId] });
      setNewSubtaskTitle("");
    },
  });

  const taskQueryKey = ["task", taskId, teamId] as const;

  const patchTaskSubtask = (
    current: Task | undefined,
    subtaskId: string,
    completed: boolean,
    serverSubtask?: Subtask,
  ): Task | undefined => {
    if (!current) return current;
    const actor = session?.user;
    return {
      ...current,
      subtasks: (current.subtasks ?? []).map((subtask) => {
        if (subtask.id !== subtaskId) return subtask;
        const optimisticCompletion: SubtaskCompletion[] =
          completed && actor?.id
            ? [
                {
                  id: `optimistic-${subtaskId}`,
                  subtaskId,
                  userId: actor.id,
                  completedAt: new Date().toISOString(),
                  user: {
                    id: actor.id,
                    name: actor.name ?? "You",
                    image: actor.image,
                  },
                },
              ]
            : [];
        return {
          ...subtask,
          ...(serverSubtask ?? {}),
          completed,
          completions: completed
            ? (serverSubtask?.completions ?? optimisticCompletion).slice(0, 1)
            : [],
        };
      }),
    };
  };

  const toggleSubtaskMutation = useMutation({
    mutationFn: ({
      subtaskId,
      completed,
    }: {
      subtaskId: string;
      completed: boolean;
    }) =>
      api.patch<Subtask>(
        `/api/teams/${teamId}/tasks/${taskId}/subtasks/${subtaskId}`,
        { completed },
      ),
    onMutate: async ({ subtaskId, completed }) => {
      await queryClient.cancelQueries({ queryKey: taskQueryKey });
      const previous = queryClient.getQueryData<Task>(taskQueryKey);
      queryClient.setQueryData<Task>(taskQueryKey, (current) =>
        patchTaskSubtask(current, subtaskId, completed),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskQueryKey, context.previous);
      }
      toast({
        title: "Couldn't update subtask",
        message: error instanceof Error ? error.message : "Try again.",
        preset: "error",
      });
    },
    onSuccess: (serverSubtask, variables) => {
      queryClient.setQueryData<Task>(taskQueryKey, (current) =>
        patchTaskSubtask(
          current,
          variables.subtaskId,
          variables.completed,
          serverSubtask,
        ),
      );
      invalidateTaskCaches(queryClient, teamId);
      if (variables.completed && !isCompleted) {
        const incomplete = incompleteSubtasks(task?.subtasks);
        if (
          incomplete.length === 1 &&
          incomplete[0].id === variables.subtaskId &&
          (task?.subtasks?.length ?? 0) > 0
        ) {
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
    () =>
      task?.description ? parseFeedbackTaskDescription(task.description) : null,
    [task?.description],
  );
  const isFeedbackTask = isFeedbackTaskDescription(task?.description);
  const isReminder = task ? isReminderTask(task) : false;
  const isFeedbackAssignee = !!feedbackMeta && isSelfAssigned;
  const isCompleted = task?.status === "done";
  const openSubtasks = incompleteSubtasks(task?.subtasks);
  const showFeedbackFormLoading =
    !!feedbackMeta &&
    isFeedbackAssignee &&
    !isCompleted &&
    !feedbackCompletionActive &&
    feedbackContextLoading &&
    !feedbackContext;
  const showFocusedFeedbackTask = isFeedbackTask && isFeedbackAssignee;
  const showFeedbackAlreadySubmitted =
    showFocusedFeedbackTask &&
    !isCompleted &&
    !feedbackContext &&
    !showFeedbackFormLoading &&
    !feedbackCompletionActive &&
    feedbackContextSubmitted;
  const showFeedbackLoadError =
    showFocusedFeedbackTask &&
    !isCompleted &&
    !feedbackContext &&
    !showFeedbackFormLoading &&
    !feedbackCompletionActive &&
    !feedbackContextSubmitted &&
    !!feedbackContextError;
  const isCreator = !!currentUserId && task?.creator?.id === currentUserId;
  const isOwnerOrLeader =
    team?.role === "owner" || team?.role === "team_leader";
  const warnOwnerNotAssigned = task
    ? ownerCompletingUnassignedTask(team?.role, currentUserId, task)
    : false;
  const isRegularMember = !isOwnerOrLeader;
  const feedbackAssigneeName =
    task?.assignments?.[0]?.user.name?.trim() || "the assigned member";
  const canEdit =
    access.canWrite && (isCreator || isOwnerOrLeader) && !isCompleted;
  const canComplete =
    !isCompleted && !isFeedbackTask && (isSelfAssigned || canEdit || isCreator);
  const isEditable = canEdit && isEditMode;

  const requestToggleSubtask = (subtask: Subtask) => {
    if (!access.canWrite || isCompleted) return;
    const done = isSubtaskSharedComplete(subtask);
    if (!done) {
      toggleSubtaskMutation.mutate({ subtaskId: subtask.id, completed: true });
      return;
    }
    const other = completedByOtherMember(subtask, currentUserId);
    if (other) {
      setUncheckConfirm({
        subtaskId: subtask.id,
        title: subtask.title,
        completedByName: other.name,
      });
      return;
    }
    toggleSubtaskMutation.mutate({ subtaskId: subtask.id, completed: false });
  };

  const taskIsRecurring = !!task && isRecurringTask(task);
  const seriesId = task?.recurrenceSeriesId ?? null;
  const originalDueDate = task?.dueDate ? new Date(task.dueDate) : null;
  const displayedDueDate = isEditMode ? draftDueDate : originalDueDate;
  const displayedDueLabel = displayedDueDate
    ? formatTaskDueDateLabel(displayedDueDate, userTimeZone)
    : "No due date";
  const displayedDueClock = displayedDueDate
    ? formatTaskDueClock(displayedDueDate, userTimeZone)
    : null;
  const displayedDueToday = displayedDueDate
    ? sameCalendarDay(displayedDueDate, new Date())
    : false;
  const displayedDueOverdue = Boolean(
    displayedDueDate &&
    !isCompleted &&
    displayedDueDate.getTime() < Date.now(),
  );
  const { data: seriesTasksData, isPending: seriesTasksPending } = useQuery({
    queryKey: ["series-tasks", teamId, seriesId],
    queryFn: () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        `/api/teams/${teamId}/tasks?recurrenceSeriesId=${encodeURIComponent(seriesId!)}&limit=400`,
      ),
    enabled: !!teamId && !!seriesId,
  });
  const seriesTasks = seriesTasksData?.tasks ?? [];
  const seriesCompletedCount = seriesTasks.filter(
    (t) => t.status === "done",
  ).length;
  const SERIES_PREVIEW_LIMIT = 5;
  const seriesPreviewTasks = seriesTasks.slice(0, SERIES_PREVIEW_LIMIT);
  const hasMoreSeriesTasks = seriesTasks.length > SERIES_PREVIEW_LIMIT;

  const openSeriesTask = (id: string) => {
    if (id === taskId) return;
    setShowSeriesList(false);
    if (onSelectTask) {
      onSelectTask(id);
      return;
    }
    router.replace({
      pathname: "/task-detail",
      params: { taskId: id, teamId: teamId! },
    });
  };

  const renderSeriesRow = (
    item: Task,
    index: number,
    opts?: { first?: boolean },
  ) => {
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
          borderTopWidth:
            opts?.first || index === 0 ? 0 : StyleSheet.hairlineWidth,
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
    setDueHasTime(taskDueHasClock(task.dueDate, userTimeZone));
    setShowDatePicker(false);
    setShowTimePicker(false);
    setIsEditMode(true);
  };

  const cancelEdit = () => {
    setIsEditMode(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setRecurringScopeMode(null);
  };

  const requestSaveEdit = () => {
    if (taskIsRecurring && seriesFieldsChanged()) {
      setRecurringScopeMode("edit");
      return;
    }
    saveTaskEdit("task");
  };

  const requestDelete = () => {
    if (taskIsRecurring) {
      setRecurringScopeMode("delete");
      return;
    }
    setShowDeleteConfirm(true);
  };

  const canDeleteTask =
    (isCreator || isOwnerOrLeader) && !isReminder;

  const dueDraftChanged = () => {
    const originalTimed = taskDueHasClock(originalDueDate, userTimeZone);
    if (!sameCalendarDay(draftDueDate, originalDueDate)) return true;
    if (dueHasTime !== originalTimed) return true;
    if (!dueHasTime || !draftDueDate || !originalDueDate) return false;
    return (
      draftDueDate.getHours() !== originalDueDate.getHours() ||
      draftDueDate.getMinutes() !== originalDueDate.getMinutes()
    );
  };

  const seriesFieldsChanged = () =>
    !!task &&
    (draftTitle.trim() !== task.title.trim() ||
      draftPriority !== task.priority ||
      dueDraftChanged());

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
    updateMutation.mutate(
      { status: "done" },
      {
        onSuccess: (result) => {
          setMilestoneModal(result.milestone ?? null);
          setPersonalBestModal(result.comeback ?? null);
          setShowCompletionSuccess(true);
        },
      },
    );
  };

  const closeMilestoneCelebration = () => {
    setMilestoneModal(null);
    if (!personalBestModal) close();
  };

  const closePersonalBestCelebration = () => {
    setPersonalBestModal(null);
    close();
  };

  const handleMarkComplete = () => {
    if (!task) return;
    if (isFeedbackTaskDescription(task.description)) return;
    if (openSubtasks.length > 0) {
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
        dueDate: draftDueDate
          ? taskDuePayload(draftDueDate, dueHasTime, userTimeZone)
          : null,
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
      setDueHasTime(taskDueHasClock(task.dueDate, userTimeZone));
    }
  }, [isEditMode]);

  useEffect(() => {
    if (feedbackCompletionActive) return;

    if (!feedbackMeta || !isFeedbackAssignee) {
      setFeedbackContext(null);
      setFeedbackContextLoading(false);
      setFeedbackContextError(null);
      setFeedbackContextSubmitted(false);
      return;
    }
    if (isCompleted && !feedbackCompletionActive) {
      setFeedbackContext(null);
      setFeedbackContextLoading(false);
      return;
    }
    let cancelled = false;
    setFeedbackContextLoading(true);
    setFeedbackContextError(null);
    void fetchOneOnOneAssociateFeedbackContext(
      String(teamId || feedbackMeta.teamId),
      feedbackMeta.memberUserId,
      feedbackMeta.meetingId,
      feedbackMeta.fieldId,
    )
      .then((context) => {
        if (cancelled || feedbackCompletionActiveRef.current) return;
        setFeedbackContextSubmitted(context.submitted);
        setFeedbackContextError(null);
        // Keep the form on screen even if notes were already saved, so this
        // never collapses to a blank task. Saving again completes the follow-up.
        setFeedbackContext(
          context.submitted ? { ...context, submitted: false } : context,
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setFeedbackContext(null);
        setFeedbackContextSubmitted(false);
        setFeedbackContextError(
          error instanceof Error
            ? error.message
            : "Couldn't load this follow-up.",
        );
      })
      .finally(() => {
        if (!cancelled) setFeedbackContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    feedbackMeta,
    isFeedbackAssignee,
    isCompleted,
    feedbackCompletionActive,
    teamId,
    feedbackRetryTick,
  ]);

  const handleToggleMember = (userId: string) => {
    if (assignedIds.has(userId)) {
      unassignMutation.mutate(userId);
    } else {
      assignMutation.mutate([userId]);
    }
  };

  if (!hasTaskAccess && !subscriptionFetched) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: "transparent" }}
        edges={embedded ? [] : ["top"]}
        testID="loading-indicator"
      >
        <View style={{ backgroundColor: HEADER_BRAND_COLOR }}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 14,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <TouchableOpacity onPress={close} testID="back-button">
              <ArrowLeft size={22} color="white" />
            </TouchableOpacity>
          </View>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4361EE" />
        </View>
      </SafeAreaView>
    );
  }

  if (!hasTaskAccess && subscriptionFetched) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: "transparent" }}
        edges={embedded ? [] : ["top"]}
        testID="task-detail-paywall-screen"
      >
        <View style={{ backgroundColor: HEADER_BRAND_COLOR }}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 14,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <TouchableOpacity onPress={close} testID="back-button">
              <ArrowLeft size={22} color="white" />
            </TouchableOpacity>
          </View>
        </View>
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
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: "transparent" }}
        edges={embedded ? [] : ["top"]}
        testID="loading-indicator"
      >
        <View style={{ backgroundColor: HEADER_BRAND_COLOR }}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 14,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <TouchableOpacity onPress={close} testID="back-button">
              <ArrowLeft size={22} color="white" />
            </TouchableOpacity>
          </View>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4361EE" />
        </View>
      </SafeAreaView>
    );
  }

  if (!task) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "transparent" }}
      >
        <Text className="text-slate-500">Task not found</Text>
      </SafeAreaView>
    );
  }

  const sheetTitle = isEditMode
    ? "Edit task"
    : "Task details";

  const sheetSubtitle = (() => {
    if (isEditMode) return "Make your changes, then save";
    if (isReminder) return "Private reminder";
    if (isCompleted) return "Completed";
    if (displayedDueOverdue) return "Overdue";
    if (task.priority === "urgent" || task.priority === "high") {
      return `${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)} priority`;
    }
    if (displayedDueToday) return "Due today";
    return undefined;
  })();

  const headerRight =
    isEditMode ? (
      <TouchableOpacity
        onPress={cancelEdit}
        hitSlop={8}
        style={{ paddingHorizontal: 4, paddingVertical: 6 }}
        testID="cancel-edit-button"
        accessibilityLabel="Cancel editing"
      >
        <Text style={{ color: "#64748B", fontSize: 14, fontWeight: "600" }}>
          Cancel
        </Text>
      </TouchableOpacity>
    ) : canEdit && !isFeedbackTask ? (
      <TouchableOpacity
        onPress={() => setShowReminderActions(true)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.brandSoft,
        }}
        testID={isReminder ? "reminder-options-button" : "task-options-button"}
      >
        <MoreHorizontal
          size={18}
          color={colors.brand}
          strokeWidth={2.1}
        />
      </TouchableOpacity>
    ) : null;

  const footerNode = !showFocusedFeedbackTask && isEditMode ? (
    <View style={{ width: "100%", gap: 8 }}>
      <TouchableOpacity
        onPress={requestSaveEdit}
        disabled={updateMutation.isPending}
        style={[
          alenioSheetStyles.primaryButton,
          { backgroundColor: colors.brand },
          updateMutation.isPending ? alenioSheetStyles.primaryButtonDisabled : null,
        ]}
        testID="save-edit-button"
        accessibilityRole="button"
      >
        {updateMutation.isPending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={alenioSheetStyles.primaryButtonText}>Save changes</Text>
        )}
      </TouchableOpacity>
      {canDeleteTask ? (
        <TouchableOpacity
          onPress={requestDelete}
          disabled={deleteMutation.isPending}
          hitSlop={8}
          style={alenioSheetStyles.cancelButton}
          testID="delete-button"
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text style={[alenioSheetStyles.cancelButtonText, { color: "#EF4444" }]}>
              Delete task
            </Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  ) : !showFocusedFeedbackTask && canComplete && access.canWrite ? (
    <TouchableOpacity
      onPress={handleMarkComplete}
      disabled={updateMutation.isPending}
      style={[
        alenioSheetStyles.primaryButton,
        {
          backgroundColor: colors.brand,
          flexDirection: "row",
          gap: 8,
        },
        updateMutation.isPending ? alenioSheetStyles.primaryButtonDisabled : null,
      ]}
      testID="mark-complete-button"
      accessibilityRole="button"
    >
      {updateMutation.isPending ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          <Check size={17} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={alenioSheetStyles.primaryButtonText}>Mark complete</Text>
        </>
      )}
    </TouchableOpacity>
  ) : !showFocusedFeedbackTask && canComplete && !access.canWrite ? (
    <View
      style={styles.readOnlyCompleteCard}
      testID="task-complete-read-only-note"
    >
      <View style={styles.readOnlyCompleteHeader}>
        <Lock size={16} color="#98A2B3" strokeWidth={2.2} />
        <Text style={styles.readOnlyCompleteTitle}>Workspace is read-only</Text>
      </View>
      <Text style={styles.readOnlyCompleteBody}>
        {team?.role === "owner"
          ? "Choose a plan to restore full workspace functionality, including completing tasks."
          : "Task completion is currently unavailable. Contact your workspace owner to restore full access."}
      </Text>
      {team?.role === "owner" ? (
        <TouchableOpacity
          onPress={() => router.push(workspacePlanHref(teamId))}
          style={[
            alenioSheetStyles.primaryButton,
            { backgroundColor: colors.brand, marginTop: 12 },
          ]}
          testID="task-complete-choose-plan"
          accessibilityRole="button"
        >
          <Text style={alenioSheetStyles.primaryButtonText}>Choose a plan</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : undefined;

  const body = (
    <>
        {!showFocusedFeedbackTask && isReminder ? (
          <Text
            style={{
              marginTop: 18,
              marginBottom: 7,
              fontSize: 10,
              fontWeight: "700",
              color: colors.brand,
              letterSpacing: 0.45,
            }}
          >
            REMINDER
          </Text>
        ) : null}

        {/* Keep the navigation header stable; the task title belongs to the content. */}
        {!showFocusedFeedbackTask && !isEditMode ? (
          <View style={{ marginTop: 20, marginBottom: isReminder ? 7 : 12 }}>
            {!isReminder ? (
              <Text
                style={{
                  marginBottom: 7,
                  fontSize: 10,
                  fontWeight: "800",
                  color: colors.brand,
                  letterSpacing: 0.75,
                }}
              >
                WORKSPACE TASK · {task.priority.toUpperCase()} PRIORITY
                {task.recurrenceRule ? " · RECURRING" : ""}
              </Text>
            ) : null}
            <Text
              style={{
                fontSize: 25,
                lineHeight: 31,
                fontWeight: "700",
                color: palette.ink,
                letterSpacing: -0.45,
              }}
            >
              {task.title}
            </Text>
          </View>
        ) : null}

        {/* Title — edit mode */}
        {!showFocusedFeedbackTask && isEditMode ? (
          <View style={{ marginTop: isReminder ? 0 : 16, marginBottom: 10 }}>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              style={{
                fontSize: 24,
                fontWeight: "700",
                color: palette.ink,
                borderBottomWidth: 1,
                borderBottomColor: colors.brand,
                paddingBottom: 4,
              }}
              placeholder="Task title"
              placeholderTextColor={palette.inkMuted}
              testID="edit-title-input"
            />
          </View>
        ) : null}

        {isFeedbackTask &&
        isOwnerOrLeader &&
        !isFeedbackAssignee &&
        !isCompleted ? (
          <View
            style={{
              marginBottom: 16,
              paddingHorizontal: 13,
              paddingVertical: 13,
              borderRadius: 17,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "#E2DEFA",
              backgroundColor: "#FCFBFF",
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 11,
              shadowColor: "#382A7A",
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.07,
              shadowRadius: 14,
              elevation: 2,
            }}
            testID="leader-feedback-task-notice"
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#EEEAFE",
              }}
            >
              <Clock3 size={16} color="#684BFF" strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 9,
                  lineHeight: 11,
                  fontWeight: "800",
                  letterSpacing: 0.75,
                  color: "#7B6BC2",
                }}
              >
                AWAITING MEMBER
              </Text>
              <Text
                style={{
                  marginTop: 3,
                  fontSize: 12.5,
                  lineHeight: 16,
                  fontWeight: "700",
                  color: "#28213F",
                }}
              >
                {feedbackAssigneeName}&apos;s follow-up
              </Text>
              <Text
                style={{
                  marginTop: 3,
                  fontSize: 10.5,
                  lineHeight: 15,
                  color: "#716A82",
                }}
              >
                This post-check-in response must be completed by the member. You
                can review it here while it is pending.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Priority indicator */}
        {!showFocusedFeedbackTask && !isReminder && isEditMode ? (
          <View className="flex-row items-center mb-4" style={{ gap: 7 }}>
            {isReminder ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: "#EEF2FF",
                  }}
                  testID="reminder-detail-badge"
                >
                  <Lock size={11} color="#4F46E5" />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "800",
                      color: "#4F46E5",
                      letterSpacing: 0.35,
                    }}
                  >
                    ONLY YOU
                  </Text>
                </View>
                {task.recurrenceRule ? (
                  <View
                    className="flex-row items-center ml-1"
                    style={{ gap: 4 }}
                  >
                    <RefreshCw size={12} color="#64748B" />
                    <Text className="text-xs text-slate-500 capitalize">
                      {task.recurrenceRule.type}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : isEditMode ? (
              <>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: "#64748B",
                    marginRight: 4,
                  }}
                >
                  Priority:
                </Text>
                {["urgent", "high", "medium", "low"].map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setDraftPriority(p)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor:
                        draftPriority === p
                          ? (PRIORITY_COLORS[p] ?? "#94A3B8") + "20"
                          : "transparent",
                      borderWidth: 1,
                      borderColor:
                        draftPriority === p
                          ? (PRIORITY_COLORS[p] ?? "#94A3B8")
                          : "#E2E8F0",
                    }}
                    testID={`priority-${p}`}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        textTransform: "capitalize",
                        color:
                          draftPriority === p
                            ? (PRIORITY_COLORS[p] ?? "#94A3B8")
                            : "#94A3B8",
                      }}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
        {!showFocusedFeedbackTask && isReminder ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 7,
              marginBottom: 18,
              paddingHorizontal: 2,
            }}
            testID="reminder-private-status"
          >
            <Lock size={12} color="#6958E8" strokeWidth={2.1} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#718096" }}>
              Private
            </Text>
            <Text style={{ fontSize: 10, color: "#CBD2DE" }}>•</Text>
            <Text style={{ fontSize: 11, color: "#718096" }}>
              Only you can see this
            </Text>
            <Text style={{ fontSize: 10, color: "#CBD2DE" }}>•</Text>
            <Text style={{ fontSize: 11, color: "#718096" }}>
              Not included in Stars
            </Text>
          </View>
        ) : null}

        {!showFocusedFeedbackTask && !isEditMode ? (
            <View style={{ marginBottom: 18 }} testID="task-summary">
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 13,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: palette.rowDivider,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: palette.inkMuted }}>
                    Created
                  </Text>
                  <Text
                    style={{
                      marginTop: 3,
                      fontSize: 12,
                      fontWeight: "700",
                      color: palette.ink,
                    }}
                    numberOfLines={1}
                    testID="task-created-date"
                  >
                    {new Date(task.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </View>
                <View
                  style={{
                    width: StyleSheet.hairlineWidth,
                    height: 34,
                    marginHorizontal: 10,
                    backgroundColor: palette.rowDivider,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: palette.inkMuted }}>Due</Text>
                  <Text
                    style={{
                      marginTop: 3,
                      fontSize: 12,
                      fontWeight: "700",
                      color: displayedDueOverdue ? colors.error : palette.ink,
                    }}
                    numberOfLines={1}
                  >
                    {displayedDueClock
                      ? `${displayedDueLabel} · ${displayedDueClock}`
                      : isReminder && !displayedDueDate
                        ? "Anytime"
                        : displayedDueLabel}
                  </Text>
                </View>
                <View
                  style={{
                    width: StyleSheet.hairlineWidth,
                    height: 34,
                    marginHorizontal: 10,
                    backgroundColor: palette.rowDivider,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: palette.inkMuted }}>
                    Status
                  </Text>
                  <Text
                    style={{
                      marginTop: 3,
                      fontSize: 12,
                      fontWeight: "700",
                      color: isCompleted
                        ? "#059669"
                        : displayedDueOverdue
                          ? colors.error
                          : palette.ink,
                    }}
                  >
                    {isCompleted
                      ? "Completed"
                      : displayedDueOverdue
                        ? "Overdue"
                        : "Open"}
                  </Text>
                </View>
              </View>
            </View>
        ) : null}

        {!showFocusedFeedbackTask && isEditMode ? (
          <View style={{ marginBottom: 14 }} testID="task-timeline-card">
            <AlenioSheetCard
              tint="slate"
              style={{ gap: 0, paddingVertical: 4, paddingHorizontal: 0 }}
            >
              <TouchableOpacity
                disabled={!isEditMode}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={isEditMode ? 0.65 : 1}
                style={[
                  alenioSheetStyles.optionRow,
                  {
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                  },
                ]}
                testID="edit-due-date-button"
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.brandSoft,
                  }}
                >
                  <Clock3
                    size={15}
                    color={displayedDueOverdue ? colors.error : colors.brand}
                    strokeWidth={2.1}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[
                      alenioSheetStyles.optionTitle,
                      displayedDueOverdue ? { color: colors.error } : null,
                    ]}
                  >
                    {displayedDueOverdue
                      ? "Overdue"
                      : displayedDueToday
                        ? "Due today"
                        : "Due"}
                  </Text>
                  <Text
                    style={alenioSheetStyles.optionSubtitle}
                    numberOfLines={2}
                  >
                    {displayedDueOverdue && !displayedDueToday
                      ? displayedDueClock
                        ? `${displayedDueLabel} · ${displayedDueClock}`
                        : displayedDueLabel
                      : displayedDueClock
                        ? `${displayedDueLabel} · ${displayedDueClock}`
                        : isReminder && !displayedDueDate
                          ? "Anytime"
                          : displayedDueLabel}
                  </Text>
                </View>
                {isEditMode ? (
                  <ChevronRight size={15} color={colors.textMuted} />
                ) : null}
              </TouchableOpacity>

              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: palette.rowDivider,
                  marginHorizontal: 12,
                }}
              />

              <View
                style={[
                  alenioSheetStyles.optionRow,
                  {
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                  },
                ]}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.brandSoft,
                  }}
                >
                  <CalendarDays
                    size={15}
                    color={colors.brand}
                    strokeWidth={2.1}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={alenioSheetStyles.optionTitle}>Created</Text>
                  <Text style={alenioSheetStyles.optionSubtitle} numberOfLines={1}>
                    {new Date(task.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              </View>

              {isEditMode ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: palette.rowDivider,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      if (!dueHasTime) {
                        setDueHasTime(true);
                        setDraftDueDate((current) =>
                          suggestedDueClock(current ?? new Date()),
                        );
                      }
                      setShowTimePicker(true);
                    }}
                    style={{ flex: 1 }}
                    testID="edit-due-time-button"
                  >
                    <Text
                      style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                    >
                      Due time
                    </Text>
                    <Text
                      style={{
                        marginTop: 2,
                        fontSize: 13,
                        fontWeight: "700",
                        color: dueHasTime ? "#0F172A" : "#94A3B8",
                      }}
                    >
                      {dueHasTime && displayedDueClock
                        ? displayedDueClock
                        : "Add a time"}
                    </Text>
                  </TouchableOpacity>
                  {dueHasTime ? (
                    <TouchableOpacity
                      onPress={() => {
                        setDueHasTime(false);
                        setShowTimePicker(false);
                        setDraftDueDate((current) => {
                          if (!current) return current;
                          const next = new Date(current);
                          next.setHours(23, 59, 59, 0);
                          return next;
                        });
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: "#EF4444",
                        }}
                      >
                        Clear
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {task.completedAt ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: palette.rowDivider,
                    backgroundColor: tints.mint.bg,
                  }}
                >
                  <CheckCircle2 size={14} color="#059669" strokeWidth={2.4} />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: "600",
                      color: "#047857",
                    }}
                  >
                    Completed{" "}
                    {new Date(task.completedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              ) : null}
            </AlenioSheetCard>
          </View>
        ) : null}

        {!showFocusedFeedbackTask && isEditMode && Platform.OS === "ios" ? (
          <Modal
            visible={showDatePicker}
            transparent
            animationType="slide"
            presentationStyle="overFullScreen"
            supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
            onRequestClose={() => setShowDatePicker(false)}
          >
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <Pressable
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(15,23,42,0.35)",
                }}
                onPress={() => setShowDatePicker(false)}
              />
              <View
                style={{
                  backgroundColor: "white",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingBottom: Math.max(insets.bottom, 16),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 20,
                    paddingTop: 16,
                    paddingBottom: 8,
                  }}
                >
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={{ color: "#64748B", fontSize: 15 }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: "#0F172A",
                    }}
                  >
                    Due Date
                  </Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text
                      style={{
                        color: "#4361EE",
                        fontSize: 15,
                        fontWeight: "700",
                      }}
                    >
                      Done
                    </Text>
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
                    if (dueHasTime && draftDueDate) {
                      next.setHours(draftDueDate.getHours(), draftDueDate.getMinutes(), 0, 0);
                    } else {
                      next.setHours(23, 59, 59, 0);
                    }
                    setDraftDueDate(next);
                  }}
                  testID="edit-date-time-picker"
                  style={{ alignSelf: "center", marginHorizontal: 8 }}
                />
                <TouchableOpacity
                  onPress={() => {
                    setDraftDueDate(null);
                    setDueHasTime(false);
                    setShowDatePicker(false);
                    setShowTimePicker(false);
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
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#EF4444",
                    }}
                  >
                    Clear date
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : !showFocusedFeedbackTask && isEditMode && showDatePicker ? (
          <DateTimePicker
            value={draftDueDate ?? new Date()}
            mode="date"
            display="calendar"
            minimumDate={isRegularMember ? new Date() : undefined}
            onChange={(_e, date) => {
              setShowDatePicker(false);
              if (!date) return;
              const next = new Date(date);
              if (dueHasTime && draftDueDate) {
                next.setHours(draftDueDate.getHours(), draftDueDate.getMinutes(), 0, 0);
              } else {
                next.setHours(23, 59, 59, 0);
              }
              setDraftDueDate(next);
            }}
            testID="edit-date-time-picker"
          />
        ) : null}

        {!showFocusedFeedbackTask && isEditMode && Platform.OS === "ios" ? (
          <Modal
            visible={showTimePicker}
            transparent
            animationType="slide"
            presentationStyle="overFullScreen"
            supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
            onRequestClose={() => setShowTimePicker(false)}
          >
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <Pressable
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(15,23,42,0.35)",
                }}
                onPress={() => setShowTimePicker(false)}
              />
              <View
                style={{
                  backgroundColor: "white",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingBottom: Math.max(insets.bottom, 16),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 20,
                    paddingTop: 16,
                    paddingBottom: 8,
                  }}
                >
                  <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                    <Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>
                    Due time
                  </Text>
                  <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                    <Text style={{ color: "#4361EE", fontSize: 15, fontWeight: "700" }}>
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={draftDueDate ?? new Date()}
                  mode="time"
                  display="spinner"
                  onChange={(_e, date) => {
                    if (!date) return;
                    setDueHasTime(true);
                    setDraftDueDate((current) =>
                      withDueClock(current ?? new Date(), date.getHours(), date.getMinutes()),
                    );
                  }}
                  testID="edit-due-time-picker"
                />
              </View>
            </View>
          </Modal>
        ) : !showFocusedFeedbackTask && isEditMode && showTimePicker ? (
          <DateTimePicker
            value={draftDueDate ?? new Date()}
            mode="time"
            display="spinner"
            onChange={(_e, date) => {
              setShowTimePicker(false);
              if (!date) return;
              setDueHasTime(true);
              setDraftDueDate((current) =>
                withDueClock(current ?? new Date(), date.getHours(), date.getMinutes()),
              );
            }}
            testID="edit-due-time-picker"
          />
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
              void (async () => {
                await queryClient.invalidateQueries({
                  queryKey: ["task", taskId, teamId],
                });
                invalidateTaskCaches(queryClient, teamId);
                await Promise.all([
                  queryClient.refetchQueries({
                    queryKey: ["tasks", teamId],
                    type: "active",
                  }),
                  queryClient.refetchQueries({
                    queryKey: ["tasks-count", teamId],
                    type: "active",
                  }),
                  queryClient.refetchQueries({
                    queryKey: ["member-stats", teamId],
                    type: "active",
                  }),
                ]);
                close();
              })();
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

        {showFeedbackLoadError ? (
          <View
            style={{
              borderRadius: 20,
              backgroundColor: "#FFFFFF",
              marginTop: 8,
              marginBottom: 16,
              padding: 24,
              borderWidth: 1,
              borderColor: "#FECACA",
              gap: 12,
            }}
            testID="feedback-follow-up-error"
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>
              Couldn't load this follow-up
            </Text>
            <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20 }}>
              {feedbackContextError === "Check-in not found"
                ? "This check-in is no longer available."
                : feedbackContextError || "Please try again."}
            </Text>
            <TouchableOpacity
              onPress={() => setFeedbackRetryTick((tick) => tick + 1)}
              style={{
                alignSelf: "flex-start",
                backgroundColor: "#7C3AED",
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 16,
              }}
              testID="feedback-follow-up-retry"
            >
              <Text
                style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}
              >
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showFeedbackAlreadySubmitted ? (
          <View
            style={{
              borderRadius: 20,
              backgroundColor: "#FFFFFF",
              marginTop: 8,
              marginBottom: 16,
              padding: 24,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              gap: 8,
            }}
            testID="feedback-follow-up-submitted"
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>
              Your notes are saved
            </Text>
            <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20 }}>
              This follow-up is ready. If it is still open, save again on the
              next try.
            </Text>
            <TouchableOpacity
              onPress={() => setFeedbackRetryTick((tick) => tick + 1)}
              style={{
                alignSelf: "flex-start",
                marginTop: 4,
                backgroundColor: "#7C3AED",
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 16,
              }}
            >
              <Text
                style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}
              >
                Open notes
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {task.description &&
        !feedbackContext &&
        !showFeedbackFormLoading &&
        !isFeedbackTask ? (
          <Text className="text-base text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
            {formatTaskDescriptionForDisplay(task.description)}
          </Text>
        ) : null}

        {/* Attachment photo */}
        {task.attachmentUrl ? (
          <Image
            source={{ uri: task.attachmentUrl }}
            style={{
              width: "100%",
              height: 200,
              borderRadius: 12,
              marginBottom: 16,
            }}
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
          <View
            style={{
              minHeight: 64,
              marginBottom: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: "#E2E8E5",
              backgroundColor: "#FFFFFF",
              shadowColor: "#172033",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.035,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 11,
                backgroundColor: "#EAF8F1",
              }}
            >
              <CheckCircle2 size={18} color="#168A55" strokeWidth={2.3} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  color: "#172033",
                  fontSize: 13,
                  lineHeight: 17,
                  fontWeight: "700",
                }}
              >
                Task completed
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  color: "#7A869A",
                  fontSize: 10.5,
                  lineHeight: 14,
                }}
              >
                Recall it to make changes.
              </Text>
            </View>
            {access.canWrite ? (
              <TouchableOpacity
                onPress={() => setShowRecallConfirm(true)}
                disabled={updateMutation.isPending}
                style={{
                  minWidth: 62,
                  minHeight: 32,
                  paddingHorizontal: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#CFE9DB",
                  backgroundColor: "#F4FBF7",
                  opacity: updateMutation.isPending ? 0.65 : 1,
                }}
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator size="small" color="#168A55" />
                ) : (
                  <Text
                    style={{
                      color: "#168A55",
                      fontSize: 11.5,
                      fontWeight: "700",
                    }}
                  >
                    Recall
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Subtasks */}
        {!showFocusedFeedbackTask &&
        !isReminder &&
        (task.subtasks?.length ?? 0) > 0
          ? (() => {
              const subtasks = task.subtasks ?? [];
              const isJointTask = task.isJoint === true;

              const completedCount = subtasks.filter((s) =>
                isSubtaskSharedComplete(s),
              ).length;
              const totalCount = subtasks.length;
              return (
                <View style={{ marginBottom: 14 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                      paddingHorizontal: 2,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: palette.inkSecondary,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                      }}
                    >
                      Subtasks
                      {totalCount > 0
                        ? ` (${completedCount}/${totalCount})`
                        : ""}
                    </Text>
                  </View>
                  {subtasks.length > 0 || addingSubtask ? (
                    <AlenioSheetCard
                      tint="slate"
                      style={{ paddingHorizontal: 8, paddingVertical: 4, gap: 0 }}
                    >
                  {subtasks.length > 0 && (
                    <View style={{ gap: 2 }}>
                      {subtasks.map((subtask) => {
                        const done = isSubtaskSharedComplete(subtask);
                        const completions = (subtask.completions ?? []).slice(
                          0,
                          1,
                        );
                        return (
                          <TouchableOpacity
                            key={subtask.id}
                            onPress={() => requestToggleSubtask(subtask)}
                            disabled={!access.canWrite || isCompleted}
                            testID={`subtask-toggle-${subtask.id}`}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingVertical: 10,
                              paddingHorizontal: 4,
                              gap: 10,
                            }}
                            activeOpacity={0.6}
                          >
                            {done ? (
                              <CheckSquare size={22} color="#10B981" />
                            ) : (
                              <Square size={22} color="#94A3B8" />
                            )}
                            <Text
                              className="flex-1 text-sm text-slate-900 dark:text-white"
                              style={
                                done
                                  ? {
                                      textDecorationLine: "line-through",
                                      color: "#94A3B8",
                                    }
                                  : undefined
                              }
                            >
                              {subtask.title}
                            </Text>
                            {isJointTask && completions[0] ? (
                              <View
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 11,
                                  backgroundColor: "#4361EE",
                                  borderWidth: 1.5,
                                  borderColor: "white",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  overflow: "hidden",
                                }}
                              >
                                <UserAvatar
                                  user={completions[0].user}
                                  size={19}
                                  radius={9.5}
                                  backgroundColor="#4361EE"
                                  textColor="#FFFFFF"
                                  fontSize={9}
                                />
                              </View>
                            ) : null}
                            {isEditable ? (
                              <TouchableOpacity
                                onPress={() =>
                                  deleteSubtaskMutation.mutate(subtask.id)
                                }
                                disabled={deleteSubtaskMutation.isPending}
                                hitSlop={{
                                  top: 8,
                                  bottom: 8,
                                  left: 8,
                                  right: 8,
                                }}
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
                  {isEditable && addingSubtask ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 4,
                        marginBottom: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 8,
                        borderRadius: 12,
                        backgroundColor: palette.page,
                      }}
                    >
                      <TextInput
                        value={newSubtaskTitle}
                        onChangeText={setNewSubtaskTitle}
                        placeholder="Add a subtask..."
                        placeholderTextColor={palette.inkMuted}
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color: palette.ink,
                        }}
                        onSubmitEditing={() => {
                          if (newSubtaskTitle.trim())
                            createSubtaskMutation.mutate(
                              newSubtaskTitle.trim(),
                            );
                        }}
                        returnKeyType="done"
                        testID="new-subtask-input"
                      />
                      <TouchableOpacity
                        onPress={() => {
                          if (newSubtaskTitle.trim())
                            createSubtaskMutation.mutate(
                              newSubtaskTitle.trim(),
                            );
                        }}
                        disabled={
                          !newSubtaskTitle.trim() ||
                          createSubtaskMutation.isPending
                        }
                        testID="add-subtask-button"
                      >
                        {createSubtaskMutation.isPending ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.brand}
                          />
                        ) : (
                          <Plus
                            size={18}
                            color={
                              newSubtaskTitle.trim()
                                ? colors.brand
                                : colors.textMuted
                            }
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : null}
                    </AlenioSheetCard>
                  ) : null}
                  {isEditable && !addingSubtask ? (
                    <TouchableOpacity
                      onPress={() => setAddingSubtask(true)}
                      style={{
                        minHeight: 42,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingHorizontal: 2,
                      }}
                      testID="show-add-subtask-button"
                    >
                      <Plus size={17} color={colors.brand} strokeWidth={2.3} />
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: colors.brand,
                        }}
                      >
                        Add subtask
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })()
          : null}

        {/* Assignees — compact stack; full list opens in a sheet */}
        {!showFocusedFeedbackTask && !isReminder ? (
          <View style={{ marginBottom: 14 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
                paddingHorizontal: 2,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: palette.inkSecondary,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  Assigned to
                  {task.assignments?.length
                    ? ` · ${task.assignments.length}`
                    : ""}
                </Text>
                {task.isJoint ? (
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                    testID="joint-task-indicator"
                  >
                    <Handshake size={13} color={colors.brand} strokeWidth={2.2} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: colors.brand,
                        letterSpacing: 0.4,
                      }}
                    >
                      JOINT
                    </Text>
                  </View>
                ) : null}
              </View>
              {canEdit ? (
                <TouchableOpacity
                  testID="manage-assignees-button"
                  onPress={() => setShowAssignModal(true)}
                  hitSlop={8}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: colors.brand,
                    }}
                  >
                    Manage
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

              {task.assignments && task.assignments.length > 0 ? (
                <Pressable
                  onPress={() => setShowAssigneesSheet(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minHeight: 48,
                    paddingVertical: 5,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Show all assignees"
                  testID="assignee-avatar-row"
                >
                  <AssigneeStack
                    assignments={task.assignments}
                    currentUserId={currentUserId}
                  />
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      marginLeft: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: "600",
                        color: palette.inkSecondary,
                      }}
                      numberOfLines={1}
                    >
                      {task.assignments
                        .slice(0, 2)
                        .map((assignment) =>
                          assignment.userId === currentUserId
                            ? "You"
                            : assignment.user.name?.trim() || "Teammate",
                        )
                        .join(", ")}
                      {task.assignments.length > 2
                        ? ` +${task.assignments.length - 2}`
                        : ""}
                    </Text>
                    <ChevronRight
                      size={14}
                      color={palette.inkMuted}
                      strokeWidth={2.2}
                    />
                  </View>
                </Pressable>
              ) : (
                <Text
                  style={{
                    fontSize: 13,
                    color: palette.inkMuted,
                  }}
                >
                  No one assigned yet
                </Text>
              )}
          </View>
        ) : null}

        {!isFeedbackTask ? (
          <TaskNotesSection
            teamId={teamId}
            taskId={taskId}
            isJoint={task.isJoint === true}
            isReminder={isReminder}
            currentUserId={currentUserId}
            canWrite={
              access.canWrite &&
              (isCreator || isSelfAssigned || isOwnerOrLeader)
            }
            canModerate={isCreator || isOwnerOrLeader}
          />
        ) : null}

        {/* Recurring series chain */}
        {!showFocusedFeedbackTask && seriesId ? (
          <View className="mb-4" testID="recurring-series-chain">
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: palette.inkSecondary,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                marginBottom: 8,
                paddingHorizontal: 2,
              }}
            >
              Series
              {seriesTasks.length > 0
                ? ` (${seriesCompletedCount}/${seriesTasks.length})`
                : ""}
            </Text>
            {seriesTasksPending && seriesTasks.length === 0 ? (
              <ActivityIndicator
                color="#4361EE"
                style={{ alignSelf: "flex-start", marginVertical: 4 }}
              />
            ) : seriesTasks.length === 0 ? (
              <Text className="text-sm text-slate-400 italic">
                No tasks in this series
              </Text>
            ) : (
              <AlenioSheetCard
                tint="slate"
                style={{ paddingHorizontal: 0, paddingVertical: 0, gap: 0, overflow: "hidden" }}
              >
                {seriesPreviewTasks.map((item, index) =>
                  renderSeriesRow(item, index),
                )}
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
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: "#4361EE",
                        textAlign: "center",
                      }}
                    >
                      Show more ({seriesTasks.length - SERIES_PREVIEW_LIMIT}{" "}
                      more)
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </AlenioSheetCard>
            )}
          </View>
        ) : null}

        <View style={{ height: 32 }} />
    </>
  );

  const overlays = (
    <>
      <AlenioBottomSheet
        visible={showReminderActions}
        title="Task options"
        subtitle={isReminder ? "Manage this private task" : "Manage this task"}
        onClose={() => setShowReminderActions(false)}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="reminder-options-sheet"
      >
        <View style={{ gap: 8 }}>
          <AlenioSheetOption
            compact
            tint="slate"
            icon={<Pencil size={16} color="#FFFFFF" />}
            title="Edit task"
            subtitle="Update the title, due date, or recurrence"
            onPress={() => {
              setShowReminderActions(false);
              setTimeout(beginEdit, 220);
            }}
            testID={isReminder ? "edit-reminder-option" : "edit-task-option"}
          />
          {isCreator || isOwnerOrLeader ? (
            <AlenioSheetOption
              compact
              destructive
              icon={<Trash2 size={16} color="#FFFFFF" />}
              title="Delete task"
              subtitle="Permanently remove this task"
              onPress={() => {
                setShowReminderActions(false);
                setTimeout(() => {
                  if (taskIsRecurring) {
                    setRecurringScopeMode("delete");
                  } else {
                    setShowDeleteConfirm(true);
                  }
                }, 220);
              }}
              testID="delete-reminder-option"
            />
          ) : null}
        </View>
      </AlenioBottomSheet>

      <AssigneesSheet
        visible={showAssigneesSheet && !isReminder}
        assignments={task?.assignments ?? []}
        currentUserId={currentUserId}
        taskTitle={task?.title}
        canManage={canEdit}
        onClose={() => setShowAssigneesSheet(false)}
        onManage={() => {
          setShowAssigneesSheet(false);
          setTimeout(() => setShowAssignModal(true), 220);
        }}
      />

      {/* Assign members modal */}
      <AlenioBottomSheet
        visible={showAssignModal && !isReminder}
        title="Manage assignees"
        subtitle="Choose who is responsible for this task"
        onClose={() => setShowAssignModal(false)}
        compact
        showCloseButton
        bodyHeightRatio={0.46}
        testID="manage-assignees-sheet"
      >
        <AlenioSheetCard
          tint="slate"
          compact
          style={{ paddingVertical: 0, overflow: "hidden" }}
        >
          {members.map((m) => {
            const isAssigned = assignedIds.has(m.userId);
            const isPending =
              assignMutation.isPending || unassignMutation.isPending;
            return (
              <TouchableOpacity
                key={m.id}
                testID={`assign-member-${m.userId}`}
                onPress={() => handleToggleMember(m.userId)}
                disabled={isPending}
                style={{
                  minHeight: 56,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 8,
                  paddingVertical: 8,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: "#E4E9F0",
                  opacity: isPending ? 0.55 : 1,
                }}
              >
                <UserAvatar
                  user={m.user}
                  size={36}
                  radius={18}
                  backgroundColor="#4F46E5"
                  textColor="#FFFFFF"
                  fontSize={14}
                />
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    marginLeft: 12,
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#172033",
                      fontSize: 13,
                      lineHeight: 18,
                      fontWeight: "700",
                    }}
                    numberOfLines={1}
                  >
                    {m.user.name}
                    {m.userId === currentUserId ? " (you)" : ""}
                  </Text>
                  <Text
                    style={{
                      marginTop: 2,
                      color: "#7A8598",
                      fontSize: 10.5,
                      lineHeight: 14,
                    }}
                    numberOfLines={1}
                  >
                    {m.user.email}
                  </Text>
                </View>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isAssigned ? "#4361EE" : "#FFFFFF",
                    borderColor: isAssigned ? "#4361EE" : "#CBD5E1",
                  }}
                >
                  {isAssigned ? <Check size={13} color="#FFFFFF" /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </AlenioSheetCard>
      </AlenioBottomSheet>

      {/* Full recurring series list */}
      <Modal
        visible={showSeriesList}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
        onRequestClose={() => setShowSeriesList(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setShowSeriesList(false)}
          />
          <View
            style={{
              backgroundColor: "white",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "70%",
              paddingBottom: Math.max(insets.bottom, 12),
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#E2E8F0",
                alignSelf: "center",
                marginTop: 8,
                marginBottom: 10,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                marginBottom: 8,
              }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}
              >
                Series ({seriesCompletedCount}/{seriesTasks.length})
              </Text>
              <Pressable
                onPress={() => setShowSeriesList(false)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: "#F1F5F9",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                testID="series-list-close"
              >
                <X size={14} color="#64748B" />
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{
                paddingHorizontal: 12,
                paddingBottom: 8,
              }}
              showsVerticalScrollIndicator
              testID="series-list-scroll"
            >
              <AlenioSheetCard
                tint="slate"
                style={{ paddingHorizontal: 0, paddingVertical: 0, gap: 0, overflow: "hidden" }}
              >
                {seriesTasks.map((item, index) => renderSeriesRow(item, index))}
              </AlenioSheetCard>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 items-center justify-center px-8"
          activeOpacity={1}
          onPress={() => setShowDeleteConfirm(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ maxWidth: DIALOG_MAX_WIDTH }}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
          >
            <View className="px-5 pt-5 pb-4 items-center">
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                {isReminder ? "Delete reminder?" : "Delete task?"}
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                {isReminder
                  ? "This reminder will be permanently removed."
                  : "This task will be permanently removed."}
              </Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700"
              >
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">
                  Cancel
                </Text>
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
                <Text className="text-base font-semibold text-red-500">
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Recurring task scope modal (delete / edit) */}
      <Modal
        visible={recurringScopeMode !== null}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
        onRequestClose={() => setRecurringScopeMode(null)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 items-center justify-center px-8"
          activeOpacity={1}
          onPress={() => setRecurringScopeMode(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ maxWidth: DIALOG_MAX_WIDTH }}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
          >
            <View className="px-5 pt-5 pb-4 items-center">
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1 text-center">
                {recurringScopeMode === "delete"
                  ? `Delete recurring ${isReminder ? "reminder" : "task"}?`
                  : `Update recurring ${isReminder ? "reminder" : "task"}?`}
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                {recurringScopeMode === "delete"
                  ? `Delete only this occurrence, or the entire series including future ${isReminder ? "reminders" : "tasks"}.`
                  : `Apply changes to only this occurrence, or to this and all upcoming ${isReminder ? "reminders" : "tasks"} in the series.`}
              </Text>
            </View>
            <View className="border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity
                onPress={() => setRecurringScopeMode(null)}
                className="py-3.5 items-center border-b border-slate-100 dark:border-slate-700"
              >
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">
                  Cancel
                </Text>
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
                <Text className="text-base font-semibold text-indigo-500">
                  This task only
                </Text>
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
                <Text
                  className={`text-base font-semibold ${recurringScopeMode === "delete" ? "text-red-500" : "text-indigo-500"}`}
                >
                  Entire series
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Recall confirmation modal */}
      <Modal
        visible={showRecallConfirm}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
        onRequestClose={() => setShowRecallConfirm(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 items-center justify-center px-8"
          activeOpacity={1}
          onPress={() => setShowRecallConfirm(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ maxWidth: DIALOG_MAX_WIDTH }}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
          >
            <View className="px-5 pt-5 pb-4 items-center">
              <Text style={{ fontSize: 28, marginBottom: 8 }}>⚠️</Text>
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                {isReminder ? "Recall this reminder?" : "Recall this task?"}
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                {task?.dueDate && isTaskOverdue(task)
                  ? "This task is past its due date and will be marked as overdue once recalled."
                  : `This will move the ${isReminder ? "reminder" : "task"} back to active and allow edits to be made.`}
              </Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity
                onPress={() => setShowRecallConfirm(false)}
                className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700"
              >
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-recall-button"
                onPress={() => {
                  setShowRecallConfirm(false);
                  updateMutation.mutate({ status: "todo" });
                }}
                disabled={updateMutation.isPending}
                className="flex-1 py-3.5 items-center"
              >
                <Text className="text-base font-semibold text-amber-500">
                  Recall
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={uncheckConfirm != null}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
        onRequestClose={() => setUncheckConfirm(null)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 items-center justify-center px-8"
          activeOpacity={1}
          onPress={() => setUncheckConfirm(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ maxWidth: DIALOG_MAX_WIDTH }}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
          >
            <View className="px-5 pt-5 pb-4 items-center">
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1 text-center">
                Uncheck this step?
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                {uncheckConfirm?.completedByName} already completed
                {uncheckConfirm?.title ? ` “${uncheckConfirm.title}”` : " this"}
                . Unchecking it marks it incomplete for everyone.
              </Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity
                onPress={() => setUncheckConfirm(null)}
                className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700"
              >
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-uncheck-other-subtask"
                onPress={() => {
                  const subtaskId = uncheckConfirm?.subtaskId;
                  setUncheckConfirm(null);
                  if (subtaskId) {
                    toggleSubtaskMutation.mutate({
                      subtaskId,
                      completed: false,
                    });
                  }
                }}
                className="flex-1 py-3.5 items-center"
              >
                <Text className="text-base font-semibold text-amber-500">
                  Uncheck
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Subtask blocker modal */}
      <Modal
        visible={showSubtaskBlock}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
        onRequestClose={() => setShowSubtaskBlock(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 items-center justify-center px-8"
          activeOpacity={1}
          onPress={() => setShowSubtaskBlock(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ maxWidth: DIALOG_MAX_WIDTH }}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
          >
            <View className="px-5 pt-5 pb-4 items-center">
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: "#FEF3C7",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 24 }}>⚠️</Text>
              </View>
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                Subtasks Incomplete
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                Subtasks are incomplete. Finish them before marking this{" "}
                {isReminder ? "reminder" : "task"} as done.
              </Text>
            </View>
            <View className="border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity
                onPress={() => setShowSubtaskBlock(false)}
                className="py-3.5 items-center"
                testID="subtask-block-ok"
              >
                <Text className="text-base font-semibold text-indigo-500">
                  Got it
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showCompletionSuccess}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
      >
        <View
          style={completionMomentStyles.backdrop}
          accessibilityViewIsModal
        >
          <Animated.View
            style={[
              completionMomentStyles.card,
              { transform: [{ scale: completionScale }] },
            ]}
            accessible
            accessibilityRole="alert"
            accessibilityLabel="Task complete"
            testID="task-completion-success"
          >
            <LinearGradient
              colors={["#F5F3FF", "#FFFBF2", "#FFFFFF"]}
              locations={[0, 0.56, 1]}
              style={completionMomentStyles.successHero}
            >
              <View style={completionMomentStyles.brandRow}>
                <Image
                  source={require("@/assets/alenio-icon.png")}
                  style={completionMomentStyles.brandLogo}
                />
                <Text style={completionMomentStyles.brandText}>
                  ALENIO STARS
                </Text>
              </View>
              <Sparkles
                size={18}
                color="#B9A8FF"
                strokeWidth={1.9}
                style={completionMomentStyles.sparkleLeft}
              />
              <Sparkles
                size={15}
                color="#F2B84B"
                strokeWidth={1.9}
                style={completionMomentStyles.sparkleRight}
              />
              <View style={completionMomentStyles.markStage}>
                <Animated.View
                  style={[
                    completionMomentStyles.pulseRing,
                    {
                      opacity: completionRing.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 0],
                      }),
                      transform: [
                        {
                          scale: completionRing.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.86, 1.35],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <View style={completionMomentStyles.successMark}>
                  <Check size={32} color="#6D55E7" strokeWidth={3.2} />
                </View>
              </View>
              <Text style={completionMomentStyles.eyebrow}>
                {isReminder ? "REMINDER COMPLETE" : "TASK COMPLETE"}
              </Text>
              <Text style={completionMomentStyles.successTitle}>
                Nice work.
              </Text>
              <Text style={completionMomentStyles.successSubtitle}>
                {isReminder
                  ? "This reminder is locked in."
                  : "This task is locked in for the team."}
              </Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      <StreakCelebrationModal
        visible={!!milestoneModal && !showCompletionSuccess}
        count={milestoneModal}
        userName={session?.user?.name ?? "You"}
        onClose={closeMilestoneCelebration}
      />

      <StreakCelebrationModal
        visible={
          !!personalBestModal && !showCompletionSuccess && !milestoneModal
        }
        count={personalBestModal}
        userName={session?.user?.name ?? "You"}
        personalBest
        onClose={closePersonalBestCelebration}
      />

      <AlenioBottomSheet
        visible={showDoneConfirm}
        title={isReminder ? "Complete reminder?" : "Complete task?"}
        subtitle={
          isReminder
            ? "This locks the reminder from further edits."
            : "This locks the task from further edits."
        }
        onClose={() => {
          if (updateMutation.isPending) return;
          setShowDoneConfirm(false);
        }}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="done-confirm-sheet"
        footer={
          <>
            <TouchableOpacity
              testID="confirm-done-button"
              onPress={confirmCompleteTask}
              disabled={!doneConfirmReady || updateMutation.isPending}
              activeOpacity={0.92}
              style={[
                alenioSheetStyles.primaryButton,
                (!doneConfirmReady || updateMutation.isPending) && {
                  opacity: 0.55,
                },
              ]}
            >
              {updateMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  {isReminder ? "Complete reminder" : "Complete task"}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDoneConfirm(false)}
              disabled={!doneConfirmReady || updateMutation.isPending}
              style={alenioSheetStyles.cancelButton}
              activeOpacity={0.8}
              testID="done-confirm-cancel"
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Not yet</Text>
            </TouchableOpacity>
          </>
        }
      >
        <AlenioSheetCard tint="purple" compact>
          <View
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#EDE9FE",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={18} color="#6D55E7" strokeWidth={2.25} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: "#312E81" }}
                numberOfLines={2}
              >
                {task?.title ?? "Task"}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: "#5B21B6",
                  marginTop: 4,
                  lineHeight: 17,
                }}
              >
                Confirm to mark it done and close this screen.
              </Text>
              {warnOwnerNotAssigned ? (
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    lineHeight: 17,
                    fontWeight: "700",
                    color: "#B45309",
                  }}
                  testID="owner-unassigned-complete-warning"
                >
                  This task is not assigned to you.
                </Text>
              ) : null}
            </View>
          </View>
        </AlenioSheetCard>
      </AlenioBottomSheet>

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
          <View
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
          >
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
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: "#991B1B" }}
              >
                {earlierOpenSeriesTasks.length === 1
                  ? "1 earlier task is still incomplete"
                  : `${earlierOpenSeriesTasks.length} earlier tasks are still incomplete`}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: "#B91C1C",
                  marginTop: 4,
                  lineHeight: 17,
                }}
              >
                {warnOwnerNotAssigned
                  ? "This task is not assigned to you. "
                  : ""}
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
              <Text style={alenioSheetStyles.primaryButtonText}>
                Complete anyway
              </Text>
            )}
          </TouchableOpacity>
        </AlenioSheetCard>
      </AlenioBottomSheet>
    </>
  );

  if (!embedded) {
    return (
      <>
        <View
          testID="task-detail-screen"
          style={{ flex: 1 }}
          onLayout={(event) => setPaneWidth(event.nativeEvent.layout.width)}
        >
          <AlenioBottomSheet
            asScreen
            title={sheetTitle}
            subtitle={sheetSubtitle}
            onClose={close}
            showCloseButton
            showScrollIndicator
            showMoreIndicator
            bodyHeightRatio={0.82}
            headerRight={headerRight}
            footer={footerNode}
            testID="task-detail-sheet"
          >
            {body}
          </AlenioBottomSheet>
        </View>
        {overlays}
      </>
    );
  }

  return (
    <SafeAreaView
      edges={[]}
      testID="task-detail-screen"
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      onLayout={(event) => setPaneWidth(event.nativeEvent.layout.width)}
    >
      <View
        style={{
          paddingLeft:
            COLUMN_PADDING +
            columnGutter +
            (iconRailEdge === "left" ? cameraPad : 0),
          paddingRight:
            COLUMN_PADDING +
            columnGutter +
            (iconRailEdge === "right" ? cameraPad : 0),
          paddingTop: 8,
          paddingBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: palette.cardBorder,
          backgroundColor: "#FFFFFF",
        }}
      >
        {isEditMode ? (
          <TouchableOpacity
            onPress={cancelEdit}
            hitSlop={8}
            style={{
              minWidth: 64,
              height: 36,
              justifyContent: "center",
            }}
            testID="cancel-edit-button"
            accessibilityLabel="Cancel editing"
          >
            <Text
              style={{ color: "#64748B", fontSize: 16, fontWeight: "600" }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={close}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: palette.cardBorder,
            }}
            testID="back-button"
            accessibilityLabel="Close task"
          >
            <X size={19} color={palette.ink} strokeWidth={2.4} />
          </TouchableOpacity>
        )}
        <Text
          style={{
            flex: 1,
            marginHorizontal: 12,
            color: palette.ink,
            fontSize: 17,
            fontWeight: "700",
            letterSpacing: -0.2,
            textAlign: "center",
          }}
          numberOfLines={1}
        >
          {sheetTitle}
        </Text>
        <View
          style={{
            minWidth: 64,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          {headerRight && !isEditMode ? headerRight : null}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        contentContainerStyle={[
          {
            paddingHorizontal: COLUMN_PADDING + columnGutter,
            backgroundColor: "#FFFFFF",
            flexGrow: 1,
          },
          showFocusedFeedbackTask
            ? isCompleted
              ? { justifyContent: "center", paddingVertical: 32 }
              : { paddingBottom: 32 }
            : { paddingBottom: 24 },
        ]}
      >
        {body}
      </ScrollView>

      {footerNode ? (
        <View
          style={{
            paddingHorizontal: COLUMN_PADDING + columnGutter,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: palette.cardBorder,
            backgroundColor: "#FFFFFF",
          }}
        >
          {footerNode}
        </View>
      ) : null}

      {overlays}
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  readOnlyCompleteCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E4F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  readOnlyCompleteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  readOnlyCompleteTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  readOnlyCompleteBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
  },
});

const completionMomentStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  card: {
    width: "100%",
    maxWidth: 336,
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 32,
    elevation: 18,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginBottom: 18,
  },
  brandLogo: { width: 24, height: 24, borderRadius: 7 },
  brandText: {
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.35,
    color: "#716A86",
  },
  sparkleLeft: { position: "absolute", left: 34, top: 72 },
  sparkleRight: { position: "absolute", right: 38, top: 96 },
  successHero: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
    alignItems: "center",
  },
  markStage: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  pulseRing: {
    position: "absolute",
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 2,
    borderColor: "#C4B5FD",
    backgroundColor: "rgba(109, 85, 231, 0.12)",
  },
  successMark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    shadowColor: "#6D55E7",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#6D55E7",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  successSubtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
  },
});
