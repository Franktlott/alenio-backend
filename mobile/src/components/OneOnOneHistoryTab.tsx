import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { toast } from "burnt";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, X, ChevronLeft, MoreVertical } from "lucide-react-native";
import {
  createOneOnOneMeeting,
  deleteOneOnOneMeeting,
  fetchOneOnOneMeetings,
  fetchOneOnOneTemplates,
  updateOneOnOneMeeting,
  type OneOnOneMeeting,
  type OneOnOneTemplate,
  type OneOnOneTemplateField,
  type OneOnOneFollowUpTaskInput,
} from "@/lib/member-profile-api";
import {
  ASSOCIATE_FEEDBACK_FIELD_ID,
  ASSOCIATE_FEEDBACK_LABEL,
  formatAssociateResponseDisplay,
} from "@/lib/one-on-one-feedback";
import {
  getOneOnOneMeetingStatusFromMeeting,
  oneOnOneMeetingStatusColors,
  oneOnOneMeetingStatusLabel,
} from "@/lib/one-on-one-status";

type Props = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName: string | null;
  leaderUserId: string | null;
  canCreate: boolean;
  canModify: boolean;
};

type OneOneView = "list" | "pick" | "fill";

type FollowUpDraft = {
  id: string;
  title: string;
  assigneeRole: "associate" | "leader";
  dueDate: string;
};

function newFollowUpDraft(): FollowUpDraft {
  return { id: `${Date.now()}-${Math.random()}`, title: "", assigneeRole: "associate", dueDate: "" };
}

function formatMeetingDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function meetingToFillTemplate(meeting: OneOnOneMeeting): OneOnOneTemplate {
  return {
    id: meeting.templateId ?? meeting.id,
    teamId: meeting.teamId,
    title: meeting.templateTitle,
    description: null,
    fields: meeting.templateFields,
    createdById: meeting.createdById,
    createdAt: meeting.createdAt,
    updatedAt: meeting.createdAt,
    createdBy: meeting.createdBy,
  };
}

function dueDateInputToIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(`${trimmed}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function groupFields(fields: OneOnOneTemplateField[]) {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const groups: { section: OneOnOneTemplateField; fields: OneOnOneTemplateField[] }[] = [];
  let current: { section: OneOnOneTemplateField; fields: OneOnOneTemplateField[] } | null = null;
  for (const field of sorted) {
    if (field.type === "section") {
      current = { section: field, fields: [] };
      groups.push(current);
    } else if (field.type === "associate_notes") {
      continue;
    } else if (current) {
      current.fields.push(field);
    } else {
      current = {
        section: { id: "__general", label: "Responses", type: "section", order: 0 },
        fields: [field],
      };
      groups.push(current);
    }
  }
  return groups;
}

export function OneOnOneHistoryTab({
  teamId,
  memberUserId,
  memberName,
  managerName,
  leaderUserId,
  canCreate,
  canModify,
}: Props) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<OneOneView>("list");
  const [meetings, setMeetings] = useState<OneOnOneMeeting[]>([]);
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<OneOnOneTemplate | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<OneOnOneMeeting | null>(null);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [previewMeeting, setPreviewMeeting] = useState<OneOnOneMeeting | null>(null);
  const [menuMeetingId, setMenuMeetingId] = useState<string | null>(null);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<FollowUpDraft[]>([]);
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);

  const resolveLeaderUserId = (meeting?: OneOnOneMeeting | null) =>
    leaderUserId ?? meeting?.createdById ?? null;

  const buildFollowUpPayload = (meeting?: OneOnOneMeeting | null): OneOnOneFollowUpTaskInput[] => {
    const leaderId = resolveLeaderUserId(meeting);
    return followUpDrafts
      .map((draft) => ({ draft, title: draft.title.trim() }))
      .filter((item) => item.title.length > 0)
      .map(({ draft, title }) => {
        const dueDate = dueDateInputToIso(draft.dueDate);
        return {
          title,
          assigneeUserId: draft.assigneeRole === "associate" ? memberUserId : leaderId ?? memberUserId,
          ...(dueDate ? { dueDate } : {}),
        };
      });
  };

  const loadMeetings = useCallback(async () => {
    if (!teamId || !memberUserId) return;
    setLoadingMeetings(true);
    setErr(null);
    try {
      const list = await fetchOneOnOneMeetings(teamId, memberUserId);
      setMeetings(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load check-in history.");
    } finally {
      setLoadingMeetings(false);
    }
  }, [memberUserId, teamId]);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    setView("list");
    setSelectedTemplate(null);
    setEditingMeeting(null);
    setResponses({});
    setFollowUpDrafts([]);
    setPreviewMeeting(null);
    setMenuMeetingId(null);
    setErr(null);
    setTemplates([]);
  }, [memberUserId, teamId]);

  const startCreate = async () => {
    setErr(null);
    setEditingMeeting(null);
    setLoadingTemplates(true);
    setView("pick");
    try {
      const list = await fetchOneOnOneTemplates(teamId);
      setTemplates(list);
      if (list.length === 0) {
        setErr("No check-in templates yet. Ask your workspace owner to create templates on the web Team page.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load templates.");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const pickTemplate = (template: OneOnOneTemplate) => {
    setSelectedTemplate(template);
    setEditingMeeting(null);
    const initial: Record<string, string | number> = {};
    for (const field of template.fields) {
      if (field.type === "section") continue;
      if (field.type === "rating") initial[field.id] = 0;
      else initial[field.id] = "";
    }
    setResponses(initial);
    setFollowUpDrafts([newFollowUpDraft()]);
    setErr(null);
    setView("fill");
  };

  const startEdit = (meeting: OneOnOneMeeting) => {
    setPreviewMeeting(null);
    setMenuMeetingId(null);
    setEditingMeeting(meeting);
    setSelectedTemplate(meetingToFillTemplate(meeting));
    setResponses({ ...meeting.responses });
    setFollowUpDrafts([]);
    setErr(null);
    setView("fill");
  };

  const setFieldValue = (fieldId: string, value: string | number) => {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
  };

  const normalizeResponses = (fields: OneOnOneTemplateField[]) => {
    const normalized: Record<string, string | number> = {};
    for (const field of fields) {
      if (field.type === "section" || field.type === "associate_notes") continue;
      const raw = responses[field.id];
      if (field.type === "rating") {
        normalized[field.id] = typeof raw === "number" ? raw : Number(raw) || 0;
      } else {
        normalized[field.id] = typeof raw === "string" ? raw : String(raw ?? "");
      }
    }
    return normalized;
  };

  const performSave = async (requestAssociateFeedback: boolean) => {
    if (!selectedTemplate) return;
    setFeedbackPromptOpen(false);
    setSaving(true);
    setErr(null);
    try {
      const normalized = normalizeResponses(selectedTemplate.fields);
      const followUpTasks = buildFollowUpPayload(editingMeeting);
      const payload = { responses: normalized, followUpTasks, requestAssociateFeedback };
      if (editingMeeting) {
        await updateOneOnOneMeeting(teamId, memberUserId, editingMeeting.id, payload);
      } else {
        await createOneOnOneMeeting(teamId, memberUserId, {
          templateId: selectedTemplate.id,
          ...payload,
        });
      }
      await loadMeetings();
      setView("list");
      setSelectedTemplate(null);
      setEditingMeeting(null);
      setResponses({});
      setFollowUpDrafts([]);
      toast({ title: "Check-in saved", preset: "done" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save check-in.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (meeting: OneOnOneMeeting) => {
    setMenuMeetingId(null);
    Alert.alert(
      "Delete check-in?",
      `Delete this check-in from ${formatMeetingDate(meeting.createdAt)}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteOneOnOneMeeting(teamId, memberUserId, meeting.id);
              if (previewMeeting?.id === meeting.id) setPreviewMeeting(null);
              await loadMeetings();
              toast({ title: "Check-in deleted", preset: "done" });
            } catch (e) {
              toast({ title: e instanceof Error ? e.message : "Could not delete", preset: "error" });
            }
          },
        },
      ],
    );
  };

  const exitFill = () => {
    if (editingMeeting) {
      setView("list");
      setEditingMeeting(null);
      setSelectedTemplate(null);
    } else {
      setView("pick");
      setSelectedTemplate(null);
    }
    setFollowUpDrafts([]);
    setErr(null);
  };

  const renderFieldInput = (field: OneOnOneTemplateField) => {
    const value = responses[field.id] ?? "";
    const isLong = field.type === "long_text" || field.type === "manager_notes";

    if (field.type === "rating") {
      const max = field.ratingMax ?? 5;
      const current = typeof value === "number" ? value : Number(value) || 0;
      return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              onPress={() => setFieldValue(field.id, n)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: current === n ? "#4361EE" : "#F1F5F9",
              }}
            >
              <Text style={{ fontWeight: "700", color: current === n ? "white" : "#64748B" }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      );
    }

    return (
      <TextInput
        value={String(value)}
        onChangeText={(v) => setFieldValue(field.id, v)}
        multiline={isLong}
        placeholder={`Enter ${field.label.toLowerCase()}…`}
        style={{
          borderWidth: 1,
          borderColor: "#E2E8F0",
          borderRadius: 10,
          padding: 12,
          fontSize: 15,
          color: "#0F172A",
          minHeight: isLong ? 100 : undefined,
          textAlignVertical: isLong ? "top" : "center",
        }}
      />
    );
  };

  const renderFillView = () => {
    if (!selectedTemplate) return null;
    const fillFields = selectedTemplate.fields
      .filter((f) => f.type !== "section" && f.type !== "associate_notes")
      .sort((a, b) => a.order - b.order);

    return (
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#F1F5F9",
            gap: 12,
          }}
        >
          <Pressable onPress={exitFill} hitSlop={8}>
            <ChevronLeft size={22} color="#4361EE" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A" }}>
              {editingMeeting ? "Edit check-in" : selectedTemplate.title}
            </Text>
            <Text style={{ fontSize: 12, color: "#64748B" }}>{memberName}</Text>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 100 }}>
            {err ? <Text style={{ fontSize: 13, color: "#DC2626" }}>{err}</Text> : null}
            {fillFields.map((field) => (
              <View key={field.id}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6 }}>
                  {field.label}
                </Text>
                {renderFieldInput(field)}
              </View>
            ))}

            {!editingMeeting ? (
              <View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>Follow-up tasks</Text>
                  <Pressable onPress={() => setFollowUpDrafts([...followUpDrafts, newFollowUpDraft()])}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>Add task</Text>
                  </Pressable>
                </View>
                {followUpDrafts.map((draft) => (
                  <View
                    key={draft.id}
                    style={{
                      marginBottom: 12,
                      padding: 12,
                      backgroundColor: "#F8FAFC",
                      borderRadius: 12,
                      gap: 8,
                    }}
                  >
                    <TextInput
                      value={draft.title}
                      onChangeText={(v) =>
                        setFollowUpDrafts(
                          followUpDrafts.map((d) => (d.id === draft.id ? { ...d, title: v } : d)),
                        )
                      }
                      placeholder="Task title"
                      style={{
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        borderRadius: 8,
                        padding: 10,
                        fontSize: 14,
                        backgroundColor: "white",
                      }}
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() =>
                          setFollowUpDrafts(
                            followUpDrafts.map((d) =>
                              d.id === draft.id ? { ...d, assigneeRole: "associate" } : d,
                            ),
                          )
                        }
                        style={{
                          flex: 1,
                          padding: 8,
                          borderRadius: 8,
                          backgroundColor: draft.assigneeRole === "associate" ? "#EEF2FF" : "white",
                          borderWidth: 1,
                          borderColor: draft.assigneeRole === "associate" ? "#4361EE" : "#E2E8F0",
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#4361EE" }}>{memberName}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          setFollowUpDrafts(
                            followUpDrafts.map((d) =>
                              d.id === draft.id ? { ...d, assigneeRole: "leader" } : d,
                            ),
                          )
                        }
                        style={{
                          flex: 1,
                          padding: 8,
                          borderRadius: 8,
                          backgroundColor: draft.assigneeRole === "leader" ? "#EEF2FF" : "white",
                          borderWidth: 1,
                          borderColor: draft.assigneeRole === "leader" ? "#4361EE" : "#E2E8F0",
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#4361EE" }}>
                          {managerName ?? "Leader"}
                        </Text>
                      </Pressable>
                    </View>
                    <TextInput
                      value={draft.dueDate}
                      onChangeText={(v) =>
                        setFollowUpDrafts(
                          followUpDrafts.map((d) => (d.id === draft.id ? { ...d, dueDate: v } : d)),
                        )
                      }
                      placeholder="Due date (YYYY-MM-DD)"
                      style={{
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        borderRadius: 8,
                        padding: 10,
                        fontSize: 14,
                        backgroundColor: "white",
                      }}
                    />
                    {followUpDrafts.length > 1 ? (
                      <Pressable onPress={() => setFollowUpDrafts(followUpDrafts.filter((d) => d.id !== draft.id))}>
                        <Text style={{ fontSize: 12, color: "#EF4444" }}>Remove task</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

        <View
          style={{
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: "#F1F5F9",
            backgroundColor: "white",
          }}
        >
          <Pressable
            onPress={() => setFeedbackPromptOpen(true)}
            disabled={saving}
            style={{
              backgroundColor: "#4361EE",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Text style={{ fontWeight: "700", color: "white" }}>{saving ? "Saving…" : "Save check-in"}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderPickView = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 }}>
        <Pressable onPress={() => setView("list")} hitSlop={8}>
          <ChevronLeft size={22} color="#4361EE" />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Choose template</Text>
      </View>
      {loadingTemplates ? (
        <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
      ) : templates.length === 0 ? (
        <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 8 }}>{err ?? "No templates available."}</Text>
      ) : (
        <View style={{ gap: 10, marginTop: 8 }}>
          {templates.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => pickTemplate(t)}
              style={{
                backgroundColor: "white",
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: "#E2E8F0",
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>{t.title}</Text>
              {t.description ? (
                <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{t.description}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  if (view === "fill") return renderFillView();
  if (view === "pick") return renderPickView();

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Check-in history</Text>
          <Text style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
            Meetings with {memberName}
          </Text>
        </View>
        {canCreate ? (
          <Pressable
            onPress={() => void startCreate()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#4361EE",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Plus size={16} color="white" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>New check-in</Text>
          </Pressable>
        ) : null}
      </View>

      {!canCreate && !canModify ? (
        <View
          style={{
            backgroundColor: "#F8FAFC",
            borderRadius: 10,
            padding: 12,
            borderWidth: 1,
            borderColor: "#E2E8F0",
          }}
        >
          <Text style={{ fontSize: 13, color: "#64748B", lineHeight: 18 }}>
            View only on mobile. Create and edit check-ins from the web Team page.
          </Text>
        </View>
      ) : null}

      {loadingMeetings ? (
        <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
      ) : err && meetings.length === 0 ? (
        <Text style={{ fontSize: 13, color: "#DC2626" }}>{err}</Text>
      ) : meetings.length === 0 ? (
        <Text style={{ fontSize: 13, color: "#94A3B8" }}>
          {canCreate ? "No check-ins yet. Tap New check-in to start one." : "No check-ins recorded."}
        </Text>
      ) : (
        <View style={{ gap: 10 }}>
          {[...meetings]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((meeting) => {
              const status = getOneOnOneMeetingStatusFromMeeting(meeting);
              const colors = oneOnOneMeetingStatusColors(status);
              return (
                <Pressable
                  key={meeting.id}
                  onPress={() => setPreviewMeeting(meeting)}
                  style={{
                    backgroundColor: "white",
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>
                        {meeting.templateTitle}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                        {formatMeetingDate(meeting.createdAt)}
                      </Text>
                      <View
                        style={{
                          alignSelf: "flex-start",
                          marginTop: 8,
                          backgroundColor: colors.bg,
                          borderRadius: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text }}>
                          {oneOnOneMeetingStatusLabel(status)}
                        </Text>
                      </View>
                    </View>
                    {canModify ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          setMenuMeetingId(menuMeetingId === meeting.id ? null : meeting.id);
                        }}
                        hitSlop={8}
                      >
                        <MoreVertical size={18} color="#64748B" />
                      </Pressable>
                    ) : null}
                  </View>
                  {menuMeetingId === meeting.id ? (
                    <View style={{ marginTop: 10, backgroundColor: "#F8FAFC", borderRadius: 10, overflow: "hidden" }}>
                      <Pressable
                        onPress={() => startEdit(meeting)}
                        style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: "#4361EE" }}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => onDelete(meeting)} style={{ padding: 12 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: "#EF4444" }}>Delete</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
        </View>
      )}

      <Modal
        visible={!!previewMeeting}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        onRequestClose={() => setPreviewMeeting(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "white",
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: "#F1F5F9",
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A" }}>
                  {previewMeeting?.templateTitle}
                </Text>
                <Text style={{ fontSize: 12, color: "#64748B" }}>
                  {previewMeeting ? formatMeetingDate(previewMeeting.createdAt) : ""}
                </Text>
              </View>
              <Pressable onPress={() => setPreviewMeeting(null)} hitSlop={12}>
                <X size={22} color="#64748B" />
              </Pressable>
            </View>
            {previewMeeting ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
                {groupFields(previewMeeting.templateFields).map((group) => {
                  const items = group.fields.filter((f) => {
                    const ans = previewMeeting.responses[f.id];
                    return ans !== undefined && ans !== "" && ans !== 0;
                  });
                  if (items.length === 0) return null;
                  return (
                    <View key={group.section.id}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: "#0F172A", marginBottom: 8 }}>
                        {group.section.label}
                      </Text>
                      {items.map((field) => (
                        <View key={field.id} style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B" }}>{field.label}</Text>
                          <Text style={{ fontSize: 14, color: "#334155", marginTop: 4 }}>
                            {formatAssociateResponseDisplay(previewMeeting.responses[field.id])}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
                {(() => {
                  const associateAnswer = previewMeeting.responses[ASSOCIATE_FEEDBACK_FIELD_ID];
                  const showAssociateFeedback =
                    (associateAnswer !== undefined && associateAnswer !== "" && associateAnswer !== 0) ||
                    previewMeeting.associateFeedbackPending;
                  if (!showAssociateFeedback) return null;
                  return (
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: "#0F172A", marginBottom: 8 }}>
                        {ASSOCIATE_FEEDBACK_LABEL}
                      </Text>
                      <Text style={{ fontSize: 14, color: "#334155" }}>
                        {associateAnswer !== undefined && associateAnswer !== "" && associateAnswer !== 0
                          ? formatAssociateResponseDisplay(associateAnswer)
                          : "Awaiting associate feedback"}
                      </Text>
                    </View>
                  );
                })()}
                {previewMeeting.followUpTasks && previewMeeting.followUpTasks.length > 0 ? (
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: "#0F172A", marginBottom: 8 }}>
                      Follow-up tasks
                    </Text>
                    {previewMeeting.followUpTasks.map((task) => (
                      <View
                        key={task.id}
                        style={{ marginBottom: 8, padding: 10, backgroundColor: "#F8FAFC", borderRadius: 8 }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{task.title}</Text>
                        <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                          {task.assignee?.name ?? "Unassigned"}
                          {task.dueDate ? ` · Due ${formatMeetingDate(task.dueDate)}` : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
            {canModify && previewMeeting ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
                <Pressable
                  onPress={() => {
                    const m = previewMeeting;
                    setPreviewMeeting(null);
                    startEdit(m);
                  }}
                  style={{
                    backgroundColor: "#4361EE",
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "700", color: "white" }}>Edit check-in</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={feedbackPromptOpen} transparent animationType="fade" onRequestClose={() => setFeedbackPromptOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            padding: 24,
            paddingTop: 24 + insets.top,
            paddingBottom: 24 + insets.bottom,
          }}
          onPress={() => setFeedbackPromptOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()} style={{ backgroundColor: "white", borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Request feedback?</Text>
            <Text style={{ fontSize: 14, color: "#64748B", marginTop: 8, lineHeight: 20 }}>
              Request feedback and commitments from {memberName}? They&apos;ll receive a task to share their notes.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable
                onPress={() => void performSave(false)}
                disabled={saving}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#F1F5F9", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "700", color: "#64748B" }}>No</Text>
              </Pressable>
              <Pressable
                onPress={() => void performSave(true)}
                disabled={saving}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#4361EE", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "700", color: "white" }}>Yes</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
