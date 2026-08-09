import type { Task, TeamMember } from "@/lib/types";
import type {
  AssignedToFilter,
  DueDateFilter,
  PriorityFilter,
  SortFilter,
  TaskStatusTab,
  WorkspaceFiltersState,
} from "./workspace-types";

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function taskMatchesCalendarMonth(task: Task, year: number, month: number): boolean {
  if (!task.dueDate) {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth();
  }
  const due = new Date(task.dueDate);
  return due.getFullYear() === year && due.getMonth() === month;
}

export function assignedToLabel(value: AssignedToFilter): string {
  if (value === "me") return "Me";
  if (value === "direct_reports") return "My Direct Reports";
  if (value === "entire_team") return "Entire Team";
  if (value === "unassigned") return "Unassigned";
  return value.memberName;
}

export function dueDateLabel(value: DueDateFilter, selectedDayIso: string | null): string {
  if (value === "calendar_day") {
    if (!selectedDayIso) return "Today";
    const todayIso = toLocalIso(new Date());
    if (selectedDayIso === todayIso) return "Today";
    const d = new Date(selectedDayIso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (value === "today") return "Today";
  if (value === "tomorrow") return "Tomorrow";
  if (value === "this_week") return "This Week";
  if (value === "overdue") return "Overdue";
  return "All";
}

export function priorityLabel(value: PriorityFilter): string {
  if (value === "all") return "All";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function sortLabel(value: SortFilter): string {
  if (value === "due") return "Due Date";
  if (value === "priority") return "Priority";
  if (value === "newest") return "Newest";
  if (value === "oldest") return "Oldest";
  return "Alphabetical";
}

export function isDefaultAssignedTo(value: AssignedToFilter): boolean {
  return value === "me";
}

export function isDefaultDueDate(value: DueDateFilter, _selectedDayIso: string | null): boolean {
  return value === "all";
}

export function isDefaultPriority(value: PriorityFilter): boolean {
  return value === "all";
}

export function isDefaultSort(value: SortFilter, statusTab: TaskStatusTab): boolean {
  return statusTab === "completed" || statusTab === "archived"
    ? value === "newest"
    : value === "due";
}

export function taskStatusLabel(value: TaskStatusTab): string {
  if (value === "completed") return "Completed Tasks";
  if (value === "archived") return "Archived Tasks";
  if (value === "all") return "All Tasks";
  return "Active Tasks";
}

export function taskFilterSummary(
  filters: WorkspaceFiltersState,
  selectedDayIso: string | null,
): string {
  const base =
    filters.statusTab === "completed"
      ? "Completed"
      : filters.statusTab === "archived"
        ? "Archived"
        : filters.statusTab === "all"
          ? "All Tasks"
          : "Active Tasks";
  if (typeof filters.assignedTo === "object") {
    return `Assigned to ${filters.assignedTo.memberName}`;
  }
  const due = dueDateLabel(filters.dueDate, selectedDayIso);
  if (filters.dueDate !== "all") return `${base} • ${due}`;
  if (filters.priority !== "all") {
    return `${base} • ${priorityLabel(filters.priority)} Priority`;
  }
  return base;
}

/**
 * Badge count for the Filters control. Assigned to and Sort are excluded
 * because each already shows its current value in its own pill.
 */
export function countActiveTaskFilters(
  filters: Pick<WorkspaceFiltersState, "dueDate" | "priority">,
  selectedDayIso: string | null,
): number {
  let count = 0;
  if (!isDefaultDueDate(filters.dueDate, selectedDayIso)) count += 1;
  if (!isDefaultPriority(filters.priority)) count += 1;
  return count;
}

export function buildWorkspaceTasksPath(
  teamId: string,
  opts: {
    statusTab: TaskStatusTab;
    calendarYear: number;
    calendarMonth: number;
    assignedTo: AssignedToFilter;
    cursor?: string;
    /** Archive search query — required for archived results. */
    search?: string;
  },
): string {
  // Active: open tasks. Completed: recent done (not archived). Archived: search-only.
  const params = new URLSearchParams({
    limit: opts.statusTab === "active" ? "500" : "200",
  });
  if (opts.statusTab === "all") {
    // No status scope: return the recent active/completed set allowed by the API.
  } else if (opts.statusTab === "completed") {
    params.set("completedYear", String(opts.calendarYear));
    params.set("completedMonth", String(opts.calendarMonth));
    params.set("status", "done");
  } else if (opts.statusTab === "archived") {
    params.set("archived", "true");
    if (opts.search?.trim()) {
      params.set("q", opts.search.trim());
    }
  } else {
    params.set("activeOnly", "true");
  }

  if (opts.assignedTo === "me") {
    params.set("myTasks", "true");
  } else if (typeof opts.assignedTo === "object") {
    params.set("assigneeId", opts.assignedTo.memberId);
  }

  if (opts.cursor) params.set("cursor", opts.cursor);
  return `/api/teams/${teamId}/tasks?${params.toString()}`;
}

export function assignedToQueryKey(assignedTo: AssignedToFilter): string {
  if (assignedTo === "me") return "me";
  if (assignedTo === "entire_team") return "entire_team";
  if (assignedTo === "direct_reports") return "direct_reports";
  if (assignedTo === "unassigned") return "unassigned";
  return `member:${assignedTo.memberId}`;
}

export function filterTasksClientSide(
  tasks: Task[],
  opts: {
    filters: WorkspaceFiltersState;
    currentUserId: string | null;
    members: TeamMember[];
    selectedDay: string | null;
    calendarYear: number;
    calendarMonth: number;
    isLeader: boolean;
  },
): Task[] {
  const { filters, currentUserId, members, selectedDay, calendarYear, calendarMonth, isLeader } = opts;
  let result = tasks;

  if (filters.statusTab === "all") {
    result = result.filter((t) => !t.archivedAt);
  } else if (filters.statusTab === "active") {
    result = result.filter((t) => t.status !== "done");
  } else if (filters.statusTab === "archived") {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    result = result.filter((t) => {
      if (t.status !== "done") return false;
      if (t.archivedAt) return true;
      if (!t.completedAt) return false;
      return new Date(t.completedAt).getTime() <= cutoff;
    });
  } else {
    // Completed: recent done only (last 30 days, not archived)
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    result = result.filter((t) => {
      if (t.status !== "done" || t.archivedAt) return false;
      if (!t.completedAt) return true;
      return new Date(t.completedAt).getTime() > cutoff;
    });
  }

  if (filters.assignedTo === "entire_team" || filters.assignedTo === "unassigned" || filters.assignedTo === "direct_reports") {
    // server returns all team tasks for these modes
  } else if (filters.assignedTo === "me") {
    // server already scopes myTasks
  }

  if (filters.assignedTo === "unassigned") {
    result = result.filter((t) => (t.assignments ?? []).length === 0);
  }

  if (filters.assignedTo === "direct_reports" && isLeader) {
    const reportIds = new Set(
      members.filter((m) => m.role === "member" && m.userId !== currentUserId).map((m) => m.userId),
    );
    result = result.filter((t) => (t.assignments ?? []).some((a) => reportIds.has(a.userId)));
  }

  if (filters.priority !== "all") {
    result = result.filter((t) =>
      filters.priority === "high"
        ? t.priority === "high" || t.priority === "urgent"
        : t.priority === filters.priority,
    );
  }

  const todayIso = toLocalIso(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toLocalIso(tomorrow);
  const effectiveDay =
    filters.dueDate === "calendar_day"
      ? selectedDay ?? todayIso
      : filters.dueDate === "today"
        ? todayIso
        : filters.dueDate === "tomorrow"
          ? tomorrowIso
        : null;

  if (filters.dueDate === "overdue" && filters.statusTab === "active") {
    const todayStart = startOfDay(new Date());
    result = result.filter((t) => t.dueDate && startOfDay(new Date(t.dueDate)) < todayStart);
  } else if (filters.dueDate === "this_week") {
    const weekStart = startOfWeekSunday(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    result = result.filter((t) => {
      if (!t.dueDate) return false;
      const due = startOfDay(new Date(t.dueDate));
      return due >= weekStart && due < weekEnd;
    });
  } else if (effectiveDay) {
    result = result.filter((t) => {
      if (filters.statusTab === "completed" || filters.statusTab === "archived") {
        return t.completedAt ? toLocalIso(new Date(t.completedAt)) === effectiveDay : false;
      }
      if (!t.dueDate) return false;
      return toLocalIso(new Date(t.dueDate)) === effectiveDay;
    });
  } else if (!selectedDay && filters.dueDate === "calendar_day") {
    result = result.filter((t) => taskMatchesCalendarMonth(t, calendarYear, calendarMonth));
  }

  return result.slice().sort((a, b) => sortTasks(a, b, filters.sort));
}

function sortTasks(a: Task, b: Task, sort: SortFilter): number {
  if (sort === "priority") {
    const order = { urgent: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
  }
  if (sort === "alphabetical") return a.title.localeCompare(b.title);
  if (sort === "newest" || sort === "oldest") {
    const aDate = new Date(a.createdAt ?? a.completedAt ?? 0).getTime();
    const bDate = new Date(b.createdAt ?? b.completedAt ?? 0).getTime();
    return sort === "newest" ? bDate - aDate : aDate - bDate;
  }
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
}

export type TaskWeekGroup = {
  key: string;
  label: string;
  sortKey: number;
  tasks: Task[];
};

/** Sunday-start week, matching the workspace calendar. */
export function startOfWeekSunday(d: Date): Date {
  const day = startOfDay(d);
  day.setDate(day.getDate() - day.getDay());
  return day;
}

export function formatWeekRangeLabel(weekStart: Date, now = new Date()): string {
  const thisWeek = startOfWeekSunday(now).getTime();
  const start = weekStart.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (start === thisWeek) return "This week";
  if (start === thisWeek + 7 * dayMs) return "Next week";
  if (start === thisWeek - 7 * dayMs) return "Last week";

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${startLabel} – ${weekEnd.getDate()}`;
  }
  return `${startLabel} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** Group already-sorted tasks into week sections (due date, or completed date). */
export function groupTasksByWeek(
  tasks: Task[],
  mode: "due" | "completed" = "due",
): TaskWeekGroup[] {
  const map = new Map<string, TaskWeekGroup>();
  for (const task of tasks) {
    const raw = mode === "completed" ? task.completedAt : task.dueDate;
    let key: string;
    let label: string;
    let sortKey: number;
    if (!raw) {
      key = "none";
      label = mode === "completed" ? "No completion date" : "No due date";
      sortKey = mode === "completed" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    } else {
      const weekStart = startOfWeekSunday(new Date(raw));
      key = toLocalIso(weekStart);
      label = formatWeekRangeLabel(weekStart);
      sortKey = weekStart.getTime();
    }
    const existing = map.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      map.set(key, { key, label, sortKey, tasks: [task] });
    }
  }

  const groups = [...map.values()];
  groups.sort((a, b) => (mode === "completed" ? b.sortKey - a.sortKey : a.sortKey - b.sortKey));
  return groups;
}
