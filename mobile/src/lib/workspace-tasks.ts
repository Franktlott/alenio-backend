import type { Task } from "@/lib/types";

export function taskCreatorId(task: Pick<Task, "creatorId" | "creator">): string | undefined {
  return task.creatorId ?? task.creator?.id;
}

/** Tasks assigned to me, or created by me with no assignee. */
export function isMyWorkspaceTask(task: Task, userId: string): boolean {
  if (task.assignments.some((assignment) => assignment.userId === userId)) return true;
  return taskCreatorId(task) === userId && task.assignments.length === 0;
}
