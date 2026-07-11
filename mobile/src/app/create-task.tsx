import React, { useMemo, useState } from "react";
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
} from "react-native";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { X, BookOpen, Bookmark, Plus, Square, Camera, Pencil, Trash2, ImageIcon, Check, ChevronDown } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { useSession } from "@/lib/auth/use-session";
import type { Task, TaskPriority, RecurrenceType, Team, TeamMember, TaskTemplate } from "@/lib/types";
import { recurrenceCountHint, recurrenceDurationUnit } from "@/lib/recurring-task";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { calendarDueIso, resolveTimeZone } from "@/lib/timezone";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";

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

const SCREEN_HEIGHT = Dimensions.get("window").height;
const CREATE_TASK_SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.92);
const ASSIGNEE_SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.62);

export default function CreateTaskScreen() {
  const { teamId, prefillTitle, initialDueDate } = useLocalSearchParams<{ teamId: string; prefillTitle?: string; initialDueDate?: string }>();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const insets = useSafeAreaInsets();

  const { data: meProfile } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get<{ timezone?: string | null }>("/api/me"),
    enabled: !!teamId,
  });

  const [title, setTitle] = useState(typeof prefillTitle === "string" ? prefillTitle : "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subtaskTitles, setSubtaskTitles] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);

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
  const currentMembership = members.find((m) => m.userId === session?.user?.id);
  const isRegularMember = !currentMembership || currentMembership.role === "member";

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
  const allAssigneeIds = useMemo(() => assigneeOptions.map((m) => m.userId), [assigneeOptions]);
  const allAssigneesSelected =
    allAssigneeIds.length > 0 && allAssigneeIds.every((id) => selectedAssignees.includes(id));

  const { data: templates = [] } = useQuery({
    queryKey: ["templates", teamId],
    queryFn: () => api.get<TaskTemplate[]>(`/api/teams/${teamId}/templates`),
    enabled: !!teamId,
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

  const handleSaveAsTemplate = async () => {
    if (!title.trim()) {
      setError("Please enter a task title before saving as template");
      return;
    }
    setSavingTemplate(true);
    try {
      let templateAttachmentUrl: string | undefined;
      if (attachmentUri) {
        if (attachmentUri.startsWith("file://") || attachmentUri.startsWith("/")) {
          setUploadingPhoto(true);
          const filename = attachmentUri.split("/").pop() ?? "photo.jpg";
          const uploaded = await uploadFile(attachmentUri, filename, "image/jpeg");
          templateAttachmentUrl = uploaded.url;
          setUploadingPhoto(false);
        } else {
          templateAttachmentUrl = attachmentUri;
        }
      }
      await api.post(`/api/teams/${teamId}/templates`, {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        attachmentUrl: templateAttachmentUrl || undefined,
        subtasks: subtaskTitles.map((s, i) => ({ title: s, order: i })),
        isRecurring,
        recurrenceType: isRecurring ? recurrenceType : undefined,
        recurrenceInterval: isRecurring ? parseInt(recurrenceCount) || 1 : undefined,
        recurrenceDaysOfWeek: isRecurring && recurrenceType === "weekly" && selectedDayOfWeek !== null
          ? String(selectedDayOfWeek)
          : undefined,
        recurrenceDayOfMonth: isRecurring && recurrenceType === "monthly" && selectedDayOfMonth !== null
          ? selectedDayOfMonth
          : undefined,
        isJoint,
      });
      queryClient.invalidateQueries({ queryKey: ["templates", teamId] });
      setError(null);
    } catch {
      setError("Failed to save template");
    } finally {
      setSavingTemplate(false);
      setUploadingPhoto(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      let attachmentUrl: string | undefined;
      if (attachmentUri) {
        const filename = attachmentUri.split("/").pop() ?? "photo.jpg";
        const uploaded = await uploadFile(attachmentUri, filename, "image/jpeg");
        attachmentUrl = uploaded.url;
      }
      const tasks = await api.post<Task[]>(`/api/teams/${teamId}/tasks`, { ...input, attachmentUrl });
      // Attach subtasks to each created task
      for (const task of tasks) {
        for (const subtaskTitle of subtaskTitles) {
          await api.post(`/api/teams/${teamId}/tasks/${task.id}/subtasks`, { title: subtaskTitle });
        }
      }
      return tasks;
    },
    onSuccess: () => {
      invalidateTaskCaches(queryClient, teamId);
      router.back();
    },
    onError: () => setError("Failed to create task. Please try again."),
  });

  const confirmCreate = () => {
    setShowSplitConfirm(false);
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      status: "todo",
      priority,
      dueDate: dueDate ? calendarDueIso(dueDate, resolveTimeZone(meProfile?.timezone)) : undefined,
      timeZone: resolveTimeZone(meProfile?.timezone),
      assigneeIds: selectedAssignees,
      isJoint: isJoint || undefined,
      recurrence: isRecurring
        ? {
            type: recurrenceType,
            occurrenceCount: parseInt(recurrenceCount) || 1,
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
      return;
    }
    if (selectedAssignees.length === 0) {
      setError("Please assign this task to at least one person");
      return;
    }
    setError(null);
    if (selectedAssignees.length >= 2 && !isJoint) {
      setShowSplitConfirm(true);
      return;
    }
    confirmCreate();
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
    return member.userId === session?.user?.id ? `${base} (You)` : base;
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

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }} testID="create-task-screen">
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={() => router.back()}
        testID="create-task-backdrop"
      />
      <SafeKeyboardAvoidingView style={{ justifyContent: "flex-end" }}>
        <Pressable
          style={{
            backgroundColor: "white",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: CREATE_TASK_SHEET_MAX_HEIGHT,
            overflow: "hidden",
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 8, marginBottom: 12 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Image source={require("@/assets/alenio-icon.png")} style={{ width: 28, height: 28, borderRadius: 7 }} />
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>New Task</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {templates.length > 0 ? (
                <TouchableOpacity onPress={() => setShowTemplatePicker(true)} testID="use-template-button">
                  <BookOpen size={20} color="#64748B" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={handleSaveAsTemplate} disabled={savingTemplate} testID="save-template-button">
                {savingTemplate ? <ActivityIndicator color="#4361EE" size="small" /> : <Bookmark size={20} color="#64748B" />}
              </TouchableOpacity>
              <Pressable
                onPress={() => router.back()}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
                testID="close-button"
              >
                <X size={16} color="#64748B" />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={{ maxHeight: CREATE_TASK_SHEET_MAX_HEIGHT - 88 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
          {/* Title */}
          <TextInput
            className="text-xl font-semibold text-slate-900 dark:text-white py-4 border-b border-slate-100 dark:border-slate-800"
            placeholder="Task title..."
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              setError(null);
            }}
            multiline
            returnKeyType="next"
            testID="title-input"
          />

          {/* Description */}
          <TextInput
            className="text-base text-slate-600 dark:text-slate-400 py-3 border-b border-slate-100 dark:border-slate-800"
            placeholder="Add description (optional)"
            placeholderTextColor="#94A3B8"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            testID="description-input"
          />

          {error ? (
            <Text className="text-red-500 text-sm mt-2">{error}</Text>
          ) : null}

          {/* Priority */}
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
            <Text className="text-sm font-semibold text-slate-500 mb-3">
              Priority
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  onPress={() => setPriority(p.value)}
                  className="px-3 py-1.5 rounded-full border"
                  style={
                    priority === p.value
                      ? {
                          backgroundColor: p.color + "20",
                          borderColor: p.color,
                        }
                      : { borderColor: "#E2E8F0", backgroundColor: "transparent" }
                  }
                  testID={`priority-${p.value}`}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{
                      color: priority === p.value ? p.color : "#94A3B8",
                    }}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Due Date */}
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
            <Text className="text-sm font-semibold text-slate-500 mb-3">
              Due Date <Text className="text-red-500">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              className="flex-row items-center px-4 py-3 rounded-xl border"
              style={{ borderColor: dueDate ? "#4361EE" : "#E2E8F0", backgroundColor: dueDate ? "#4361EE0D" : "#F8FAFC" }}
              testID="due-date-picker-button"
            >
              <Text className="text-lg mr-3">📅</Text>
              <Text className="flex-1 text-sm font-medium" style={{ color: dueDate ? "#4361EE" : "#94A3B8" }}>
                {dueDate
                  ? dueDate.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })
                  : "Select a due date"}
              </Text>
              {dueDate ? (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setDueDate(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text className="text-slate-400 text-base">✕</Text>
                </TouchableOpacity>
              ) : (
                <Text className="text-slate-400">›</Text>
              )}
            </TouchableOpacity>

            {/* iOS inline picker shown in modal */}
            {Platform.OS === "ios" ? (
              <Modal visible={showDatePicker} transparent animationType="slide">
                <View className="flex-1 justify-end">
                  <View className="bg-white dark:bg-slate-900 rounded-t-3xl" style={{ shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20 }}>
                    <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
                      <TouchableOpacity onPress={() => { setShowDatePicker(false); setDueDate(null); }}>
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
                      display="spinner"
                      minimumDate={isRegularMember ? new Date() : undefined}
                      onChange={(_e, date) => { if (date) { date.setHours(23, 59, 59, 0); setDueDate(date); setError(null); } }}
                      testID="date-time-picker"
                      style={{ height: 200 }}
                    />
                    <View style={{ height: 20 }} />
                  </View>
                </View>
              </Modal>
            ) : (
              showDatePicker ? (
                <DateTimePicker
                  value={dueDate ?? new Date()}
                  mode="date"
                  display="calendar"
                  minimumDate={isRegularMember ? new Date() : undefined}
                  onChange={(_e, date) => { setShowDatePicker(false); if (date) { date.setHours(23, 59, 59, 0); setDueDate(date); setError(null); } }}
                  testID="date-time-picker"
                />
              ) : null
            )}
          </View>

          {/* Recurring */}
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
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
                        onPress={() => setRecurrenceType(r.value)}
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
                    className="w-12 text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 text-slate-900 dark:text-white font-semibold"
                    value={recurrenceCount}
                    onChangeText={(t) =>
                      setRecurrenceCount(t.replace(/[^0-9]/g, ""))
                    }
                    keyboardType="numeric"
                    maxLength={2}
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

          {/* Photo attachment */}
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
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

          {/* Subtasks */}
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
            <Text className="text-sm font-semibold text-slate-500 mb-3">
              Subtasks{subtaskTitles.length > 0 ? ` (${subtaskTitles.length})` : ""}
            </Text>
            {subtaskTitles.length > 0 ? (
              <View className="mb-3" style={{ gap: 6 }}>
                {subtaskTitles.map((title, index) => (
                  <View key={index} className="flex-row items-center" style={{ gap: 8 }}>
                    <Square size={16} color="#CBD5E1" />
                    <Text className="flex-1 text-sm text-slate-700 dark:text-slate-300">{title}</Text>
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

          {/* Assignees */}
          {members.length > 0 ? (
            <View className="py-4 border-b border-slate-100 dark:border-slate-800">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <Text className="text-sm font-semibold text-slate-500">Assign to</Text>
                <Text style={{ fontSize: 12, color: "#EF4444", fontWeight: "600" }}>*</Text>
              </View>
              <Pressable
                onPress={() => setShowAssigneePicker(true)}
                style={{
                  borderWidth: 1.5,
                  borderColor: selectedAssignees.length > 0 ? "#4361EE" : "#E2E8F0",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: selectedAssignees.length > 0 ? "#4361EE0D" : "#FFFFFF",
                }}
                testID="assignee-picker-button"
              >
                <Text style={{ fontSize: 13, color: "#334155", fontWeight: "500", flex: 1 }} numberOfLines={1}>
                  {selectedAssignees.length === 0
                    ? "Select associates"
                    : allAssigneesSelected
                      ? "All associates"
                      : `${selectedAssignees.length} associate${selectedAssignees.length === 1 ? "" : "s"} selected`}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </Pressable>
            </View>
          ) : null}

          {/* Joint Task — only shown when 2+ assignees selected */}
          {selectedAssignees.length >= 2 ? (
            <View className="py-4 border-b border-slate-100 dark:border-slate-800">
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

          <TouchableOpacity
            onPress={handleCreate}
            disabled={createMutation.isPending}
            style={{
              marginTop: 8,
              backgroundColor: "#4361EE",
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
            }}
            testID="create-button"
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>Create Task</Text>
            )}
          </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </SafeKeyboardAvoidingView>

      <Modal visible={showAssigneePicker} transparent animationType="slide" onRequestClose={() => setShowAssigneePicker(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}
          onPress={() => setShowAssigneePicker(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: "white",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: ASSIGNEE_SHEET_MAX_HEIGHT,
                paddingBottom: insets.bottom + 12,
                overflow: "hidden",
              }}
            >
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 10, marginBottom: 14 }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>Assign to</Text>
                <Pressable
                  onPress={() => setShowAssigneePicker(false)}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
                >
                  <X size={16} color="#64748B" />
                </Pressable>
              </View>
              <Pressable
                onPress={toggleAllAssignees}
                style={{
                  marginHorizontal: 20,
                  marginBottom: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderRadius: 12,
                  backgroundColor: "#F8FAFC",
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                }}
                testID="assignee-select-all"
              >
                <Text style={{ fontSize: 13, color: "#4361EE", fontWeight: "700" }}>
                  {allAssigneesSelected ? "Deselect all" : "Select all"}
                </Text>
                {allAssigneesSelected ? <Check size={16} color="#4361EE" /> : null}
              </Pressable>
              <ScrollView
                style={{ maxHeight: ASSIGNEE_SHEET_MAX_HEIGHT - 210 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                {assigneeOptions.map((member, idx) => {
                  const isSelected = selectedAssignees.includes(member.userId);
                  return (
                    <Pressable
                      key={member.userId}
                      onPress={() => toggleAssignee(member.userId)}
                      style={{
                        paddingVertical: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottomWidth: idx === assigneeOptions.length - 1 ? 0 : 1,
                        borderBottomColor: "#F1F5F9",
                      }}
                      testID={`assignee-${member.userId}`}
                    >
                      <Text style={{ fontSize: 15, color: "#334155", fontWeight: isSelected ? "700" : "500", flex: 1 }} numberOfLines={1}>
                        {memberDisplayName(member)}
                      </Text>
                      {isSelected ? <Check size={16} color="#4361EE" /> : <View style={{ width: 16, height: 16 }} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                onPress={() => setShowAssigneePicker(false)}
                style={{
                  marginHorizontal: 20,
                  marginTop: 8,
                  backgroundColor: "#4361EE",
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
                testID="assignee-picker-done"
              >
                <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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

      {/* Split confirm modal */}
      <Modal visible={showSplitConfirm} transparent animationType="fade" onRequestClose={() => setShowSplitConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
          <View className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full" style={{ shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 24 }}>
            <Text className="text-base font-bold text-slate-900 dark:text-white mb-3">Creating separate tasks</Text>
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-1">
              {"You've selected "}
              <Text style={{ fontWeight: "bold" }}>{selectedAssignees.length} people</Text>
              {" without enabling Joint Task. This will create "}
              <Text style={{ fontWeight: "bold" }}>{selectedAssignees.length} separate tasks</Text>
              {" — one for each person."}
            </Text>
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              {"\nEnable Joint Task if you want everyone working on the same shared task."}
            </Text>
            <TouchableOpacity
              onPress={() => { setIsJoint(true); setShowSplitConfirm(false); }}
              className="py-3 rounded-xl items-center mb-3"
              style={{ backgroundColor: "#4361EE" }}
              testID="split-confirm-enable-joint"
            >
              <Text className="text-sm font-semibold text-white">Enable Joint Task</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmCreate}
              className="py-3 rounded-xl items-center border"
              style={{ borderColor: "#CBD5E1" }}
              testID="split-confirm-create-separate"
            >
              <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {`Create ${selectedAssignees.length} separate tasks`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                    {t.createdById === session?.user?.id ? (
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
    </View>
  );
}
