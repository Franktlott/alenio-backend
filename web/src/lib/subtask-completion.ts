export function isSubtaskSharedComplete(subtask: {
  completed?: boolean | null;
  completions?: Array<{ userId: string }> | null;
}): boolean {
  if (subtask.completed) return true;
  return (subtask.completions?.length ?? 0) > 0;
}

export function incompleteSubtasks<
  T extends {
    completed?: boolean | null;
    completions?: Array<{ userId: string }> | null;
  },
>(subtasks: readonly T[] | null | undefined): T[] {
  return (subtasks ?? []).filter((subtask) => !isSubtaskSharedComplete(subtask));
}

export function subtaskCompleter<
  T extends { userId: string; user?: { name?: string | null } | null },
>(subtask: { completions?: T[] | null }): T | null {
  return subtask.completions?.[0] ?? null;
}

export function completedByOtherMember(
  subtask: {
    completed?: boolean | null;
    completions?: Array<{ userId: string; user?: { name?: string | null } | null }> | null;
  },
  currentUserId: string | null | undefined,
): { userId: string; name: string } | null {
  if (!isSubtaskSharedComplete(subtask)) return null;
  const completer = subtaskCompleter(subtask);
  if (!completer || !currentUserId || completer.userId === currentUserId) return null;
  return {
    userId: completer.userId,
    name: completer.user?.name?.trim() || "A teammate",
  };
}
