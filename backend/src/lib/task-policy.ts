import { canManageWorkspaceTasks, type WorkspaceRole } from "./workspace-role-policy";
import { isTaskKind, type TaskClassification, type TaskKind } from "./task-kind";

export const TASK_LEADER_REQUIRED = "TASK_LEADER_REQUIRED";
export const TASK_KIND_INVALID = "TASK_KIND_INVALID";
export const TASK_ASSIGNEE_INVALID = "TASK_ASSIGNEE_INVALID";
export const REMINDER_CREATOR_REQUIRED = "REMINDER_CREATOR_REQUIRED";
export const REMINDER_PRIVATE = "REMINDER_PRIVATE";
export const REMINDER_ASSIGNMENT_LOCKED = "REMINDER_ASSIGNMENT_LOCKED";

export type TaskPolicyErrorCode =
  | typeof TASK_LEADER_REQUIRED
  | typeof TASK_KIND_INVALID
  | typeof TASK_ASSIGNEE_INVALID;

export type TaskCreationPolicy =
  | {
      ok: true;
      classification: TaskClassification;
      assigneeIds: string[];
      incognito: boolean;
      isJoint: boolean;
    }
  | { ok: false; code: TaskPolicyErrorCode; message: string };

export function resolveTaskCreationPolicy(input: {
  requestedKind?: unknown;
  creatorId: string;
  creatorRole: WorkspaceRole;
  requestedAssigneeIds?: unknown;
  requestedIncognito?: unknown;
  requestedIsJoint?: unknown;
}): TaskCreationPolicy {
  const kind = input.requestedKind ?? "workspace_task";
  if (!isTaskKind(kind)) {
    return { ok: false, code: TASK_KIND_INVALID, message: "Task kind is invalid" };
  }

  if (kind === "reminder") {
    return {
      ok: true,
      classification: { kind, momentumEligible: false },
      assigneeIds: [input.creatorId],
      incognito: true,
      isJoint: false,
    };
  }

  if (!canManageWorkspaceTasks(input.creatorRole)) {
    return {
      ok: false,
      code: TASK_LEADER_REQUIRED,
      message: "Only workspace owners and team leaders can create workspace tasks",
    };
  }

  return {
    ok: true,
    classification: { kind, momentumEligible: true },
    assigneeIds: normalizeAssigneeIds(input.requestedAssigneeIds),
    incognito: input.requestedIncognito === true,
    isJoint: input.requestedIsJoint === true,
  };
}

export function normalizeAssigneeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

export function canAccessTask(
  task: { kind: string; creatorId: string },
  viewerUserId: string,
): boolean {
  return task.kind !== "reminder" || task.creatorId === viewerUserId;
}

export function canMutateTask(
  task: { kind: string; creatorId: string },
  actorUserId: string,
): boolean {
  return task.kind !== "reminder" || task.creatorId === actorUserId;
}

/** Prisma-compatible visibility predicate for personal task surfaces. */
export function taskVisibilityWhere(viewerUserId: string) {
  return {
    OR: [
      { kind: "workspace_task" as TaskKind },
      { kind: "reminder" as TaskKind, creatorId: viewerUserId },
    ],
  };
}

/** Shared workspace/member reporting must never include private reminders. */
export const workspaceTaskWhere = Object.freeze({
  kind: "workspace_task" as TaskKind,
});

export function workspaceTaskClassificationForRole(role: WorkspaceRole): TaskClassification {
  if (!canManageWorkspaceTasks(role)) {
    throw new Error("Only workspace owners and team leaders can create workspace tasks");
  }
  return {
    kind: "workspace_task",
    momentumEligible: true,
  };
}
