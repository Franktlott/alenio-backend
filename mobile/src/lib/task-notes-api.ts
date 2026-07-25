import { api } from "@/lib/api/api";
import type { TaskNote } from "@/lib/types";

export const taskNotesQueryKey = (teamId: string, taskId: string) =>
  ["task-notes", teamId, taskId] as const;

function notesPath(teamId: string, taskId: string): string {
  return `/api/teams/${encodeURIComponent(teamId)}/tasks/${encodeURIComponent(taskId)}/notes`;
}

export function fetchTaskNotes(teamId: string, taskId: string) {
  return api.get<TaskNote[]>(notesPath(teamId, taskId));
}

export function createTaskNote(teamId: string, taskId: string, body: string) {
  return api.post<TaskNote>(notesPath(teamId, taskId), { body });
}

export function updateTaskNote(teamId: string, taskId: string, noteId: string, body: string) {
  return api.patch<TaskNote>(
    `${notesPath(teamId, taskId)}/${encodeURIComponent(noteId)}`,
    { body },
  );
}

export function deleteTaskNote(teamId: string, taskId: string, noteId: string) {
  return api.delete<void>(`${notesPath(teamId, taskId)}/${encodeURIComponent(noteId)}`);
}
