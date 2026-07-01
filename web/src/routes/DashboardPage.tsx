import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { queryKeys } from "../lib/query-keys";
import {
  getDashboardSnapshot,
  markDashboardTaskDone,
  reconcileDashboardTasks,
  removeDashboardTask,
  upsertDashboardTask,
  upsertDashboardTasks,
} from "../lib/dashboard-task-cache";
import {
  computeWeekBars,
  getDaysInMonth,
  CALENDAR_WEEKDAY_LABELS,
  isCurrentMonth,
  isSameDay,
  startOfDay,
  eventCalendarDayRange,
  calendarDayToUtcNoonIso,
  formatCalendarEventRangeLabel,
  formatCalendarEventTimeLabel,
  calendarEventSpanContext,
} from "../lib/calendar-mobile-parity";
import { getUSHolidays } from "../lib/us-federal-holidays";
import { canShowVideoJoin } from "../lib/video-meeting-join";
import {
  VIDEO_MEETING_DURATION_OPTIONS,
  durationMinutesFromRange,
  formatVideoMeetingDuration,
  formatVideoMeetingEndPreview,
  videoMeetingEndFromDuration,
} from "../lib/video-meeting-duration";
import {
  createWebTeamEvent,
  createVideoRoom,
  deleteWebTask,
  deleteWebTeamEvent,
  fetchCoreTeamTasks,
  fetchOneOnOneAssociateFeedbackContext,
  fetchWebTeam,
  fetchWebTeamEvents,
  fetchPendingCalendarEvents,
  fetchWebTeamTasks,
  updateWebTeamEvent,
  updateCoreTeamTask,
  type ApiCalendarEvent,
  type ApiTask,
  type OneOnOneAssociateFeedbackContext,
  type WebTeamDetail,
  type WebMeUser,
  type WebTeamRow,
} from "../lib/api";
import { fetchExternalCalendarEvents } from "../lib/outlook-calendar-api";
import {
  formatTaskDescriptionForDisplay,
  isAssociateFeedbackRecipient,
  isFeedbackTaskDescription,
  resolveFeedbackTaskMeta,
} from "../lib/one-on-one-feedback";
import { RecurringTaskScopeModal } from "../components/RecurringTaskScopeModal";
import { PendingCalendarEventsModal } from "../components/PendingCalendarEventsModal";
import { TaskPromptModal } from "../components/tasks/TaskPromptModal";
import { WorkspaceTaskCreateModal } from "../components/tasks/WorkspaceTaskCreateModal";
import { WorkspaceTaskDetailModal } from "../components/tasks/WorkspaceTaskDetailModal";
import { WorkspaceTaskFollowUpPanel } from "../components/tasks/WorkspaceTaskFollowUpPanel";
import { WorkspaceTaskListViewTabs } from "../components/tasks/WorkspaceTaskListViewTabs";
import { WorkspaceTaskViewMenu, type TaskListView, type TaskPriorityFilter, type TaskStatusFilter } from "../components/tasks/WorkspaceTaskViewMenu";
import { WorkspaceTaskRow } from "../components/tasks/WorkspaceTaskRow";
import { computeTaskFollowUpStats } from "../lib/task-follow-up-stats";
import { isRecurringTask, type RecurrenceScope } from "../lib/recurring-task";
import {
  dotClassForDayTasks,
  isTaskOverdue,
  priorityRank,
} from "../lib/task-display";

function canDeleteTask(task: ApiTask, meId: string | undefined, role: string): boolean {
  if (!meId) return false;
  const creatorId = task.creatorId ?? task.creator?.id;
  if (creatorId === meId) return true;
  return role === "owner" || role === "admin";
}

function taskCreatorId(task: ApiTask): string | undefined {
  return task.creatorId ?? task.creator?.id;
}

/** Workspace task list: assigned to me, or created by me with no assignee. */
function isMyWorkspaceTask(task: ApiTask, userId: string): boolean {
  if (task.assignments.some((a) => a.user.id === userId)) return true;
  return taskCreatorId(task) === userId && task.assignments.length === 0;
}

/** Team tab: tasks I created that are assigned to someone else. */
function isDelegatedTeamTask(task: ApiTask, userId: string): boolean {
  if (task.assignments.length === 0) return false;
  if (taskCreatorId(task) !== userId) return false;
  return task.assignments.some((a) => a.user.id !== userId);
}

type TaskScope = "mine" | "team";

const EXTERNAL_BUSY_COLOR = "#475569";
const OUTLOOK_ACCENT_COLOR = "#0078D4";

function OutlookGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="enterprise-cal-outlook-glyph">
      <rect x="3" y="5" width="18" height="16" rx="2" fill="currentColor" opacity="0.15" />
      <rect x="3" y="5" width="18" height="5" rx="2" fill="currentColor" />
      <rect x="6" y="13" width="4" height="3" rx="0.5" fill="currentColor" />
      <rect x="11" y="13" width="7" height="3" rx="0.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const overdueFocus = searchParams.get("overdue") === "1";
  const { me, teams, selectedTeamId, setSelectedTeamId } = useEnterpriseShell();
  const [calendarView, setCalendarView] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date());
  const [taskScope, setTaskScope] = useState<TaskScope>("mine");
  const [taskListView, setTaskListView] = useState<TaskListView>("active");
  const [taskViewMenuOpen, setTaskViewMenuOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [sortBy, setSortBy] = useState<"due" | "priority" | "completed">("due");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [selectedTaskModal, setSelectedTaskModal] = useState<ApiTask | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitialDueDate, setCreateInitialDueDate] = useState<string | undefined>();
  const [teamDetail, setTeamDetail] = useState<WebTeamDetail | null>(null);
  const [completePromptTask, setCompletePromptTask] = useState<ApiTask | null>(null);
  const [completeBusyId, setCompleteBusyId] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evDescription, setEvDescription] = useState("");
  const [evAllDay, setEvAllDay] = useState(true);
  const [evStart, setEvStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [evEnd, setEvEnd] = useState("");
  const [evColor, setEvColor] = useState("#4361EE");
  const [evSaving, setEvSaving] = useState(false);
  const [evError, setEvError] = useState<string | null>(null);
  const [evDeleteId, setEvDeleteId] = useState<string | null>(null);
  const [evApprovalId, setEvApprovalId] = useState<string | null>(null);
  const [evActionError, setEvActionError] = useState<string | null>(null);
  const [evEditId, setEvEditId] = useState<string | null>(null);
  const [evMenuId, setEvMenuId] = useState<string | null>(null);
  const [eventAddChoiceOpen, setEventAddChoiceOpen] = useState(false);
  const [pendingCalendarOpen, setPendingCalendarOpen] = useState(false);
  const [newEventIsVideoMeeting, setNewEventIsVideoMeeting] = useState(false);
  const [evIsHidden, setEvIsHidden] = useState(false);
  const [evMeetingDurationMinutes, setEvMeetingDurationMinutes] = useState(60);
  const [meetingNow, setMeetingNow] = useState(() => Date.now());
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null);
  const [taskDeleteId, setTaskDeleteId] = useState<string | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [recurringScopeModal, setRecurringScopeModal] = useState<ApiTask | null>(null);
  const [feedbackContext, setFeedbackContext] = useState<OneOnOneAssociateFeedbackContext | null>(null);
  const [feedbackContextLoading, setFeedbackContextLoading] = useState(false);
  const [feedbackContextSubmitted, setFeedbackContextSubmitted] = useState(false);
  const [feedbackContextError, setFeedbackContextError] = useState<string | null>(null);
  const [feedbackFetchVersion, setFeedbackFetchVersion] = useState(0);
  const [feedbackCompletionActive, setFeedbackCompletionActive] = useState(false);
  const feedbackCompletionActiveRef = useRef(false);
  feedbackCompletionActiveRef.current = feedbackCompletionActive;

  const now = new Date();
  const selectedTaskFeedbackMeta = selectedTaskModal
    ? resolveFeedbackTaskMeta(selectedTaskModal, selectedTeamId)
    : null;
  const isSelectedTaskFeedbackAssignee = isAssociateFeedbackRecipient(me?.id, selectedTaskFeedbackMeta);
  const isSelectedTaskFeedback = isFeedbackTaskDescription(selectedTaskModal?.description);
  const showFeedbackFormLoading =
    isSelectedTaskFeedback &&
    isSelectedTaskFeedbackAssignee &&
    selectedTaskModal?.status !== "done" &&
    !feedbackCompletionActive &&
    feedbackContextLoading &&
    !feedbackContext;

  useEffect(() => {
    const id = location.hash.replace(/^#/, "");
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash]);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(selectedTeamId),
    queryFn: async () => {
      const [webTasks, coreTasks, evs] = await Promise.all([
        fetchWebTeamTasks(selectedTeamId),
        fetchCoreTeamTasks(selectedTeamId).catch(() => []),
        fetchWebTeamEvents(selectedTeamId),
      ]);
      return {
        tasks: mergeTaskLists(webTasks, coreTasks),
        events: evs,
      };
    },
    enabled: !!selectedTeamId,
    staleTime: 0,
    refetchOnMount: false,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const tasks = dashboardQuery.data?.tasks ?? [];
  const events = dashboardQuery.data?.events ?? [];
  const tasksErr =
    dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : dashboardQuery.isError
        ? "Could not load tasks."
        : null;

  const refreshTeamData = (teamId: string) => {
    reconcileDashboardTasks(queryClient, teamId);
  };

  useEffect(() => {
    if (!evMenuId) return;
    const closeMenu = () => setEvMenuId(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [evMenuId]);

  useEffect(() => {
    if (!selectedTeamId) {
      setTeamDetail(null);
      return;
    }
    let cancelled = false;
    void fetchWebTeam(selectedTeamId)
      .then((detail) => {
        if (!cancelled) setTeamDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setTeamDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  useEffect(() => {
    const id = window.setInterval(() => setMeetingNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setSelectedDate(new Date());
    setAssigneeFilter("all");
    setTaskScope("mine");
    setTaskListView("active");
    setPriorityFilter("all");
    setStatusFilter("all");
  }, [selectedTeamId]);

  useEffect(() => {
    if (!taskMenuId) return;
    const close = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest(".enterprise-task-row-actions")) return;
      setTaskMenuId(null);
    };
    const timer = window.setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", close);
    };
  }, [taskMenuId]);

  const selectedTeam = teams?.find((t) => t.id === selectedTeamId);

  const openTaskDetail = (taskId: string) => {
    const t = tasks.find((item) => item.id === taskId) ?? null;
    if (!t) return;
    setSelectedTaskModal(t);
    setFeedbackContext(null);
    setFeedbackContextLoading(false);
    setFeedbackContextSubmitted(false);
    setFeedbackContextError(null);
    setFeedbackCompletionActive(false);
  };

  const openCreateTask = (dueDate?: string) => {
    setCreateInitialDueDate(dueDate);
    setCreateOpen(true);
  };

  const requestCompleteTask = (task: ApiTask) => {
    if (task.status === "done") return;
    setCompletePromptTask(task);
  };

  const performCompleteTask = async (task: ApiTask) => {
    if (!selectedTeamId) return;
    setCompleteBusyId(task.id);
    setTaskActionError(null);
    const snapshot = getDashboardSnapshot(queryClient, selectedTeamId);
    markDashboardTaskDone(queryClient, selectedTeamId, task.id);
    try {
      const updated = await updateCoreTeamTask(selectedTeamId, task.id, { status: "done" });
      upsertDashboardTask(queryClient, selectedTeamId, updated);
      if (selectedTaskModal?.id === task.id) setSelectedTaskModal(null);
    } catch (err) {
      if (snapshot) queryClient.setQueryData(queryKeys.dashboard(selectedTeamId), snapshot);
      setTaskActionError(err instanceof Error ? err.message : "Could not complete task.");
    } finally {
      setCompleteBusyId(null);
      setCompletePromptTask(null);
      refreshTeamData(selectedTeamId);
    }
  };

  useEffect(() => {
    if (feedbackCompletionActive) return;

    if (!selectedTaskFeedbackMeta || !isSelectedTaskFeedbackAssignee) {
      setFeedbackContext(null);
      setFeedbackContextLoading(false);
      setFeedbackContextSubmitted(false);
      setFeedbackContextError(null);
      return;
    }
    if (selectedTaskModal?.status === "done" && !feedbackCompletionActive) {
      setFeedbackContext(null);
      setFeedbackContextLoading(false);
      setFeedbackContextSubmitted(false);
      setFeedbackContextError(null);
      return;
    }
    let cancelled = false;
    setFeedbackContextLoading(true);
    setFeedbackContextSubmitted(false);
    setFeedbackContextError(null);
    (async () => {
      try {
        const context = await fetchOneOnOneAssociateFeedbackContext(
          selectedTaskFeedbackMeta.teamId,
          selectedTaskFeedbackMeta.memberUserId,
          selectedTaskFeedbackMeta.meetingId,
          selectedTaskFeedbackMeta.fieldId,
        );
        if (cancelled || feedbackCompletionActiveRef.current) return;
        if (context.submitted) {
          setFeedbackContext(null);
          setFeedbackContextSubmitted(true);
        } else {
          setFeedbackContext(context);
        }
      } catch (e) {
        if (cancelled) return;
        setFeedbackContext(null);
        setFeedbackContextError(e instanceof Error ? e.message : "Could not load your check-in.");
      } finally {
        if (!cancelled) setFeedbackContextLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedTaskFeedbackMeta?.teamId,
    selectedTaskFeedbackMeta?.memberUserId,
    selectedTaskFeedbackMeta?.meetingId,
    selectedTaskFeedbackMeta?.fieldId,
    isSelectedTaskFeedbackAssignee,
    selectedTaskModal?.status,
    feedbackCompletionActive,
    feedbackFetchVersion,
  ]);

  const myRole = selectedTeam?.role ?? "";
  const isOwnerOrLeader = myRole === "owner" || myRole === "team_leader";
  const isOwnerOrAdmin = myRole === "owner" || myRole === "admin";
  const isRegularMember = myRole === "member" || !myRole;
  const canViewTeamTab = !isRegularMember;

  const pendingCalendarQuery = useQuery({
    queryKey: queryKeys.pendingCalendarEvents(selectedTeamId ?? ""),
    queryFn: () => fetchPendingCalendarEvents(selectedTeamId!),
    enabled: !!selectedTeamId && isOwnerOrLeader,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const pendingCalendarEvents = pendingCalendarQuery.data ?? [];

  const refreshCalendarApprovals = async (teamId: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.pendingCalendarEvents(teamId) });
    await refreshTeamData(teamId);
  };

  useEffect(() => {
    if (taskScope === "team" && !canViewTeamTab) setTaskScope("mine");
  }, [taskScope, canViewTeamTab]);

  const handleDeleteTask = async (task: ApiTask, scope: RecurrenceScope = "task") => {
    if (!selectedTeamId || !canDeleteTask(task, me?.id, myRole)) return;
    setTaskDeleteId(task.id);
    setTaskActionError(null);
    setTaskMenuId(null);
    const snapshot = getDashboardSnapshot(queryClient, selectedTeamId);
    removeDashboardTask(queryClient, selectedTeamId, task.id);
    try {
      await deleteWebTask(task.id, selectedTeamId, scope);
      if (selectedTaskModal?.id === task.id) {
        setSelectedTaskModal(null);
      }
    } catch (err) {
      if (snapshot) queryClient.setQueryData(queryKeys.dashboard(selectedTeamId), snapshot);
      setTaskActionError(err instanceof Error ? err.message : "Could not delete task.");
    } finally {
      setTaskDeleteId(null);
      setRecurringScopeModal(null);
      refreshTeamData(selectedTeamId);
    }
  };

  const requestDeleteTask = (task: ApiTask) => {
    if (!selectedTeamId || !canDeleteTask(task, me?.id, myRole)) return;
    setTaskMenuId(null);
    if (isRecurringTask(task)) {
      setRecurringScopeModal(task);
      return;
    }
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    void handleDeleteTask(task, "task");
  };

  const visibleEvents = useMemo(() => {
    const uid = me?.id ?? null;
    return events.filter((e) => {
      if (!e.isHidden) return true;
      if (uid && e.createdById === uid) return true;
      return false;
    });
  }, [events, me?.id]);

  const calendarRange = useMemo(() => {
    const days = getDaysInMonth(calendarView);
    const startDay = days[0];
    const endDay = days[days.length - 1];
    if (!startDay || !endDay) return { start: "", end: "" };
    return {
      start: startOfDay(startDay).toISOString(),
      end: new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 999).toISOString(),
    };
  }, [calendarView]);

  const externalEventsQuery = useQuery({
    queryKey: queryKeys.externalCalendarEvents(calendarRange.start, calendarRange.end),
    queryFn: () => fetchExternalCalendarEvents(calendarRange.start, calendarRange.end),
    enabled: !!me?.id && !!calendarRange.start,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const externalBusyEvents = externalEventsQuery.data ?? [];

  const calendarBarEvents = useMemo(
    () => [
      ...visibleEvents.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        allDay: e.allDay,
        color: e.color,
        isHidden: e.isHidden,
        isVideoMeeting: e.isVideoMeeting,
      })),
      ...externalBusyEvents.map((event) => ({
        id: `ext-${event.id}`,
        title: event.title?.trim() || "Untitled event",
        startDate: event.startDate,
        endDate: event.endDate,
        allDay: event.allDay,
        isExternal: true,
        color: EXTERNAL_BUSY_COLOR,
      })),
    ],
    [visibleEvents, externalBusyEvents],
  );

  const getExternalForDay = (day: Date) =>
    externalBusyEvents.filter((e) => {
      const { start, end } = eventCalendarDayRange(e);
      const d = startOfDay(day);
      return d >= start && d <= end;
    });

  const myTasks = useMemo(() => {
    if (!me?.id) return [];
    return tasks.filter((t) => isMyWorkspaceTask(t, me.id));
  }, [tasks, me?.id]);

  const getEventsForDay = (day: Date) =>
    visibleEvents.filter((e) => {
      const { start, end } = eventCalendarDayRange(e);
      const d = startOfDay(day);
      return d >= start && d <= end;
    });

  const getTasksForDay = (day: Date): ApiTask[] =>
    myTasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), day));

  const calDays = useMemo(() => getDaysInMonth(calendarView), [calendarView]);
  const calWeeks = useMemo(() => {
    const w: Date[][] = [];
    for (let i = 0; i < calDays.length; i += 7) {
      w.push(calDays.slice(i, i + 7));
    }
    return w;
  }, [calDays]);

  const holidayYears = useMemo(() => {
    const ys = new Set<number>();
    for (const d of calDays) ys.add(d.getFullYear());
    return ys;
  }, [calDays]);

  const holidays = useMemo(
    () => [...holidayYears].sort((a, b) => a - b).flatMap((y) => getUSHolidays(y)),
    [holidayYears],
  );

  const selectedHolidays = useMemo(() => {
    if (!selectedDate) return [];
    return holidays.filter((h) => isSameDay(h.date, selectedDate));
  }, [holidays, selectedDate]);

  const selectedEvents = selectedDate ? getEventsForDay(selectedDate) : [];
  const selectedExternalEvents = selectedDate ? getExternalForDay(selectedDate) : [];
  const selectedTasks = selectedDate ? getTasksForDay(selectedDate) : [];

  const activeTasks = useMemo(() => myTasks.filter((t) => t.status !== "done"), [myTasks]);
  const completedTasks = useMemo(() => myTasks.filter((t) => t.status === "done"), [myTasks]);

  const activeDelegatedTasks = useMemo(() => {
    if (!me?.id) return [];
    return tasks.filter((t) => isDelegatedTeamTask(t, me.id) && t.status !== "done");
  }, [tasks, me?.id]);

  const completedDelegatedTasks = useMemo(() => {
    if (!me?.id) return [];
    return tasks.filter((t) => isDelegatedTeamTask(t, me.id) && t.status === "done");
  }, [tasks, me?.id]);

  const tabTasks = useMemo(() => {
    if (taskListView === "archived") return [];
    if (taskListView === "completed") {
      return taskScope === "team" ? completedDelegatedTasks : completedTasks;
    }
    return taskScope === "team" ? activeDelegatedTasks : activeTasks;
  }, [
    taskListView,
    taskScope,
    activeTasks,
    completedTasks,
    activeDelegatedTasks,
    completedDelegatedTasks,
  ]);

  const memberNameByUserId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const member of teamDetail?.members ?? []) {
      const label = member.user.name?.trim() || member.user.email?.trim();
      if (label) map[member.userId] = label;
    }
    return map;
  }, [teamDetail?.members]);

  const filteredTabTasks = useMemo(() => {
    let list = tabTasks;
    if (assigneeFilter !== "all") {
      list = list.filter((t) => t.assignments.some((a) => a.user.id === assigneeFilter));
    }
    if (priorityFilter !== "all") {
      list = list.filter((t) => t.priority === priorityFilter);
    }
    if (taskListView === "active" && statusFilter !== "all") {
      list =
        statusFilter === "overdue"
          ? list.filter((t) => isTaskOverdue(t, now))
          : list.filter((t) => !isTaskOverdue(t, now));
    }
    return list;
  }, [tabTasks, assigneeFilter, priorityFilter, statusFilter, taskListView, now]);

  const scopeTasksForStats = useMemo(() => {
    const base =
      taskScope === "team"
        ? tasks.filter((t) => me?.id && isDelegatedTeamTask(t, me.id))
        : myTasks;
    if (taskScope !== "team" || assigneeFilter === "all") return base;
    return base.filter((t) => t.assignments.some((a) => a.user.id === assigneeFilter));
  }, [taskScope, myTasks, tasks, me?.id, assigneeFilter]);

  const followUpStats = useMemo(
    () => computeTaskFollowUpStats(scopeTasksForStats, now),
    [scopeTasksForStats, now],
  );

  const tasksForTable = useMemo(() => {
    if (!overdueFocus) return filteredTabTasks;
    return tasks.filter((t) => t.status !== "done" && isTaskOverdue(t, now));
  }, [overdueFocus, filteredTabTasks, tasks, now]);

  const tableRows = useMemo(() => {
    const list = [...tasksForTable];
    if (sortBy === "due") {
      list.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    } else if (sortBy === "completed") {
      list.sort((a, b) => {
        const aDone = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bDone = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bDone - aDone;
      });
    } else {
      list.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
    }
    return list;
  }, [tasksForTable, sortBy]);

  const assigneeMenuOptions = useMemo(
    () =>
      (teamDetail?.members ?? []).map((m) => ({
        userId: m.userId,
        label: m.user.name ?? m.user.email ?? m.userId,
      })),
    [teamDetail?.members],
  );

  const openTaskCount = taskScope === "team" ? activeDelegatedTasks.length : activeTasks.length;
  const completedTaskCount = taskScope === "team" ? completedDelegatedTasks.length : completedTasks.length;

  const clearOverdueFocus = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("overdue");
    setSearchParams(next, { replace: true });
  };

  const handleTaskListViewChange = (view: TaskListView) => {
    setTaskListView(view);
    setSortBy(view === "completed" ? "completed" : "due");
    if (overdueFocus) clearOverdueFocus();
  };

  const calTitle = calendarView.toLocaleString(undefined, { month: "long", year: "numeric" });
  const weekdayLabels = CALENDAR_WEEKDAY_LABELS;
  const toDateInput = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  };
  const toDatetimeLocalInput = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const beginNewEvent = (defaultHidden: boolean) => {
    setEvEditId(null);
    setEvError(null);
    setEvTitle("");
    setEvDescription("");
    setEvColor("#4361EE");
    setNewEventIsVideoMeeting(false);
    setEvMeetingDurationMinutes(60);
    setEvIsHidden(defaultHidden);
    setEvAllDay(true);
    setEvStart(new Date().toISOString().slice(0, 10));
    setEvEnd("");
    setEventAddChoiceOpen(false);
    setEventOpen(true);
  };

  const beginNewCalendarEvent = () => beginNewEvent(false);

  const beginNewPersonalEvent = () => beginNewEvent(true);

  const beginNewVirtualMeeting = () => {
    setEvEditId(null);
    setEvError(null);
    setEvTitle("");
    setEvDescription("");
    setEvColor("#4361EE");
    setNewEventIsVideoMeeting(true);
    setEvMeetingDurationMinutes(60);
    setEvIsHidden(false);
    setEvAllDay(false);
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    setEvStart(toDatetimeLocalInput(start.toISOString()));
    setEvEnd("");
    setEventAddChoiceOpen(false);
    setEventOpen(true);
  };

  const openVideoCall = async (roomId: string, title: string) => {
    setVideoLoading(true);
    try {
      const room = await createVideoRoom(roomId, me?.name ?? me?.email ?? "Guest");
      const call = room.token ? `${room.url}?t=${encodeURIComponent(room.token)}&prejoin=false` : `${room.url}?prejoin=false`;
      setVideoTitle(title);
      setVideoUrl(call);
    } catch (err) {
      setEvActionError(err instanceof Error ? err.message : "Could not start video call.");
    } finally {
      setVideoLoading(false);
    }
  };

  if (me === undefined) {
    return (
      <div className="enterprise-tab-shell">
        <p className="enterprise-muted" data-testid="dashboard-loading">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="enterprise-tab-shell enterprise-dashboard-shell enterprise-dashboard-pro" data-testid="dashboard-screen">
        {tasksErr ? (
          <p className="enterprise-banner-warn" role="status">
            {tasksErr}
          </p>
        ) : null}
        {evActionError ? (
          <p className="enterprise-banner-warn" role="status">
            {evActionError}
          </p>
        ) : null}

        <div className="enterprise-dashboard-top">
          <section
            className={`enterprise-card enterprise-card-cal${evMenuId ? " enterprise-card-cal--menu-open" : ""}`}
            aria-labelledby="cal-heading"
          >
            <div className="enterprise-card-head enterprise-cal-card-head">
              <h2 id="cal-heading" className="enterprise-card-title">
                Calendar
              </h2>
              <div className="enterprise-cal-nav">
                <button
                  type="button"
                  className="enterprise-cal-nav-btn"
                  aria-label="Previous month"
                  onClick={() => setCalendarView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
                >
                  ‹
                </button>
                <span className="enterprise-cal-month">{calTitle}</span>
                <button
                  type="button"
                  className="enterprise-cal-nav-btn"
                  aria-label="Next month"
                  onClick={() => setCalendarView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
                >
                  ›
                </button>
              </div>
              <div className="enterprise-cal-head-actions">
                {isOwnerOrLeader && pendingCalendarEvents.length > 0 ? (
                  <button
                    type="button"
                    className="enterprise-team-pending-chip"
                    onClick={() => setPendingCalendarOpen(true)}
                    aria-label={`${pendingCalendarEvents.length} pending calendar request${pendingCalendarEvents.length !== 1 ? "s" : ""}`}
                  >
                    {pendingCalendarEvents.length} pending
                  </button>
                ) : null}
                {selectedTeamId ? (
                  <button
                    type="button"
                    className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                    onClick={() => {
                      if (!selectedTeamId) return;
                      if (isOwnerOrLeader) setEventAddChoiceOpen(true);
                      else beginNewPersonalEvent();
                    }}
                  >
                    + Add event
                  </button>
                ) : null}
              </div>
            </div>
            <div className={`enterprise-cal-mobile-wrap${evMenuId ? " enterprise-cal-mobile-wrap--menu-open" : ""}`}>
              <div className="enterprise-cal-weekdays enterprise-cal-weekdays-mobile">
                {weekdayLabels.map((w) => (
                  <div key={w} className="enterprise-cal-weekday">
                    {w}
                  </div>
                ))}
              </div>
              <div className="enterprise-cal-weeks">
                {calWeeks.map((week, weekIndex) => {
                  const tracks = computeWeekBars(week, calendarBarEvents);
                  return (
                    <div key={weekIndex} className="enterprise-cal-week">
                      <div className="enterprise-cal-day-row">
                        {week.map((day, dayIndex) => {
                          const inMonth = isCurrentMonth(day, calendarView);
                          const isToday = isSameDay(day, now);
                          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                          const hasTask = inMonth && getTasksForDay(day).length > 0;
                          const isHoliday = holidays.some((h) => isSameDay(h.date, day));
                          return (
                            <button
                              key={dayIndex}
                              type="button"
                              className={`enterprise-cal-day-cell ${inMonth ? "enterprise-cal-day-in" : "enterprise-cal-day-out"} ${isToday ? "enterprise-cal-day-today-wrap" : ""} ${isSelected && !isToday ? "enterprise-cal-day-selected" : ""}`}
                              onClick={() => setSelectedDate(day)}
                              data-testid={`calendar-day-${day.getDate()}`}
                            >
                              <span
                                className={`enterprise-cal-daynum-circle ${isToday ? "enterprise-cal-daynum-today" : ""} ${isSelected && !isToday ? "enterprise-cal-daynum-selected" : ""}`}
                              >
                                <span className="enterprise-cal-daynum">{day.getDate()}</span>
                              </span>
                              {(hasTask && !isToday) || isHoliday ? (
                                <span className="enterprise-cal-day-dots" aria-hidden>
                                  {hasTask && !isToday ? <span className="enterprise-cal-task-dot" title="Your tasks due this day" /> : null}
                                  {isHoliday ? <span className="enterprise-cal-holiday-dot" title="US federal holiday" /> : null}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      {tracks.map((track, trackIndex) => (
                        <div key={trackIndex} className="enterprise-cal-track-row">
                          {track.map((bar) => {
                            const showTitle = !bar.continuesBefore;
                            return (
                              <button
                                key={bar.id}
                                type="button"
                                className={[
                                  "enterprise-cal-bar",
                                  bar.isExternal ? "enterprise-cal-bar-outlook" : "enterprise-cal-bar-team",
                                  bar.continuesBefore ? "enterprise-cal-bar-continues-before" : "",
                                  bar.continuesAfter ? "enterprise-cal-bar-continues-after" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                style={{
                                  left: `calc(${bar.startCol} * (100% / 7) + 2px)`,
                                  width: `calc(${bar.endCol - bar.startCol + 1} * (100% / 7) - 4px)`,
                                  ...(bar.isExternal ? {} : { backgroundColor: bar.color }),
                                }}
                                title={bar.title}
                                aria-label={bar.title}
                              >
                                {showTitle ? (
                                  <span className="enterprise-cal-bar-title-inner">
                                    {bar.isVideoMeeting ? (
                                      <svg className="enterprise-cal-bar-video" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                                        <polygon points="23 7 16 12 23 17 23 7" fill="white" />
                                        <rect x="1" y="5" width="15" height="14" rx="2" stroke="white" strokeWidth="2" />
                                      </svg>
                                    ) : null}
                                    {bar.isExternal ? <OutlookGlyph size={10} /> : null}
                                    <span className="enterprise-cal-bar-title-text">{bar.title}</span>
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="enterprise-cal-legend">
                <div className="enterprise-cal-legend-item">
                  <span className="enterprise-cal-legend-bar" />
                  <span>Team events</span>
                </div>
                <div className="enterprise-cal-legend-item">
                  <span className="enterprise-cal-legend-bar enterprise-cal-legend-bar-outlook" />
                  <span>Outlook</span>
                </div>
                <div className="enterprise-cal-legend-item">
                  <span className="enterprise-cal-legend-dot" />
                  <span>Your tasks</span>
                </div>
                <div className="enterprise-cal-legend-item">
                  <span className="enterprise-cal-legend-holiday" />
                  <span>Federal holidays</span>
                </div>
              </div>
              {selectedDate ? (
                <div className={`enterprise-cal-day-panel${evMenuId ? " enterprise-cal-day-panel--menu-open" : ""}`}>
                  <div className="enterprise-cal-day-panel-head">
                    <h3 className="enterprise-cal-day-panel-title">
                      {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </h3>
                    <p className="enterprise-cal-day-panel-hint">Scheduled items for this date.</p>
                  </div>
                  {dashboardQuery.isPending && !dashboardQuery.data ? (
                    <div className="enterprise-cal-day-loading">Loading…</div>
                  ) : selectedEvents.length === 0 &&
                    selectedExternalEvents.length === 0 &&
                    selectedTasks.length === 0 &&
                    selectedHolidays.length === 0 ? (
                    <div className="enterprise-dashboard-empty enterprise-cal-day-empty">
                      <svg className="enterprise-dashboard-empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      <p className="enterprise-dashboard-empty-title">Nothing scheduled</p>
                      <p className="enterprise-dashboard-empty-sub">Add an event or select a date.</p>
                    </div>
                  ) : (
                    <div className={`enterprise-cal-day-list${evMenuId ? " enterprise-cal-day-list--menu-open" : ""}`}>
                      {selectedHolidays.map((h) => (
                        <div key={h.name} className="enterprise-cal-day-holiday" data-testid={`holiday-${h.name}`}>
                          <div className="enterprise-cal-day-holiday-accent" aria-hidden />
                          <div>
                            <div className="enterprise-cal-day-holiday-name">{h.name}</div>
                            <div className="enterprise-cal-day-holiday-sub">Federal holiday</div>
                          </div>
                        </div>
                      ))}
                      {selectedEvents.map((event) => {
                        const canManageEvent =
                          (isOwnerOrLeader || (!!me?.id && event.createdById === me.id)) && !!selectedTeamId;
                        const badgesContent = (
                          <>
                            {!event.isHidden ? <span className="enterprise-cal-badge-public">Public</span> : null}
                            {event.isHidden ? <span className="enterprise-cal-badge-private">Private</span> : null}
                            {event.approvalStatus === "pending" ? <span className="enterprise-cal-badge-pending">Pending approval</span> : null}
                            {event.approvalStatus === "rejected" ? <span className="enterprise-cal-badge-rejected">Declined</span> : null}
                            <span
                              className="enterprise-cal-badge-range"
                              style={{ color: event.color?.trim() || "#4361EE", background: `${event.color?.trim() || "#4361EE"}20` }}
                            >
                              {event.endDate && !isSameDay(new Date(event.startDate), new Date(event.endDate))
                                ? `${new Date(event.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(event.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                                : "Event"}
                            </span>
                          </>
                        );
                        const eventActions = canManageEvent ? (
                          <div className="enterprise-cal-day-event-actions">
                            <button
                              type="button"
                              className="enterprise-cal-day-event-more"
                              aria-expanded={evMenuId === event.id}
                              aria-haspopup="menu"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEvMenuId((prev) => (prev === event.id ? null : event.id));
                              }}
                              aria-label="Event actions"
                            >
                              ⋯
                            </button>
                            {evMenuId === event.id ? (
                              <div className="enterprise-cal-day-event-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setEvMenuId(null);
                                    setEvEditId(event.id);
                                    const allDay = event.allDay !== false;
                                    setEvAllDay(allDay);
                                    setEvTitle(event.title ?? "");
                                    setEvDescription(event.description ?? "");
                                    setEvColor(event.color?.trim() || "#4361EE");
                                    setNewEventIsVideoMeeting(!!event.isVideoMeeting);
                                    setEvIsHidden(event.isHidden ?? false);
                                    setEvStart(allDay ? toDateInput(event.startDate) : toDatetimeLocalInput(event.startDate));
                                    if (event.isVideoMeeting && event.endDate) {
                                      setEvMeetingDurationMinutes(
                                        durationMinutesFromRange(new Date(event.startDate), new Date(event.endDate)),
                                      );
                                      setEvEnd("");
                                    } else {
                                      setEvMeetingDurationMinutes(60);
                                      setEvEnd(
                                        event.endDate
                                          ? allDay
                                            ? toDateInput(event.endDate)
                                            : toDatetimeLocalInput(event.endDate)
                                          : "",
                                      );
                                    }
                                    setEventOpen(true);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={evDeleteId === event.id}
                                  onClick={async () => {
                                    const ok = window.confirm("Delete this event?");
                                    if (!ok) return;
                                    setEvDeleteId(event.id);
                                    setEvActionError(null);
                                    setEvMenuId(null);
                                    try {
                                      await deleteWebTeamEvent(selectedTeamId, event.id);
                                      await refreshTeamData(selectedTeamId);
                                    } catch (err) {
                                      setEvActionError(err instanceof Error ? err.message : "Could not delete event.");
                                    } finally {
                                      setEvDeleteId(null);
                                    }
                                  }}
                                >
                                  {evDeleteId === event.id ? "Deleting…" : "Delete"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null;
                        return (
                          <div
                            key={event.id}
                            className={`enterprise-cal-day-event${evMenuId === event.id ? " enterprise-cal-day-event--menu-open" : ""}`}
                            style={{ borderLeftColor: event.color?.trim() || "#4361EE" }}
                            data-testid={`event-item-${event.id}`}
                          >
                            <div className="enterprise-cal-day-event-top">
                              <span className="enterprise-cal-day-event-name">{event.title}</span>
                              <div className="enterprise-cal-day-event-meta">
                                {event.isVideoMeeting && canShowVideoJoin(
                                  event.startDate,
                                  event.endDate,
                                  meetingNow,
                                  isOwnerOrLeader,
                                ) ? (
                                  <button
                                    type="button"
                                    className="enterprise-cal-badge-video enterprise-cal-video-join"
                                    title="Join video meeting"
                                    aria-label={`Join video meeting: ${event.title}`}
                                    onClick={() => void openVideoCall(event.id, event.title)}
                                    disabled={videoLoading}
                                    data-testid={`event-join-${event.id}`}
                                  >
                                    {videoLoading ? "Joining…" : "Join"}
                                  </button>
                                ) : null}
                                <span className="enterprise-cal-day-event-badges">{badgesContent}</span>
                                {eventActions}
                              </div>
                            </div>
                            {event.allDay !== true ? (
                              <div className="enterprise-cal-day-event-time">
                                {new Date(event.startDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                                {event.endDate
                                  ? ` – ${new Date(event.endDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`
                                  : null}
                              </div>
                            ) : null}
                            {event.description ? <p className="enterprise-cal-day-event-desc">{event.description}</p> : null}
                          </div>
                        );
                      })}
                      {selectedExternalEvents.map((event) => {
                        const rangeLabel = formatCalendarEventRangeLabel({ ...event, isExternal: true });
                        const timeLabel = formatCalendarEventTimeLabel({ ...event, isExternal: true });
                        const span = selectedDate
                          ? calendarEventSpanContext({ ...event, isExternal: true }, selectedDate)
                          : null;
                        return (
                          <div
                            key={event.id}
                            className="enterprise-cal-day-event enterprise-cal-day-event-external"
                            style={{ borderLeftColor: OUTLOOK_ACCENT_COLOR }}
                            data-testid={`external-event-${event.id}`}
                          >
                            <div className="enterprise-cal-day-event-top">
                              <span className="enterprise-cal-day-event-name">{event.title?.trim() || "Untitled event"}</span>
                              <div className="enterprise-cal-day-event-meta">
                                <span className="enterprise-cal-day-event-badges">
                                  <span className="enterprise-cal-badge-outlook">
                                    <OutlookGlyph size={11} />
                                    Outlook
                                  </span>
                                  <span
                                    className="enterprise-cal-badge-range enterprise-cal-badge-range-outlook"
                                    style={{ color: OUTLOOK_ACCENT_COLOR, background: `${OUTLOOK_ACCENT_COLOR}18` }}
                                  >
                                    {rangeLabel}
                                  </span>
                                </span>
                              </div>
                            </div>
                            {timeLabel ? <div className="enterprise-cal-day-event-time">{timeLabel}</div> : null}
                            {span?.isMultiDay && (span.continuesBefore || span.continuesAfter) ? (
                              <p className="enterprise-cal-day-event-span-hint">
                                {span.continuesBefore && span.continuesAfter
                                  ? "Multi-day event — continues before and after this date"
                                  : span.continuesBefore
                                    ? "Multi-day event — started on an earlier date"
                                    : "Multi-day event — continues on later dates"}
                              </p>
                            ) : null}
                            <p className="enterprise-cal-day-event-source-hint">Synced from your Outlook calendar · only visible to you</p>
                          </div>
                        );
                      })}
                      {selectedTasks.map((task) => (
                        <div
                          key={task.id}
                          className="enterprise-cal-day-task enterprise-cal-day-task-clickable"
                          data-testid={`task-item-${task.id}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => openTaskDetail(task.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openTaskDetail(task.id);
                            }
                          }}
                        >
                          <div className="enterprise-cal-day-task-top">
                            <span className={task.status === "done" ? "enterprise-cal-day-task-title done" : "enterprise-cal-day-task-title"}>
                              {task.title}
                            </span>
                            <span className="enterprise-cal-day-task-badge">{task.status === "done" ? "Done" : "Task"}</span>
                          </div>
                          {task.description ? (
                            <p className="enterprise-cal-day-task-desc">{formatTaskDescriptionForDisplay(task.description)}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <div className="enterprise-dashboard-tasks-column">
          <section className="enterprise-card enterprise-card-tasks" aria-labelledby="tasks-heading">
            <div className="enterprise-card-head enterprise-card-head-row">
              <h2 id="tasks-heading" className="enterprise-card-title">
                Tasks
              </h2>
              <button
                type="button"
                className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                onClick={() => openCreateTask(selectedDate ? selectedDate.toISOString().slice(0, 10) : undefined)}
              >
                + Add task
              </button>
            </div>
            <WorkspaceTaskFollowUpPanel
              taskScope={taskScope}
              canViewTeamScope={canViewTeamTab}
              stats={followUpStats}
              showStats={taskListView === "active"}
              onScopeChange={(scope) => {
                if (overdueFocus) clearOverdueFocus();
                setTaskScope(scope);
              }}
            />
            {overdueFocus ? (
              <div className="enterprise-workspace-overdue-banner" role="status">
                <span>Showing overdue tasks across your workspace</span>
                <button type="button" className="enterprise-workspace-overdue-banner-clear" onClick={clearOverdueFocus}>
                  Show all tasks
                </button>
              </div>
            ) : null}
            <div className="enterprise-task-toolbar">
              <WorkspaceTaskListViewTabs
                view={taskListView}
                onViewChange={handleTaskListViewChange}
                openCount={openTaskCount}
                completedCount={completedTaskCount}
              />
              <div className="enterprise-task-toolbar-filters">
                <label className="enterprise-select-label">
                  Sort by
                  <select
                    className="enterprise-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "due" | "priority" | "completed")}
                    aria-label="Sort tasks"
                  >
                    {taskListView === "completed" ? (
                      <>
                        <option value="completed">Completion date</option>
                        <option value="priority">Priority</option>
                      </>
                    ) : (
                      <>
                        <option value="due">Due date</option>
                        <option value="priority">Priority</option>
                      </>
                    )}
                  </select>
                </label>
                <div className="enterprise-workspace-task-view-trigger-wrap">
                  <button
                    type="button"
                    className="enterprise-workspace-task-view-trigger"
                    aria-label="Task filters"
                    aria-expanded={taskViewMenuOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTaskViewMenuOpen((open) => !open);
                    }}
                  >
                    ⋮
                  </button>
                  <WorkspaceTaskViewMenu
                    open={taskViewMenuOpen}
                    onClose={() => setTaskViewMenuOpen(false)}
                    assigneeFilter={assigneeFilter}
                    onAssigneeFilterChange={setAssigneeFilter}
                    members={assigneeMenuOptions}
                    showAssigneeFilter={taskScope === "team" && assigneeMenuOptions.length > 0}
                    priorityFilter={priorityFilter}
                    onPriorityFilterChange={setPriorityFilter}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    statusFilterEnabled={taskListView === "active"}
                  />
                </div>
              </div>
            </div>
            {taskActionError ? (
              <p className="enterprise-form-error" role="alert" style={{ marginBottom: "0.75rem" }}>
                {taskActionError}
              </p>
            ) : null}
            <div className="enterprise-card-tasks-body">
              <div className="enterprise-table-wrap enterprise-workspace-task-scroll">
                {tableRows.length === 0 ? (
                  <div className="enterprise-dashboard-empty">
                    <svg className="enterprise-dashboard-empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    <p className="enterprise-dashboard-empty-title">
                      {overdueFocus
                        ? "No overdue tasks"
                        : taskListView === "archived"
                          ? "Nothing in archive"
                          : taskListView === "completed"
                            ? "No completed tasks yet"
                            : taskScope === "team"
                              ? "No open team tasks"
                              : "No open tasks"}
                    </p>
                    <p className="enterprise-dashboard-empty-sub">
                      {taskListView === "archived"
                        ? "Deleted tasks are removed permanently and are not stored here."
                        : taskListView === "completed"
                          ? "Finished tasks show up here so you can review what got done."
                          : taskScope === "team"
                            ? "Tasks you assign to teammates appear on the Open tab."
                            : "Create a task or switch to Completed to see finished work."}
                    </p>
                  </div>
                ) : (
                  <table className="enterprise-table enterprise-workspace-task-table">
                    <colgroup>
                      <col className="enterprise-workspace-col-check" />
                      <col className="enterprise-workspace-col-task" />
                      <col className="enterprise-workspace-col-trail" />
                      <col className="enterprise-workspace-col-actions" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="enterprise-workspace-task-th-check" aria-label="Complete" />
                        <th>Task</th>
                        <th className="enterprise-workspace-task-th-trail">
                          <div className="enterprise-workspace-task-trail enterprise-workspace-task-trail--head">
                            <span>{taskListView === "completed" ? "Completed" : "Due"}</span>
                            <span>Priority</span>
                            <span>Assignee</span>
                          </div>
                        </th>
                        <th className="enterprise-table-th-actions" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((t) => {
                        const creatorId = taskCreatorId(t);
                        const isAssignee = !!me?.id && t.assignments.some((a) => a.user.id === me.id);
                        const canComplete =
                          t.status !== "done" &&
                          (isAssignee || creatorId === me?.id) &&
                          !isFeedbackTaskDescription(t.description);
                        const canEditRow = creatorId === me?.id || isOwnerOrLeader;
                        return (
                          <WorkspaceTaskRow
                            key={t.id}
                            task={t}
                            now={now}
                            memberNameByUserId={memberNameByUserId}
                            viewerUserId={me?.id}
                            menuOpen={taskMenuId === t.id}
                            completeBusy={completeBusyId === t.id}
                            deleteBusy={taskDeleteId === t.id}
                            canDelete={canDeleteTask(t, me?.id, myRole)}
                            canComplete={canComplete}
                            canEdit={canEditRow && t.status !== "done"}
                            onOpen={() => openTaskDetail(t.id)}
                            onToggleComplete={(e) => {
                              e.stopPropagation();
                              requestCompleteTask(t);
                            }}
                            onEdit={() => openTaskDetail(t.id)}
                            onDelete={() => requestDeleteTask(t)}
                            onMenuToggle={(e) => {
                              e.stopPropagation();
                              setTaskMenuId((prev) => (prev === t.id ? null : t.id));
                            }}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
          </div>
        </div>
      </div>
      {selectedTaskModal && selectedTeamId ? (
        <WorkspaceTaskDetailModal
          task={selectedTaskModal}
          teamId={selectedTeamId}
          teamDetail={teamDetail}
          me={me ?? null}
          myRole={myRole}
          feedbackContext={feedbackContext}
          feedbackContextLoading={feedbackContextLoading}
          feedbackContextSubmitted={feedbackContextSubmitted}
          feedbackContextError={feedbackContextError}
          onFeedbackRetry={() => setFeedbackFetchVersion((version) => version + 1)}
          feedbackCompletionActive={feedbackCompletionActive}
          onFeedbackCompletionStarted={() => setFeedbackCompletionActive(true)}
          onFeedbackCompletionFailed={() => setFeedbackCompletionActive(false)}
          onFeedbackSubmitted={() => {
            setFeedbackCompletionActive(false);
            setSelectedTaskModal(null);
            setFeedbackContext(null);
            void refreshTeamData(selectedTeamId);
          }}
          onClose={() => {
            setSelectedTaskModal(null);
            setFeedbackContext(null);
            setFeedbackCompletionActive(false);
          }}
          onUpdated={async (updated) => {
            if (updated && selectedTeamId) upsertDashboardTask(queryClient, selectedTeamId, updated);
            refreshTeamData(selectedTeamId);
          }}
          onDeleted={async () => refreshTeamData(selectedTeamId)}
        />
      ) : null}
      <WorkspaceTaskCreateModal
        open={createOpen}
        teamId={selectedTeamId ?? ""}
        teamDetail={teamDetail}
        me={me ?? null}
        myRole={myRole}
        initialDueDate={createInitialDueDate}
        onClose={() => setCreateOpen(false)}
        onCreated={async (created) => {
          if (selectedTeamId && created.length > 0) {
            upsertDashboardTasks(queryClient, selectedTeamId, created);
          }
          if (selectedTeamId) refreshTeamData(selectedTeamId);
        }}
      />
      <TaskPromptModal
        open={!!completePromptTask}
        title="Mark as done?"
        message="This will complete the task and lock it from further edits."
        confirmLabel="Complete"
        confirmTone="success"
        busy={!!completeBusyId}
        onClose={() => setCompletePromptTask(null)}
        onConfirm={() => {
          if (completePromptTask) void performCompleteTask(completePromptTask);
        }}
      />
      {eventAddChoiceOpen ? (
        <div
          className="enterprise-task-modal-backdrop"
          role="presentation"
          onClick={() => setEventAddChoiceOpen(false)}
        >
          <div
            className="enterprise-task-modal enterprise-event-modal--v3 enterprise-event-choice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-event-choice-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="create-v3-head">
              <div className="create-v3-head-main">
                <h2 id="dashboard-event-choice-title" className="create-v3-heading">
                  What would you like to add?
                </h2>
                <p className="create-v3-sub">Choose an item for the team calendar.</p>
              </div>
              <div className="create-v3-head-actions">
                <button
                  type="button"
                  className="create-v3-icon-btn"
                  onClick={() => setEventAddChoiceOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </header>
            <div className="create-v3-body create-v3-body--choice">
              <button type="button" className="enterprise-event-choice-row-v3" onClick={beginNewCalendarEvent}>
                <span className="enterprise-event-choice-icon-wrap enterprise-event-choice-icon-calendar" aria-hidden>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>
                <span className="enterprise-event-choice-row-text">
                  <span className="enterprise-event-choice-row-title">Add calendar event</span>
                  <span className="enterprise-event-choice-row-sub">Add to the team calendar</span>
                </span>
              </button>
              <button type="button" className="enterprise-event-choice-row-v3" onClick={beginNewVirtualMeeting}>
                <span className="enterprise-event-choice-icon-wrap enterprise-event-choice-icon-meeting" aria-hidden>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" fill="currentColor" stroke="none" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </span>
                <span className="enterprise-event-choice-row-text">
                  <span className="enterprise-event-choice-row-title">Add virtual meeting</span>
                  <span className="enterprise-event-choice-row-sub">Create a meeting with a video call link</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {eventOpen ? (
        <div
          className="enterprise-task-modal-backdrop"
          role="presentation"
          onClick={() => {
            setEventOpen(false);
            setEvEditId(null);
            setNewEventIsVideoMeeting(false);
          }}
        >
          <div
            className="enterprise-task-modal enterprise-event-modal--v3"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-event-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="create-v3-head">
              <div className="create-v3-head-main">
                <h2 id="dashboard-event-form-title" className="create-v3-heading">
                  {evEditId
                    ? newEventIsVideoMeeting
                      ? "Edit virtual meeting"
                      : evIsHidden
                        ? "Edit personal event"
                        : "Edit calendar event"
                    : newEventIsVideoMeeting
                      ? "Add virtual meeting"
                      : evIsHidden
                        ? "Add personal event"
                        : "Add calendar event"}
                </h2>
                <p className="create-v3-sub">
                  {evEditId
                    ? "Update this calendar entry."
                    : newEventIsVideoMeeting
                      ? "Schedule a timed meeting your team can join from the dashboard."
                      : evIsHidden
                        ? "Only you will see this on your calendar."
                        : "Create an all-day or multi-day entry on the team calendar."}
                </p>
              </div>
              <div className="create-v3-head-actions">
                <button
                  type="button"
                  className="create-v3-icon-btn"
                  onClick={() => {
                    setEventOpen(false);
                    setEvEditId(null);
                    setNewEventIsVideoMeeting(false);
                  }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </header>
            <form
              className="enterprise-workspace-create-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setEvError(null);
                if (!selectedTeamId) return setEvError("Pick a workspace first.");
                if (!evTitle.trim()) return setEvError("Please enter an event title.");
                const fd = new FormData(e.currentTarget);
                const isVideoMeeting = fd.get("eventIsVideoMeeting") === "1";
                setEvSaving(true);
                try {
                  const useAllDay = isVideoMeeting ? false : evAllDay;
                  const startIso = useAllDay
                    ? calendarDayToUtcNoonIso(evStart)
                    : new Date(evStart).toISOString();
                  let endIso: string | null;
                  if (isVideoMeeting) {
                    endIso = videoMeetingEndFromDuration(new Date(evStart), evMeetingDurationMinutes).toISOString();
                  } else {
                    endIso =
                      evEnd && evEnd.trim()
                        ? useAllDay
                          ? calendarDayToUtcNoonIso(evEnd)
                          : new Date(evEnd).toISOString()
                        : null;
                  }
                  if (evEditId) {
                    await updateWebTeamEvent(selectedTeamId, evEditId, {
                      title: evTitle.trim(),
                      description: evDescription.trim() || null,
                      startDate: startIso,
                      endDate: endIso,
                      allDay: useAllDay,
                      color: evColor,
                      isVideoMeeting,
                      isHidden: evIsHidden,
                    });
                  } else {
                    await createWebTeamEvent(selectedTeamId, {
                      title: evTitle.trim(),
                      description: evDescription.trim() || null,
                      startDate: startIso,
                      endDate: endIso,
                      allDay: useAllDay,
                      color: evColor,
                      isVideoMeeting,
                      isHidden: evIsHidden,
                    });
                  }
                  await refreshTeamData(selectedTeamId);
                  await queryClient.invalidateQueries({ queryKey: queryKeys.upcomingVideoMeetings });
                  setEventOpen(false);
                  setEvEditId(null);
                  setNewEventIsVideoMeeting(false);
                  setEvIsHidden(false);
                  setEvMeetingDurationMinutes(60);
                  setEvTitle("");
                  setEvDescription("");
                  setEvAllDay(true);
                  setEvStart(new Date().toISOString().slice(0, 10));
                  setEvEnd("");
                  setEvColor("#4361EE");
                } catch (err) {
                  setEvError(err instanceof Error ? err.message : "Could not create event.");
                } finally {
                  setEvSaving(false);
                }
              }}
            >
              <div className="create-v3-body">
                <div className="create-v3-event-form">
                  <input type="hidden" name="eventIsVideoMeeting" value={newEventIsVideoMeeting ? "1" : "0"} />
                  <div className="create-v3-title-wrap">
                    <span className="create-v3-title-accent" aria-hidden />
                    <label className="sr-only" htmlFor="dashboard-event-title">
                      Event title
                    </label>
                    <input
                      id="dashboard-event-title"
                      className="create-v3-title-input"
                      value={evTitle}
                      onChange={(e) => setEvTitle(e.target.value)}
                      placeholder="Event title"
                      required
                      autoFocus
                    />
                  </div>

                  <section className="create-v3-block">
                    <h3 className="create-v3-block-title">Description</h3>
                    <textarea
                      className="create-v3-event-textarea"
                      value={evDescription}
                      onChange={(e) => setEvDescription(e.target.value)}
                      placeholder="Add details for your team…"
                      rows={3}
                    />
                  </section>

                  {!newEventIsVideoMeeting ? (
                    <label className="create-v3-repeat-row create-v3-event-all-day">
                      <input type="checkbox" checked={evAllDay} onChange={(e) => setEvAllDay(e.target.checked)} />
                      <span>All day</span>
                    </label>
                  ) : null}

                  {!newEventIsVideoMeeting ? (
                    <>
                      <label className="create-v3-repeat-row create-v3-event-all-day">
                        <input
                          type="checkbox"
                          checked={!evIsHidden}
                          onChange={(e) => setEvIsHidden(!e.target.checked)}
                        />
                        <span>Visible to the whole team</span>
                      </label>
                      {!isOwnerOrLeader && !evIsHidden ? (
                        <p className="enterprise-cal-approval-hint">
                          Public events are sent to your team leader or owner for approval before they appear on the team calendar.
                        </p>
                      ) : null}
                    </>
                  ) : null}

                  <section className="create-v3-block create-v3-block--event-details">
                    <h3 className="create-v3-block-title">When</h3>
                    <div className="create-v3-detail-rows">
                      <label className="create-v3-detail-row">
                        <span className="create-v3-detail-key">
                          <span className="create-v3-detail-icon" aria-hidden>
                            📅
                          </span>
                          {newEventIsVideoMeeting || !evAllDay ? "Starts" : "Start date"}
                        </span>
                        <input
                          type={newEventIsVideoMeeting || !evAllDay ? "datetime-local" : "date"}
                          className="auth-input create-v3-detail-input"
                          value={evStart}
                          onChange={(e) => setEvStart(e.target.value)}
                        />
                      </label>
                      {newEventIsVideoMeeting ? (
                        <>
                          <label className="create-v3-detail-row">
                            <span className="create-v3-detail-key">
                              <span className="create-v3-detail-icon" aria-hidden>
                                ⏱
                              </span>
                              Duration
                            </span>
                            <select
                              className="auth-input create-v3-detail-input"
                              value={evMeetingDurationMinutes}
                              onChange={(e) => setEvMeetingDurationMinutes(Number(e.target.value))}
                            >
                              {VIDEO_MEETING_DURATION_OPTIONS.map((minutes) => (
                                <option key={minutes} value={minutes}>
                                  {formatVideoMeetingDuration(minutes)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="create-v3-detail-row create-v3-detail-row--preview">
                            <span className="create-v3-detail-key">
                              <span className="create-v3-detail-icon" aria-hidden>
                                🕐
                              </span>
                              Ends at
                            </span>
                            <span className="create-v3-meeting-end-preview">
                              {formatVideoMeetingEndPreview(evStart, evMeetingDurationMinutes)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <label className="create-v3-detail-row">
                          <span className="create-v3-detail-key">
                            <span className="create-v3-detail-icon" aria-hidden>
                              📅
                            </span>
                            {evAllDay ? "End date (optional)" : "Ends (optional)"}
                          </span>
                          <input
                            type={evAllDay ? "date" : "datetime-local"}
                            className="auth-input create-v3-detail-input"
                            value={evEnd}
                            onChange={(e) => setEvEnd(e.target.value)}
                          />
                        </label>
                      )}
                      <label className="create-v3-detail-row">
                        <span className="create-v3-detail-key">
                          <span className="create-v3-detail-icon" aria-hidden>
                            ●
                          </span>
                          Color
                        </span>
                        <input type="color" className="auth-input create-v3-detail-input create-v3-event-color" value={evColor} onChange={(e) => setEvColor(e.target.value)} />
                      </label>
                    </div>
                  </section>
                </div>
              </div>

              {evError ? (
                <p className="auth-error create-v3-error" role="alert">
                  {evError}
                </p>
              ) : null}

              <footer className="create-v3-footer">
                <button
                  type="button"
                  className="task-detail-v2-btn task-detail-v2-btn--ghost"
                  onClick={() => {
                    setEventOpen(false);
                    setEvEditId(null);
                    setNewEventIsVideoMeeting(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="task-detail-v2-btn task-detail-v2-btn--primary" disabled={evSaving}>
                  {evSaving
                    ? evEditId
                      ? "Saving…"
                      : "Creating…"
                    : evEditId
                      ? newEventIsVideoMeeting
                        ? "Save meeting"
                        : "Save event"
                      : newEventIsVideoMeeting
                        ? "Create meeting"
                        : "Create event"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
      {videoUrl ? (
        <div className="enterprise-task-modal-backdrop" role="presentation" onClick={() => setVideoUrl(null)}>
          <div className="enterprise-video-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="enterprise-task-modal-close" onClick={() => setVideoUrl(null)} aria-label="Close video call">
              ×
            </button>
            <h3 className="enterprise-card-title">{videoTitle || "Video call"}</h3>
            <iframe
              src={videoUrl}
              className="enterprise-video-iframe"
              allow="camera; microphone; fullscreen; display-capture"
              title={videoTitle || "Video call"}
            />
          </div>
        </div>
      ) : null}
      {selectedTeamId ? (
        <PendingCalendarEventsModal
          open={pendingCalendarOpen}
          teamId={selectedTeamId}
          events={pendingCalendarEvents}
          actionId={evApprovalId}
          onClose={() => setPendingCalendarOpen(false)}
          onReload={async () => {
            await refreshCalendarApprovals(selectedTeamId);
          }}
          onError={(message) => setEvActionError(message)}
          onActionStart={setEvApprovalId}
          onActionEnd={() => setEvApprovalId(null)}
        />
      ) : null}
      <RecurringTaskScopeModal
        open={!!recurringScopeModal}
        mode="delete"
        busy={!!taskDeleteId}
        onClose={() => setRecurringScopeModal(null)}
        onChoose={(scope) => {
          if (!recurringScopeModal) return;
          void handleDeleteTask(recurringScopeModal, scope);
        }}
      />
    </>
  );
}

function mergeTaskLists(webTasks: ApiTask[], coreTasks: ApiTask[]): ApiTask[] {
  const safeWebTasks = Array.isArray(webTasks) ? webTasks : [];
  const safeCoreTasks = Array.isArray(coreTasks) ? coreTasks : [];
  const byId = new Map<string, ApiTask>();
  for (const t of safeWebTasks) byId.set(t.id, t);
  for (const c of safeCoreTasks) {
    const prev = byId.get(c.id);
    if (!prev) {
      byId.set(c.id, c);
      continue;
    }
    byId.set(c.id, {
      ...prev,
      ...c,
      creatorId: c.creatorId ?? prev.creatorId ?? c.creator?.id ?? prev.creator?.id,
      assignments: c.assignments?.length ? c.assignments : prev.assignments,
      subtasks: c.subtasks?.length ? c.subtasks : prev.subtasks,
      attachmentUrl: c.attachmentUrl ?? prev.attachmentUrl,
      creator: c.creator ?? prev.creator,
      oneOnOneMeetingId: c.oneOnOneMeetingId ?? prev.oneOnOneMeetingId,
      oneOnOneMeeting: c.oneOnOneMeeting ?? prev.oneOnOneMeeting,
    });
  }
  return [...byId.values()];
}
