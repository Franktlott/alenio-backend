import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Switch,
  Modal,
  Image,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  Keyboard,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { X, BookOpen, Plus, Square, Camera, Pencil, Trash2, ImageIcon, Check, CheckSquare, ChevronRight, Lock, Search, Calendar, Clock, Users, FileText, ListChecks, ArrowLeft, ArrowRight } from "lucide-react-native";
import { colors } from "@/theme";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { useSession } from "@/lib/auth/use-session";
import type { Task, TaskKind, TaskPriority, RecurrenceType, Team, TeamMember, TaskTemplate } from "@/lib/types";
import { clampRecurrenceCount, maxRecurrenceCount, recurrenceCountHint, recurrenceDurationUnit } from "@/lib/recurring-task";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { resolveMyTeamRole } from "@/lib/member-identity";
import { resolveTimeZone, suggestedDueClock, taskDuePayload, withDueClock } from "@/lib/timezone";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import { UserAvatar } from "@/components/UserAvatar";
import { AlenioBottomSheet, AlenioSheetCard } from "@/components/AlenioBottomSheet";
import { AlenioList, AlenioListRow, Button } from "@/components/ui";
import { toast } from "burnt";
import { parseTaskKind, resolveTaskCreationPresentation } from "@/lib/task-kind";

const PRIORITIES: { label: string; value: TaskPriority; color: string }[] = [
  { label: "Low", value: "low", color: "#94A3B8" },
  { label: "Medium", value: "medium", color: "#3B82F6" },
  { label: "High", value: "high", color: "#F97316" },
  { label: "Urgent", value: "urgent", color: "#EF4444" },
];

const RECURRENCE_TYPES: { label: string; value: RecurrenceType }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

const formStyles = StyleSheet.create({
  section: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#94A3B8",
  },
  label: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  required: {
    color: "#EF4444",
  },
  field: {
    borderWidth: 1,
    borderColor: "#E6E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  fieldInput: {
    fontSize: 14,
    color: "#0F172A",
    padding: 0,
  },
  counter: {
    alignSelf: "flex-end",
    marginTop: 4,
    fontSize: 11,
    color: "#94A3B8",
  },
  choice: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9D6FE",
    backgroundColor: "#F8F7FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  choiceText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#312E81",
  },
});

const ACCENT = "#4F46E5";
const ACCENT_SOFT = "#EEF0FF";
const ACCENT_INK = "#3730A3";

type BuilderStep = "details" | "who" | "when" | "review";
const STEP_LABEL: Record<BuilderStep, string> = {
  details: "Details",
  who: "Who",
  when: "When",
  review: "Review",
};
const STEP_ICON: Record<BuilderStep, typeof FileText> = {
  details: FileText,
  who: Users,
  when: Calendar,
  review: ListChecks,
};

const builderStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1,
    color: ACCENT,
  },
  title: {
    marginTop: 1,
    fontSize: 21,
    fontWeight: "800",
    color: "#0F172A",
  },
  stepPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E8F0",
  },
  stepNode: {
    flex: 1,
    maxWidth: 72,
    alignItems: "center",
    gap: 5,
  },
  stepDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginTop: 17,
    marginHorizontal: -12,
    borderRadius: 1,
    backgroundColor: "#E6E8F0",
  },
  kindCard: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6E8F0",
    backgroundColor: "#FFFFFF",
  },
  kindCardSelected: {
    borderColor: ACCENT,
    backgroundColor: "#F4F2FF",
  },
  kindTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  kindSub: {
    marginTop: 1,
    fontSize: 11.5,
    color: "#64748B",
  },
  priority: {
    flex: 1,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E8F0",
    backgroundColor: "#FFFFFF",
  },
  prioritySelected: {
    borderColor: ACCENT,
    backgroundColor: "#F4F2FF",
  },
  rowButton: {
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E8F0",
    backgroundColor: "#FFFFFF",
  },
  rowButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6E8F0",
    backgroundColor: "#FFFFFF",
  },
  avatarRemove: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#64748B",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  avatarName: {
    marginTop: 5,
    maxWidth: 56,
    fontSize: 11.5,
    fontWeight: "600",
    color: "#334155",
  },
  summary: {
    marginTop: 4,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F8F7FF",
    borderWidth: 1,
    borderColor: "#E4E1FD",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E6E8F0",
    backgroundColor: "#FFFFFF",
  },
  error: {
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
  },
  backButton: {
    height: 52,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  primary: {
    height: 52,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: ACCENT,
  },
});

const SCREEN_HEIGHT = Dimensions.get("window").height;
const ASSIGNEE_SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.72);

export default function CreateTaskScreen() {
  const { teamId, prefillTitle, initialDueDate, initialAssigneeId, kind: routeKind } =
    useLocalSearchParams<{
      teamId: string;
      prefillTitle?: string;
      initialDueDate?: string;
      initialAssigneeId?: string;
      kind?: string;
    }>();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { height: windowHeight } = useWindowDimensions();
  const [selectedKind, setSelectedKind] = useState<TaskKind>(
    parseTaskKind(routeKind) ?? "workspace_task",
  );

  const { data: meProfile } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () =>
      api.get<{ id: string; email: string; timezone?: string | null }>("/api/me"),
    enabled: !!session?.user || !!teamId,
  });

  const [title, setTitle] = useState(typeof prefillTitle === "string" ? prefillTitle : "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(
    typeof initialAssigneeId === "string" && initialAssigneeId
      ? [initialAssigneeId]
      : [],
  );
  const [isRecurring, setIsRecurring] = useState(false);
  const [isJoint, setIsJoint] = useState(false);
  const [showSplitConfirm, setShowSplitConfirm] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState("3");
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | null>(null);
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(() => {
    if (typeof initialDueDate === "string" && initialDueDate) {
      const [y, m, d] = initialDueDate.split("-").map(Number);
      const date = new Date(y, m - 1, d, 23, 59, 59, 0);
      return date;
    }
    const d = new Date();
    d.setHours(23, 59, 59, 0);
    return d;
  });
  const [dueHasTime, setDueHasTime] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subtaskTitles, setSubtaskTitles] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [step, setStep] = useState(0);

  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("medium");

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const members = team?.members ?? [];
  const sessionUserId = typeof session?.user?.id === "string" ? session.user.id : "";
  const { myId, myRole } = resolveMyTeamRole({
    teamRole: team?.role,
    members,
    meId: meProfile?.id,
    meEmail: meProfile?.email || (typeof session?.user?.email === "string" ? session.user.email : undefined),
    sessionUserId,
  });
  const presentation = resolveTaskCreationPresentation(myRole, selectedKind);
  const isReminder = presentation.kind === "reminder";
  const steps: BuilderStep[] = isReminder
    ? ["details", "when", "review"]
    : ["details", "who", "when", "review"];
  const stepIndex = Math.min(step, steps.length - 1);
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const whoStepIndex = steps.indexOf("who");
  // Member-only due-date limit only when role is explicitly member (never on a failed roster match).
  const memberDueDateLimit = myRole === "member";

  useEffect(() => {
    if (myRole && !presentation.canChooseKind && selectedKind !== "reminder") {
      setSelectedKind("reminder");
    }
  }, [myRole, presentation.canChooseKind, selectedKind]);

  const assigneeOptions = useMemo(
    () =>
      [...members].sort((a, b) =>
        (a.user.name?.trim() || a.user.email || "").localeCompare(
          b.user.name?.trim() || b.user.email || "",
          undefined,
          { sensitivity: "base" },
        ),
      ),
    [members],
  );
  const filteredAssigneeOptions = useMemo(() => {
    const query = assigneeSearch.trim().toLowerCase();
    if (!query) return assigneeOptions;
    return assigneeOptions.filter((member) =>
      [member.user.name, member.user.email]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [assigneeOptions, assigneeSearch]);
  const allAssigneeIds = useMemo(() => assigneeOptions.map((m) => m.userId), [assigneeOptions]);
  const selectedMembers = useMemo(
    () =>
      selectedAssignees
        .map((id) => members.find((m) => m.userId === id))
        .filter((m): m is TeamMember => Boolean(m)),
    [selectedAssignees, members],
  );
  const allAssigneesSelected =
    allAssigneeIds.length > 0 && allAssigneeIds.every((id) => selectedAssignees.includes(id));

  const { data: templates = [] } = useQuery({
    queryKey: ["templates", teamId],
    queryFn: () => api.get<TaskTemplate[]>(`/api/teams/${teamId}/templates`),
    enabled: !!teamId && !isReminder,
  });

  const { mutate: deleteTemplate } = useMutation({
    mutationFn: (id: string) => api.delete(`/api/teams/${teamId}/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates", teamId] }),
  });

  const { mutate: updateTemplate, isPending: updatingTemplate } = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TaskTemplate> }) =>
      api.patch(`/api/teams/${teamId}/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates", teamId] });
      setEditingTemplate(null);
    },
  });

  const applyTemplate = (t: TaskTemplate) => {
    setTitle(t.title);
    setDescription(t.description ?? "");
    setPriority(t.priority);
    if (t.attachmentUrl) setAttachmentUri(t.attachmentUrl);
    if (t.subtasks && t.subtasks.length > 0) {
      setSubtaskTitles(t.subtasks.map((s) => s.title));
    }
    if (t.isRecurring) {
      setIsRecurring(true);
      if (t.recurrenceType) setRecurrenceType(t.recurrenceType);
      if (t.recurrenceInterval) setRecurrenceCount(String(t.recurrenceInterval));
      if (t.recurrenceDaysOfWeek != null) setSelectedDayOfWeek(parseInt(t.recurrenceDaysOfWeek));
      if (t.recurrenceDayOfMonth != null) setSelectedDayOfMonth(t.recurrenceDayOfMonth);
    } else {
      setIsRecurring(false);
    }
    setIsJoint(t.isJoint ?? false);
    setShowTemplatePicker(false);
  };

  const createMutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      let attachmentUrl: string | undefined;
      if (!isReminder && attachmentUri) {
        const filename = attachmentUri.split("/").pop() ?? "photo.jpg";
        const uploaded = await uploadFile(attachmentUri, filename, "image/jpeg");
        attachmentUrl = uploaded.url;
      }
      const tasks = await api.post<Task[]>(`/api/teams/${teamId}/tasks`, { ...input, attachmentUrl });
      // Attach subtasks to each created task
      if (!isReminder) {
        for (const task of tasks) {
          for (const subtaskTitle of subtaskTitles) {
            await api.post(`/api/teams/${teamId}/tasks/${task.id}/subtasks`, { title: subtaskTitle });
          }
        }
      }
      return tasks;
    },
    onSuccess: () => {
      invalidateTaskCaches(queryClient, teamId);
      toast({
        title: "Task created",
        message: isReminder
          ? "Only you can see it. It won’t fill Stars."
          : "Your workspace task is ready.",
        preset: "done",
      });
      router.back();
    },
    onError: () =>
      setError("Failed to create task. Please try again."),
  });

  const confirmCreate = (assigneeIds: string[] = selectedAssignees) => {
    setShowSplitConfirm(false);
    createMutation.mutate({
      kind: presentation.kind,
      title: title.trim(),
      description: description.trim() || undefined,
      status: "todo",
      priority,
      dueDate: dueDate
        ? taskDuePayload(dueDate, dueHasTime, resolveTimeZone(meProfile?.timezone))
        : undefined,
      timeZone: resolveTimeZone(meProfile?.timezone),
      assigneeIds: isReminder ? (myId ? [myId] : undefined) : assigneeIds,
      isJoint: isReminder ? undefined : isJoint || undefined,
      recurrence: isRecurring
        ? {
            type: recurrenceType,
            occurrenceCount: clampRecurrenceCount(recurrenceCount, recurrenceType),
            daysOfWeek: recurrenceType === "weekly" && selectedDayOfWeek !== null
              ? String(selectedDayOfWeek)
              : undefined,
            dayOfMonth: recurrenceType === "monthly" && selectedDayOfMonth !== null
              ? selectedDayOfMonth
              : undefined,
          }
        : undefined,
    });
  };

  const handleCreate = () => {
    if (!title.trim()) {
      setError("Please enter a task title");
      setStep(0);
      return;
    }
    if (!myRole) {
      setError("Please wait while your workspace access loads.");
      return;
    }
    const assigneeIds = selectedAssignees;
    if (!isReminder && assigneeIds.length === 0) {
      setError("Please assign this task to at least one person");
      setStep(whoStepIndex >= 0 ? whoStepIndex : 0);
      return;
    }
    setError(null);
    if (!isReminder && assigneeIds.length >= 2 && !isJoint) {
      setShowSplitConfirm(true);
      return;
    }
    confirmCreate(assigneeIds);
  };

  const goToStep = (index: number) => {
    if (index > stepIndex && !title.trim()) {
      setError("Please enter a task title");
      return;
    }
    if (
      !isReminder &&
      whoStepIndex >= 0 &&
      index > whoStepIndex &&
      selectedAssignees.length === 0
    ) {
      setError("Please assign this task to at least one person");
      setStep(whoStepIndex);
      return;
    }
    const whenStepIndex = steps.indexOf("when");
    if (whenStepIndex >= 0 && index > whenStepIndex && !dueDate) {
      setError("Please choose a due date");
      setStep(whenStepIndex);
      return;
    }
    // Leave any open keyboard so the footer Next control stays tappable.
    Keyboard.dismiss();
    setError(null);
    setStep(Math.max(0, Math.min(index, steps.length - 1)));
  };

  const toggleAssignee = (userId: string) => {
    setSelectedAssignees((prev) => {
      const next = prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId];
      if (next.length < 2) setIsJoint(false);
      return next;
    });
  };

  const toggleAllAssignees = () => {
    if (allAssigneesSelected) {
      setSelectedAssignees([]);
      setIsJoint(false);
      return;
    }
    setSelectedAssignees(allAssigneeIds);
  };

  const memberDisplayName = (member: TeamMember) => {
    const base = member.user.name || member.user.email || "Unknown";
    return myId && member.userId === myId ? `${base} (You)` : base;
  };

  const addSubtask = () => {
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    setSubtaskTitles((prev) => [...prev, trimmed]);
    setNewSubtaskTitle("");
  };

  const removeSubtask = (index: number) => {
    setSubtaskTitles((prev) => prev.filter((_, i) => i !== index));
  };

  const pickPhotoFromLibrary = async () => {
    setShowPhotoOptions(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setError("Permission to access photos is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setAttachmentUri(result.assets[0].uri);
    }
  };

  const takePhotoWithCamera = async () => {
    setShowPhotoOptions(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setError("Permission to access camera is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setAttachmentUri(result.assets[0].uri);
    }
  };

  const primaryLabel = isLastStep
    ? presentation.createLabel
    : `Next: ${STEP_LABEL[steps[stepIndex + 1]]}`;

  return (
    <>
      <AlenioBottomSheet
        asScreen
        title={presentation.newTitle}
        subtitle={
          presentation.privacyHint
            ? presentation.privacyHint
            : "Task builder"
        }
        onClose={() => router.back()}
        showCloseButton
        showScrollIndicator
        testID="create-task-screen"
        headerRight={
          <View style={builderStyles.stepPill} testID="task-builder-step-count">
            <Text style={builderStyles.stepPillText}>
              Step {stepIndex + 1} of {steps.length}
            </Text>
          </View>
        }
        footer={
          <View style={{ width: "100%" }}>
            {error ? (
              <Text style={[builderStyles.error, { marginBottom: 10 }]} testID="task-builder-error">
                {error}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
              {stepIndex === 0 ? null : (
                <TouchableOpacity
                  onPress={() => setStep(stepIndex - 1)}
                  style={[builderStyles.backButton, { marginRight: 12 }]}
                  accessibilityRole="button"
                  testID="back-step-button"
                >
                  <ArrowLeft size={17} color="#334155" strokeWidth={2.2} />
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#334155" }}>Back</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  label={primaryLabel}
                  iconRight={
                    isLastStep ? undefined : <ArrowRight size={17} color="#FFFFFF" strokeWidth={2.4} />
                  }
                  loading={isLastStep && createMutation.isPending}
                  disabled={isLastStep && createMutation.isPending}
                  onPress={() => {
                    Keyboard.dismiss();
                    if (isLastStep) handleCreate();
                    else goToStep(stepIndex + 1);
                  }}
                  testID={isLastStep ? "create-button" : "next-step-button"}
                />
              </View>
            </View>
          </View>
        }
      >
          <View style={builderStyles.stepper} testID="task-builder-stepper">
              {steps.map((id, i) => {
                const Icon = STEP_ICON[id];
                const active = i === stepIndex;
                const done = i < stepIndex;
                return (
                  <React.Fragment key={id}>
                    {i > 0 ? (
                      <View style={[builderStyles.stepLine, i <= stepIndex ? { backgroundColor: ACCENT } : null]} />
                    ) : null}
                    <Pressable
                      onPress={() => goToStep(i)}
                      style={builderStyles.stepNode}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={STEP_LABEL[id]}
                      testID={`task-builder-step-${id}`}
                    >
                      <View
                        style={[
                          builderStyles.stepDot,
                          active ? { backgroundColor: ACCENT } : done ? { backgroundColor: ACCENT_SOFT } : null,
                        ]}
                      >
                        {done ? (
                          <Check size={16} color={ACCENT} strokeWidth={2.6} />
                        ) : (
                          <Icon size={16} color={active ? "#FFFFFF" : "#94A3B8"} strokeWidth={2.2} />
                        )}
                      </View>
                      <Text style={[builderStyles.stepLabel, active || done ? { color: ACCENT_INK } : null]}>
                        {STEP_LABEL[id]}
                      </Text>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </View>

          {currentStep === "details" ? (
          <>
          {presentation.canChooseKind ? (
            <>
              <Text style={[formStyles.label, { marginTop: 4 }]}>Who is this for?</Text>
              <View style={{ flexDirection: "row", gap: 10 }} testID="task-kind-selector">
                {(["workspace_task", "reminder"] as TaskKind[]).map((option) => {
                  const selected = presentation.kind === option;
                  const Icon = option === "workspace_task" ? CheckSquare : Lock;
                  const label = option === "workspace_task" ? "Team" : "Just for me";
                  const hint =
                    option === "workspace_task"
                      ? "Assigned, with a due date"
                      : "Only you can see this";
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setSelectedKind(option)}
                      style={[builderStyles.kindCard, selected ? builderStyles.kindCardSelected : null]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Create ${label} task`}
                      testID={`task-kind-${option}`}
                    >
                      <Icon size={18} color={selected ? ACCENT : "#64748B"} strokeWidth={2.2} />
                      <View style={{ flex: 1 }}>
                        <Text style={[builderStyles.kindTitle, selected ? { color: ACCENT_INK } : null]}>
                          {label}
                        </Text>
                        <Text style={builderStyles.kindSub} numberOfLines={1}>
                          {hint}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {isReminder ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
                marginTop: 6,
                paddingHorizontal: 4,
                paddingVertical: 10,
              }}
              testID="reminder-private-note"
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#F0EFFF",
                }}
              >
                <Lock size={15} color="#635BDB" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E293B" }}>
                  Private to you
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 17, color: "#64748B" }}>
                  Hidden from your team · Excluded from Stars
                </Text>
              </View>
            </View>
          ) : null}


          <View style={{ marginTop: 16 }}>
          <Text style={formStyles.label}>
            Task title{" "}
            <Text style={formStyles.required}>*</Text>
          </Text>
          <View style={formStyles.field}>
            <TextInput
              style={formStyles.fieldInput}
              placeholder="What needs to get done?"
              placeholderTextColor="#94A3B8"
              value={title}
              onChangeText={(t) => {
                setTitle(t.slice(0, 120));
                setError(null);
              }}
              maxLength={120}
              returnKeyType="next"
              testID="title-input"
            />
            <Text style={formStyles.counter}>{title.length}/120</Text>
          </View>

          <Text style={[formStyles.label, { marginTop: 14 }]}>
            Notes (optional)
          </Text>
          <View style={[formStyles.field, { minHeight: 88 }]}>
            <TextInput
              style={[formStyles.fieldInput, { minHeight: 52, textAlignVertical: "top" }]}
              placeholder="Add context, instructions, or resources..."
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={(t) => setDescription(t.slice(0, 500))}
              maxLength={500}
              multiline
              testID="description-input"
            />
            <Text style={formStyles.counter}>{description.length}/500</Text>
          </View>

          </View>

          {!isReminder ? (
            <View style={{ marginTop: 16 }}>
              <Text style={formStyles.label}>Priority</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {PRIORITIES.map((p) => {
                  const selected = priority === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      onPress={() => setPriority(p.value)}
                      style={[builderStyles.priority, selected ? builderStyles.prioritySelected : null]}
                      testID={`priority-${p.value}`}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
                      <Text style={{ fontSize: 13, fontWeight: selected ? "700" : "600", color: selected ? ACCENT_INK : "#334155" }}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {!isReminder ? (
            <View className="py-4 border-b border-slate-100 dark:border-slate-800" style={{ marginTop: 8 }}>
              <Text className="text-sm font-semibold text-slate-500 mb-3">Photo</Text>
              {attachmentUri ? (
                <View className="relative">
                  <Image
                    source={{ uri: attachmentUri }}
                    style={{ width: "100%", height: 180, borderRadius: 12 }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={() => setAttachmentUri(null)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 items-center justify-center"
                    testID="remove-photo-button"
                  >
                    <X size={14} color="white" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowPhotoOptions(true)}
                  disabled={uploadingPhoto}
                  className="flex-row items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl py-6"
                  style={{ gap: 8 }}
                  testID="pick-photo-button"
                >
                  <Camera size={20} color="#94A3B8" />
                  <Text className="text-sm text-slate-400">Add a photo</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {!isReminder ? (
            <View className="py-4 border-b border-slate-100 dark:border-slate-800">
              <Text className="text-sm font-semibold text-slate-500 mb-3">
                Subtasks{subtaskTitles.length > 0 ? ` (${subtaskTitles.length})` : ""}
              </Text>
              {subtaskTitles.length > 0 ? (
                <View className="mb-3" style={{ gap: 6 }}>
                  {subtaskTitles.map((subtaskTitle, index) => (
                    <View key={index} className="flex-row items-center" style={{ gap: 8 }}>
                      <Square size={16} color="#CBD5E1" />
                      <Text className="flex-1 text-sm text-slate-700 dark:text-slate-300">{subtaskTitle}</Text>
                      <TouchableOpacity
                        onPress={() => removeSubtask(index)}
                        className="w-6 h-6 rounded-full items-center justify-center bg-slate-100 dark:bg-slate-700"
                        testID={`remove-subtask-${index}`}
                      >
                        <X size={12} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}
              <View className="flex-row items-center border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2" style={{ gap: 8 }}>
                <TextInput
                  value={newSubtaskTitle}
                  onChangeText={setNewSubtaskTitle}
                  placeholder="Add a subtask..."
                  placeholderTextColor="#94A3B8"
                  className="flex-1 text-sm text-slate-900 dark:text-white"
                  onSubmitEditing={addSubtask}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  testID="new-subtask-input"
                />
                <TouchableOpacity onPress={addSubtask} disabled={!newSubtaskTitle.trim()} testID="add-subtask-button">
                  <Plus size={18} color={newSubtaskTitle.trim() ? "#4361EE" : "#CBD5E1"} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {!isReminder && templates.length > 0 ? (
            <Pressable
              onPress={() => setShowTemplatePicker(true)}
              style={[builderStyles.rowButton, { marginTop: 16 }]}
              testID="use-template-button"
            >
              <BookOpen size={17} color="#64748B" strokeWidth={2} />
              <Text style={builderStyles.rowButtonText}>Use a template</Text>
              <ChevronRight size={16} color="#C4C9D4" strokeWidth={2.2} />
            </Pressable>
          ) : null}
          </>
          ) : null}

          {currentStep === "when" ? (
          <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={formStyles.label}>
                Due date <Text style={formStyles.required}>*</Text>
              </Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                style={formStyles.choice}
                testID="due-date-picker-button"
              >
                <Calendar size={16} color="#6366F1" strokeWidth={2} />
                <Text style={formStyles.choiceText} numberOfLines={1}>
                  {dueDate
                    ? dueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                    : "Select date"}
                </Text>
                <ChevronRight size={15} color="#C4C9D4" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={formStyles.label}>Due time</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!dueDate) {
                    const today = new Date();
                    today.setHours(23, 59, 59, 0);
                    setDueDate(today);
                  }
                  if (!dueHasTime) {
                    setDueHasTime(true);
                    setDueDate((current) => suggestedDueClock(current ?? new Date()));
                  }
                  setShowTimePicker(true);
                }}
                style={formStyles.choice}
                testID="due-time-picker-button"
              >
                <Clock size={16} color="#6366F1" strokeWidth={2} />
                <Text style={formStyles.choiceText} numberOfLines={1}>
                  {dueHasTime && dueDate
                    ? dueDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                    : "End of day"}
                </Text>
                <ChevronRight size={15} color="#C4C9D4" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          </View>

          <View>

            {/* iOS inline picker shown in modal */}
            {Platform.OS === "ios" ? (
              <Modal visible={showDatePicker} transparent animationType="slide">
                <View className="flex-1 justify-end">
                  <View className="bg-white dark:bg-slate-900 rounded-t-3xl" style={{ shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20 }}>
                    <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text className="text-slate-500 text-base">Cancel</Text>
                      </TouchableOpacity>
                      <Text className="text-base font-semibold text-slate-900 dark:text-white">Due Date</Text>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text className="text-indigo-600 font-semibold text-base">Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={dueDate ?? new Date()}
                      mode="date"
                      display="inline"
                      minimumDate={memberDueDateLimit ? new Date() : undefined}
                      onChange={(_e, date) => {
                        if (!date) return;
                        const next = new Date(date);
                        if (dueHasTime && dueDate) next.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0);
                        else next.setHours(23, 59, 59, 0);
                        setDueDate(next);
                        setError(null);
                      }}
                      testID="date-time-picker"
                      style={{ alignSelf: "center", marginHorizontal: 8 }}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        setDueDate(null);
                        setDueHasTime(false);
                        setShowDatePicker(false);
                      }}
                      style={{
                        marginHorizontal: 20,
                        marginTop: 4,
                        marginBottom: 8,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: "#F8FAFC",
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        alignItems: "center",
                      }}
                      testID="clear-due-date-sheet-button"
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#EF4444" }}>Clear date</Text>
                    </TouchableOpacity>
                    <View style={{ height: 8 }} />
                  </View>
                </View>
              </Modal>
            ) : (
              showDatePicker ? (
                <DateTimePicker
                  value={dueDate ?? new Date()}
                  mode="date"
                  display="calendar"
                  minimumDate={memberDueDateLimit ? new Date() : undefined}
                  onChange={(_e, date) => {
                    setShowDatePicker(false);
                    if (!date) return;
                    const next = new Date(date);
                    if (dueHasTime && dueDate) next.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0);
                    else next.setHours(23, 59, 59, 0);
                    setDueDate(next);
                    setError(null);
                  }}
                  testID="date-time-picker"
                />
              ) : null
            )}

            {Platform.OS === "ios" ? (
              <Modal visible={showTimePicker} transparent animationType="slide">
                <View className="flex-1 justify-end">
                  <View className="bg-white dark:bg-slate-900 rounded-t-3xl" style={{ shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20 }}>
                    <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
                      <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                        <Text className="text-slate-500 text-base">Cancel</Text>
                      </TouchableOpacity>
                      <Text className="text-base font-semibold text-slate-900 dark:text-white">Due time</Text>
                      <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                        <Text className="text-indigo-600 font-semibold text-base">Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={dueDate ?? new Date()}
                      mode="time"
                      display="spinner"
                      onChange={(_e, date) => {
                        if (!date) return;
                        setDueHasTime(true);
                        setDueDate((current) => withDueClock(current ?? new Date(), date.getHours(), date.getMinutes()));
                      }}
                      testID="due-time-picker"
                    />
                    <TouchableOpacity
                      onPress={() => {
                        setDueHasTime(false);
                        setDueDate((current) => {
                          const next = new Date(current ?? new Date());
                          next.setHours(23, 59, 59, 0);
                          return next;
                        });
                        setShowTimePicker(false);
                      }}
                      style={{
                        marginHorizontal: 20,
                        marginTop: 4,
                        marginBottom: 8,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: "#F8FAFC",
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        alignItems: "center",
                      }}
                      testID="clear-due-time-sheet-button"
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#475569" }}>
                        Use end of day
                      </Text>
                    </TouchableOpacity>
                    <View style={{ height: 8 }} />
                  </View>
                </View>
              </Modal>
            ) : showTimePicker ? (
              <DateTimePicker
                value={dueDate ?? new Date()}
                mode="time"
                display="spinner"
                onChange={(_e, date) => {
                  setShowTimePicker(false);
                  if (!date) return;
                  setDueHasTime(true);
                  setDueDate((current) => withDueClock(current ?? new Date(), date.getHours(), date.getMinutes()));
                }}
                testID="due-time-picker"
              />
            ) : null}
          </View>

          {/* Recurring */}
          <View style={[builderStyles.card, { marginTop: 18 }]}>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-semibold text-slate-500">
                  Recurring task
                </Text>
                {isRecurring ? (
                  <Text className="text-xs text-slate-400 mt-0.5">
                    {recurrenceCountHint(recurrenceType)}
                  </Text>
                ) : null}
              </View>
              <Switch
                value={isRecurring}
                onValueChange={setIsRecurring}
                trackColor={{ false: "#E2E8F0", true: "#6B8EF6" }}
                thumbColor="white"
                testID="recurring-switch"
              />
            </View>
            {isRecurring ? (
              <View style={{ gap: 12, marginTop: 8 }}>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {RECURRENCE_TYPES.map((r) => {
                    const selected = recurrenceType === r.value;
                    return (
                      <TouchableOpacity
                        key={r.value}
                        onPress={() => {
                          setRecurrenceType(r.value);
                          setRecurrenceCount(String(clampRecurrenceCount(recurrenceCount, r.value)));
                        }}
                        className="px-3 py-1.5 rounded-full border"
                        style={{
                          backgroundColor: selected ? "#4361EE20" : "#F1F5F9",
                          borderColor: selected ? "#4361EE" : "#E2E8F0",
                        }}
                        testID={`recurrence-${r.value}`}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "600", color: selected ? "#4361EE" : "#64748B" }}>
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text className="text-sm text-slate-500">Repeat for</Text>
                  <TextInput
                    className="w-14 text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 text-slate-900 dark:text-white font-semibold"
                    value={recurrenceCount}
                    onChangeText={(t) => {
                      const digits = t.replace(/[^0-9]/g, "");
                      if (digits === "") {
                        setRecurrenceCount("");
                        return;
                      }
                      setRecurrenceCount(String(clampRecurrenceCount(digits, recurrenceType)));
                    }}
                    keyboardType="numeric"
                    maxLength={String(maxRecurrenceCount(recurrenceType)).length}
                    testID="interval-input"
                  />
                  <Text className="text-sm text-slate-500">
                    {recurrenceDurationUnit(recurrenceType)}
                  </Text>
                </View>

                {recurrenceType === "weekly" ? (
                  <View>
                    <Text className="text-xs text-slate-500 mb-2">On</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => {
                        const selected = selectedDayOfWeek === i;
                        return (
                          <TouchableOpacity
                            key={i}
                            testID={`day-of-week-${i}`}
                            onPress={() => setSelectedDayOfWeek(selectedDayOfWeek === i ? null : i)}
                            className="w-10 h-10 rounded-full items-center justify-center border"
                            style={{
                              backgroundColor: selected ? "#4361EE20" : "#F1F5F9",
                              borderColor: selected ? "#4361EE" : "#E2E8F0",
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: "600", color: selected ? "#4361EE" : "#64748B" }}>
                              {day}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {recurrenceType === "monthly" ? (
                  <View>
                    <Text className="text-xs text-slate-500 mb-2">On day</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                        const selected = selectedDayOfMonth === day;
                        return (
                          <TouchableOpacity
                            key={day}
                            testID={`day-of-month-${day}`}
                            onPress={() => setSelectedDayOfMonth(selectedDayOfMonth === day ? null : day)}
                            className="w-9 h-9 rounded-full items-center justify-center border"
                            style={{
                              backgroundColor: selected ? "#4361EE20" : "#F1F5F9",
                              borderColor: selected ? "#4361EE" : "#E2E8F0",
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: "600", color: selected ? "#4361EE" : "#64748B" }}>
                              {day}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          </>
          ) : null}

          {currentStep === "who" ? (
          <>
          {!isReminder && members.length > 0 ? (
            <View style={{ marginTop: 4 }}>
              <Text style={formStyles.label}>
                Assign to <Text style={formStyles.required}>*</Text>
              </Text>
              <Pressable
                onPress={() => setShowAssigneePicker(true)}
                style={formStyles.choice}
                testID="assignee-picker-button"
              >
                <Users size={16} color="#6366F1" strokeWidth={2} />
                <Text style={[formStyles.choiceText, selectedAssignees.length === 0 ? { color: "#64748B", fontWeight: "500" } : null]} numberOfLines={1}>
                  {selectedAssignees.length === 0
                    ? "Select associates"
                    : allAssigneesSelected
                      ? "All associates"
                      : `${selectedAssignees.length} associate${selectedAssignees.length === 1 ? "" : "s"} selected`}
                </Text>
                <ChevronRight size={15} color="#C4C9D4" strokeWidth={2.2} />
              </Pressable>
              {selectedMembers.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 12, marginHorizontal: -16 }}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
                  testID="assignee-avatars"
                >
                  {selectedMembers.map((member) => (
                    <View key={member.userId} style={{ width: 56, alignItems: "center" }}>
                      <View style={{ width: 48, height: 48 }}>
                        <UserAvatar
                          user={member.user}
                          size={48}
                          radius={24}
                          backgroundColor={ACCENT_SOFT}
                          textColor={ACCENT}
                          fontSize={15}
                        />
                        <Pressable
                          onPress={() => toggleAssignee(member.userId)}
                          hitSlop={8}
                          style={builderStyles.avatarRemove}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${memberDisplayName(member)}`}
                          testID={`assignee-avatar-remove-${member.userId}`}
                        >
                          <X size={10} color="#FFFFFF" strokeWidth={3} />
                        </Pressable>
                      </View>
                      <Text style={builderStyles.avatarName} numberOfLines={1}>
                        {myId && member.userId === myId
                          ? "You"
                          : (member.user.name?.trim() || member.user.email || "Unknown").split(/\s+/)[0]}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ) : null}

          {!isReminder && selectedAssignees.length >= 2 ? (
            <View style={[builderStyles.card, { marginTop: 14 }]}>
              <View className="flex-row items-center justify-between">
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text className="text-sm font-semibold text-slate-500">Joint Task</Text>
                  <Text className="text-xs text-slate-400 mt-0.5">
                    Everyone works on one shared task
                  </Text>
                </View>
                <Switch
                  value={isJoint}
                  onValueChange={(val) => setIsJoint(val)}
                  trackColor={{ false: "#E2E8F0", true: "#6B8EF6" }}
                  thumbColor="white"
                  testID="joint-task-switch"
                />
              </View>
              {isJoint ? (
                <View
                  className="mt-3 px-3 py-2.5 rounded-xl"
                  style={{ backgroundColor: "#EFF6FF" }}
                  testID="joint-task-banner"
                >
                  <Text className="text-xs text-blue-600">
                    Subtasks are shared — completing one marks it done for the whole team.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          </>
          ) : null}

          {currentStep === "review" ? (
          <View style={builderStyles.summary} testID="task-builder-summary">
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }} numberOfLines={2}>
              {title.trim() || "Untitled task"}
            </Text>
            <Text style={{ marginTop: 3, fontSize: 12.5, color: "#64748B" }} numberOfLines={2}>
              {[
                dueDate
                  ? `Due ${dueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${
                      dueHasTime ? `, ${dueDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""
                    }`
                  : "No due date",
                isReminder
                  ? null
                  : `${PRIORITIES.find((p) => p.value === priority)?.label ?? "Medium"} priority`,
                isRecurring ? "Repeats" : null,
                isReminder
                  ? "Private to you"
                  : allAssigneesSelected
                    ? "All associates"
                    : selectedMembers.length > 0
                      ? selectedMembers
                          .map((member) =>
                            myId && member.userId === myId
                              ? "You"
                              : (member.user.name?.trim() || member.user.email || "Unknown").split(/\s+/)[0],
                          )
                          .join(", ")
                      : "Unassigned",
                !isReminder && isJoint ? "Joint task" : null,
                !isReminder && subtaskTitles.length > 0
                  ? `${subtaskTitles.length} subtask${subtaskTitles.length === 1 ? "" : "s"}`
                  : null,
                !isReminder && attachmentUri ? "Photo attached" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          ) : null}
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={showAssigneePicker}
        title="Assign to"
        subtitle={
          selectedAssignees.length === 0
            ? "Pick who this task is for."
            : `${selectedAssignees.length} selected`
        }
        onClose={() => {
          setShowAssigneePicker(false);
          setAssigneeSearch("");
        }}
        showCloseButton
        compact
        scrollEnabled={false}
        testID="assignee-picker-sheet"
        footer={
          <Button
            variant="primary"
            size="lg"
            fullWidth
            label="Done"
            onPress={() => {
              setShowAssigneePicker(false);
              setAssigneeSearch("");
            }}
            testID="assignee-picker-done"
          />
        }
      >
        <View
          style={{
            minHeight: 42,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            borderRadius: 12,
            backgroundColor: "#F8FAFC",
            borderWidth: 1,
            borderColor: "#E2E8F0",
          }}
        >
          <Search size={17} color="#94A3B8" strokeWidth={2} />
          <TextInput
            value={assigneeSearch}
            onChangeText={setAssigneeSearch}
            placeholder="Search members"
            placeholderTextColor="#94A3B8"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              flex: 1,
              paddingVertical: 10,
              fontSize: 14,
              color: "#0F172A",
            }}
            testID="assignee-search-input"
          />
          {assigneeSearch ? (
            <Pressable
              onPress={() => setAssigneeSearch("")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear member search"
            >
              <X size={16} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={toggleAllAssignees}
          style={{
            marginTop: 4,
            paddingHorizontal: 4,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          testID="assignee-select-all"
          accessibilityRole="button"
          accessibilityLabel={allAssigneesSelected ? "Deselect all members" : "Select all members"}
        >
          <Text style={{ fontSize: 13, color: ACCENT, fontWeight: "700" }}>
            {allAssigneesSelected ? "Deselect all" : "Select all"}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#94A3B8" }}>
            {selectedAssignees.length}/{allAssigneeIds.length}
          </Text>
        </Pressable>

        <ScrollView
          style={{ maxHeight: Math.min(ASSIGNEE_SHEET_MAX_HEIGHT - 280, Math.round(windowHeight * 0.42)) }}
          contentContainerStyle={{ paddingBottom: 4 }}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {filteredAssigneeOptions.length === 0 ? (
            <View style={{ paddingVertical: 28, alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B" }}>
                No members found
              </Text>
            </View>
          ) : (
            <AlenioList>
              {filteredAssigneeOptions.map((member) => {
                const isSelected = selectedAssignees.includes(member.userId);
                return (
                  <AlenioListRow
                    key={member.userId}
                    leading={
                      <View style={{ width: 36, height: 36, flexShrink: 0 }}>
                        <UserAvatar
                          user={member.user}
                          size={36}
                          radius={18}
                          backgroundColor={ACCENT_SOFT}
                          textColor={ACCENT}
                          fontSize={12}
                        />
                      </View>
                    }
                    title={memberDisplayName(member)}
                    trailing={
                      isSelected ? (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: ACCENT,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Check size={13} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      ) : (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 1.5,
                            borderColor: "#CBD5E1",
                            backgroundColor: "#FFFFFF",
                          }}
                        />
                      )
                    }
                    onPress={() => toggleAssignee(member.userId)}
                    accessibilityLabel={`${isSelected ? "Unassign" : "Assign"} ${memberDisplayName(member)}`}
                    testID={`assignee-${member.userId}`}
                  />
                );
              })}
            </AlenioList>
          )}
        </ScrollView>
      </AlenioBottomSheet>

      {/* Photo options modal */}
      <Modal visible={showPhotoOptions} transparent animationType="slide" onRequestClose={() => setShowPhotoOptions(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-end" activeOpacity={1} onPress={() => setShowPhotoOptions(false)}>
          <TouchableOpacity activeOpacity={1} className="bg-white dark:bg-slate-800 rounded-t-3xl px-4 pt-4 pb-10">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-slate-900 dark:text-white">Add Photo</Text>
              <TouchableOpacity onPress={() => setShowPhotoOptions(false)}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={takePhotoWithCamera}
                className="flex-row items-center p-4 rounded-xl border border-slate-200 dark:border-slate-700"
                style={{ gap: 12 }}
                testID="take-photo-button"
              >
                <View className="w-10 h-10 rounded-full bg-indigo-100 items-center justify-center">
                  <Camera size={20} color="#4361EE" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-slate-900 dark:text-white">Take Photo</Text>
                  <Text className="text-xs text-slate-400 mt-0.5">Use your camera</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pickPhotoFromLibrary}
                className="flex-row items-center p-4 rounded-xl border border-slate-200 dark:border-slate-700"
                style={{ gap: 12 }}
                testID="choose-from-library-button"
              >
                <View className="w-10 h-10 rounded-full bg-purple-100 items-center justify-center">
                  <ImageIcon size={20} color="#7C3AED" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-slate-900 dark:text-white">Choose from Library</Text>
                  <Text className="text-xs text-slate-400 mt-0.5">Select from your photos</Text>
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <AlenioBottomSheet
        visible={showSplitConfirm}
        title="Separate tasks?"
        subtitle="Choose how this work is shared."
        onClose={() => setShowSplitConfirm(false)}
        showCloseButton
        compact
        scrollEnabled={false}
        testID="split-confirm-sheet"
        footer={
          <View style={{ width: "100%", gap: 10 }}>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              label="Enable Joint Task"
              icon={<Users size={16} color="#FFFFFF" strokeWidth={2.4} />}
              onPress={() => {
                setIsJoint(true);
                setShowSplitConfirm(false);
              }}
              testID="split-confirm-enable-joint"
            />
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              label={`Create ${selectedAssignees.length} separate tasks`}
              onPress={() => confirmCreate()}
              testID="split-confirm-create-separate"
            />
          </View>
        }
      >
        <AlenioSheetCard tint="blue" compact>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#1E3A8A", lineHeight: 18 }}>
            You picked {selectedAssignees.length} people without Joint Task on. That creates{" "}
            {selectedAssignees.length} separate tasks — one each.
          </Text>
          <Text style={{ marginTop: 6, fontSize: 12, color: "#64748B", lineHeight: 17 }}>
            Turn on Joint Task if everyone should share one task.
          </Text>
        </AlenioSheetCard>
      </AlenioBottomSheet>

      {/* Template picker modal */}
      <Modal visible={showTemplatePicker} transparent animationType="slide" onRequestClose={() => { setShowTemplatePicker(false); setEditingTemplate(null); }}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-end" activeOpacity={1} onPress={() => { setShowTemplatePicker(false); setEditingTemplate(null); }}>
          <TouchableOpacity activeOpacity={1} className="bg-white dark:bg-slate-800 rounded-t-3xl px-4 pt-4 pb-10">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-slate-900 dark:text-white">
                {editingTemplate ? "Edit Template" : "Use Template"}
              </Text>
              <TouchableOpacity onPress={() => { setShowTemplatePicker(false); setEditingTemplate(null); }}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {editingTemplate ? (
              /* Edit form */
              <View style={{ gap: 12 }}>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="Template title..."
                  placeholderTextColor="#94A3B8"
                  className="text-sm font-semibold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5"
                  testID="edit-template-title-input"
                />
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Description (optional)"
                  placeholderTextColor="#94A3B8"
                  className="text-sm text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5"
                  multiline
                  numberOfLines={2}
                  testID="edit-template-description-input"
                />
                <View>
                  <Text className="text-xs font-semibold text-slate-500 mb-2">Priority</Text>
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {PRIORITIES.map((p) => (
                      <TouchableOpacity
                        key={p.value}
                        onPress={() => setEditPriority(p.value)}
                        className="px-3 py-1.5 rounded-full border"
                        style={
                          editPriority === p.value
                            ? { backgroundColor: p.color + "20", borderColor: p.color }
                            : { borderColor: "#E2E8F0", backgroundColor: "transparent" }
                        }
                        testID={`edit-priority-${p.value}`}
                      >
                        <Text
                          className="text-xs font-semibold"
                          style={{ color: editPriority === p.value ? p.color : "#94A3B8" }}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View className="flex-row" style={{ gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => setEditingTemplate(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 items-center"
                    testID="edit-template-cancel-button"
                  >
                    <Text className="text-sm font-semibold text-slate-500">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      updateTemplate({
                        id: editingTemplate.id,
                        data: { title: editTitle, description: editDescription, priority: editPriority },
                      })
                    }
                    disabled={updatingTemplate || !editTitle.trim()}
                    className="flex-1 py-2.5 rounded-xl items-center"
                    style={{ backgroundColor: "#4361EE" }}
                    testID="edit-template-save-button"
                  >
                    {updatingTemplate ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text className="text-sm font-semibold text-white">Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : templates.length === 0 ? (
              <Text className="text-sm text-slate-400 text-center py-6">No templates saved yet</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {templates.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => applyTemplate(t)}
                    className="flex-row items-center p-3 rounded-xl border border-slate-100 dark:border-slate-700"
                    testID={`template-${t.id}`}
                  >
                    <View className="flex-1">
                      <Text className="font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{t.title}</Text>
                      {t.description ? (
                        <Text className="text-xs text-slate-400 mt-0.5" numberOfLines={1}>{t.description}</Text>
                      ) : null}
                    </View>
                    <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: "#4361EE20" }}>
                      <Text className="text-xs font-semibold text-indigo-600 capitalize">{t.priority}</Text>
                    </View>
                    {myId && t.createdById === myId ? (
                      <View className="flex-row items-center ml-2" style={{ gap: 8 }}>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            setEditingTemplate(t);
                            setEditTitle(t.title);
                            setEditDescription(t.description ?? "");
                            setEditPriority(t.priority);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          testID={`edit-template-${t.id}`}
                        >
                          <Pencil size={15} color="#94A3B8" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            Alert.alert(
                              "Delete Template",
                              `Delete "${t.title}"? This cannot be undone.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                { text: "Delete", style: "destructive", onPress: () => deleteTemplate(t.id) },
                              ]
                            );
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          testID={`delete-template-${t.id}`}
                        >
                          <Trash2 size={15} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
