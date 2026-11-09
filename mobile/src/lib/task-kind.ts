import type { Task, TaskKind } from "@/lib/types";
import { isLeaderRole } from "@/lib/member-identity";

export type TaskCreationPresentation = {
  kind: TaskKind;
  canChooseKind: boolean;
  noun: "Task" | "Reminder";
  newTitle: "New Task" | "New Reminder";
  createLabel: "Create Task" | "Create Reminder";
  titlePlaceholder: "Task title..." | "Reminder title...";
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
  const reminder = kind === "reminder";

  return {
    kind,
    canChooseKind,
    noun: reminder ? "Reminder" : "Task",
    newTitle: reminder ? "New Reminder" : "New Task",
    createLabel: reminder ? "Create Reminder" : "Create Task",
    titlePlaceholder: reminder ? "Reminder title..." : "Task title...",
  };
}

export function isReminderTask(task: Pick<Task, "kind">): boolean {
  return task.kind === "reminder";
}

/**
 * Owners can complete any workspace task. Warn first when it is not theirs,
 * including a task with no assignee. Reminders and reopening stay quiet.
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

/** Add the viewer's private reminders to a workspace task list without duplicating rows. */
export function mergeViewerReminders(tasks: Task[], reminders: Task[]): Task[] {
  const seen = new Set(tasks.map((task) => task.id));
  const extras = reminders.filter((task) => isReminderTask(task) && !seen.has(task.id));
  return extras.length === 0 ? tasks : [...tasks, ...extras];
}
