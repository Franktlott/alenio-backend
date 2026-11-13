import type { Task, TaskKind } from "@/lib/types";
import { isLeaderRole } from "@/lib/member-identity";

export type TaskCreationPresentation = {
  kind: TaskKind;
  canChooseKind: boolean;
  /** Always "Task" in the UI — private items stay kind=reminder under the hood. */
  noun: "Task";
  newTitle: "New Task";
  createLabel: "Create Task";
  titlePlaceholder: "Task title...";
  /** Shown when the task is private to the viewer. */
  privacyHint: string | null;
  audienceLabel: "Team" | "Just for me";
  audienceHint: string;
};

export function parseTaskKind(
  value?: string | string[] | null,
): TaskKind | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "workspace_task" || candidate === "reminder"
    ? candidate
    : undefined;
}

export function resolveTaskCreationPresentation(
  role?: string | null,
  requestedKind?: TaskKind,
): TaskCreationPresentation {
  const canChooseKind = isLeaderRole(role);
  const kind: TaskKind =
    role == null
      ? (requestedKind ?? "workspace_task")
      : canChooseKind
        ? (requestedKind ?? "workspace_task")
        : "reminder";
  const privateTask = kind === "reminder";

  return {
    kind,
    canChooseKind,
    noun: "Task",
    newTitle: "New Task",
    createLabel: "Create Task",
    titlePlaceholder: "Task title...",
    privacyHint: privateTask ? "Only you can see this" : null,
    audienceLabel: privateTask ? "Just for me" : "Team",
    audienceHint: privateTask
      ? "Private to you"
      : "Assigned, with a due date",
  };
}

export function isReminderTask(task: Pick<Task, "kind">): boolean {
  return task.kind === "reminder";
}

/**
 * Owners can complete any workspace task. Warn first when it is not theirs,
 * including a task with no assignee. Private tasks and reopening stay quiet.
 */
export function ownerCompletingUnassignedTask(
  role: string | null | undefined,
  userId: string | null | undefined,
  task: {
    kind?: string | null;
    status?: string | null;
    assignments?: { userId: string }[] | null;
  },
): boolean {
  if (role !== "owner" || !userId) return false;
  if (task.status === "done" || task.kind === "reminder") return false;
  return !(task.assignments ?? []).some((assignment) => assignment.userId === userId);
}

/** Defensive client-side boundary for workspace-wide summaries and team surfaces. */
export function workspaceTasksOnly(tasks: Task[]): Task[] {
  return tasks.filter((task) => !isReminderTask(task));
}

/** Add the viewer's private tasks to a workspace task list without duplicating rows. */
export function mergeViewerReminders(tasks: Task[], reminders: Task[]): Task[] {
  const seen = new Set(tasks.map((task) => task.id));
  const extras = reminders.filter((task) => isReminderTask(task) && !seen.has(task.id));
  return extras.length === 0 ? tasks : [...tasks, ...extras];
}
