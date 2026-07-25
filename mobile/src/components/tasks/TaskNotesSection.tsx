import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react-native";
import { toast } from "burnt";
import { AlenioBottomSheet, alenioSheetStyles } from "@/components/AlenioBottomSheet";
import {
  createTaskNote,
  deleteTaskNote,
  fetchTaskNotes,
  taskNotesQueryKey,
  updateTaskNote,
} from "@/lib/task-notes-api";
import type { TaskNote } from "@/lib/types";

type Props = {
  teamId: string;
  taskId: string;
  isJoint: boolean;
  currentUserId: string | null;
  canWrite: boolean;
  canModerate: boolean;
};

function formatNoteTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function authorName(note: TaskNote): string {
  return note.createdBy.name?.trim() || note.createdBy.email || "Team member";
}

export function TaskNotesSection({
  teamId,
  taskId,
  isJoint,
  currentUserId,
  canWrite,
  canModerate,
}: Props) {
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<TaskNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskNote | null>(null);
  const [draft, setDraft] = useState("");

  const notesQuery = useQuery({
    queryKey: taskNotesQueryKey(teamId, taskId),
    queryFn: () => fetchTaskNotes(teamId, taskId),
    enabled: Boolean(teamId && taskId),
  });

  const refreshNotes = () =>
    queryClient.invalidateQueries({ queryKey: taskNotesQueryKey(teamId, taskId) });

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = draft.trim();
      return editingNote
        ? updateTaskNote(teamId, taskId, editingNote.id, body)
        : createTaskNote(teamId, taskId, body);
    },
    onSuccess: () => {
      void refreshNotes();
      setComposerOpen(false);
      setEditingNote(null);
      setDraft("");
    },
    onError: (error: Error) => toast({ title: error.message, preset: "error" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteTaskNote(teamId, taskId, noteId),
    onSuccess: () => {
      void refreshNotes();
      setDeleteTarget(null);
    },
    onError: (error: Error) => toast({ title: error.message, preset: "error" }),
  });

  const openAdd = () => {
    setEditingNote(null);
    setDraft("");
    setComposerOpen(true);
  };

  const openEdit = (note: TaskNote) => {
    setEditingNote(note);
    setDraft(note.body);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    if (saveMutation.isPending) return;
    setComposerOpen(false);
    setEditingNote(null);
    setDraft("");
  };

  const notes = notesQuery.data ?? [];

  return (
    <View className="mb-4" testID="task-notes-section">
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <MessageSquareText size={16} color="#64748B" />
          <Text className="text-sm font-semibold text-slate-500">
            {isJoint ? "Team notes" : "Notes"}
          </Text>
          {notes.length > 0 ? (
            <View className="min-w-5 items-center rounded-full bg-indigo-50 px-1.5 py-0.5">
              <Text className="text-[10px] font-bold text-indigo-600">{notes.length}</Text>
            </View>
          ) : null}
        </View>
        {canWrite ? (
          <Pressable
            onPress={openAdd}
            className="flex-row items-center rounded-full bg-indigo-50 px-3 py-1.5"
            style={{ gap: 4 }}
            accessibilityRole="button"
            testID="add-task-note-button"
          >
            <Plus size={13} color="#4361EE" strokeWidth={2.5} />
            <Text className="text-xs font-semibold text-indigo-600">Add note</Text>
          </Pressable>
        ) : null}
      </View>

      {notesQuery.isLoading ? (
        <View className="items-center rounded-xl border border-slate-200 bg-slate-50 py-5" testID="task-notes-loading">
          <ActivityIndicator size="small" color="#4361EE" />
        </View>
      ) : notesQuery.isError ? (
        <Pressable
          onPress={() => notesQuery.refetch()}
          className="rounded-xl border border-red-100 bg-red-50 px-3 py-3"
          testID="task-notes-error"
        >
          <Text className="text-xs text-red-600">
            Notes could not load
            {notesQuery.error instanceof Error ? `: ${notesQuery.error.message}` : "."} Tap to try again.
          </Text>
        </Pressable>
      ) : notes.length === 0 ? (
        <View className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4" testID="task-notes-empty">
          <Text className="text-center text-xs text-slate-400">
            {canWrite
              ? isJoint
                ? "Share an update with everyone assigned to this task."
                : "Add context, progress, or a handoff note."
              : "No notes yet."}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {notes.map((note) => {
            const canManage = canModerate || note.createdById === currentUserId;
            const name = authorName(note);
            return (
              <View
                key={note.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                testID={`task-note-${note.id}`}
              >
                <View className="mb-2 flex-row items-center">
                  <View className="mr-2 h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-indigo-600">
                    {note.createdBy.image ? (
                      <Image
                        source={{ uri: note.createdBy.image }}
                        style={{ width: 28, height: 28 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text className="text-[11px] font-bold text-white">
                        {name[0]?.toUpperCase() ?? "?"}
                      </Text>
                    )}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-xs font-semibold text-slate-800" numberOfLines={1}>
                      {name}
                      {note.createdById === currentUserId ? " (you)" : ""}
                    </Text>
                    <Text className="text-[10px] text-slate-400">
                      {formatNoteTime(note.createdAt)}
                      {note.updatedAt !== note.createdAt ? " · edited" : ""}
                    </Text>
                  </View>
                  {canManage ? (
                    <View className="flex-row" style={{ gap: 4 }}>
                      <Pressable
                        onPress={() => openEdit(note)}
                        className="h-7 w-7 items-center justify-center rounded-full bg-white"
                        accessibilityRole="button"
                        accessibilityLabel="Edit note"
                        testID={`edit-task-note-${note.id}`}
                      >
                        <Pencil size={13} color="#64748B" />
                      </Pressable>
                      <Pressable
                        onPress={() => setDeleteTarget(note)}
                        className="h-7 w-7 items-center justify-center rounded-full bg-white"
                        accessibilityRole="button"
                        accessibilityLabel="Delete note"
                        testID={`delete-task-note-${note.id}`}
                      >
                        <Trash2 size={13} color="#EF4444" />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <Text className="text-sm leading-5 text-slate-700">{note.body}</Text>
              </View>
            );
          })}
        </View>
      )}

      <AlenioBottomSheet
        visible={composerOpen}
        title={editingNote ? "Edit task note" : isJoint ? "Add team note" : "Add task note"}
        subtitle={isJoint ? "Everyone assigned to this task can see this note." : "Keep task context and progress in one place."}
        onClose={closeComposer}
        showCloseButton
        testID="task-note-composer"
        footer={
          <View style={{ gap: 6 }}>
            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={!draft.trim() || saveMutation.isPending}
              style={[
                alenioSheetStyles.primaryButton,
                !draft.trim() || saveMutation.isPending ? alenioSheetStyles.primaryButtonDisabled : null,
              ]}
              testID="save-task-note-button"
            >
              {saveMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  {editingNote ? "Save changes" : "Add note"}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={alenioSheetStyles.fieldLabel}>Note</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Share an update, blocker, or handoff..."
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={5000}
          textAlignVertical="top"
          style={[alenioSheetStyles.fieldInput, { minHeight: 110, paddingTop: 10 }]}
          autoFocus
          testID="task-note-input"
        />
        <Text className="text-right text-[10px] text-slate-400">{draft.length}/5000</Text>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={deleteTarget !== null}
        title="Delete task note?"
        subtitle="This cannot be undone."
        onClose={() => {
          if (!deleteMutation.isPending) setDeleteTarget(null);
        }}
        compact
        showCloseButton
        testID="delete-task-note-confirmation"
        footer={
          <View style={{ gap: 6 }}>
            <Pressable
              onPress={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="min-h-11 items-center justify-center rounded-xl bg-red-500"
              testID="confirm-delete-task-note-button"
            >
              {deleteMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-bold text-white">Delete note</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text className="text-sm leading-5 text-slate-600" numberOfLines={4}>
          {deleteTarget?.body ?? ""}
        </Text>
      </AlenioBottomSheet>
    </View>
  );
}
