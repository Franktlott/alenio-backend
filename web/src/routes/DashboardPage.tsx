import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  computeWeekBars,
  getDaysInMonth,
  isCurrentMonth,
  isSameDay,
  startOfDay,
} from "../lib/calendar-mobile-parity";
import { getUSHolidays } from "../lib/us-federal-holidays";
import { canShowVideoJoin, isInVideoMeetingBannerWindow, isVideoMeetingLeaderRole } from "../lib/video-meeting-join";
import {
  createWebTask,
  createWebTeamEvent,
  createVideoRoom,
  deleteWebTask,
  deleteWebTeamEvent,
  fetchCoreTeamTasks,
  fetchWebTeam,
  fetchWebTeamEvents,
  fetchWebTeamTasks,
  fetchUpcomingVideoMeetings,
  updateWebTeamEvent,
  updateCoreTeamTask,
  type ApiCalendarEvent,
  type ApiSubtask,
  type ApiTask,
  type UpcomingVideoMeeting,
  type WebTeamDetail,
  type WebMeUser,
  type WebTeamRow,
} from "../lib/api";
import addChoiceLogo from "../../icon.png";

function priorityRank(p: string): number {
  if (p === "high") return 3;
  if (p === "medium") return 2;
  if (p === "low") return 1;
  return 0;
}

function dotClassForDayTasks(dayTasks: ApiTask[]): string {
  if (!dayTasks.length) return "";
  const max = Math.max(...dayTasks.map((t) => priorityRank(t.priority)));
  if (max >= 3) return "enterprise-cal-dot enterprise-cal-dot-high";
  if (max >= 2) return "enterprise-cal-dot enterprise-cal-dot-med";
  return "enterprise-cal-dot enterprise-cal-dot-low";
}

function formatTaskDue(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = startOfDay(now);
  if (isSameDay(d, today)) return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · Today`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(status: string): string {
  if (status === "done") return "Completed";
  if (status === "in_progress") return "In progress";
  return "Pending";
}

function statusClass(status: string): string {
  if (status === "done") return "enterprise-status enterprise-status-done";
  if (status === "in_progress") return "enterprise-status enterprise-status-progress";
  return "enterprise-status enterprise-status-pending";
}

function priorityLabel(p: string): string {
  if (p === "high") return "High";
  if (p === "medium") return "Medium";
  if (p === "low") return "Low";
  return "—";
}

function priorityClass(p: string): string {
  if (p === "high") return "enterprise-priority enterprise-priority-high";
  if (p === "medium") return "enterprise-priority enterprise-priority-medium";
  if (p === "low") return "enterprise-priority enterprise-priority-low";
  return "enterprise-priority enterprise-priority-none";
}

function isImageAttachment(url: string): boolean {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif"].some((ext) => clean.endsWith(ext));
}

function formatModalDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", weekday: "long" });
}

function assigneeInitials(name: string | null, email: string | null | undefined): string {
  const n = name?.trim() || email?.trim() || "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

function canDeleteTask(task: ApiTask, meId: string | undefined, role: string): boolean {
  if (!meId) return false;
  const creatorId = task.creatorId ?? task.creator?.id;
  if (creatorId === meId) return true;
  return role === "owner" || role === "admin";
}

type TaskTab = "active" | "completed" | "team";
const PRIORITIES = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
] as const;
const STATUSES = [
  { label: "Open", value: "todo" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "done" },
] as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, teams, selectedTeamId, setSelectedTeamId, setWorkspaceMainLoading } = useEnterpriseShell();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [events, setEvents] = useState<ApiCalendarEvent[]>([]);
  const [tasksErr, setTasksErr] = useState<string | null>(null);
  const [teamDataLoading, setTeamDataLoading] = useState(false);
  const [calendarView, setCalendarView] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date());
  const [taskTab, setTaskTab] = useState<TaskTab>("active");
  const [sortBy, setSortBy] = useState<"due" | "priority">("due");
  const [selectedTaskModal, setSelectedTaskModal] = useState<ApiTask | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTeamDetail, setCreateTeamDetail] = useState<WebTeamDetail | null>(null);
  const [ctTitle, setCtTitle] = useState("");
  const [ctDescription, setCtDescription] = useState("");
  const [ctPriority, setCtPriority] = useState("medium");
  const [ctStatus, setCtStatus] = useState("todo");
  const [ctDueDate, setCtDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ctAssigneeIds, setCtAssigneeIds] = useState<string[]>([]);
  const [ctIsJoint, setCtIsJoint] = useState(false);
  const [ctIncognito, setCtIncognito] = useState(false);
  const [ctSubtasks, setCtSubtasks] = useState<string[]>([]);
  const [ctNewSubtask, setCtNewSubtask] = useState("");
  const [ctSaving, setCtSaving] = useState(false);
  const [ctError, setCtError] = useState<string | null>(null);
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
  const [evActionError, setEvActionError] = useState<string | null>(null);
  const [evEditId, setEvEditId] = useState<string | null>(null);
  const [evMenuId, setEvMenuId] = useState<string | null>(null);
  const [eventAddChoiceOpen, setEventAddChoiceOpen] = useState(false);
  const [newEventIsVideoMeeting, setNewEventIsVideoMeeting] = useState(false);
  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingVideoMeeting[]>([]);
  const [meetingNow, setMeetingNow] = useState(() => Date.now());
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [taskEditMode, setTaskEditMode] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("medium");
  const [editDueDate, setEditDueDate] = useState("");
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null);
  const [taskDeleteId, setTaskDeleteId] = useState<string | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);

  const now = new Date();

  useEffect(() => {
    const id = location.hash.replace(/^#/, "");
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash]);

  useEffect(() => {
    setWorkspaceMainLoading(!!selectedTeamId && teamDataLoading);
    return () => setWorkspaceMainLoading(false);
  }, [selectedTeamId, teamDataLoading, setWorkspaceMainLoading]);

  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;
    setTeamDataLoading(true);
    (async () => {
      try {
        const [webTasks, coreTasks, evs] = await Promise.all([
          fetchWebTeamTasks(selectedTeamId),
          fetchCoreTeamTasks(selectedTeamId).catch(() => []),
          fetchWebTeamEvents(selectedTeamId),
        ]);
        if (cancelled) return;
        const merged = mergeTaskLists(webTasks, coreTasks);
        setTasks(merged);
        setEvents(evs);
        setTasksErr(null);
      } catch (e) {
        if (cancelled) return;
        setTasks([]);
        setEvents([]);
        setTasksErr(e instanceof Error ? e.message : "Could not load tasks.");
      } finally {
        if (!cancelled) setTeamDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  useEffect(() => {
    if (!createOpen || !selectedTeamId) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchWebTeam(selectedTeamId);
        if (cancelled) return;
        setCreateTeamDetail(d);
      } catch {
        if (cancelled) return;
        setCreateTeamDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen, selectedTeamId]);

  useEffect(() => {
    if (!createOpen || !me?.id || !createTeamDetail?.members?.length) return;
    setCtAssigneeIds((prev) => {
      if (prev.length > 0) return prev;
      return [me.id];
    });
  }, [createOpen, me?.id, createTeamDetail?.members]);

  useEffect(() => {
    const id = window.setInterval(() => setMeetingNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadUpcoming = async () => {
      try {
        const data = await fetchUpcomingVideoMeetings();
        if (cancelled) return;
        setUpcomingMeetings(data ?? []);
      } catch {
        if (cancelled) return;
        setUpcomingMeetings([]);
      }
    };
    void loadUpcoming();
    const id = window.setInterval(loadUpcoming, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setSelectedDate(new Date());
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

  const refreshTeamData = async (teamId: string) => {
    const [webTasks, coreTasks, evs] = await Promise.all([
      fetchWebTeamTasks(teamId),
      fetchCoreTeamTasks(teamId).catch(() => []),
      fetchWebTeamEvents(teamId),
    ]);
    setTasks(mergeTaskLists(webTasks, coreTasks));
    setEvents(evs);
  };

  const openTaskDetail = (taskId: string) => {
    const t = tasks.find((item) => item.id === taskId) ?? null;
    if (!t) return;
    setSelectedTaskModal(t);
    setTaskEditMode(false);
    setTaskError(null);
    setEditTitle(t.title ?? "");
    setEditDescription(t.description ?? "");
    setEditPriority(t.priority ?? "medium");
    setEditDueDate(t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "");
  };

  const resetCreateForm = () => {
    setCtTitle("");
    setCtDescription("");
    setCtPriority("medium");
    setCtStatus("todo");
    setCtDueDate(new Date().toISOString().slice(0, 10));
    setCtAssigneeIds(me?.id ? [me.id] : []);
    setCtIsJoint(false);
    setCtIncognito(false);
    setCtSubtasks([]);
    setCtNewSubtask("");
    setCtError(null);
  };

  const toggleCreateAssignee = (userId: string) => {
    setCtAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const myRole = selectedTeam?.role ?? "";
  const isOwnerOrLeader = myRole === "owner" || myRole === "team_leader";
  const isOwnerOrAdmin = myRole === "owner" || myRole === "admin";

  const handleDeleteTask = async (task: ApiTask) => {
    if (!selectedTeamId || !canDeleteTask(task, me?.id, myRole)) return;
    const ok = window.confirm(`Delete "${task.title}"? This cannot be undone.`);
    if (!ok) return;
    setTaskDeleteId(task.id);
    setTaskActionError(null);
    setTaskMenuId(null);
    try {
      await deleteWebTask(task.id, selectedTeamId);
      if (selectedTaskModal?.id === task.id) {
        setSelectedTaskModal(null);
        setTaskEditMode(false);
      }
      await refreshTeamData(selectedTeamId);
    } catch (err) {
      setTaskActionError(err instanceof Error ? err.message : "Could not delete task.");
    } finally {
      setTaskDeleteId(null);
    }
  };

  const visibleEvents = useMemo(() => {
    const uid = me?.id ?? null;
    return events.filter((e) => {
      if (!e.isHidden) return true;
      if (uid && e.createdById === uid) return true;
      return false;
    });
  }, [events, me?.id]);

  const myTasks = useMemo(() => {
    if (!me?.id) return [];
    return tasks.filter((t) => t.assignments.some((a) => a.user.id === me.id));
  }, [tasks, me?.id]);

  const getEventsForDay = (day: Date) =>
    visibleEvents.filter((e) => {
      const s = startOfDay(new Date(e.startDate));
      const en = e.endDate ? startOfDay(new Date(e.endDate)) : s;
      const d = startOfDay(day);
      return d >= s && d <= en;
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
  const selectedTasks = selectedDate ? getTasksForDay(selectedDate) : [];

  const activeTasks = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  const tabTasks = useMemo(() => {
    if (taskTab === "completed") return completedTasks;
    if (taskTab === "team") return activeTasks;
    return activeTasks;
  }, [taskTab, activeTasks, completedTasks]);

  const tableRows = useMemo(() => {
    const list = [...tabTasks];
    if (sortBy === "due") {
      list.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    } else {
      list.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
    }
    return list.slice(0, 8);
  }, [tabTasks, sortBy]);

  const calTitle = calendarView.toLocaleString(undefined, { month: "long", year: "numeric" });
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

  const refreshUpcomingMeetings = async () => {
    try {
      const data = await fetchUpcomingVideoMeetings();
      setUpcomingMeetings(data ?? []);
    } catch {
      setUpcomingMeetings([]);
    }
  };

  const beginNewCalendarEvent = () => {
    setEvEditId(null);
    setEvError(null);
    setEvTitle("");
    setEvDescription("");
    setEvColor("#4361EE");
    setNewEventIsVideoMeeting(false);
    setEvAllDay(true);
    setEvStart(new Date().toISOString().slice(0, 10));
    setEvEnd("");
    setEventAddChoiceOpen(false);
    setEventOpen(true);
  };

  const beginNewVirtualMeeting = () => {
    setEvEditId(null);
    setEvError(null);
    setEvTitle("");
    setEvDescription("");
    setEvColor("#4361EE");
    setNewEventIsVideoMeeting(true);
    setEvAllDay(false);
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setEvStart(toDatetimeLocalInput(start.toISOString()));
    setEvEnd(toDatetimeLocalInput(end.toISOString()));
    setEventAddChoiceOpen(false);
    setEventOpen(true);
  };

  const activeUpcomingMeeting = useMemo(() => {
    if (!selectedTeamId) return null;
    return (
      upcomingMeetings
        .filter((m) => m.event.teamId === selectedTeamId)
        .find((m) =>
          isInVideoMeetingBannerWindow(m.event.startDate, m.event.endDate, meetingNow),
        ) ?? null
    );
  }, [upcomingMeetings, selectedTeamId, meetingNow]);

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
      <div className="enterprise-tab-shell enterprise-tab-shell-scroll" data-testid="dashboard-screen">
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
        {activeUpcomingMeeting ? (
          <div className="enterprise-video-banner" role="status">
            <div>
              <strong>Upcoming video meeting:</strong> {activeUpcomingMeeting.event.title}
            </div>
            {canShowVideoJoin(
              activeUpcomingMeeting.event.startDate,
              activeUpcomingMeeting.event.endDate,
              meetingNow,
              isVideoMeetingLeaderRole(activeUpcomingMeeting.userRole),
            ) ? (
              <button
                type="button"
                className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                onClick={() => void openVideoCall(activeUpcomingMeeting.event.id, activeUpcomingMeeting.event.title)}
                disabled={videoLoading}
              >
                {videoLoading ? "Joining…" : "Join call"}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="enterprise-dashboard-top">
          <section className="enterprise-card enterprise-card-cal" aria-labelledby="cal-heading">
            <div className="enterprise-card-head">
              <h2 id="cal-heading" className="enterprise-card-title">
                Calendar
              </h2>
              <div className="enterprise-cal-head-actions">
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                  onClick={() => {
                    if (!selectedTeamId) return;
                    if (isOwnerOrLeader) setEventAddChoiceOpen(true);
                    else beginNewCalendarEvent();
                  }}
                >
                  + Add event
                </button>
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
              </div>
            </div>
            <div className="enterprise-cal-mobile-wrap">
              <div className="enterprise-cal-weekdays enterprise-cal-weekdays-mobile">
                {weekdayLabels.map((w) => (
                  <div key={w} className="enterprise-cal-weekday">
                    {w}
                  </div>
                ))}
              </div>
              <div className="enterprise-cal-weeks">
                {calWeeks.map((week, weekIndex) => {
                  const tracks = computeWeekBars(week, visibleEvents);
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
                          {week.map((_, colIndex) => {
                            const bar = track.find((b) => b.startCol <= colIndex && b.endCol >= colIndex);
                            if (!bar) {
                              return <div key={colIndex} className="enterprise-cal-track-cell" />;
                            }
                            const isBarStart = colIndex === bar.startCol;
                            const isBarEnd = colIndex === bar.endCol;
                            return (
                              <div key={colIndex} className="enterprise-cal-track-cell">
                                <button
                                  type="button"
                                  className="enterprise-cal-bar-seg"
                                  style={{
                                    backgroundColor: bar.color,
                                    borderTopLeftRadius: isBarStart ? 3 : 0,
                                    borderBottomLeftRadius: isBarStart ? 3 : 0,
                                    borderTopRightRadius: isBarEnd ? 3 : 0,
                                    borderBottomRightRadius: isBarEnd ? 3 : 0,
                                    marginLeft: isBarStart ? 2 : 0,
                                    marginRight: isBarEnd ? 2 : 0,
                                  }}
                                  title={bar.title}
                                  aria-label={bar.title}
                                  onClick={() => {
                                    /* parity: mobile opens edit; web has no editor */
                                  }}
                                />
                              </div>
                            );
                          })}
                          {track.map((bar) => (
                            <div
                              key={`title-${bar.id}`}
                              className="enterprise-cal-bar-title"
                              style={{
                                left: `calc(${bar.startCol} * (100% / 7) + 2px)`,
                                width: `calc(${bar.endCol - bar.startCol + 1} * (100% / 7) - 4px)`,
                              }}
                              aria-hidden
                            >
                              <span className="enterprise-cal-bar-title-inner">
                                {bar.isVideoMeeting ? (
                                  <svg className="enterprise-cal-bar-video" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                                    <polygon points="23 7 16 12 23 17 23 7" fill="white" />
                                    <rect x="1" y="5" width="15" height="14" rx="2" stroke="white" strokeWidth="2" />
                                  </svg>
                                ) : null}
                                <span className="enterprise-cal-bar-title-text">{bar.title}</span>
                              </span>
                            </div>
                          ))}
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
                  <span className="enterprise-cal-legend-dot" />
                  <span>Your tasks</span>
                </div>
                <div className="enterprise-cal-legend-item">
                  <span className="enterprise-cal-legend-holiday" />
                  <span>Federal holidays</span>
                </div>
                {isOwnerOrLeader ? (
                  <div className="enterprise-cal-legend-item">
                    <span className="enterprise-cal-legend-incog" aria-hidden>
                      ○
                    </span>
                    <span>Incognito</span>
                  </div>
                ) : null}
              </div>
              {selectedDate ? (
                <div className="enterprise-cal-day-panel">
                  <div className="enterprise-cal-day-panel-head">
                    <h3 className="enterprise-cal-day-panel-title">
                      {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </h3>
                    <p className="enterprise-cal-day-panel-hint">Add events here, or manage advanced edits in the mobile app.</p>
                  </div>
                  {teamDataLoading ? (
                    <div className="enterprise-cal-day-loading">Loading…</div>
                  ) : selectedEvents.length === 0 && selectedTasks.length === 0 && selectedHolidays.length === 0 ? (
                    <div className="enterprise-cal-day-empty">
                      <p>Nothing scheduled</p>
                    </div>
                  ) : (
                    <div className="enterprise-cal-day-list">
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
                        const badgesContent = (
                          <>
                            {!event.isHidden ? <span className="enterprise-cal-badge-public">Public</span> : null}
                            <span
                              className="enterprise-cal-badge-range"
                              style={{ color: event.color?.trim() || "#4361EE", background: `${event.color?.trim() || "#4361EE"}20` }}
                            >
                              {event.endDate && !isSameDay(new Date(event.startDate), new Date(event.endDate))
                                ? `${new Date(event.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(event.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                                : "Event"}
                            </span>
                            {(isOwnerOrAdmin || (!!me?.id && event.createdById === me.id)) && selectedTeamId ? (
                              <div className="enterprise-cal-day-event-actions">
                                <button
                                  type="button"
                                  className="enterprise-cal-day-event-more"
                                  onClick={() => setEvMenuId((prev) => (prev === event.id ? null : event.id))}
                                  aria-label="Event actions"
                                >
                                  ⋯
                                </button>
                                {evMenuId === event.id ? (
                                  <div className="enterprise-cal-day-event-menu">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEvMenuId(null);
                                        setEvEditId(event.id);
                                        const allDay = event.allDay !== false;
                                        setEvAllDay(allDay);
                                        setEvTitle(event.title ?? "");
                                        setEvDescription(event.description ?? "");
                                        setEvColor(event.color?.trim() || "#4361EE");
                                        setNewEventIsVideoMeeting(!!event.isVideoMeeting);
                                        setEvStart(allDay ? toDateInput(event.startDate) : toDatetimeLocalInput(event.startDate));
                                        setEvEnd(
                                          event.endDate
                                            ? allDay
                                              ? toDateInput(event.endDate)
                                              : toDatetimeLocalInput(event.endDate)
                                            : "",
                                        );
                                        setEventOpen(true);
                                      }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
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
                            ) : null}
                          </>
                        );
                        return (
                          <div
                            key={event.id}
                            className="enterprise-cal-day-event"
                            style={{ borderLeftColor: event.color?.trim() || "#4361EE" }}
                            data-testid={`event-item-${event.id}`}
                          >
                            <div className="enterprise-cal-day-event-top">
                              <span className="enterprise-cal-day-event-name">{event.title}</span>
                              {event.isVideoMeeting ? (
                                <div className="enterprise-cal-day-event-meeting-actions">
                                  {canShowVideoJoin(
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
                                </div>
                              ) : (
                                <span className="enterprise-cal-day-event-badges">{badgesContent}</span>
                              )}
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
                          {task.description ? <p className="enterprise-cal-day-task-desc">{task.description}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <section className="enterprise-card enterprise-card-tasks" aria-labelledby="tasks-heading">
            <div className="enterprise-card-head enterprise-card-head-row">
              <h2 id="tasks-heading" className="enterprise-card-title">
                Tasks
              </h2>
              <div className="enterprise-task-head-actions">
                <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" onClick={() => setCreateOpen(true)}>
                  + Add task
                </button>
                <div className="enterprise-task-tabs" role="tablist">
                  {(["active", "completed", "team"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={taskTab === tab}
                      className={`enterprise-task-tab ${taskTab === tab ? "enterprise-task-tab-on" : ""}`}
                      onClick={() => setTaskTab(tab)}
                    >
                      {tab === "active" ? "Active" : tab === "completed" ? "Completed" : "Team"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="enterprise-task-toolbar">
              <label className="enterprise-select-label">
                Sort by
                <select
                  className="enterprise-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "due" | "priority")}
                  aria-label="Sort tasks"
                >
                  <option value="due">Due date</option>
                  <option value="priority">Priority</option>
                </select>
              </label>
              <span className="enterprise-task-filters-ico" aria-hidden title="Filters">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
              </span>
            </div>
            {taskActionError ? (
              <p className="enterprise-form-error" role="alert" style={{ marginBottom: "0.75rem" }}>
                {taskActionError}
              </p>
            ) : null}
            <div className="enterprise-table-wrap">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Due</th>
                    <th>Priority</th>
                    <th>Assignee</th>
                    <th>Status</th>
                    <th className="enterprise-table-th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="enterprise-table-empty">
                        No tasks in this view.
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((t) => {
                      const assignees = t.assignments.map((a) => a.user).filter(Boolean);
                      return (
                        <tr
                          key={t.id}
                          className="enterprise-table-row-clickable"
                          role="link"
                          tabIndex={0}
                          aria-label={`Open task: ${t.title}`}
                          onClick={() => openTaskDetail(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openTaskDetail(t.id);
                            }
                          }}
                        >
                          <td>
                            <div className="enterprise-task-title">{t.title}</div>
                            {t.description ? <div className="enterprise-task-desc">{t.description}</div> : null}
                          </td>
                          <td>{formatTaskDue(t.dueDate, now)}</td>
                          <td>
                            <span className={priorityClass(t.priority)}>{priorityLabel(t.priority)}</span>
                          </td>
                          <td>
                            <div className="enterprise-assignees">
                              {assignees.slice(0, 3).map((u) =>
                                u.image ? (
                                  <img key={u.id} src={u.image} alt={u.name ?? u.email ?? "Assignee"} className="enterprise-assignee-img" />
                                ) : (
                                  <span key={u.id} className="enterprise-assignee-initials" title={u.name ?? u.email ?? ""}>
                                    {assigneeInitials(u.name, u.email)}
                                  </span>
                                ),
                              )}
                              {assignees.length === 0 ? <span className="enterprise-muted">—</span> : null}
                            </div>
                          </td>
                          <td>
                            <span className={statusClass(t.status)}>{statusLabel(t.status)}</span>
                          </td>
                          <td
                            className="enterprise-table-td-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="enterprise-task-row-actions">
                              <button
                                type="button"
                                className="enterprise-row-more"
                                aria-label={`Actions for ${t.title}`}
                                aria-expanded={taskMenuId === t.id}
                                aria-haspopup="menu"
                                data-testid={`task-menu-${t.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTaskMenuId((prev) => (prev === t.id ? null : t.id));
                                }}
                              >
                                ⋮
                              </button>
                              {taskMenuId === t.id ? (
                                <div className="enterprise-task-row-menu" role="menu">
                                  {canDeleteTask(t, me?.id, myRole) ? (
                                    <button
                                      type="button"
                                      className="enterprise-task-row-menu-danger"
                                      role="menuitem"
                                      disabled={taskDeleteId === t.id}
                                      data-testid={`task-delete-${t.id}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDeleteTask(t);
                                      }}
                                    >
                                      {taskDeleteId === t.id ? "Deleting…" : "Delete"}
                                    </button>
                                  ) : (
                                    <p className="enterprise-task-row-menu-muted" role="presentation">
                                      No actions available
                                    </p>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
      {selectedTaskModal ? (
        <div className="enterprise-task-modal-backdrop" role="presentation" onClick={() => setSelectedTaskModal(null)}>
          <div
            className="enterprise-task-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Task details"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="enterprise-task-modal-close"
              onClick={() => {
                setSelectedTaskModal(null);
                setTaskEditMode(false);
                setTaskError(null);
              }}
              aria-label="Close"
            >
              ×
            </button>
            <header className="enterprise-task-modal-head">
              {taskEditMode ? (
                <input className="auth-input enterprise-task-modal-title-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              ) : (
                <h3 className="enterprise-task-modal-title">{selectedTaskModal.title}</h3>
              )}
              <div className="enterprise-task-modal-meta">
                <span className={priorityClass(selectedTaskModal.priority)}>{priorityLabel(selectedTaskModal.priority)}</span>
                <span className={statusClass(selectedTaskModal.status)}>{statusLabel(selectedTaskModal.status)}</span>
              </div>
            </header>

            <div className="enterprise-task-modal-body">
              <section className="enterprise-task-modal-left">
                {selectedTaskModal.attachmentUrl ? (
                  <section className="enterprise-task-modal-section">
                    <h4>Attachment</h4>
                    {isImageAttachment(selectedTaskModal.attachmentUrl) ? (
                      <img src={selectedTaskModal.attachmentUrl} alt="Task attachment" className="enterprise-task-modal-image" />
                    ) : (
                      <a href={selectedTaskModal.attachmentUrl} target="_blank" rel="noopener noreferrer" className="enterprise-inline-link">
                        Open attachment
                      </a>
                    )}
                  </section>
                ) : null}

                <section className="enterprise-task-modal-section">
                  <h4>Description</h4>
                  {taskEditMode ? (
                    <textarea className="auth-input create-task-textarea" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
                  ) : (
                    <div className="enterprise-task-modal-description-box">{selectedTaskModal.description?.trim() || "Add a description..."}</div>
                  )}
                </section>

                <section className="enterprise-task-modal-section">
                  <h4>Subtasks</h4>
                  {(selectedTaskModal.subtasks?.length ?? 0) > 0 ? (
                    <ul className="enterprise-task-modal-subtasks">
                      {(selectedTaskModal.subtasks as ApiSubtask[]).map((s) => (
                        <li key={s.id} className={s.completed ? "done" : ""}>
                          <span className="enterprise-task-modal-check">{s.completed ? "✓" : "○"}</span>
                          {s.title}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="enterprise-muted">No subtasks</p>
                  )}
                </section>
              </section>

              <aside className="enterprise-task-modal-right">
                <div className="enterprise-task-side-card">
                  <div className="enterprise-task-side-row">
                    <span>Status</span>
                    <strong>{statusLabel(selectedTaskModal.status)}</strong>
                  </div>
                  <div className="enterprise-task-side-row">
                    <span>Priority</span>
                    <strong>
                      {taskEditMode ? (
                        <select className="auth-input enterprise-task-inline-select" value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                          {PRIORITIES.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        priorityLabel(selectedTaskModal.priority)
                      )}
                    </strong>
                  </div>
                  <div className="enterprise-task-side-row">
                    <span>Due date</span>
                    <strong>
                      {taskEditMode ? (
                        <input
                          type="date"
                          className="auth-input enterprise-task-inline-select"
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                        />
                      ) : (
                        formatModalDate(selectedTaskModal.dueDate)
                      )}
                    </strong>
                  </div>
                  <div className="enterprise-task-side-row">
                    <span>Assignees</span>
                    <strong>{selectedTaskModal.assignments.map((a) => a.user.name ?? a.user.email ?? a.user.id).join(", ") || "—"}</strong>
                  </div>
                  <div className="enterprise-task-side-row">
                    <span>Created by</span>
                    <strong>{selectedTaskModal.creator?.name ?? "Unknown"}</strong>
                  </div>
                </div>

                <div className="enterprise-task-side-card">
                  <h4>Task details</h4>
                  <dl className="enterprise-task-modal-dl">
                    <dt>Task ID</dt>
                    <dd>{selectedTaskModal.id}</dd>
                    <dt>Created</dt>
                    <dd>{formatModalDate(selectedTaskModal.createdAt)}</dd>
                    <dt>Last updated</dt>
                    <dd>{formatModalDate(selectedTaskModal.updatedAt)}</dd>
                  </dl>
                </div>
              </aside>
            </div>
            {taskError ? <p className="auth-error">{taskError}</p> : null}
            <footer className="enterprise-task-modal-footer">
              <button
                type="button"
                className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                disabled={taskSaving}
                onClick={async () => {
                  if (!selectedTaskModal) return;
                  if (!taskEditMode) {
                    setTaskEditMode(true);
                    return;
                  }
                  setTaskSaving(true);
                  setTaskError(null);
                  try {
                    const dueIso = editDueDate ? new Date(`${editDueDate}T23:59:59`).toISOString() : null;
                    const updated = await updateCoreTeamTask(selectedTeamId, selectedTaskModal.id, {
                      title: editTitle.trim(),
                      description: editDescription.trim() || null,
                      priority: editPriority,
                      dueDate: dueIso,
                    });
                    setSelectedTaskModal(updated);
                    await refreshTeamData(selectedTeamId);
                    setTaskEditMode(false);
                  } catch (err) {
                    setTaskError(err instanceof Error ? err.message : "Could not save task.");
                  } finally {
                    setTaskSaving(false);
                  }
                }}
              >
                {taskSaving ? "Saving…" : taskEditMode ? "Save task" : "Edit task"}
              </button>
              <button
                type="button"
                className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                disabled={taskSaving}
                onClick={async () => {
                  if (!selectedTaskModal) return;
                  const isReopen = selectedTaskModal.status === "done";
                  const confirmed = window.confirm(
                    isReopen
                      ? "Reopen this task? This will move it back to pending."
                      : "Mark this task as complete?",
                  );
                  if (!confirmed) return;
                  setTaskSaving(true);
                  setTaskError(null);
                  try {
                    const nextStatus = isReopen ? "todo" : "done";
                    const updated = await updateCoreTeamTask(selectedTeamId, selectedTaskModal.id, { status: nextStatus });
                    setSelectedTaskModal(updated);
                    await refreshTeamData(selectedTeamId);
                  } catch (err) {
                    setTaskError(err instanceof Error ? err.message : "Could not update task status.");
                  } finally {
                    setTaskSaving(false);
                  }
                }}
              >
                {selectedTaskModal.status === "done" ? "Reopen task" : "Mark as complete"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      {createOpen ? (
        <div className="enterprise-task-modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <div className="enterprise-task-modal enterprise-task-create-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="enterprise-task-modal-close" onClick={() => setCreateOpen(false)} aria-label="Close">
              ×
            </button>
            <header className="enterprise-task-modal-head">
              <h3 className="enterprise-task-modal-title">Create task</h3>
              <p className="enterprise-muted">Create in dashboard without leaving this page.</p>
            </header>
            <form
              className="create-task-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setCtError(null);
                if (!ctTitle.trim()) return setCtError("Please enter a task title.");
                if (!selectedTeamId) return setCtError("Pick a workspace.");
                if (ctAssigneeIds.length === 0) return setCtError("Assign at least one teammate.");
                setCtSaving(true);
                try {
                  const dueIso = ctDueDate ? new Date(`${ctDueDate}T23:59:59`).toISOString() : null;
                  await createWebTask({
                    teamId: selectedTeamId,
                    title: ctTitle.trim(),
                    description: ctDescription.trim() || null,
                    priority: ctPriority,
                    status: ctStatus,
                    dueDate: dueIso,
                    assigneeIds: ctAssigneeIds,
                    isJoint: ctAssigneeIds.length > 1 && ctIsJoint,
                    incognito: ctIncognito,
                    subtasks: ctSubtasks.map((s) => s.trim()).filter(Boolean),
                  });
                  await refreshTeamData(selectedTeamId);
                  setCreateOpen(false);
                  resetCreateForm();
                } catch (err) {
                  setCtError(err instanceof Error ? err.message : "Could not create task.");
                } finally {
                  setCtSaving(false);
                }
              }}
            >
              {ctError ? <p className="auth-error">{ctError}</p> : null}
              <label className="auth-label" htmlFor="ct-title-inline">
                Title
              </label>
              <input id="ct-title-inline" className="auth-input" value={ctTitle} onChange={(e) => setCtTitle(e.target.value)} />
              <label className="auth-label" htmlFor="ct-desc-inline">
                Description
              </label>
              <textarea
                id="ct-desc-inline"
                className="auth-input create-task-textarea"
                value={ctDescription}
                onChange={(e) => setCtDescription(e.target.value)}
                rows={3}
                placeholder="Optional details"
              />
              <div className="create-task-row">
                <div className="create-task-field">
                  <label className="auth-label">Priority</label>
                  <select className="auth-input" value={ctPriority} onChange={(e) => setCtPriority(e.target.value)}>
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="create-task-field">
                  <label className="auth-label">Status</label>
                  <select className="auth-input" value={ctStatus} onChange={(e) => setCtStatus(e.target.value)}>
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="create-task-field">
                  <label className="auth-label">Due date</label>
                  <input className="auth-input" type="date" value={ctDueDate} onChange={(e) => setCtDueDate(e.target.value)} />
                </div>
              </div>
              <fieldset className="create-task-fieldset">
                <legend className="auth-label">Assign to</legend>
                {!createTeamDetail?.members.length ? (
                  <p className="enterprise-muted">Loading members…</p>
                ) : (
                  <ul className="create-task-assignees">
                    {createTeamDetail.members.map((m) => (
                      <li key={m.userId}>
                        <label className="create-task-assignee-label">
                          <input type="checkbox" checked={ctAssigneeIds.includes(m.user.id)} onChange={() => toggleCreateAssignee(m.user.id)} />
                          <span>{m.user.name ?? m.user.email ?? m.user.id}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              {ctAssigneeIds.length > 1 ? (
                <label className="create-task-checkbox-row">
                  <input type="checkbox" checked={ctIsJoint} onChange={(e) => setCtIsJoint(e.target.checked)} />
                  <span>Shared task for all assignees</span>
                </label>
              ) : null}
              <label className="create-task-checkbox-row">
                <input type="checkbox" checked={ctIncognito} onChange={(e) => setCtIncognito(e.target.checked)} />
                <span>Incognito</span>
              </label>
              <div className="create-task-subtasks">
                <span className="auth-label">Subtasks</span>
                <ul className="create-task-subtask-list">
                  {ctSubtasks.map((st, i) => (
                    <li key={`${i}-${st}`} className="create-task-subtask-item">
                      <span>{st}</span>
                      <button type="button" className="create-task-subtask-remove" onClick={() => setCtSubtasks((s) => s.filter((_, idx) => idx !== i))}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="create-task-subtask-add">
                  <input
                    className="auth-input"
                    value={ctNewSubtask}
                    onChange={(e) => setCtNewSubtask(e.target.value)}
                    placeholder="Add a subtask"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = ctNewSubtask.trim();
                        if (!v) return;
                        setCtSubtasks((s) => [...s, v]);
                        setCtNewSubtask("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="auth-btn-secondary create-task-add-btn"
                    onClick={() => {
                      const v = ctNewSubtask.trim();
                      if (!v) return;
                      setCtSubtasks((s) => [...s, v]);
                      setCtNewSubtask("");
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="enterprise-task-modal-footer">
                <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="enterprise-task-modal-btn enterprise-task-modal-btn-primary" disabled={ctSaving}>
                  {ctSaving ? "Creating…" : "Create task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {eventAddChoiceOpen ? (
        <div
          className="enterprise-event-choice-backdrop"
          role="presentation"
          onClick={() => setEventAddChoiceOpen(false)}
        >
          <div
            className="enterprise-event-choice-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-event-choice-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="enterprise-task-modal-close"
              onClick={() => setEventAddChoiceOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="enterprise-event-choice-handle" aria-hidden />
            <div className="enterprise-event-choice-head">
              <img src={addChoiceLogo} alt="Alenio" className="enterprise-event-choice-logo" width={32} height={32} />
              <h3 id="dashboard-event-choice-title" className="enterprise-event-choice-title">
                What would you like to add?
              </h3>
            </div>
            <button type="button" className="enterprise-event-choice-row enterprise-event-choice-row-calendar" onClick={beginNewCalendarEvent}>
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
            <button type="button" className="enterprise-event-choice-row enterprise-event-choice-row-meeting" onClick={beginNewVirtualMeeting}>
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
          <div className="enterprise-task-modal enterprise-task-create-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="enterprise-task-modal-close"
              onClick={() => {
                setEventOpen(false);
                setEvEditId(null);
                setNewEventIsVideoMeeting(false);
              }}
              aria-label="Close"
            >
              ×
            </button>
            <header className="enterprise-task-modal-head">
              <h3 className="enterprise-task-modal-title">
                {evEditId
                  ? newEventIsVideoMeeting
                    ? "Edit virtual meeting"
                    : "Edit calendar event"
                  : newEventIsVideoMeeting
                    ? "Add virtual meeting"
                    : "Add calendar event"}
              </h3>
              <p className="enterprise-muted">
                {evEditId
                  ? "Update this team event from the web dashboard."
                  : newEventIsVideoMeeting
                    ? "Schedule a timed meeting your team can join from the dashboard."
                    : "Create an all-day or multi-day entry on the team calendar."}
              </p>
            </header>
            <form
              className="create-task-form"
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
                    ? new Date(`${evStart}T00:00:00`).toISOString()
                    : new Date(evStart).toISOString();
                  const endIso =
                    evEnd && evEnd.trim()
                      ? useAllDay
                        ? new Date(`${evEnd}T23:59:59`).toISOString()
                        : new Date(evEnd).toISOString()
                      : null;
                  if (evEditId) {
                    await updateWebTeamEvent(selectedTeamId, evEditId, {
                      title: evTitle.trim(),
                      description: evDescription.trim() || null,
                      startDate: startIso,
                      endDate: endIso,
                      allDay: useAllDay,
                      color: evColor,
                      isVideoMeeting,
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
                      isHidden: false,
                    });
                  }
                  await refreshTeamData(selectedTeamId);
                  await refreshUpcomingMeetings();
                  setEventOpen(false);
                  setEvEditId(null);
                  setNewEventIsVideoMeeting(false);
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
              <input type="hidden" name="eventIsVideoMeeting" value={newEventIsVideoMeeting ? "1" : "0"} />
              {evError ? <p className="auth-error">{evError}</p> : null}
              <label className="auth-label">Title</label>
              <input className="auth-input" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} />
              <label className="auth-label">Description</label>
              <textarea className="auth-input create-task-textarea" value={evDescription} onChange={(e) => setEvDescription(e.target.value)} rows={3} />
              {!newEventIsVideoMeeting ? (
                <label className="create-task-checkbox-row">
                  <input type="checkbox" checked={evAllDay} onChange={(e) => setEvAllDay(e.target.checked)} />
                  <span>All day</span>
                </label>
              ) : null}
              <div className="create-task-row">
                <div className="create-task-field">
                  <label className="auth-label">{newEventIsVideoMeeting || !evAllDay ? "Starts" : "Start date"}</label>
                  <input
                    type={newEventIsVideoMeeting || !evAllDay ? "datetime-local" : "date"}
                    className="auth-input"
                    value={evStart}
                    onChange={(e) => setEvStart(e.target.value)}
                  />
                </div>
                <div className="create-task-field">
                  <label className="auth-label">{newEventIsVideoMeeting || !evAllDay ? "Ends (optional)" : "End date (optional)"}</label>
                  <input
                    type={newEventIsVideoMeeting || !evAllDay ? "datetime-local" : "date"}
                    className="auth-input"
                    value={evEnd}
                    onChange={(e) => setEvEnd(e.target.value)}
                  />
                </div>
                <div className="create-task-field">
                  <label className="auth-label">Color</label>
                  <input type="color" className="auth-input" value={evColor} onChange={(e) => setEvColor(e.target.value)} />
                </div>
              </div>
              <div className="enterprise-task-modal-footer">
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                  onClick={() => {
                    setEventOpen(false);
                    setEvEditId(null);
                    setNewEventIsVideoMeeting(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="enterprise-task-modal-btn enterprise-task-modal-btn-primary" disabled={evSaving}>
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
              </div>
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
    });
  }
  return [...byId.values()];
}
