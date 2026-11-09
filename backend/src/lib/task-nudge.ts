import { canManageWorkspaceTasks } from "./workspace-role-policy";

/** A leader can nudge the same person about the same task at most once in this window. */
export const TASK_NUDGE_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export type TaskNudgeTask = {
  kind: string;
  status: string;
  archivedAt: Date | null;
  assigneeIds: string[];
};

export type TaskNudgeCheck =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 429; code: string; message: string };

export function checkTaskNudge(input: {
  actorUserId: string;
  actorRole: string;
  targetUserId: string;
  task: TaskNudgeTask;
  lastNudgedAt: number | undefined;
  now: number;
}): TaskNudgeCheck {
  const { actorUserId, actorRole, targetUserId, task, lastNudgedAt, now } = input;
  if (!canManageWorkspaceTasks(actorRole)) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "Only owners and team leaders can send nudges." };
  }
  if (task.kind !== "workspace_task") {
    return { ok: false, status: 400, code: "NUDGE_NOT_ALLOWED", message: "Private reminders can't be nudged." };
  }
  if (task.status === "done" || task.archivedAt) {
    return { ok: false, status: 400, code: "TASK_COMPLETED", message: "This task is already done." };
  }
  if (targetUserId === actorUserId) {
    return { ok: false, status: 400, code: "NUDGE_SELF", message: "You can't nudge yourself." };
  }
  if (!task.assigneeIds.includes(targetUserId)) {
    return { ok: false, status: 400, code: "NOT_ASSIGNED", message: "That person isn't assigned to this task." };
  }
  if (lastNudgedAt !== undefined && now - lastNudgedAt < TASK_NUDGE_COOLDOWN_MS) {
    return {
      ok: false,
      status: 429,
      code: "NUDGE_COOLDOWN",
      message: "Already nudged recently. You can nudge again in a few hours.",
    };
  }
  return { ok: true };
}

export function taskNudgeBody(actorName: string | null | undefined, taskTitle: string, dueDate: Date | null, now: Date): string {
  const who = actorName?.trim() || "Your team leader";
  const late = dueDate && dueDate.getTime() < now.getTime();
  return late ? `${who} is checking in on an overdue task: ${taskTitle}` : `${who} sent a reminder: ${taskTitle}`;
}

const lastNudges = new Map<string, number>();

export function taskNudgeKey(taskId: string, userId: string): string {
  return `${taskId}:${userId}`;
}

export function getLastTaskNudge(taskId: string, userId: string): number | undefined {
  return lastNudges.get(taskNudgeKey(taskId, userId));
}

export function recordTaskNudge(taskId: string, userId: string, at: number): void {
  if (lastNudges.size > 5000) {
    for (const [key, time] of lastNudges) {
      if (at - time >= TASK_NUDGE_COOLDOWN_MS) lastNudges.delete(key);
    }
  }
  lastNudges.set(taskNudgeKey(taskId, userId), at);
}
