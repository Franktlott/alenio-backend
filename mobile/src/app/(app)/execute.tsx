import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Image,
  ScrollView,
  Modal,
  TextInput,
  Platform,
  Switch,
  Alert,
  Dimensions,
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const EVENT_MODAL_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.92);
const MEETING_ASSIGNEE_SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.62);
const MEETING_DURATION_SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.55);
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams, Redirect, useFocusEffect } from "expo-router";
import { Plus, User, Users, ChevronLeft, ChevronRight, ChevronDown, X, CalendarDays, CheckSquare, Calendar, Check, UserRound, Video, VideoOff, Clock, Lock, Globe, Trash2, Pencil, RefreshCw, AlertTriangle, Search } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSession } from "@/lib/auth/use-session";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { useTaskStore } from "@/lib/state/task-store";
import type { Task, Team, TeamMember, CalendarEvent } from "@/lib/types";
import { NoWorkspaceRedirect } from "@/components/NoWorkspaceRedirect";
import { isFeedbackTaskDescription } from "@/lib/one-on-one-feedback";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import { earlierIncompleteSeriesTasks } from "@/lib/recurring-task";
import { formatTaskDueDateLabel } from "@/lib/timezone";
import { hasWorkspaceTaskAccess } from "@/lib/plan-access-copy";
import { workspaceTaskClearance } from "@/lib/tab-bar";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { WorkspaceViewToggle, type WorkspaceViewMode } from "@/components/workspace/WorkspaceViewToggle";
import { CalendarCard } from "@/components/workspace/CalendarCard";
import { EventsSection } from "@/components/workspace/EventsSection";
import { TaskStatusTabs } from "@/components/workspace/TaskStatusTabs";
import { TaskFilterBar } from "@/components/workspace/TaskFilterBar";
import { TaskListCard } from "@/components/workspace/TaskListCard";
import { MemberTasksEmptyState } from "@/components/workspace/MemberTasksEmptyState";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import {
  DEFAULT_WORKSPACE_FILTERS,
  type FilterPicker,
  type TaskStatusTab,
  type WorkspaceFiltersState,
} from "@/components/workspace/workspace-types";
import { WorkspaceFilterPicker } from "@/components/workspace/WorkspaceFilterPicker";
import { WS } from "@/components/workspace/workspace-ui";
import {
  assignedToQueryKey,
  buildWorkspaceTasksPath,
  filterTasksClientSide,
  groupTasksByWeek,
  isSameDay,
  startOfDay,
  toLocalIso,
} from "@/components/workspace/workspace-utils";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { getUSHolidays, type USFederalHoliday } from "@/lib/us-federal-holidays";
import { eventCalendarDayRange } from "@/lib/calendar-grid";
import {
  fetchExternalCalendarEvents,
  type ExternalCalendarEventItem,
} from "@/lib/outlook-calendar-api";
import {
  VIDEO_MEETING_DURATION_OPTIONS,
  durationMinutesFromRange,
  formatVideoMeetingDuration,
  formatVideoMeetingEndPreview,
  videoMeetingEndFromDuration,
} from "@/lib/video-meeting-duration";

const EXTERNAL_BUSY_COLOR = "#94A3B8";

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { openModal } = useLocalSearchParams<{ openModal?: string }>();
  const [filters, setFilters] = useState<WorkspaceFiltersState>(DEFAULT_WORKSPACE_FILTERS);
  const [filterPicker, setFilterPicker] = useState<FilterPicker>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceViewMode>("calendar");
  const [selectedDay, setSelectedDay] = useState<string | null>(toLocalIso(new Date()));
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());

  const [confirmCompleteTask, setConfirmCompleteTask] = useState<Task | null>(null);
  const [seriesOrderWarning, setSeriesOrderWarning] = useState<{
    task: Task;
    earlierCount: number;
    nextDueLabel: string;
  } | null>(null);
  const [checkingSeriesOrder, setCheckingSeriesOrder] = useState(false);
  const [actionMenuTask, setActionMenuTask] = useState<Task | null>(null);
  const [actionMenuEvent, setActionMenuEvent] = useState<CalendarEvent | null>(null);
  const [confirmDeleteActionEvent, setConfirmDeleteActionEvent] = useState(false);
  const [reassignTask, setReassignTask] = useState<Task | null>(null);
  const [confirmReassign, setConfirmReassign] = useState<{ task: Task; newUserId: string; newUserName: string } | null>(null);
  const [subtaskBlockMessage, setSubtaskBlockMessage] = useState<string | null>(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState<{ count: number; userName: string } | null>(null);
  const [personalBestModal, setPersonalBestModal] = useState<{ count: number; userName: string } | null>(null);
  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventModalReadOnly, setEventModalReadOnly] = useState(false);
  const [eventModalType, setEventModalType] = useState<"event" | "meeting">("event");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStart, setEventStart] = useState<Date>(new Date());
  const [eventEnd, setEventEnd] = useState<Date>(new Date());
  const [eventColor, setEventColor] = useState("#4361EE");
  const [eventIsHidden, setEventIsHidden] = useState(true);
  const [meetingAssigneeIds, setMeetingAssigneeIds] = useState<string[]>([]);
  const [showMeetingAssigneeDropdown, setShowMeetingAssigneeDropdown] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [meetingDurationMinutes, setMeetingDurationMinutes] = useState(60);
  const [formError, setFormError] = useState<string | null>(null);
  const [visibleWeeks, setVisibleWeeks] = useState<number>(1);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveSearchDebounced, setArchiveSearchDebounced] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const queryClient = useQueryClient();
  const acknowledge = useTaskStore((s) => s.acknowledge);
  const acknowledgeEvents = useTaskStore((s) => s.acknowledgeEvents);
  const acknowledgedCounts = useTaskStore((s) => s.acknowledgedCounts);
  const acknowledgedEventCounts = useTaskStore((s) => s.acknowledgedEventCounts);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const workspacePollInterval = isScreenFocused ? 15_000 : false;

  useEffect(() => {
    const handle = setTimeout(() => setArchiveSearchDebounced(archiveSearch.trim()), 300);
    return () => clearTimeout(handle);
  }, [archiveSearch]);

  const archiveSearchReady = archiveSearchDebounced.length >= 2;

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      if (activeTeamId) {
        invalidateTaskCaches(queryClient, activeTeamId);
        void queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      }
      return () => setIsScreenFocused(false);
    }, [activeTeamId, queryClient])
  );

  const [refreshing, setRefreshing] = useState(false);

  // Auto-open event modal when navigated from another tab
  useEffect(() => {
    if (openModal === "event") {
      openEventModal();
      router.setParams({ openModal: undefined });
    }
  }, [openModal]);

  const handleViewMonthChange = useCallback((year: number, month: number) => {
    setCalendarYear(year);
    setCalendarMonth(month);
    const now = new Date();
    const keepToday =
      now.getFullYear() === year && now.getMonth() === month ? toLocalIso(now) : toLocalIso(new Date(year, month, 1));
    setSelectedDay(keepToday);
    setVisibleWeeks(1);
    setNextCursor(null);
  }, []);

  useEffect(() => {
    const now = new Date();
    setCalendarYear(now.getFullYear());
    setCalendarMonth(now.getMonth());
    setSelectedDay(toLocalIso(now));
    setNextCursor(null);
  }, [activeTeamId]);

  const onRefresh = async () => {
    setRefreshing(true);
    setNextCursor(null);
    invalidateTaskCaches(queryClient, activeTeamId);
    await queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
    await queryClient.invalidateQueries({ queryKey: ["upcoming-video-meetings"] });
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!activeTeamId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    const queryKey =
      filters.statusTab === "archived"
        ? ([
            "tasks",
            activeTeamId,
            assignedToQueryKey(filters.assignedTo),
            "archived",
            archiveSearchDebounced,
          ] as const)
        : filters.statusTab === "completed"
          ? (["tasks", activeTeamId, assignedToQueryKey(filters.assignedTo), calendarYear, calendarMonth, "completed"] as const)
          : (["tasks", activeTeamId, assignedToQueryKey(filters.assignedTo), "active"] as const);
    try {
      const result = await api.get<{ tasks: Task[]; nextCursor: string | null }>(
        buildWorkspaceTasksPath(activeTeamId, {
          statusTab: filters.statusTab,
          calendarYear,
          calendarMonth,
          assignedTo: filters.assignedTo,
          cursor: nextCursor,
          search: filters.statusTab === "archived" ? archiveSearchDebounced : undefined,
        }),
      );
      queryClient.setQueryData<{ tasks: Task[]; nextCursor: string | null }>(queryKey, (prev) => ({
        tasks: [...(prev?.tasks ?? []), ...result.tasks],
        nextCursor: result.nextCursor,
      }));
      setNextCursor(result.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  const currentRole = teams?.find((t) => t.id === activeTeamId)?.role ?? "member";
  const isRegularMember = currentRole === "member";
  const isOwnerOrLeader = currentRole === "owner" || currentRole === "team_leader";
  const isCalendarManager = isOwnerOrLeader || currentRole === "admin";
  const canManageTaskMenu = useCallback(
    (task: Task) => {
      // Check-in follow-ups are completed via the form, not the edit menu.
      if (isFeedbackTaskDescription(task.description)) return false;
      if (currentRole === "owner" || currentRole === "team_leader" || currentRole === "admin") return true;
      const creatorId = task.creator?.id;
      return !!session?.user?.id && creatorId === session.user.id;
    },
    [currentRole, session?.user?.id],
  );

  const canManageEvent = useCallback(
    (ev: CalendarEvent) => {
      if (ev.isExternal) return false;
      const creatorId = ev.createdById ?? ev.createdBy?.id;
      if (!session?.user?.id) return false;
      if (isCalendarManager) return true;
      // Members: only their own non-meeting entries (matches backend calendar permissions).
      if (ev.isVideoMeeting) return false;
      return creatorId === session.user.id;
    },
    [isCalendarManager, session?.user?.id],
  );

  React.useEffect(() => {
    if (teams && teams.length > 0 && !activeTeamId) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId, setActiveTeamId]);

  const { data: subscription, isFetched: subscriptionFetched } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () => api.get<{ plan: string; status: string }>(`/api/teams/${activeTeamId}/subscription`),
    enabled: !!activeTeamId,
  });
  const plan = useSubscriptionStore((s) => s.plan);
  const hasTaskAccess = hasWorkspaceTaskAccess(subscription, plan);

  const {
    data: activeTasksData,
    isPending: activePending,
    isError: activeError,
    error: activeLoadError,
    refetch: refetchActiveTasks,
  } = useQuery({
    queryKey: ["tasks", activeTeamId, assignedToQueryKey(filters.assignedTo), "active"],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        buildWorkspaceTasksPath(activeTeamId!, {
          statusTab: "active",
          calendarYear,
          calendarMonth,
          assignedTo: filters.assignedTo,
        }),
      ),
    enabled: !!activeTeamId && hasTaskAccess,
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });

  const { data: completedTasksData, isPending: completedPending } = useQuery({
    queryKey: ["tasks", activeTeamId, assignedToQueryKey(filters.assignedTo), calendarYear, calendarMonth, "completed"],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        buildWorkspaceTasksPath(activeTeamId!, {
          statusTab: "completed",
          calendarYear,
          calendarMonth,
          assignedTo: filters.assignedTo,
        }),
      ),
    enabled: !!activeTeamId && hasTaskAccess,
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });

  const { data: archivedTasksData, isPending: archivedPending, isFetching: archivedFetching } = useQuery({
    queryKey: [
      "tasks",
      activeTeamId,
      assignedToQueryKey(filters.assignedTo),
      "archived",
      archiveSearchDebounced,
    ],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        buildWorkspaceTasksPath(activeTeamId!, {
          statusTab: "archived",
          calendarYear,
          calendarMonth,
          assignedTo: filters.assignedTo,
          search: archiveSearchDebounced,
        }),
      ),
    enabled: !!activeTeamId && hasTaskAccess && filters.statusTab === "archived" && archiveSearchReady,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });

  const rawTasks: Task[] =
    filters.statusTab === "archived"
      ? (archivedTasksData?.tasks ?? [])
      : filters.statusTab === "completed"
        ? (completedTasksData?.tasks ?? [])
        : (activeTasksData?.tasks ?? []);
  const { data: teamData } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });
  const nonOwnerMembers: TeamMember[] = (teamData?.members ?? []).filter(
    (m) => m.role !== "owner"
  );

  const meetingAssigneeOptions = React.useMemo(
    () =>
      [...(teamData?.members ?? [])].sort((a, b) =>
        (a.user.name?.trim() || "").localeCompare(b.user.name?.trim() || "", undefined, { sensitivity: "base" }),
      ),
    [teamData?.members],
  );
  const allMeetingAssigneeIds = React.useMemo(
    () => meetingAssigneeOptions.map((m) => m.userId),
    [meetingAssigneeOptions],
  );
  const allMeetingAssigneesSelected =
    allMeetingAssigneeIds.length > 0 && allMeetingAssigneeIds.every((id) => meetingAssigneeIds.includes(id));

  const toggleAllMeetingAssignees = () => {
    setMeetingAssigneeIds(allMeetingAssigneesSelected ? [] : allMeetingAssigneeIds);
  };

  const { data: calendarEvents = [] } = useQuery({
    queryKey: ["calendar-events", activeTeamId],
    queryFn: () => api.get<CalendarEvent[]>(`/api/teams/${activeTeamId}/events`),
    enabled: !!activeTeamId && hasTaskAccess,
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });

  const workspaceCalendarRange = React.useMemo(() => {
    const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
    const lastOfMonth = new Date(calendarYear, calendarMonth + 1, 0);
    const startPad = new Date(firstOfMonth);
    startPad.setDate(startPad.getDate() - 7);
    const endPad = new Date(lastOfMonth);
    endPad.setDate(endPad.getDate() + 7);
    return {
      start: startOfDay(startPad).toISOString(),
      end: new Date(endPad.getFullYear(), endPad.getMonth(), endPad.getDate(), 23, 59, 59, 999).toISOString(),
    };
  }, [calendarYear, calendarMonth]);

  const { data: externalBusyEvents = [] } = useQuery({
    queryKey: ["external-calendar-events", workspaceCalendarRange.start, workspaceCalendarRange.end],
    queryFn: () => fetchExternalCalendarEvents(workspaceCalendarRange.start, workspaceCalendarRange.end),
    enabled: !!session?.user?.id && !!workspaceCalendarRange.start && hasTaskAccess,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const calendarEventsWithOutlook = React.useMemo((): CalendarEvent[] => {
    // Trust API visibility: private check-ins / meetings are already filtered to creator + assignees.
    // Do not strip isHidden here — that hid scheduled check-ins from both participants.
    const teamEvents = calendarEvents;
    const outlookEvents: CalendarEvent[] = externalBusyEvents.map((event: ExternalCalendarEventItem) => ({
      id: `ext-${event.id}`,
      title: event.title?.trim() || "Untitled event",
      description: "Private · Outlook",
      startDate: event.startDate,
      endDate: event.endDate,
      allDay: event.allDay,
      color: EXTERNAL_BUSY_COLOR,
      teamId: "",
      createdAt: event.startDate,
      isExternal: true,
    }));
    return [...teamEvents, ...outlookEvents];
  }, [calendarEvents, externalBusyEvents]);

  const { data: taskCount = 0 } = useQuery({
    queryKey: ["tasks-count", activeTeamId],
    queryFn: () => api.get<number>(`/api/teams/${activeTeamId}/tasks/count`),
    enabled: !!activeTeamId && hasTaskAccess,
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });

  const eventCount = calendarEvents.length;
  const tasksBadge = Math.max(0, taskCount - (acknowledgedCounts[activeTeamId ?? ""] ?? 0));
  const calendarBadge = Math.max(0, eventCount - (acknowledgedEventCounts[activeTeamId ?? ""] ?? 0));

  // Clear the badge for the active Calendar/Tasks view when opened or switched
  useEffect(() => {
    if (!activeTeamId || !hasTaskAccess) return;
    if (workspaceMode === "tasks") {
      acknowledge(activeTeamId, taskCount);
    } else {
      acknowledgeEvents(activeTeamId, eventCount);
    }
  }, [
    activeTeamId,
    hasTaskAccess,
    workspaceMode,
    taskCount,
    eventCount,
    acknowledge,
    acknowledgeEvents,
  ]);

  const toggleMutation = useMutation({
    mutationFn: (task: Task) =>
      api.patchFull<Task>(`/api/teams/${activeTeamId}/tasks/${task.id}`, {
        status: task.status === "done" ? "todo" : "done",
      }),
    onSuccess: (result) => {
      invalidateTaskCaches(queryClient, activeTeamId);
      if (result.milestone) {
        setMilestoneModal({ count: result.milestone, userName: session?.user?.name ?? "You" });
      }
      if (result.comeback) {
        setPersonalBestModal({ count: result.comeback, userName: session?.user?.name ?? "You" });
      }
    },
    onError: (error: Error) => {
      setSubtaskBlockMessage(error.message);
    },
  });

  const handleToggleTask = (task: Task) => {
    if (isFeedbackTaskDescription(task.description)) {
      // Check-in follow-ups must be completed via the feedback form, not the quick toggle.
      if (task.status === "done") return;
      if (!activeTeamId) return;
      router.push({ pathname: "/task-detail", params: { taskId: task.id, teamId: activeTeamId } });
      return;
    }
    setConfirmCompleteTask(task);
  };

  const completeTaskFromList = (task: Task) => {
    toggleMutation.mutate(task);
    setConfirmCompleteTask(null);
    setSeriesOrderWarning(null);
  };

  const confirmListComplete = async () => {
    const task = confirmCompleteTask;
    if (!task) return;

    if (
      task.status !== "done" &&
      isFeedbackTaskDescription(task.description)
    ) {
      setConfirmCompleteTask(null);
      if (activeTeamId) {
        router.push({
          pathname: "/task-detail",
          params: { taskId: task.id, teamId: activeTeamId },
        });
      }
      return;
    }

    if (task.status === "done" || !task.recurrenceSeriesId || !activeTeamId) {
      completeTaskFromList(task);
      return;
    }

    setCheckingSeriesOrder(true);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["series-tasks", activeTeamId, task.recurrenceSeriesId],
        queryFn: () =>
          api.get<{ tasks: Task[]; nextCursor: string | null }>(
            `/api/teams/${activeTeamId}/tasks?recurrenceSeriesId=${encodeURIComponent(task.recurrenceSeriesId!)}&limit=400`,
          ),
        staleTime: 15_000,
      });
      const earlier = earlierIncompleteSeriesTasks(data.tasks, task.id);
      if (earlier.length > 0) {
        setConfirmCompleteTask(null);
        setSeriesOrderWarning({
          task,
          earlierCount: earlier.length,
          nextDueLabel: formatTaskDueDateLabel(earlier[0]!.dueDate),
        });
        return;
      }
    } catch {
      // If series check fails, still allow completion.
    } finally {
      setCheckingSeriesOrder(false);
    }

    completeTaskFromList(task);
  };

  const reassignMutation = useMutation({
    mutationFn: async ({ task, newUserId }: { task: Task; newUserId: string }) => {
      for (const assignment of task.assignments) {
        await api.delete(`/api/teams/${activeTeamId}/tasks/${task.id}/assign/${assignment.userId}`);
      }
      await api.post(`/api/teams/${activeTeamId}/tasks/${task.id}/assign`, { userIds: [newUserId] });
    },
    onSuccess: () => {
      invalidateTaskCaches(queryClient, activeTeamId);
      setReassignTask(null);
    },
  });

  const createEventMutation = useMutation({
    mutationFn: (data: object) =>
      api.post(`/api/teams/${activeTeamId}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-video-meetings"] });
      setShowEventModal(false);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE"); setEventIsHidden(true);
      setMeetingAssigneeIds([]);
      setShowMeetingAssigneeDropdown(false);
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch(`/api/teams/${activeTeamId}/events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-video-meetings"] });
      setShowEventModal(false);
      setEditingEvent(null);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE"); setEventIsHidden(true);
      setMeetingAssigneeIds([]);
      setShowMeetingAssigneeDropdown(false);
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/teams/${activeTeamId}/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-video-meetings"] });
      setShowEventModal(false);
      setEditingEvent(null);
      setConfirmDeleteEvent(false);
      setEventTitle(""); setEventDescription(""); setEventColor("#4361EE"); setEventIsHidden(true);
      setMeetingAssigneeIds([]);
      setShowMeetingAssigneeDropdown(false);
    },
    onError: (err: Error) => {
      Alert.alert("Could not delete event", err.message || "Something went wrong. Try again.");
    },
  });

  const openEventModal = () => {
    setEditingEvent(null);
    setEventModalReadOnly(false);
    setEventModalType("event");
    const d = selectedDay
      ? (() => { const [y, m, day] = selectedDay.split("-").map(Number); return new Date(y, m - 1, day); })()
      : new Date();
    setEventTitle(""); setEventDescription("");
    setEventStart(d); setEventEnd(d);
    setEventColor("#4361EE"); setEventIsHidden(false); setFormError(null); setConfirmDeleteEvent(false);
    setMeetingAssigneeIds([]);
    setShowMeetingAssigneeDropdown(false);
    setShowStartPicker(false); setShowEndPicker(false); setShowStartTimePicker(false); setShowDurationPicker(false);
    setMeetingDurationMinutes(60);
    setShowEventModal(true);
  };

  const openPersonalEventModal = () => {
    setEditingEvent(null);
    setEventModalReadOnly(false);
    setEventModalType("event");
    const d = selectedDay
      ? (() => { const [y, m, day] = selectedDay.split("-").map(Number); return new Date(y, m - 1, day); })()
      : new Date();
    setEventTitle(""); setEventDescription("");
    setEventStart(d); setEventEnd(d);
    setEventColor("#4361EE"); setEventIsHidden(true); setFormError(null); setConfirmDeleteEvent(false);
    setMeetingAssigneeIds([]);
    setShowMeetingAssigneeDropdown(false);
    setShowStartPicker(false); setShowEndPicker(false); setShowStartTimePicker(false); setShowDurationPicker(false);
    setMeetingDurationMinutes(60);
    setShowEventModal(true);
  };

  const openMeetingModal = () => {
    setEditingEvent(null);
    setEventModalReadOnly(false);
    setEventModalType("meeting");
    const now = new Date();
    const d = selectedDay
      ? (() => {
          const [y, m, day] = selectedDay.split("-").map(Number);
          return new Date(y, m - 1, day, now.getHours(), now.getMinutes(), 0, 0);
        })()
      : now;
    setEventTitle(""); setEventDescription("");
    setEventStart(d); setEventEnd(d);
    setMeetingDurationMinutes(60);
    setEventColor("#4361EE"); setEventIsHidden(true); setFormError(null); setConfirmDeleteEvent(false);
    setMeetingAssigneeIds([]);
    setShowMeetingAssigneeDropdown(false);
    setShowStartPicker(false); setShowEndPicker(false); setShowStartTimePicker(false); setShowDurationPicker(false);
    setShowEventModal(true);
  };

  const openEditEventModal = (ev: CalendarEvent, opts?: { readOnly?: boolean }) => {
    setEditingEvent(ev);
    setEventModalReadOnly(opts?.readOnly === true || !canManageEvent(ev));
    setEventModalType(ev.isVideoMeeting ? "meeting" : "event");
    setEventTitle(ev.title);
    setEventDescription(ev.description ?? "");
    setEventStart(new Date(ev.startDate));
    setEventEnd(ev.endDate ? new Date(ev.endDate) : new Date(ev.startDate));
    if (ev.isVideoMeeting && ev.endDate) {
      setMeetingDurationMinutes(durationMinutesFromRange(new Date(ev.startDate), new Date(ev.endDate)));
    } else {
      setMeetingDurationMinutes(60);
    }
    setEventColor(ev.color);
    setEventIsHidden(ev.isHidden ?? false);
    setMeetingAssigneeIds(ev.assigneeIds ?? []);
    setFormError(null);
    setConfirmDeleteEvent(false);
    setShowMeetingAssigneeDropdown(false);
    setShowStartPicker(false); setShowEndPicker(false); setShowStartTimePicker(false); setShowDurationPicker(false);
    setShowEventModal(true);
  };

  const openEventDetails = (ev: CalendarEvent) => {
    openEditEventModal(ev, { readOnly: !canManageEvent(ev) });
  };

  const confirmAndDeleteEvent = (ev: CalendarEvent) => {
    if (!canManageEvent(ev)) {
      Alert.alert("View only", "You can only edit or delete events you created.");
      return;
    }
    Alert.alert("Delete this event?", `"${ev.title}" will be removed. This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteEventMutation.mutate(ev.id),
      },
    ]);
  };

  const openEventActions = (ev: CalendarEvent) => {
    if (!canManageEvent(ev)) {
      openEventDetails(ev);
      return;
    }
    setConfirmDeleteActionEvent(false);
    setActionMenuEvent(ev);
  };

  const handleSaveEvent = () => {
    if (eventModalReadOnly) return;
    if (!eventTitle.trim()) { setFormError("Please enter a title"); return; }
    const isMeeting = eventModalType === "meeting";
    if (isMeeting && !isOwnerOrLeader) {
      setFormError("Only workspace owners and team leaders can schedule virtual meetings.");
      return;
    }
    const end = isMeeting
      ? videoMeetingEndFromDuration(eventStart, meetingDurationMinutes)
      : eventEnd < eventStart
        ? eventStart
        : eventEnd;
    // Keep the calendar focused on the saved event's day so past-dated meetings remain visible immediately.
    setSelectedDay(toLocalIso(eventStart));
    if (isMeeting) {
      const currentEventId = editingEvent?.id;
      const hasOverlap = calendarEvents
        .filter((e) => e.isVideoMeeting && e.id !== currentEventId)
        .some((e) => {
          const eStart = new Date(e.startDate);
          const eEnd = e.endDate ? new Date(e.endDate) : eStart;
          return eventStart < eEnd && end > eStart;
        });
      if (hasOverlap) {
        Alert.alert("Scheduling Conflict", "This time overlaps with another video meeting. Please choose a different time.");
        return;
      }
    }
    if (editingEvent) {
      updateEventMutation.mutate({
        id: editingEvent.id,
        data: {
          title: eventTitle.trim(),
          description: eventDescription.trim() || undefined,
          startDate: eventStart.toISOString(),
          endDate: end.toISOString(),
          color: eventColor,
          allDay: !isMeeting,
          isHidden: eventIsHidden,
          isVideoMeeting: isOwnerOrLeader && isMeeting,
          assigneeIds: isMeeting && eventIsHidden ? meetingAssigneeIds : undefined,
        },
      });
    } else {
      createEventMutation.mutate({
        title: eventTitle.trim(),
        description: eventDescription.trim() || undefined,
        startDate: eventStart.toISOString(),
        endDate: end.toISOString(),
        color: eventColor,
        allDay: !isMeeting,
        isHidden: eventIsHidden,
        isVideoMeeting: isOwnerOrLeader && isMeeting,
        assigneeIds: isMeeting && eventIsHidden ? meetingAssigneeIds : undefined,
      });
    }
  };

  const currentUserId = session?.user?.id ?? null;

  const teamMembers: TeamMember[] = teamData?.members ?? [];

  const handleSelectDay = useCallback((iso: string | null) => {
    setSelectedDay(iso);
  }, []);

  const handleStatusTabChange = useCallback((tab: TaskStatusTab) => {
    setFilters((f) => ({
      ...f,
      statusTab: tab,
      sort: tab === "completed" || tab === "archived" ? "completed" : f.sort === "completed" ? "due" : f.sort,
    }));
    setVisibleWeeks(1);
    if (tab !== "archived") {
      setArchiveSearch("");
      setArchiveSearchDebounced("");
    }
  }, []);

  const showTasksLoading =
    filters.statusTab === "archived"
      ? archiveSearchReady && archivedPending
      : filters.statusTab === "completed"
        ? completedPending && rawTasks.length === 0
        : activePending && rawTasks.length === 0;

  useEffect(() => {
    setVisibleWeeks(1);
    const source =
      filters.statusTab === "archived"
        ? archivedTasksData
        : filters.statusTab === "completed"
          ? completedTasksData
          : activeTasksData;
    setNextCursor(source?.nextCursor ?? null);
  }, [
    filters.statusTab,
    filters.assignedTo,
    calendarYear,
    calendarMonth,
    activeTasksData?.nextCursor,
    completedTasksData?.nextCursor,
    archivedTasksData?.nextCursor,
  ]);

  const tasks = React.useMemo(
    () =>
      filterTasksClientSide(rawTasks, {
        filters,
        currentUserId,
        members: teamMembers,
        selectedDay,
        calendarYear,
        calendarMonth,
        isLeader: isOwnerOrLeader,
      }),
    [rawTasks, filters, currentUserId, teamMembers, selectedDay, calendarYear, calendarMonth, isOwnerOrLeader],
  );

  const activeCount = React.useMemo(
    () =>
      filterTasksClientSide(activeTasksData?.tasks ?? [], {
        filters: { ...filters, statusTab: "active", dueDate: "all" },
        currentUserId,
        members: teamMembers,
        selectedDay: null,
        calendarYear,
        calendarMonth,
        isLeader: isOwnerOrLeader,
      }).length,
    [activeTasksData?.tasks, filters, currentUserId, teamMembers, calendarYear, calendarMonth, isOwnerOrLeader],
  );

  const completedCount = React.useMemo(
    () =>
      filterTasksClientSide(completedTasksData?.tasks ?? [], {
        filters: { ...filters, statusTab: "completed", dueDate: "all" },
        currentUserId,
        members: teamMembers,
        selectedDay: null,
        calendarYear,
        calendarMonth,
        isLeader: isOwnerOrLeader,
      }).length,
    [completedTasksData?.tasks, filters, currentUserId, teamMembers, calendarYear, calendarMonth, isOwnerOrLeader],
  );

  const taskWeekGroups = React.useMemo(
    () =>
      groupTasksByWeek(
        tasks,
        filters.statusTab === "completed" || filters.statusTab === "archived" ? "completed" : "due",
      ),
    [tasks, filters.statusTab],
  );
  const visibleWeekGroups = taskWeekGroups.slice(0, visibleWeeks);
  const remainingWeekCount = Math.max(0, taskWeekGroups.length - visibleWeeks);
  const visibleTasks = React.useMemo(
    () => visibleWeekGroups.flatMap((group) => group.tasks),
    [visibleWeekGroups],
  );

  const holidays = React.useMemo(() => {
    const years = new Set([calendarYear, calendarYear - 1, calendarYear + 1, new Date().getFullYear()]);
    return [...years].sort((a, b) => a - b).flatMap((y) => getUSHolidays(y));
  }, [calendarYear]);

  const today = new Date();
  const targetIso =
    selectedDay ??
    (calendarYear === today.getFullYear() && calendarMonth === today.getMonth()
      ? toLocalIso(today)
      : toLocalIso(new Date(calendarYear, calendarMonth, 1)));
  const dayEvents = calendarEventsWithOutlook.filter((ev) => {
    const { start: evStart, end: evEnd } = eventCalendarDayRange(ev);
    const [ty, tm, td] = targetIso.split("-").map(Number);
    const target = new Date(ty!, tm! - 1, td!);
    return evStart <= target && target <= evEnd;
  });

  const dayHolidays = holidays.filter((h) => {
    const [ty, tm, td] = targetIso.split("-").map(Number);
    return isSameDay(h.date, new Date(ty, tm - 1, td));
  });

  const dayTasks = React.useMemo(() => {
    const byId = new Map<string, Task>();
    for (const task of [...(activeTasksData?.tasks ?? []), ...(completedTasksData?.tasks ?? [])]) {
      if (!task.dueDate) continue;
      if (toLocalIso(new Date(task.dueDate)) !== targetIso) continue;
      byId.set(task.id, task);
    }
    return [...byId.values()].sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return aTime - bTime || a.title.localeCompare(b.title);
    });
  }, [activeTasksData?.tasks, completedTasksData?.tasks, targetIso]);

  const calendarTasks = rawTasks;

  if (!activeTeamId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
        <NoWorkspaceRedirect />
      </SafeAreaView>
    );
  }

  if (!hasTaskAccess && subscriptionFetched) {
    return <Redirect href="/(app)/team" />;
  }

  if (!hasTaskAccess && !subscriptionFetched) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }} edges={["top"]}>
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  const tasksLoadError =
    filters.statusTab === "completed" || filters.statusTab === "archived"
      ? null
      : activeError
        ? activeLoadError instanceof Error
          ? activeLoadError.message
          : "Could not load tasks."
        : null;

  const showMemberTasksEmpty =
    !isOwnerOrLeader &&
    !showTasksLoading &&
    !tasksLoadError &&
    filters.statusTab === "active" &&
    tasks.length === 0;

  if (!teamsLoading && (!teams || teams.length === 0)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }} edges={[]}>
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={[]} testID="tasks-screen">
      <WorkspaceHeader
        topInset={insets.top}
        showAdd={!!activeTeamId}
        addLabel="Add"
        onAddPress={() => setShowAddModal(true)}
        addTestID="workspace-header-add-button"
      />

      <WorkspaceViewToggle
        mode={workspaceMode}
        onChange={setWorkspaceMode}
        calendarBadge={calendarBadge}
        tasksBadge={tasksBadge}
      />

      <View style={{ flex: 1 }}>
        {workspaceMode === "calendar" ? (
          <View style={{ flex: 1, minHeight: 0 }}>
            <View style={{ flexShrink: 0 }}>
              <CalendarCard
                tasks={calendarTasks}
                events={calendarEventsWithOutlook}
                holidays={holidays}
                selectedDay={selectedDay}
                onSelectDay={handleSelectDay}
                viewYear={calendarYear}
                viewMonth={calendarMonth}
                onViewMonthChange={handleViewMonthChange}
              />
            </View>

            <EventsSection
              dayEvents={dayEvents}
              dayHolidays={dayHolidays}
              dayTasks={dayTasks}
              selectedDayIso={targetIso}
              variant="dayList"
              fillRemaining
              canManageEvent={canManageEvent}
              onEventLongPress={openEventActions}
              onEventPress={openEventDetails}
              onTaskPress={(task) =>
                router.push({ pathname: "/task-detail", params: { taskId: task.id, teamId: activeTeamId! } })
              }
              onTaskLongPress={(task) => {
                if (!canManageTaskMenu(task)) return;
                setActionMenuTask(task);
              }}
              onAddEvent={() => setShowAddModal(true)}
              listPaddingBottom={workspaceTaskClearance(insets.bottom)}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />
              }
            />
          </View>
        ) : showMemberTasksEmpty ? (
          <ScrollView
            style={{
              flex: 1,
              backgroundColor: WS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />}
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: workspaceTaskClearance(insets.bottom),
            }}
          >
            <MemberTasksEmptyState />
          </ScrollView>
        ) : (
          <>
            <View
              style={{
                flexShrink: 0,
                paddingHorizontal: WS.pageGutter,
                paddingTop: 4,
                paddingBottom: WS.sectionGap,
                backgroundColor: WS.pageBg,
              }}
            >
              <TaskStatusTabs
                statusTab={filters.statusTab}
                activeCount={activeCount}
                completedCount={completedCount}
                onChange={handleStatusTabChange}
              />

              {filters.statusTab === "archived" ? (
                <View
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: WS.surface,
                    borderWidth: 1,
                    borderColor: WS.cardBorder,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Search size={16} color="#94A3B8" />
                  <TextInput
                    value={archiveSearch}
                    onChangeText={setArchiveSearch}
                    placeholder="Search archived tasks..."
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    style={{ flex: 1, fontSize: 14, color: "#0F172A", padding: 0 }}
                    testID="archive-search-input"
                  />
                  {archiveSearch.length > 0 ? (
                    <Pressable onPress={() => setArchiveSearch("")} hitSlop={8} testID="archive-search-clear">
                      <X size={16} color="#94A3B8" />
                    </Pressable>
                  ) : null}
                  {archivedFetching ? <ActivityIndicator size="small" color="#4361EE" /> : null}
                </View>
              ) : (
                <View style={{ marginTop: 6 }}>
                  <TaskFilterBar
                    filters={filters}
                    selectedDay={selectedDay}
                    onOpenPicker={setFilterPicker}
                    directReportsDisabled={!isOwnerOrLeader}
                    unassignedDisabled={!isOwnerOrLeader}
                    entireTeamDisabled={!isOwnerOrLeader}
                  />
                </View>
              )}
            </View>

            <View style={{ flex: 1, minHeight: 140, paddingHorizontal: WS.pageGutter }}>
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />}
                contentContainerStyle={{
                  paddingTop:
                    visibleTasks.length === 0 && !showTasksLoading
                      ? workspaceTaskClearance(insets.bottom) * 0.35
                      : 4,
                  paddingBottom: workspaceTaskClearance(insets.bottom),
                  flexGrow: 1,
                  justifyContent: visibleTasks.length === 0 && !showTasksLoading ? "center" : undefined,
                }}
              >
                <TaskListCard
                  sections={visibleWeekGroups.map((group) => ({
                    id: group.key,
                    title: group.label,
                    tasks: group.tasks,
                  }))}
                  loading={showTasksLoading}
                  loadError={tasksLoadError}
                  onRetry={() => void refetchActiveTasks()}
                  onToggle={handleToggleTask}
                  onPress={(task) => router.push({ pathname: "/task-detail", params: { taskId: task.id, teamId: activeTeamId! } })}
                  onLongPress={(task) => {
                    if (!canManageTaskMenu(task)) return;
                    setActionMenuTask(task);
                  }}
                  emptyTitle={
                    filters.statusTab === "archived"
                      ? archiveSearchReady
                        ? "No matches"
                        : "Search archive"
                      : filters.statusTab === "completed"
                        ? "Nothing completed"
                        : filters.dueDate === "calendar_day"
                          ? "No active tasks"
                          : "You're all"
                  }
                  emptyAccentTitle={
                    filters.statusTab === "archived"
                      ? archiveSearchReady
                        ? "found."
                        : "by name."
                      : filters.statusTab === "completed"
                        ? filters.dueDate === "calendar_day"
                          ? "for this day."
                          : "yet."
                        : filters.dueDate === "calendar_day"
                          ? "for this day."
                          : "caught up."
                  }
                  emptySubtitle={
                    filters.statusTab === "archived"
                      ? archiveSearchReady
                        ? `Nothing matched “${archiveSearchDebounced}”. Try another title.`
                        : "Completed tasks move here after 30 days. Type at least 2 letters to find them."
                      : filters.dueDate === "calendar_day" && selectedDay
                        ? "Try viewing upcoming tasks or adjust your filters."
                        : filters.statusTab === "completed"
                          ? "Completed work from the last 30 days shows here."
                          : "No active tasks for the current filters."
                  }
                  emptyActionLabel={filters.dueDate === "calendar_day" ? "View upcoming tasks" : undefined}
                  onEmptyAction={
                    filters.dueDate === "calendar_day"
                      ? () => setFilters((f) => ({ ...f, dueDate: "all" }))
                      : undefined
                  }
                  footer={
                    <>
                      {remainingWeekCount > 0 ? (
                        <Pressable
                          onPress={() => setVisibleWeeks((v) => v + 1)}
                          style={{ margin: 12, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: "#F1F5F9" }}
                          testID="show-more-button"
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B" }}>
                            {remainingWeekCount === 1
                              ? "Show 1 more week"
                              : `Show more weeks (${remainingWeekCount} left)`}
                          </Text>
                        </Pressable>
                      ) : null}
                      {nextCursor !== null ? (
                        <Pressable
                          onPress={handleLoadMore}
                          style={{ margin: 12, marginTop: 0, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: "#EEF2FF", flexDirection: "row", justifyContent: "center", gap: 8 }}
                          testID="load-more-button"
                          disabled={loadingMore}
                        >
                          {loadingMore ? <ActivityIndicator size="small" color="#4361EE" testID="load-more-indicator" /> : null}
                          <Text style={{ fontSize: 13, fontWeight: "600", color: "#4361EE" }}>
                            {loadingMore ? "Loading..." : "Load more tasks"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  }
                />
              </ScrollView>
            </View>
          </>
        )}
      </View>

      <WorkspaceFilterPicker
        picker={filterPicker}
        filters={filters}
        members={teamMembers}
        isLeader={isOwnerOrLeader}
        onClose={() => setFilterPicker(null)}
        onApply={(next) => {
          setFilters((f) => ({ ...f, ...next }));
          setFilterPicker(null);
          setVisibleWeeks(1);
        }}
      />

      {/* Task completion confirmation modal */}
      {confirmCompleteTask ? (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", zIndex: 100 }} testID="complete-confirm-overlay">
          <View style={{ backgroundColor: "white", borderRadius: 20, marginHorizontal: 32, padding: 24, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12, width: "85%" }}>
            <Image source={require("@/assets/alenio-icon.png")} style={{ width: 44, height: 44, borderRadius: 10, alignSelf: "center", marginBottom: 14 }} />
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 6 }}>
              {confirmCompleteTask.status === "done" ? "Mark as Incomplete?" : "Mark as Complete?"}
            </Text>
            <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24 }} numberOfLines={2}>
              "{confirmCompleteTask.title}"
            </Text>
            <Pressable
              onPress={() => {
                void confirmListComplete();
              }}
              disabled={checkingSeriesOrder || toggleMutation.isPending}
              style={{ backgroundColor: confirmCompleteTask.status === "done" ? "#F59E0B" : "#10B981", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10, opacity: checkingSeriesOrder ? 0.7 : 1 }}
              testID="complete-confirm-yes"
            >
              {checkingSeriesOrder ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>
                  {confirmCompleteTask.status === "done" ? "Reopen Task" : "Complete Task"}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setConfirmCompleteTask(null)}
              style={{ borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
              testID="complete-confirm-cancel"
            >
              <Text style={{ color: "#94A3B8", fontSize: 15, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <AlenioBottomSheet
        visible={!!seriesOrderWarning}
        title="Earlier tasks still open"
        subtitle="You're completing this out of order"
        onClose={() => setSeriesOrderWarning(null)}
        compact
        showCloseButton
        testID="series-order-warning-sheet"
        footer={
          <TouchableOpacity
            onPress={() => setSeriesOrderWarning(null)}
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
                {seriesOrderWarning?.earlierCount === 1
                  ? "1 earlier task is still incomplete"
                  : `${seriesOrderWarning?.earlierCount ?? 0} earlier tasks are still incomplete`}
              </Text>
              <Text style={{ fontSize: 12, color: "#B91C1C", marginTop: 4, lineHeight: 17 }}>
                {seriesOrderWarning
                  ? `The next open date is ${seriesOrderWarning.nextDueLabel}. You can still complete this one if you want.`
                  : "You can still complete this one if you want."}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (!seriesOrderWarning) return;
              completeTaskFromList(seriesOrderWarning.task);
            }}
            disabled={toggleMutation.isPending}
            style={[alenioSheetStyles.primaryButton, { marginTop: 14 }]}
            activeOpacity={0.92}
            testID="series-order-warning-continue"
          >
            {toggleMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>Complete anyway</Text>
            )}
          </TouchableOpacity>
        </AlenioSheetCard>
      </AlenioBottomSheet>

      {/* Subtask block modal */}
      {subtaskBlockMessage ? (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", zIndex: 101 }} testID="subtask-block-overlay">
          <View style={{ backgroundColor: "white", borderRadius: 20, marginHorizontal: 32, padding: 24, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12, width: "85%" }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 }}>
              <Text style={{ fontSize: 26 }}>⚠️</Text>
            </View>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 6 }}>Subtasks Incomplete</Text>
            <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24 }}>{subtaskBlockMessage}</Text>
            <Pressable
              onPress={() => setSubtaskBlockMessage(null)}
              style={{ backgroundColor: "#4361EE", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
              testID="subtask-block-ok"
            >
              <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>Got it</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Task action menu */}
      <AlenioBottomSheet
        visible={!!actionMenuTask}
        title={actionMenuTask?.title ?? "Task"}
        subtitle="Choose an action"
        onClose={() => setActionMenuTask(null)}
        testID="task-action-sheet"
        footer={
          <TouchableOpacity
            onPress={() => setActionMenuTask(null)}
            style={alenioSheetStyles.cancelButton}
            activeOpacity={0.8}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        }
      >
        {actionMenuTask && canManageTaskMenu(actionMenuTask) ? (
          <AlenioSheetOption
            icon={<Pencil size={20} color="white" strokeWidth={2.25} />}
            title="Edit"
            subtitle="Change title, due date, priority, and more"
            onPress={() => {
              const task = actionMenuTask;
              setActionMenuTask(null);
              router.push({ pathname: "/task-detail", params: { taskId: task.id, teamId: activeTeamId!, startEdit: "1" } });
            }}
            testID="task-action-edit"
          />
        ) : null}
        {isOwnerOrLeader && actionMenuTask?.status !== "done" && (actionMenuTask?.assignments.length ?? 0) > 0 ? (
          <AlenioSheetOption
            icon={<RefreshCw size={20} color="white" strokeWidth={2.25} />}
            iconColor="#7C3AED"
            title="Reassign"
            subtitle="Move this task to another teammate"
            onPress={() => {
              const t = actionMenuTask!;
              setActionMenuTask(null);
              setReassignTask(t);
            }}
            testID="task-action-reassign"
          />
        ) : null}
      </AlenioBottomSheet>

      {/* Event action menu */}
      <AlenioBottomSheet
        visible={!!actionMenuEvent}
        title={actionMenuEvent?.title ?? "Event"}
        subtitle={
          confirmDeleteActionEvent
            ? "This cannot be undone"
            : actionMenuEvent?.isVideoMeeting
              ? "Virtual meeting options"
              : "Calendar event options"
        }
        onClose={() => {
          setActionMenuEvent(null);
          setConfirmDeleteActionEvent(false);
        }}
        testID="event-action-sheet"
        footer={
          <TouchableOpacity
            onPress={() => {
              setActionMenuEvent(null);
              setConfirmDeleteActionEvent(false);
            }}
            style={alenioSheetStyles.cancelButton}
            activeOpacity={0.8}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        }
      >
        {confirmDeleteActionEvent && actionMenuEvent ? (
          <AlenioSheetCard tint="danger">
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#991B1B", textAlign: "center" }}>
              Delete this {actionMenuEvent.isVideoMeeting ? "meeting" : "event"}?
            </Text>
            <Text style={{ fontSize: 12, color: "#B91C1C", textAlign: "center", lineHeight: 16 }}>
              "{actionMenuEvent.title}" will be removed permanently.
            </Text>
            <TouchableOpacity
              onPress={() => {
                const ev = actionMenuEvent;
                setActionMenuEvent(null);
                setConfirmDeleteActionEvent(false);
                deleteEventMutation.mutate(ev.id);
              }}
              style={[alenioSheetStyles.primaryButton, { backgroundColor: "#EF4444" }]}
              activeOpacity={0.92}
              testID="event-action-confirm-delete"
            >
              {deleteEventMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>Delete</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmDeleteActionEvent(false)}
              style={alenioSheetStyles.cancelButton}
              activeOpacity={0.8}
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Keep it</Text>
            </TouchableOpacity>
          </AlenioSheetCard>
        ) : (
          <>
            <AlenioSheetOption
              icon={<Pencil size={20} color="white" strokeWidth={2.25} />}
              title="Edit"
              subtitle="Update details, time, and visibility"
              onPress={() => {
                const ev = actionMenuEvent!;
                setActionMenuEvent(null);
                openEditEventModal(ev);
              }}
              testID="event-action-edit"
            />
            <AlenioSheetOption
              icon={<Trash2 size={20} color="white" strokeWidth={2.25} />}
              title="Delete"
              subtitle="Remove this from the calendar"
              destructive
              onPress={() => setConfirmDeleteActionEvent(true)}
              testID="event-action-delete"
            />
          </>
        )}
      </AlenioBottomSheet>

      {/* Reassign task modal */}
      <AlenioBottomSheet
        visible={!!reassignTask}
        title="Reassign task"
        subtitle={reassignTask ? `"${reassignTask.title}"` : "Pick a new teammate"}
        onClose={() => setReassignTask(null)}
        testID="reassign-sheet"
        footer={
          <TouchableOpacity
            onPress={() => setReassignTask(null)}
            style={alenioSheetStyles.cancelButton}
            activeOpacity={0.8}
            testID="reassign-cancel"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        }
      >
        {reassignTask?.assignments[0]?.user ? (
          <AlenioSheetCard tint="slate">
            <Text style={{ fontSize: 12, color: "#64748B" }}>
              Currently assigned to{" "}
              <Text style={{ fontWeight: "700", color: "#0F172A" }}>{reassignTask.assignments[0].user.name}</Text>
            </Text>
          </AlenioSheetCard>
        ) : null}
        {(teamData?.members ?? [])
          .filter((m) => !reassignTask?.assignments.some((a) => a.userId === m.userId))
          .map((member) => (
            <AlenioSheetOption
              key={member.userId}
              icon={
                member.user?.image ? (
                  <Image source={{ uri: member.user.image }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "white" }}>
                    {member.user?.name?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                )
              }
              title={member.user?.name ?? "Team member"}
              subtitle={member.role.replace("_", " ")}
              onPress={() => {
                if (!reassignTask) return;
                setConfirmReassign({
                  task: reassignTask,
                  newUserId: member.userId,
                  newUserName: member.user?.name ?? "this person",
                });
                setReassignTask(null);
              }}
              testID="reassign-member-row"
            />
          ))}
      </AlenioBottomSheet>

      {/* Reassign confirmation modal */}
      <AlenioBottomSheet
        visible={!!confirmReassign}
        title="Reassign task?"
        subtitle="Confirm the new assignee"
        onClose={() => setConfirmReassign(null)}
        testID="reassign-confirm-sheet"
        footer={
          <TouchableOpacity
            onPress={() => setConfirmReassign(null)}
            style={alenioSheetStyles.cancelButton}
            activeOpacity={0.8}
            testID="reassign-confirm-cancel"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        }
      >
        <AlenioSheetCard>
          <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20, textAlign: "center" }}>
            Move <Text style={{ fontWeight: "700", color: "#0F172A" }}>"{confirmReassign?.task.title}"</Text> to{" "}
            <Text style={{ fontWeight: "700", color: "#0F172A" }}>{confirmReassign?.newUserName}</Text>?
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (!confirmReassign) return;
              reassignMutation.mutate({ task: confirmReassign.task, newUserId: confirmReassign.newUserId });
              setConfirmReassign(null);
              setReassignTask(null);
            }}
            style={alenioSheetStyles.primaryButton}
            activeOpacity={0.92}
            testID="reassign-confirm-submit"
          >
            <Text style={alenioSheetStyles.primaryButtonText}>Reassign</Text>
          </TouchableOpacity>
        </AlenioSheetCard>
      </AlenioBottomSheet>

      {/* Add choice modal */}
      <AlenioBottomSheet
        visible={showAddModal}
        title="What would you like to add?"
        subtitle="Create something for this workspace"
        onClose={() => setShowAddModal(false)}
        compact
        testID="workspace-add-sheet"
        footer={
          <TouchableOpacity
            onPress={() => setShowAddModal(false)}
            style={alenioSheetStyles.cancelButton}
            activeOpacity={0.8}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        }
      >
        {isOwnerOrLeader ? (
          <AlenioSheetOption
            icon={<CalendarDays size={16} color="white" />}
            iconColor="#7C3AED"
            title="Team calendar event"
            subtitle="Add a public event for the whole team"
            onPress={() => {
              setShowAddModal(false);
              openEventModal();
            }}
          />
        ) : (
          <AlenioSheetOption
            icon={<CalendarDays size={16} color="white" />}
            iconColor="#64748B"
            title="Calendar event"
            subtitle="Add a private or public event"
            onPress={() => {
              setShowAddModal(false);
              openPersonalEventModal();
            }}
          />
        )}
        {isOwnerOrLeader ? (
          <AlenioSheetOption
            icon={<Video size={16} color="white" />}
            title="Virtual meeting"
            subtitle="Create a meeting with a video call link"
            onPress={() => {
              setShowAddModal(false);
              openMeetingModal();
            }}
          />
        ) : null}
        {!isRegularMember ? (
          <AlenioSheetOption
            icon={<CheckSquare size={16} color="white" />}
            title="Task"
            subtitle="Create a new task for the team"
            onPress={() => {
              setShowAddModal(false);
              router.push({
                pathname: "/create-task",
                params: { teamId: activeTeamId!, initialDueDate: selectedDay ?? toLocalIso(new Date()) },
              });
            }}
          />
        ) : null}
      </AlenioBottomSheet>

      {/* New / Edit Event Modal */}
      <Modal visible={showEventModal} transparent animationType="slide" onRequestClose={() => { setShowEventModal(false); setEditingEvent(null); setEventModalReadOnly(false); setConfirmDeleteEvent(false); setShowMeetingAssigneeDropdown(false); setShowDurationPicker(false); }}>
        <SafeKeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => { setShowEventModal(false); setEditingEvent(null); setEventModalReadOnly(false); setConfirmDeleteEvent(false); setShowMeetingAssigneeDropdown(false); setShowDurationPicker(false); }} />
          <Pressable
            style={{
              backgroundColor: "white",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: EVENT_MODAL_MAX_HEIGHT,
              overflow: "hidden",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 8, marginBottom: 16 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingHorizontal: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Image source={require("@/assets/alenio-icon.png")} style={{ width: 28, height: 28, borderRadius: 7 }} />
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>
                  {editingEvent
                    ? eventModalReadOnly
                      ? eventModalType === "meeting"
                        ? "Meeting details"
                        : "Event details"
                      : eventModalType === "meeting"
                        ? "Edit Virtual Meeting"
                        : "Edit Event"
                    : eventModalType === "meeting"
                      ? "New Virtual Meeting"
                      : "New Event"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {editingEvent && !eventModalReadOnly ? (
                  <Pressable
                    onPress={() => editingEvent && confirmAndDeleteEvent(editingEvent)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" }}
                    testID="delete-event-button"
                    accessibilityRole="button"
                    accessibilityLabel="Delete event"
                  >
                    <Trash2 size={15} color="#DC2626" strokeWidth={2.25} />
                  </Pressable>
                ) : null}
                <Pressable onPress={() => { setShowEventModal(false); setEditingEvent(null); setEventModalReadOnly(false); setConfirmDeleteEvent(false); setShowMeetingAssigneeDropdown(false); setShowDurationPicker(false); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
                  <X size={16} color="#64748B" />
                </Pressable>
              </View>
            </View>

            {confirmDeleteEvent ? (
              <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: "#FEF2F2", borderRadius: 14, padding: 16, gap: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#991B1B", textAlign: "center" }}>Delete this event?</Text>
                <Text style={{ fontSize: 13, color: "#EF4444", textAlign: "center" }}>This cannot be undone.</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => setConfirmDeleteEvent(false)}
                    style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#F1F5F9" }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B" }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => editingEvent && deleteEventMutation.mutate(editingEvent.id)}
                    disabled={deleteEventMutation.isPending}
                    style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#EF4444" }}
                    testID="confirm-delete-event-button"
                  >
                    {deleteEventMutation.isPending ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>Delete</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            <ScrollView
              style={{
                paddingHorizontal: 20,
                maxHeight: EVENT_MODAL_MAX_HEIGHT - (confirmDeleteEvent ? 220 : 88),
              }}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Title</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 14, backgroundColor: eventModalReadOnly ? "#F8FAFC" : "white" }}
                placeholder="Event title..."
                placeholderTextColor="#CBD5E1"
                value={eventTitle}
                onChangeText={(t) => { setEventTitle(t); setFormError(null); }}
                editable={!eventModalReadOnly}
                testID="event-title-input"
              />

              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Description (optional)</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#0F172A", marginBottom: 14, minHeight: 60, textAlignVertical: "top", backgroundColor: eventModalReadOnly ? "#F8FAFC" : "white" }}
                placeholder="Add a description..."
                placeholderTextColor="#CBD5E1"
                value={eventDescription}
                onChangeText={setEventDescription}
                multiline
                editable={!eventModalReadOnly}
              />

              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>
                    {eventModalType === "meeting" ? "Date" : "Start Date"}
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (eventModalReadOnly) return;
                      setShowEndPicker(false);
                      setShowStartPicker(true);
                    }}
                    style={{ borderWidth: 1.5, borderColor: eventModalReadOnly ? "#E2E8F0" : "#4361EE", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: eventModalReadOnly ? "#F8FAFC" : "#4361EE0D" }}
                  >
                    <Calendar size={13} color="#4361EE" />
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#4361EE", marginLeft: 6 }}>
                      {eventStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  </Pressable>
                </View>
                {eventModalType === "event" ? (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>End Date</Text>
                    <Pressable
                      onPress={() => {
                        if (eventModalReadOnly) return;
                        setShowStartPicker(false);
                        setShowEndPicker(true);
                      }}
                      style={{ borderWidth: 1.5, borderColor: eventModalReadOnly ? "#E2E8F0" : "#7C3AED", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: eventModalReadOnly ? "#F8FAFC" : "#7C3AED0D" }}
                    >
                      <Calendar size={13} color="#7C3AED" />
                      <Text style={{ fontSize: 12, fontWeight: "500", color: "#7C3AED", marginLeft: 6 }}>
                        {eventEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {showStartPicker ? (
                <View style={{ backgroundColor: "#F8FAFC", borderRadius: 16, marginBottom: 14, overflow: "hidden" }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                    <Pressable onPress={() => setShowStartPicker(false)}><Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text></Pressable>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>Start Date</Text>
                    <Pressable onPress={() => setShowStartPicker(false)}><Text style={{ color: "#4361EE", fontWeight: "600", fontSize: 15 }}>Done</Text></Pressable>
                  </View>
                  <DateTimePicker
                    value={eventStart}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "calendar"}
                    onChange={(e, d) => {
                      if (Platform.OS === "android") setShowStartPicker(false);
                      if (e.type === "dismissed") return;
                      if (d) {
                        setEventStart(d);
                        if (d > eventEnd) setEventEnd(d);
                      }
                    }}
                  />
                </View>
              ) : null}

              {showEndPicker && eventModalType === "event" ? (
                <View style={{ backgroundColor: "#F8FAFC", borderRadius: 16, marginBottom: 14, overflow: "hidden" }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                    <Pressable onPress={() => setShowEndPicker(false)}><Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text></Pressable>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>End Date</Text>
                    <Pressable onPress={() => setShowEndPicker(false)}><Text style={{ color: "#7C3AED", fontWeight: "600", fontSize: 15 }}>Done</Text></Pressable>
                  </View>
                  <DateTimePicker
                    value={eventEnd}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "calendar"}
                    minimumDate={eventStart}
                    onChange={(e, d) => {
                      if (Platform.OS === "android") setShowEndPicker(false);
                      if (e.type === "dismissed") return;
                      if (d) setEventEnd(d);
                    }}
                  />
                </View>
              ) : null}

              {/* Time pickers — only shown for virtual meetings */}
              {eventModalType === "meeting" ? (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Start Time</Text>
                      <Pressable
                        onPress={() => {
                          if (eventModalReadOnly) return;
                          setShowStartTimePicker(!showStartTimePicker);
                          setShowDurationPicker(false);
                        }}
                        style={{ borderWidth: 1.5, borderColor: "#4361EE", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: eventModalReadOnly ? "#F8FAFC" : showStartTimePicker ? "#4361EE22" : "#4361EE0D" }}
                      >
                        <Clock size={13} color="#4361EE" />
                        <Text style={{ fontSize: 12, fontWeight: "500", color: "#4361EE", marginLeft: 6 }}>
                          {eventStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Duration</Text>
                      <Pressable
                        onPress={() => {
                          if (eventModalReadOnly) return;
                          setShowStartTimePicker(false);
                          setShowDurationPicker(true);
                        }}
                        style={{ borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: eventModalReadOnly ? "#F8FAFC" : showDurationPicker ? "#7C3AED22" : "#7C3AED0D" }}
                      >
                        <Clock size={13} color="#7C3AED" />
                        <Text style={{ fontSize: 12, fontWeight: "500", color: "#7C3AED", marginLeft: 6 }}>
                          {formatVideoMeetingDuration(meetingDurationMinutes)}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>
                    Ends at {formatVideoMeetingEndPreview(eventStart, meetingDurationMinutes)}
                  </Text>
                  {showStartTimePicker ? (
                    <View style={{ backgroundColor: "#F8FAFC", borderRadius: 14, marginTop: 8, borderWidth: 1, borderColor: "#E2E8F0" }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B" }}>Start Time</Text>
                        <Pressable onPress={() => setShowStartTimePicker(false)}><Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>Done</Text></Pressable>
                      </View>
                      <DateTimePicker
                        value={eventStart}
                        mode="time"
                        display="spinner"
                        onChange={(e, d) => {
                          if (Platform.OS === "android") setShowStartTimePicker(false);
                          if (e.type === "dismissed") return;
                          if (d) {
                            setEventStart((prev) => {
                              const n = new Date(prev);
                              n.setHours(d.getHours(), d.getMinutes());
                              return n;
                            });
                          }
                        }}
                        style={{ height: 216 }}
                      />
                    </View>
                  ) : null}

                  {eventIsHidden ? (
                    <>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginTop: 12, marginBottom: 8 }}>
                        Assign Members (optional)
                      </Text>
                      <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8, lineHeight: 16 }}>
                        Choose who can see this private meeting. Select all to include everyone on the team. If none are
                        selected, only you will see it.
                      </Text>
                      <Pressable
                        onPress={() => {
                          setShowStartTimePicker(false);
                          setShowDurationPicker(false);
                          setShowMeetingAssigneeDropdown(true);
                        }}
                        style={{
                          borderWidth: 1.5,
                          borderColor: "#E2E8F0",
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 11,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: "#FFFFFF",
                        }}
                      >
                        <Text style={{ fontSize: 13, color: "#334155", fontWeight: "500", flex: 1 }} numberOfLines={1}>
                          {meetingAssigneeIds.length === 0
                            ? "Select attendees"
                            : allMeetingAssigneesSelected
                              ? "All team members"
                              : `${meetingAssigneeIds.length} attendee${meetingAssigneeIds.length === 1 ? "" : "s"} selected`}
                        </Text>
                        <ChevronDown size={16} color="#64748B" />
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : null}


              {formError ? <Text style={{ color: "#EF4444", fontSize: 13, marginBottom: 12 }}>{formError}</Text> : null}

              {/* Visibility toggle */}
              {eventModalType !== "meeting" ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F8FAFC", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20, borderWidth: 1.5, borderColor: !eventIsHidden ? "#4361EE" : "#E2E8F0" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Users size={18} color={!eventIsHidden ? "#4361EE" : "#CBD5E1"} />
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{!eventIsHidden ? "Public" : "Private"}</Text>
                    <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                      {!eventIsHidden ? "Visible to the whole team" : "Only visible to you"}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={!eventIsHidden}
                  disabled={eventModalReadOnly}
                  onValueChange={(v) => {
                    if (eventModalReadOnly) return;
                    const nextHidden = !v;
                    setEventIsHidden(nextHidden);
                    if (!nextHidden) {
                      setMeetingAssigneeIds([]);
                      setShowMeetingAssigneeDropdown(false);
                    }
                  }}
                  trackColor={{ false: "#E2E8F0", true: "#4361EE" }}
                  thumbColor="white"
                  testID="hidden-toggle"
                />
              </View>
              ) : null}
              {!eventModalReadOnly && !isOwnerOrLeader && eventModalType !== "meeting" && !eventIsHidden ? (
                <Text style={{ fontSize: 12, color: "#B45309", marginBottom: 16, marginTop: -12 }}>
                  Public events are sent to your team leader or owner for approval.
                </Text>
              ) : null}

              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 10 }}>Color</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
                {["#4361EE", "#7C3AED", "#EC4899", "#EF4444", "#F59E0B", "#10B981", "#06B6D4", "#64748B"].map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => {
                      if (eventModalReadOnly) return;
                      setEventColor(c);
                    }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, alignItems: "center", justifyContent: "center", borderWidth: eventColor === c ? 3 : 0, borderColor: "white", shadowColor: eventColor === c ? c : "transparent", shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: eventColor === c ? 4 : 0, opacity: eventModalReadOnly && eventColor !== c ? 0.45 : 1 }}
                  >
                    {eventColor === c ? <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>✓</Text> : null}
                  </Pressable>
                ))}
              </View>

              {eventModalReadOnly ? (
                <TouchableOpacity
                  onPress={() => {
                    setShowEventModal(false);
                    setEditingEvent(null);
                    setEventModalReadOnly(false);
                    setConfirmDeleteEvent(false);
                  }}
                  style={{ backgroundColor: "#F1F5F9", borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
                  testID="close-event-details-button"
                >
                  <Text style={{ color: "#334155", fontSize: 15, fontWeight: "700" }}>Close</Text>
                </TouchableOpacity>
              ) : (
              <TouchableOpacity
                onPress={handleSaveEvent}
                disabled={createEventMutation.isPending || updateEventMutation.isPending}
                style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
                testID="save-event-button"
              >
                {createEventMutation.isPending || updateEventMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>{editingEvent ? "Update Event" : "Save Event"}</Text>
                )}
              </TouchableOpacity>
              )}
            </ScrollView>
          </Pressable>

          {/* Attendee / duration pickers as overlays inside the event modal (nested Modals break taps on iOS). */}
          {showMeetingAssigneeDropdown ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: "flex-end",
                zIndex: 30,
              }}
            >
              <Pressable
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)" }}
                onPress={() => setShowMeetingAssigneeDropdown(false)}
              />
              <View
                style={{
                  backgroundColor: "white",
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  height: MEETING_ASSIGNEE_SHEET_MAX_HEIGHT,
                  paddingBottom: insets.bottom + 12,
                }}
              >
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 10, marginBottom: 14 }} />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 8 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>Assign members</Text>
                  <Pressable
                    onPress={() => setShowMeetingAssigneeDropdown(false)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
                  >
                    <X size={16} color="#64748B" />
                  </Pressable>
                </View>
                <Text style={{ fontSize: 12, color: "#94A3B8", paddingHorizontal: 20, marginBottom: 12, lineHeight: 18 }}>
                  Choose who can see this private meeting. Select all to include everyone on the team.
                </Text>
                <TouchableOpacity
                  onPress={toggleAllMeetingAssignees}
                  activeOpacity={0.7}
                  style={{
                    marginHorizontal: 20,
                    marginBottom: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: 12,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                  }}
                >
                  <Text style={{ fontSize: 13, color: "#4361EE", fontWeight: "700" }}>
                    {allMeetingAssigneesSelected ? "Deselect all" : "Select all"}
                  </Text>
                  {allMeetingAssigneesSelected ? <Check size={16} color="#4361EE" /> : null}
                </TouchableOpacity>
                <ScrollView
                  style={{ flex: 1, minHeight: 0 }}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  bounces
                >
                  {meetingAssigneeOptions.length === 0 ? (
                    <View style={{ paddingVertical: 24, alignItems: "center" }}>
                      <Text style={{ fontSize: 14, color: "#94A3B8", textAlign: "center" }}>No team members found.</Text>
                    </View>
                  ) : (
                    meetingAssigneeOptions.map((member, idx) => {
                      const selected = meetingAssigneeIds.includes(member.userId);
                      const label = member.user.name?.trim() || member.user.email || "Team member";
                      return (
                        <TouchableOpacity
                          key={member.userId}
                          activeOpacity={0.7}
                          onPress={() =>
                            setMeetingAssigneeIds((prev) =>
                              prev.includes(member.userId)
                                ? prev.filter((id) => id !== member.userId)
                                : [...prev, member.userId],
                            )
                          }
                          style={{
                            paddingVertical: 12,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderBottomWidth: idx === meetingAssigneeOptions.length - 1 ? 0 : 1,
                            borderBottomColor: "#F1F5F9",
                          }}
                        >
                          <Text style={{ fontSize: 15, color: "#334155", fontWeight: selected ? "700" : "500", flex: 1 }} numberOfLines={1}>
                            {label}
                          </Text>
                          {selected ? <Check size={16} color="#4361EE" /> : <View style={{ width: 16, height: 16 }} />}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
                <TouchableOpacity
                  onPress={() => setShowMeetingAssigneeDropdown(false)}
                  activeOpacity={0.85}
                  style={{
                    marginHorizontal: 20,
                    marginTop: 8,
                    backgroundColor: "#4361EE",
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {showDurationPicker ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: "flex-end",
                zIndex: 30,
              }}
            >
              <Pressable
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)" }}
                onPress={() => setShowDurationPicker(false)}
              />
              <View
                style={{
                  backgroundColor: "white",
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  maxHeight: MEETING_DURATION_SHEET_MAX_HEIGHT,
                  paddingBottom: insets.bottom + 12,
                }}
              >
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 10, marginBottom: 14 }} />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 8 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>Duration</Text>
                  <Pressable
                    onPress={() => setShowDurationPicker(false)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
                  >
                    <X size={16} color="#64748B" />
                  </Pressable>
                </View>
                <ScrollView
                  style={{ maxHeight: MEETING_DURATION_SHEET_MAX_HEIGHT - 120 }}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {VIDEO_MEETING_DURATION_OPTIONS.map((minutes, idx) => (
                    <TouchableOpacity
                      key={minutes}
                      activeOpacity={0.7}
                      onPress={() => {
                        setMeetingDurationMinutes(minutes);
                        setShowDurationPicker(false);
                      }}
                      style={{
                        paddingVertical: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottomWidth: idx === VIDEO_MEETING_DURATION_OPTIONS.length - 1 ? 0 : 1,
                        borderBottomColor: "#F1F5F9",
                        backgroundColor: meetingDurationMinutes === minutes ? "#EEF2FF" : "transparent",
                        borderRadius: meetingDurationMinutes === minutes ? 10 : 0,
                        paddingHorizontal: meetingDurationMinutes === minutes ? 12 : 0,
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: meetingDurationMinutes === minutes ? "700" : "500", color: meetingDurationMinutes === minutes ? "#4361EE" : "#0F172A" }}>
                        {formatVideoMeetingDuration(minutes)}
                      </Text>
                      {meetingDurationMinutes === minutes ? <Check size={16} color="#4361EE" /> : null}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          ) : null}
        </SafeKeyboardAvoidingView>
      </Modal>

      {/* Milestone Celebration Modal */}
      <Modal visible={!!milestoneModal} transparent animationType="fade" onRequestClose={() => setMilestoneModal(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => setMilestoneModal(null)}
          testID="milestone-modal-backdrop"
        >
          <Pressable onPress={(e) => e.stopPropagation()} testID="milestone-modal">
            <LinearGradient
              colors={["#F59E0B", "#EF4444"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 28, padding: 3 }}
            >
              <View style={{ backgroundColor: "#FCD34D", borderRadius: 26, padding: 28, alignItems: "center", gap: 12 }}>
                {/* Logo + Trophy */}
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Image source={require("@/assets/alenio-icon.png")} style={{ width: 40, height: 40, borderRadius: 10, marginBottom: 4 }} />
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 36 }}>🏆</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 13, fontWeight: "700", color: "#D97706", letterSpacing: 1.5, textTransform: "uppercase" }}>Milestone Reached!</Text>

                <Text style={{ fontSize: 44, fontWeight: "800", color: "#F59E0B", lineHeight: 48 }}>
                  {milestoneModal?.count}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#92400E", textAlign: "center", lineHeight: 22 }}>
                  {milestoneModal?.userName} completed{"\n"}{milestoneModal?.count} tasks on time!
                </Text>

                <Text style={{ fontSize: 13, color: "#B45309", textAlign: "center" }}>
                  Keep up the incredible streak 🔥
                </Text>

                <Pressable
                  onPress={() => setMilestoneModal(null)}
                  style={{ marginTop: 8, backgroundColor: "#F59E0B", paddingHorizontal: 40, paddingVertical: 14, borderRadius: 24 }}
                  testID="milestone-modal-close"
                >
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Let's go! 🎉</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Comeback Celebration Modal */}
      <Modal visible={!!personalBestModal} transparent animationType="fade" onRequestClose={() => setPersonalBestModal(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }}
          onPress={() => setPersonalBestModal(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={["#F97316", "#EF4444"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 28, padding: 3 }}
            >
              <View style={{ backgroundColor: "#FCD34D", borderRadius: 26, padding: 28, alignItems: "center", gap: 14 }}>
                <Image source={require("@/assets/alenio-icon.png")} style={{ width: 36, height: 36, borderRadius: 9 }} />
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 56 }}>🔥</Text>
                  <View style={{ backgroundColor: "#F97316", paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20 }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "white", letterSpacing: 2, textTransform: "uppercase" }}>Comeback</Text>
                  </View>
                </View>
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 64, fontWeight: "900", color: "#F59E0B", lineHeight: 68 }}>
                    {personalBestModal?.count}
                  </Text>
                  <Text style={{ fontSize: 14, color: "#D97706", fontWeight: "600" }}>tasks in a row</Text>
                </View>
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#92400E", textAlign: "center" }}>
                    You're back! 💪
                  </Text>
                  <Text style={{ fontSize: 13, color: "#B45309", textAlign: "center", lineHeight: 20 }}>
                    {personalBestModal?.userName} just matched their{"\n"}personal best streak after a setback.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setPersonalBestModal(null)}
                  style={{ marginTop: 4, backgroundColor: "#F59E0B", paddingHorizontal: 40, paddingVertical: 14, borderRadius: 24, width: "100%" }}
                >
                  <Text style={{ color: "white", fontWeight: "800", fontSize: 16, textAlign: "center" }}>Keep the streak alive 🔥</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}
