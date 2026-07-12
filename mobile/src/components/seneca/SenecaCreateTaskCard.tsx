import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, Flag, Users, UserRound } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SenecaCreateTaskProposal } from "@/lib/seneca-api";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { calendarDueIso, resolveTimeZone } from "@/lib/timezone";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import type { TaskPriority } from "@/lib/types";

type Props = {
  teamId: string;
  proposal: SenecaCreateTaskProposal;
  onSaved: (summary: string) => void;
  onDismiss: () => void;
};

const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high"];

function dueDateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 0);
}

function formatDueDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SenecaCreateTaskCard({ teamId, proposal, onSaved, onDismiss }: Props) {
  const queryClient = useQueryClient();
  const { data: meProfile } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get<{ timezone?: string | null }>("/api/me"),
    enabled: !!teamId,
  });
  const timeZone = resolveTimeZone(meProfile?.timezone);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [description, setDescription] = useState(proposal.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(proposal.priority);
  const [dueDate, setDueDate] = useState<Date | null>(
    proposal.dueDate ? dueDateFromYmd(proposal.dueDate) : null,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isJoint, setIsJoint] = useState(proposal.isJoint);

  const assigneeLabel = proposal.assigneeNames.join(" and ");
  const assigneeCount = proposal.assigneeUserIds.length;
  const hasMultipleAssignees = assigneeCount > 1;
  const confirmLabel =
    hasMultipleAssignees && !isJoint
      ? `Create ${assigneeCount} separate tasks`
      : hasMultipleAssignees && isJoint
        ? "Confirm & create joint task"
        : "Confirm & create";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("Please enter a task title.");
      await api.post(`/api/teams/${teamId}/tasks`, {
        title: trimmedTitle,
        description: description.trim() || undefined,
        status: "todo",
        priority,
        dueDate: dueDate ? calendarDueIso(dueDate, timeZone) : undefined,
        timeZone,
        assigneeIds: proposal.assigneeUserIds,
        isJoint: isJoint || undefined,
      });
    },
    onSuccess: () => {
      invalidateTaskCaches(queryClient, teamId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const duePart = dueDate ? ` due ${formatDueDate(dueDate)}` : "";
      const summary =
        hasMultipleAssignees && !isJoint
          ? `Done — created ${assigneeCount} separate tasks for ${assigneeLabel}: "${title.trim()}"${duePart}.`
          : hasMultipleAssignees && isJoint
            ? `Done — "${title.trim()}" is assigned as a joint task for ${assigneeLabel}${duePart}.`
            : `Done — "${title.trim()}" is assigned to ${assigneeLabel}${duePart}.`;
      onSaved(summary);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not create this task.");
    },
  });

  const handleSave = () => {
    setError(null);
    saveMutation.mutate();
  };

  const resetEdits = () => {
    setTitle(proposal.title);
    setDescription(proposal.description ?? "");
    setPriority(proposal.priority);
    setDueDate(proposal.dueDate ? dueDateFromYmd(proposal.dueDate) : null);
    setIsJoint(proposal.isJoint);
    setError(null);
  };

  const taskModeSelector = hasMultipleAssignees ? (
    <View style={styles.modeRow}>
      <Pressable
        onPress={() => setIsJoint(false)}
        style={[styles.modeChip, !isJoint && styles.modeChipActive]}
        testID="seneca-create-task-separate-mode"
      >
        <UserRound size={15} color={!isJoint ? "#4361EE" : "#64748B"} />
        <Text style={[styles.modeChipTitle, !isJoint && styles.modeChipTitleActive]}>Separate</Text>
        <Text style={[styles.modeChipHint, !isJoint && styles.modeChipHintActive]}>One task each</Text>
      </Pressable>
      <Pressable
        onPress={() => setIsJoint(true)}
        style={[styles.modeChip, isJoint && styles.modeChipActive]}
        testID="seneca-create-task-joint-mode"
      >
        <Users size={15} color={isJoint ? "#4361EE" : "#64748B"} />
        <Text style={[styles.modeChipTitle, isJoint && styles.modeChipTitleActive]}>Joint</Text>
        <Text style={[styles.modeChipHint, isJoint && styles.modeChipHintActive]}>Shared task</Text>
      </Pressable>
    </View>
  ) : null;

  const taskModeSummary = hasMultipleAssignees ? (
    <View style={styles.jointRow}>
      {isJoint ? <Users size={14} color="#4361EE" /> : <UserRound size={14} color="#4361EE" />}
      <Text style={styles.jointText}>
        {isJoint
          ? "Joint task — everyone works on one shared task"
          : `Separate tasks — one for each person (${assigneeCount} total)`}
      </Text>
    </View>
  ) : null;

  return (
    <View style={styles.card} testID="seneca-create-task-confirm">
      <Text style={styles.title}>{editing ? "Edit task" : "Task details"}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Assignees</Text>
        <Text style={styles.value}>{assigneeLabel}</Text>
      </View>

      {taskModeSelector}
      {taskModeSummary}

      {editing ? (
        <>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Task title"
            placeholderTextColor="#94A3B8"
            testID="seneca-create-task-title-input"
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor="#94A3B8"
            multiline
            testID="seneca-create-task-description-input"
          />
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.editField}>
            <Calendar size={16} color="#4361EE" />
            <Text style={[styles.editFieldText, !dueDate && styles.editFieldPlaceholder]}>
              {dueDate ? formatDueDate(dueDate) : "No due date"}
            </Text>
          </Pressable>
          <View style={styles.priorityRow}>
            {PRIORITY_OPTIONS.map((option) => {
              const active = priority === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setPriority(option)}
                  style={[styles.priorityChip, active && styles.priorityChipActive]}
                >
                  <Text style={[styles.priorityChipText, active && styles.priorityChipTextActive]}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>Title</Text>
            <Text style={styles.value}>{title}</Text>
          </View>
          {description.trim() ? (
            <View style={styles.row}>
              <Text style={styles.label}>Details</Text>
              <Text style={styles.valueMuted}>{description.trim()}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>Due</Text>
            <Text style={styles.value}>{dueDate ? formatDueDate(dueDate) : "No due date"}</Text>
          </View>
          <View style={styles.priorityDisplay}>
            <Flag size={14} color="#4361EE" />
            <Text style={styles.priorityDisplayText}>
              {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
            </Text>
          </View>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        {editing ? (
          <>
            <Pressable
              onPress={handleSave}
              disabled={saveMutation.isPending}
              style={styles.primary}
              testID="seneca-create-task-save-button"
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>{confirmLabel}</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setEditing(false);
                resetEdits();
              }}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Cancel edit</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={handleSave}
              disabled={saveMutation.isPending}
              style={styles.primary}
              testID="seneca-create-task-confirm-button"
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>{confirmLabel}</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setEditing(true)}
              style={styles.secondary}
              testID="seneca-create-task-edit-button"
            >
              <Text style={styles.secondaryText}>Edit details</Text>
            </Pressable>
            <Pressable onPress={onDismiss} style={styles.ghost} testID="seneca-create-task-cancel-button">
              <Text style={styles.ghostText}>Not now</Text>
            </Pressable>
          </>
        )}
      </View>

      {Platform.OS === "ios" ? (
        <Modal visible={showDatePicker} transparent animationType="slide">
          <Pressable style={styles.pickerBackdrop} onPress={() => setShowDatePicker(false)}>
            <Pressable onPress={(e) => e.stopPropagation?.()}>
              <View style={styles.pickerSheet}>
                <View style={styles.pickerActions}>
                  <Pressable onPress={() => setDueDate(null)}>
                    <Text style={styles.clearDateText}>Clear date</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={dueDate ?? new Date()}
                  mode="date"
                  display="inline"
                  onChange={(_e, date) => {
                    if (date) {
                      const next = new Date(date);
                      next.setHours(23, 59, 59, 0);
                      setDueDate(next);
                    }
                  }}
                  style={{ alignSelf: "center" }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : showDatePicker ? (
        <DateTimePicker
          value={dueDate ?? new Date()}
          mode="date"
          onChange={(_e, date) => {
            setShowDatePicker(false);
            if (date) {
              const next = new Date(date);
              next.setHours(23, 59, 59, 0);
              setDueDate(next);
            }
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  label: {
    width: 68,
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "500",
  },
  value: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  valueMuted: {
    flex: 1,
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: "top",
    fontWeight: "500",
  },
  editField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  editFieldText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  editFieldPlaceholder: {
    color: "#94A3B8",
    fontWeight: "500",
  },
  priorityRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  priorityChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  priorityChipActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4361EE",
  },
  priorityChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  priorityChipTextActive: {
    color: "#4361EE",
  },
  priorityDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  priorityDisplayText: {
    fontSize: 13,
    color: "#4361EE",
    fontWeight: "600",
  },
  jointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  jointText: {
    flex: 1,
    fontSize: 13,
    color: "#4361EE",
    fontWeight: "600",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  modeChip: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modeChipActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4361EE",
  },
  modeChipTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  modeChipTitleActive: {
    color: "#4361EE",
  },
  modeChipHint: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94A3B8",
  },
  modeChipHintActive: {
    color: "#4361EE",
  },
  error: {
    fontSize: 13,
    color: "#DC2626",
  },
  actions: {
    gap: 8,
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  primary: {
    backgroundColor: "#4361EE",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  primaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondary: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  ghost: {
    paddingVertical: 8,
    alignItems: "center",
  },
  ghostText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
  },
  pickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerSheet: {
    backgroundColor: "#FFFFFF",
    paddingBottom: 24,
  },
  pickerActions: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  clearDateText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4361EE",
  },
});
