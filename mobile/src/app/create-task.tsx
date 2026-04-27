import React, { useState } from "react";
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
} from "react-native";
import { SafeKeyboardAwareScrollView as KeyboardAwareScrollView } from "@/lib/safe-keyboard-controller";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { X, BookOpen, Bookmark, Plus, Square, Camera, Pencil, Trash2, ImageIcon } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { useSession } from "@/lib/auth/use-session";
import type { Task, TaskPriority, RecurrenceType, Team, TeamMember, TaskTemplate } from "@/lib/types";

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

export default function CreateTaskScreen() {
  const { teamId, prefillTitle, initialDueDate } = useLocalSearchParams<{ teamId: string; prefillTitle?: string; initialDueDate?: string }>();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const [title, setTitle] = useState(typeof prefillTitle === "string" ? prefillTitle : "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [isIncognito, setIsIncognito] = useState(false);
  const [isJoint, setIsJoint] = useState(false);
  const [showSplitConfirm, setShowSplitConfirm] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
  const [recurrenceInterval, setRecurrenceInterval] = useState("1");
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
      if (t.recurrenceInterval) setRecurrenceInterval(String(t.recurrenceInterval));
      if (t.recurrenceDaysOfWeek != null) setSelectedDayOfWeek(parseInt(t.recurrenceDaysOfWeek));
      if (t.recurrenceDayOfMonth != null) setSelectedDayOfMonth(t.recurrenceDayOfMonth);
    } else {
      setIsRecurring(false);
    }
    setIsIncognito(t.incognito ?? false);
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
        recurrenceInterval: isRecurring ? parseInt(recurrenceInterval) || 1 : undefined,
        recurrenceDaysOfWeek: isRecurring && recurrenceType === "weekly" && selectedDayOfWeek !== null
          ? String(selectedDayOfWeek)
          : undefined,
        recurrenceDayOfMonth: isRecurring && recurrenceType === "monthly" && selectedDayOfMonth !== null
          ? selectedDayOfMonth
          : undefined,
        incognito: isIncognito,
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
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      router.back();
    },
    onError: () => setError("Failed to create task. Please try again."),
  });

  const confirmCreate = () => {
    setShowSplitConfirm(false);
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate!.toISOString(),
      assigneeIds: selectedAssignees,
      incognito: isIncognito,
      isJoint: isJoint || undefined,
      recurrence: isRecurring
        ? {
            type: recurrenceType,
            interval: parseInt(recurrenceInterval) || 1,
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
    <SafeAreaView
      className="flex-1 bg-white dark:bg-slate-900"
      edges={["top"]}
      testID="create-task-screen"
    >
        {/* Header */}
        <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <TouchableOpacity onPress={() => router.back()} testID="close-button">
              <X size={22} color="white" />
            </TouchableOpacity>
            <Text style={{ flex: 1, marginLeft: 12, color: "white", fontSize: 18, fontWeight: "700" }}>New Task</Text>
            <View className="flex-row items-center" style={{ gap: 14 }}>
              {templates.length > 0 ? (
                <TouchableOpacity onPress={() => setShowTemplatePicker(true)} testID="use-template-button">
                  <BookOpen size={20} color="white" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={handleSaveAsTemplate} disabled={savingTemplate} testID="save-template-button">
                  {savingTemplate ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Bookmark size={20} color="white" />
                  )}
                </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={createMutation.isPending}
                testID="create-button"
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-white font-semibold text-base">Create</Text>
                )}
              </TouchableOpacity>
              <Image source={require("@/assets/alenio-icon.png")} style={{ width: 30, height: 30, borderRadius: 6 }} />
            </View>
          </View>
        </LinearGradient>

        <KeyboardAwareScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                  ? dueDate.toLocaleString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
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

          {/* Assignees */}
          {members.length > 0 ? (
            <View className="py-4 border-b border-slate-100 dark:border-slate-800">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12 }}>
                <Text className="text-sm font-semibold text-slate-500">Assign to</Text>
                <Text style={{ fontSize: 12, color: "#EF4444", fontWeight: "600" }}>*</Text>
              </View>
              <View style={{ gap: 8 }}>
                {members.map((m: TeamMember) => {
                  const isSelected = selectedAssignees.includes(m.userId);
                  const isMe = m.userId === session?.user?.id;
                  const displayName = (m.user.name || m.user.email || "Unknown") + (isMe ? " (You)" : "");
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => toggleAssignee(m.userId)}
                      className="flex-row items-center p-3 rounded-xl border"
                      style={{
                        borderColor: isSelected ? "#4361EE" : "#E2E8F0",
                        backgroundColor: isSelected ? "#4361EE0D" : "transparent",
                      }}
                      testID={`assignee-${m.userId}`}
                    >
                      <View className="w-9 h-9 rounded-full overflow-hidden bg-indigo-100 items-center justify-center mr-3">
                        {m.user.image ? (
                          <Image source={{ uri: m.user.image }} style={{ width: 36, height: 36 }} resizeMode="cover" />
                        ) : (
                          <View className="w-9 h-9 rounded-full bg-indigo-600 items-center justify-center">
                            <Text className="text-white text-xs font-bold">
                              {displayName[0]?.toUpperCase() ?? "?"}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        className="flex-1 font-medium text-sm"
                        style={{ color: isSelected ? "#4361EE" : "#334155" }}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                      {isSelected ? (
                        <View className="w-5 h-5 rounded-full bg-indigo-600 items-center justify-center">
                          <Text className="text-white text-xs">✓</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
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

          {/* Recurring */}
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-semibold text-slate-500">
                  Recurring task
                </Text>
                <Text className="text-xs text-slate-400 mt-0.5">
                  Auto-create next occurrence when done
                </Text>
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
                  {RECURRENCE_TYPES.map((r) => (
                    <TouchableOpacity
                      key={r.value}
                      onPress={() => setRecurrenceType(r.value)}
                      className="px-3 py-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          recurrenceType === r.value ? "#4361EE" : "#F1F5F9",
                      }}
                      testID={`recurrence-${r.value}`}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{
                          color:
                            recurrenceType === r.value ? "white" : "#64748B",
                        }}
                      >
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text className="text-sm text-slate-500">Every</Text>
                  <TextInput
                    className="w-12 text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 text-slate-900 dark:text-white font-semibold"
                    value={recurrenceInterval}
                    onChangeText={(t) =>
                      setRecurrenceInterval(t.replace(/[^0-9]/g, ""))
                    }
                    keyboardType="numeric"
                    maxLength={2}
                    testID="interval-input"
                  />
                  <Text className="text-sm text-slate-500">
                    {recurrenceType === "daily"
                      ? "day(s)"
                      : recurrenceType === "weekly"
                      ? "week(s)"
                      : "month(s)"}
                  </Text>
                </View>

                {/* Day of week picker for weekly */}
                {recurrenceType === "weekly" ? (
                  <View>
                    <Text className="text-xs text-slate-500 mb-2">On</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                        <TouchableOpacity
                          key={i}
                          testID={`day-of-week-${i}`}
                          onPress={() => setSelectedDayOfWeek(selectedDayOfWeek === i ? null : i)}
                          className="w-10 h-10 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: selectedDayOfWeek === i ? "#4361EE" : "#F1F5F9",
                          }}
                        >
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: selectedDayOfWeek === i ? "white" : "#64748B" }}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Day of month picker for monthly */}
                {recurrenceType === "monthly" ? (
                  <View>
                    <Text className="text-xs text-slate-500 mb-2">On day</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <TouchableOpacity
                          key={day}
                          testID={`day-of-month-${day}`}
                          onPress={() => setSelectedDayOfMonth(selectedDayOfMonth === day ? null : day)}
                          className="w-9 h-9 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: selectedDayOfMonth === day ? "#4361EE" : "#F1F5F9",
                          }}
                        >
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: selectedDayOfMonth === day ? "white" : "#64748B" }}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Incognito — owners and team leaders only */}
          {!isRegularMember ? (
          <View className="py-4 border-b border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center justify-between">
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 16 }}>🕵️</Text>
                  <Text className="text-sm font-semibold text-slate-500">Incognito task</Text>
                </View>
                <Text className="text-xs text-slate-400 mt-0.5">
                  Counts toward your streak, but shows as anonymous on the team feed
                </Text>
              </View>
              <Switch
                value={isIncognito}
                onValueChange={setIsIncognito}
                trackColor={{ false: "#E2E8F0", true: "#6B8EF6" }}
                thumbColor="white"
                testID="incognito-switch"
              />
            </View>
          </View>
          ) : null}

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

          <View style={{ height: 32 }} />
        </KeyboardAwareScrollView>

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
    </SafeAreaView>
  );
}
