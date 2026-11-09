export type TaskKind = "workspace_task" | "reminder";

export function canCreateWorkspaceTask(role: string | null | undefined): boolean {
  return role === "owner" || role === "team_leader";
}

export function resolveCreateTaskKind(
  role: string | null | undefined,
  requestedKind?: TaskKind,
): TaskKind {
  if (!canCreateWorkspaceTask(role)) return "reminder";
  return requestedKind ?? "workspace_task";
}

export function isPrivateReminder(task: { kind?: string | null }): boolean {
  return task.kind === "reminder";
}

export function taskNoun(task: { kind?: string | null }): "task" | "reminder" {
  return isPrivateReminder(task) ? "reminder" : "task";
}
