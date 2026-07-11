import type { TaskPriority } from "@/lib/types";

export type TaskStatusTab = "active" | "completed";

export type AssignedToFilter =
  | "me"
  | "direct_reports"
  | "entire_team"
  | "unassigned"
  | { memberId: string; memberName: string };

export type DueDateFilter = "calendar_day" | "today" | "all" | "overdue";

export type PriorityFilter = "all" | TaskPriority;

export type SortFilter = "due" | "priority" | "completed";

export interface WorkspaceFiltersState {
  statusTab: TaskStatusTab;
  assignedTo: AssignedToFilter;
  dueDate: DueDateFilter;
  priority: PriorityFilter;
  sort: SortFilter;
}

export const DEFAULT_WORKSPACE_FILTERS: WorkspaceFiltersState = {
  statusTab: "active",
  assignedTo: "me",
  dueDate: "all",
  priority: "all",
  sort: "due",
};

export type FilterPicker = "assignedTo" | "dueDate" | "priority" | "sort" | null;
