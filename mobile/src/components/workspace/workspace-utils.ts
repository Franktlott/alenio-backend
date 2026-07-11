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
  return "Completed";
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
  return statusTab === "completed" ? value === "completed" : value === "due";
}

export function buildWorkspaceTasksPath(
  teamId: string,
  opts: {
    statusTab: TaskStatusTab;
    calendarYear: number;
    calendarMonth: number;
    assignedTo: AssignedToFilter;
    cursor?: string;
  },
): string {
  const params = new URLSearchParams({ limit: "200" });
  if (opts.statusTab === "completed") {
    params.set("completedYear", String(opts.calendarYear));
    params.set("completedMonth", String(opts.calendarMonth));
    params.set("status", "done");
  } else {
    params.set("activeOnly", "true");
    params.set("dueYear", String(opts.calendarYear));
    params.set("dueMonth", String(opts.calendarMonth));
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

  if (filters.statusTab === "active") {
    result = result.filter((t) => t.status !== "done");
  } else {
    result = result.filter((t) => t.status === "done");
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
    result = result.filter((t) => t.priority === filters.priority);
  }

  const todayIso = toLocalIso(new Date());
  const effectiveDay =
    filters.dueDate === "calendar_day"
      ? selectedDay ?? todayIso
      : filters.dueDate === "today"
        ? todayIso
        : null;

  if (filters.dueDate === "overdue" && filters.statusTab === "active") {
    const todayStart = startOfDay(new Date());
    result = result.filter((t) => t.dueDate && startOfDay(new Date(t.dueDate)) < todayStart);
  } else if (effectiveDay) {
    result = result.filter((t) => {
      if (filters.statusTab === "completed") {
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
  if (sort === "completed") {
    const aDate = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bDate = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return bDate - aDate;
  }
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
}
