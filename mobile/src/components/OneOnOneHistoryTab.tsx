import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { toast } from "burnt";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, X, ChevronLeft, MoreVertical, Check, CalendarCheck } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import {
  planOneOnOneHref,
  type PlannedOneOnOneEvent,
} from "@/lib/plan-one-on-one";
import { formatEventTimeRange, eventShowsScheduledTime } from "@/lib/format-event-time";
import {
  createOneOnOneMeeting,
  deleteOneOnOneMeeting,
  fetchOneOnOneMeetings,
  fetchOneOnOneTemplates,
  fetchPlannedOneOnOnes,
  updateOneOnOneMeeting,
  type OneOnOneMeeting,
  type OneOnOneTemplate,
  type OneOnOneTemplateField,
  type OneOnOneFollowUpTaskInput,
} from "@/lib/member-profile-api";
import {
  appendLeaderCommentsIfMissing,
  findLeaderCommentsField,
  isLeaderCommentsEmpty,
  LEADER_COMMENTS_NUDGE_COPY,
  LEADER_COMMENTS_NUDGE_TITLE,
} from "@/lib/check-in-leader-comments";
import { validateCheckInResponses } from "@/lib/validate-check-in-responses";
import { meetingNumberFor, downloadOneOnOneMeetingPdf, printOneOnOneMeeting } from "@/lib/one-on-one-print";
import { oneOnOneDisplayDate, oneOnOneDisplayDateMs } from "@/lib/one-on-one-dates";
import {
  ASSOCIATE_FEEDBACK_FIELD_ID,
  ASSOCIATE_FEEDBACK_LABEL,
  formatAssociateResponseDisplay,
  formatYesNoResponseDisplay,
} from "@/lib/one-on-one-feedback";
import {
  checkInEditActionLabel,
  checkInEditMenuLabel,
  canPrintCheckIn,
  countOverdueFollowUpTasks,
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
  isSelf?: boolean;
  autoStartCheckIn?: boolean;
  preferredTemplateId?: string | null;
  plannedEventId?: string | null;
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

function formatScheduledOneOnOneWhen(event: PlannedOneOnOneEvent): string {
  const datePart = formatMeetingDate(event.startDate);
  if (eventShowsScheduledTime({ allDay: event.allDay ?? false, isVideoMeeting: event.isVideoMeeting })) {
    return `${datePart} · ${formatEventTimeRange(event.startDate, event.endDate)}`;
  }
  return datePart;
}

const PLANNED_ONE_ON_ONE_VISIBLE_ROWS = 2;
const PLANNED_ONE_ON_ONE_ROW_HEIGHT = 56;
const PLANNED_ONE_ON_ONE_ROW_GAP = 8;
const PLANNED_ONE_ON_ONE_LIST_HEIGHT =
  PLANNED_ONE_ON_ONE_VISIBLE_ROWS * PLANNED_ONE_ON_ONE_ROW_HEIGHT +
  (PLANNED_ONE_ON_ONE_VISIBLE_ROWS - 1) * PLANNED_ONE_ON_ONE_ROW_GAP +
  16;

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match?.[1] ? match[0] : undefined;
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

function CheckInEmptyState({
  memberName,
  canCreate,
  error,
  onStart,
}: {
  memberName: string;
  canCreate: boolean;
  error?: string | null;
  onStart?: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: "#F8FAFC",
        borderRadius: 16,
        padding: 28,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderStyle: "dashed",
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <CalendarCheck size={28} color="#4361EE" />
      </View>
      <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A", textAlign: "center" }}>
        {error ? "Could not load check-ins" : "No check-ins yet"}
      </Text>
      <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 21, marginTop: 8, maxWidth: 300 }}>
        {error
          ? error
          : canCreate
            ? `Run a structured check-in with ${memberName}. Pick a template, capture notes, and add follow-up tasks.`
            : `When a leader publishes a check-in with ${memberName}, it will appear here.`}
      </Text>
      {canCreate && onStart && !error ? (
        <Pressable
          onPress={onStart}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: "#4361EE",
            borderRadius: 12,
            paddingHorizontal: 18,
            paddingVertical: 12,
            marginTop: 20,
          }}
        >
          <Plus size={16} color="white" />
          <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>Start first check-in</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OneOnOneHistoryTab({
  teamId,
  memberUserId,
  memberName,
  managerName,
  leaderUserId,
  canCreate,
  canModify,
  isSelf = false,
  autoStartCheckIn = false,
  preferredTemplateId = null,
  plannedEventId = null,
}: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const canViewUpcoming = canCreate || isSelf;
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
  const [printingPdf, setPrintingPdf] = useState(false);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<FollowUpDraft[]>([]);
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);
  const [leaderCommentsNudgeOpen, setLeaderCommentsNudgeOpen] = useState(false);
  const [highlightLeaderFieldId, setHighlightLeaderFieldId] = useState<string | null>(null);
  const [highlightRequiredFieldId, setHighlightRequiredFieldId] = useState<string | null>(null);
  const fillScrollRef = useRef<ScrollView>(null);
  const [prepAcknowledged, setPrepAcknowledged] = useState(false);
  const [linkedPlannedEventId, setLinkedPlannedEventId] = useState<string | null>(null);
  const autoStartHandledRef = useRef(false);

  const {
    data: upcomingPlanned = [],
    refetch: refetchPlannedOneOnOnes,
    isError: plannedLoadError,
    error: plannedLoadErrorDetail,
  } = useQuery({
    queryKey: ["planned-one-on-ones", teamId, memberUserId],
    queryFn: () => fetchPlannedOneOnOnes(teamId, memberUserId),
    enabled: !!teamId && !!memberUserId && canViewUpcoming,
  });

  useFocusEffect(
    useCallback(() => {
      if (!teamId || !memberUserId || !canViewUpcoming) return;
      void refetchPlannedOneOnOnes();
    }, [teamId, memberUserId, canViewUpcoming, refetchPlannedOneOnOnes]),
  );

  useEffect(() => {
    if (!teamId || !memberUserId || !canViewUpcoming) return;
    void refetchPlannedOneOnOnes();
  }, [teamId, memberUserId, canViewUpcoming, refetchPlannedOneOnOnes]);

  const { data: templateCatalog = [] } = useQuery({
    queryKey: ["one-on-one-templates", teamId],
    queryFn: () => fetchOneOnOneTemplates(teamId),
    enabled: !!teamId && canCreate,
  });

  const templateTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const template of templateCatalog) {
      map.set(template.id, template.title);
    }
    for (const template of templates) {
      map.set(template.id, template.title);
    }
    return map;
  }, [templateCatalog, templates]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

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
    setLinkedPlannedEventId(null);
    autoStartHandledRef.current = false;
  }, [memberUserId, teamId]);

  const startCreate = async () => {
    setErr(null);
    setEditingMeeting(null);
    setLinkedPlannedEventId(null);
    setLoadingTemplates(true);
    setView("pick");
    try {
      const list = templateCatalog.length > 0 ? templateCatalog : await fetchOneOnOneTemplates(teamId);
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
    const fields = appendLeaderCommentsIfMissing(template.fields);
    const withLeaderComments = { ...template, fields };
    setSelectedTemplate(withLeaderComments);
    setEditingMeeting(null);
    const initial: Record<string, string | number> = {};
    for (const field of fields) {
      if (field.type === "section") continue;
      if (field.type === "rating") initial[field.id] = 0;
      else initial[field.id] = "";
    }
    setResponses(initial);
    setFollowUpDrafts([newFollowUpDraft()]);
    setPrepAcknowledged(false);
    setErr(null);
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setView("fill");
  };

  const startPlannedOneOnOne = async (event: PlannedOneOnOneEvent) => {
    setErr(null);
    setEditingMeeting(null);
    setLinkedPlannedEventId(event.id);
    setLoadingTemplates(true);
    setView("pick");
    try {
      const list = templateCatalog.length > 0 ? templateCatalog : await fetchOneOnOneTemplates(teamId);
      setTemplates(list);
      const preferred = event.oneOnOneTemplateId
        ? list.find((template) => template.id === event.oneOnOneTemplateId) ?? null
        : null;
      if (preferred) {
        pickTemplate(preferred);
        return;
      }
      if (list.length === 0) {
        setErr("No check-in templates yet. Ask your workspace owner to create templates on the web Team page.");
        return;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load templates.");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const openPlannedEventMenu = (event: PlannedOneOnOneEvent) => {
    const templateTitle = event.oneOnOneTemplateId
      ? templateTitleById.get(event.oneOnOneTemplateId) ?? null
      : null;
    const title = templateTitle ?? "Check-in";
    setMenuMeetingId(null);
    Alert.alert(title, formatScheduledOneOnOneWhen(event), [
      {
        text: "Start check-in",
        onPress: () => {
          void startPlannedOneOnOne(event);
        },
      },
      {
        text: "Edit schedule",
        onPress: () => {
          router.push(
            planOneOnOneHref(teamId, {
              eventId: event.id,
              memberUserId,
              templateId: event.oneOnOneTemplateId ?? undefined,
              startDate: event.startDate,
            }),
          );
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const renderPlannedOneOnOneRow = ({ item: event }: { item: PlannedOneOnOneEvent }) => {
    const templateTitle = event.oneOnOneTemplateId
      ? templateTitleById.get(event.oneOnOneTemplateId) ?? null
      : null;
    const title = templateTitle ?? "Check-in";
    const schedulerName = event.createdBy?.name?.trim() || managerName || "Your manager";
    const memberSubtitle = isSelf && !canCreate
      ? `With ${schedulerName} · ${formatScheduledOneOnOneWhen(event)}`
      : formatScheduledOneOnOneWhen(event);

    const rowContent = (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", flexShrink: 1 }} numberOfLines={1}>
              {title}
            </Text>
            <View
              style={{
                backgroundColor: "#F8FAFC",
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: "#E2E8F0",
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "600", color: "#64748B" }}>Scheduled</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: "#64748B", marginTop: 1 }} numberOfLines={1}>
            {memberSubtitle}
          </Text>
        </View>
        {canCreate ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              openPlannedEventMenu(event);
            }}
            hitSlop={8}
            testID={`planned-one-on-one-menu-${event.id}`}
          >
            <MoreVertical size={16} color="#64748B" />
          </Pressable>
        ) : null}
      </View>
    );

    if (!canCreate) {
      return (
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            minHeight: PLANNED_ONE_ON_ONE_ROW_HEIGHT,
            justifyContent: "center",
          }}
          testID={`planned-one-on-one-${event.id}`}
        >
          {rowContent}
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => void startPlannedOneOnOne(event)}
        style={{
          backgroundColor: "white",
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          minHeight: PLANNED_ONE_ON_ONE_ROW_HEIGHT,
          justifyContent: "center",
        }}
        testID={`planned-one-on-one-${event.id}`}
      >
        {rowContent}
      </Pressable>
    );
  };

  useEffect(() => {
    if (!autoStartCheckIn || !canCreate || autoStartHandledRef.current) return;
    autoStartHandledRef.current = true;
    if (plannedEventId) {
      setLinkedPlannedEventId(plannedEventId);
    }
    void (async () => {
      setErr(null);
      setEditingMeeting(null);
      setLoadingTemplates(true);
      setView("pick");
      try {
        const list = templateCatalog.length > 0 ? templateCatalog : await fetchOneOnOneTemplates(teamId);
        setTemplates(list);
        if (list.length === 0) {
          setErr("No check-in templates yet. Ask your workspace owner to create templates on the web Team page.");
          return;
        }
        const preferred = preferredTemplateId
          ? list.find((template) => template.id === preferredTemplateId) ?? null
          : null;
        if (preferred) {
          pickTemplate(preferred);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load templates.");
      } finally {
        setLoadingTemplates(false);
      }
    })();
  }, [autoStartCheckIn, canCreate, preferredTemplateId, plannedEventId, teamId]);

  const startEdit = (meeting: OneOnOneMeeting) => {
    setPreviewMeeting(null);
    setMenuMeetingId(null);
    setEditingMeeting(meeting);
    setLinkedPlannedEventId(null);
    setSelectedTemplate(meetingToFillTemplate(meeting));
    setResponses({ ...meeting.responses });
    setFollowUpDrafts([]);
    setPrepAcknowledged(true);
    setErr(null);
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setView("fill");
  };

  const setFieldValue = (fieldId: string, value: string | number) => {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
    if (highlightLeaderFieldId === fieldId && String(value).trim()) {
      setHighlightLeaderFieldId(null);
    }
    if (highlightRequiredFieldId === fieldId) {
      setHighlightRequiredFieldId(null);
      setErr(null);
    }
  };

  const onPublishClick = () => {
    if (!selectedTemplate || saving) return;
    const validationError = validateCheckInResponses(selectedTemplate.fields, responses);
    if (validationError) {
      setErr(validationError.message);
      setHighlightRequiredFieldId(validationError.fieldId);
      toast({ title: validationError.message, preset: "error" });
      return;
    }
    setHighlightRequiredFieldId(null);
    setErr(null);
    if (canCreate && isLeaderCommentsEmpty(selectedTemplate.fields, responses)) {
      setLeaderCommentsNudgeOpen(true);
      return;
    }
    setFeedbackPromptOpen(true);
  };

  const onSaveDraftClick = () => {
    if (!selectedTemplate || saving) return;
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    void performSaveDraft();
  };

  const onAddLeaderNotesFromNudge = () => {
    if (!selectedTemplate) return;
    const leaderField = findLeaderCommentsField(selectedTemplate.fields);
    setLeaderCommentsNudgeOpen(false);
    if (!leaderField) return;
    setHighlightLeaderFieldId(leaderField.id);
    setTimeout(() => {
      fillScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
  };

  const onContinueWithoutLeaderNotes = () => {
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(true);
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
      const payload = {
        responses: normalized,
        followUpTasks,
        requestAssociateFeedback,
        status: "published" as const,
        ...(linkedPlannedEventId ? { plannedCalendarEventId: linkedPlannedEventId } : {}),
      };
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
      setLinkedPlannedEventId(null);
      void refetchPlannedOneOnOnes();
      void queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["planned-one-on-ones", teamId] });
      toast({ title: "Check-in saved", preset: "done" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save check-in.";
      setErr(message);
      toast({ title: message, preset: "error" });
    } finally {
      setSaving(false);
    }
  };

  const performSaveDraft = async () => {
    if (!selectedTemplate || saving) return;
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setSaving(true);
    setErr(null);
    try {
      const normalized = normalizeResponses(selectedTemplate.fields);
      const payload = { responses: normalized, status: "draft" as const };
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
      toast({ title: "Draft saved", preset: "done" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setSaving(false);
    }
  };

  const checkInExportOptions = (meeting: OneOnOneMeeting) => ({
    meeting,
    memberName,
    managerName,
    meetingNumber: meetingNumberFor(meetings, meeting.id),
  });

  const onPrint = async (meeting: OneOnOneMeeting) => {
    if (!canPrintCheckIn(meeting)) {
      toast({ title: "Publish this check-in before printing.", preset: "error" });
      return;
    }
    setPrintingPdf(true);
    setMenuMeetingId(null);
    try {
      await printOneOnOneMeeting(checkInExportOptions(meeting));
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Could not open print view.",
        preset: "error",
      });
    } finally {
      setPrintingPdf(false);
    }
  };

  const onDownloadPdf = async (meeting: OneOnOneMeeting) => {
    if (!canPrintCheckIn(meeting)) {
      toast({ title: "Publish this check-in before downloading a PDF.", preset: "error" });
      return;
    }
    setDownloadingPdfId(meeting.id);
    setMenuMeetingId(null);
    try {
      await downloadOneOnOneMeetingPdf(checkInExportOptions(meeting));
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Could not download PDF.",
        preset: "error",
      });
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const onDelete = (meeting: OneOnOneMeeting) => {
    setMenuMeetingId(null);
    Alert.alert(
      "Delete check-in?",
      `Delete this check-in from ${formatMeetingDate(oneOnOneDisplayDate(meeting))}? This cannot be undone.`,
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
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setHighlightRequiredFieldId(null);
    setLinkedPlannedEventId(null);
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

    if (field.type === "yes_no") {
      const current = String(value).toLowerCase();
      return (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["yes", "no"] as const).map((option) => {
            const active = current === option;
            return (
              <Pressable
                key={option}
                onPress={() => setFieldValue(field.id, option)}
                style={{
                  minWidth: 72,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? "#4361EE" : "#F1F5F9",
                }}
              >
                <Text style={{ fontWeight: "700", color: active ? "white" : "#64748B" }}>
                  {option === "yes" ? "Yes" : "No"}
                </Text>
              </Pressable>
            );
          })}
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
    const leaderPrepItems = (selectedTemplate.leaderPrep ?? []).map((item) => item.trim()).filter(Boolean);
    const showLeaderPrepGate = !editingMeeting && leaderPrepItems.length > 0 && !prepAcknowledged;

    if (showLeaderPrepGate) {
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
              <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A" }}>{selectedTemplate.title}</Text>
              <Text style={{ fontSize: 12, color: "#64748B" }}>Prep for {memberName}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#6366F1", textTransform: "uppercase", letterSpacing: 0.6 }}>
              Before you begin
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: "#0F172A" }}>Leader prep</Text>
            <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20 }}>
              Quick reminders before this check-in. Only you see this list.
            </Text>
            <View style={{ gap: 10, marginTop: 4 }}>
              {leaderPrepItems.map((item, index) => (
                <View
                  key={`${index}-${item}`}
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#6366F1" }}>{index + 1}.</Text>
                  <Text style={{ flex: 1, fontSize: 14, color: "#0F172A", lineHeight: 20 }}>{item}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
            <Pressable
              onPress={() => setPrepAcknowledged(true)}
              style={{
                backgroundColor: "#4361EE",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "700", color: "white" }}>Start check-in</Text>
            </Pressable>
          </View>
        </View>
      );
    }

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
              {editingMeeting
                ? editingMeeting.status === "draft"
                  ? "Resume editing"
                  : "Edit check-in"
                : selectedTemplate.title}
            </Text>
            <Text style={{ fontSize: 12, color: "#64748B" }}>{memberName}</Text>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView ref={fillScrollRef} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 100 }}>
            {err ? <Text style={{ fontSize: 13, color: "#DC2626" }}>{err}</Text> : null}
            {fillFields.map((field) => {
              const isRequiredHighlight = highlightRequiredFieldId === field.id;
              const isLeaderHighlight = highlightLeaderFieldId === field.id;
              return (
              <View
                key={field.id}
                style={
                  isRequiredHighlight
                    ? {
                        borderWidth: 2,
                        borderColor: "#DC2626",
                        borderRadius: 12,
                        padding: 10,
                        backgroundColor: "#FEF2F2",
                      }
                    : isLeaderHighlight
                      ? {
                          borderWidth: 2,
                          borderColor: "#818CF8",
                          borderRadius: 12,
                          padding: 10,
                          backgroundColor: "#EEF2FF",
                        }
                      : undefined
                }
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6 }}>
                  {field.label}
                  {field.required ? <Text style={{ color: "#DC2626" }}> *</Text> : null}
                </Text>
                {field.helpText ? (
                  <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 6, lineHeight: 16 }}>
                    {field.helpText}
                  </Text>
                ) : null}
                {renderFieldInput(field)}
              </View>
            );
            })}

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
            gap: 10,
          }}
        >
          {!editingMeeting || editingMeeting.status === "draft" ? (
            <Pressable
              onPress={onSaveDraftClick}
              disabled={saving}
              style={{
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text style={{ fontWeight: "700", color: "#475569" }}>{saving ? "Saving…" : "Save draft"}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onPublishClick}
            disabled={saving}
            style={{
              backgroundColor: "#4361EE",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Text style={{ fontWeight: "700", color: "white" }}>
              {saving
                ? "Saving…"
                : editingMeeting?.status === "draft"
                  ? "Publish check-in"
                  : editingMeeting
                    ? "Save changes"
                    : "Save check-in"}
            </Text>
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
        <CheckInEmptyState
          memberName={memberName}
          canCreate={false}
          error={err ?? "No check-in templates yet. Ask your workspace owner to create templates on the web Team page."}
        />
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

  const renderPublishModals = () => (
    <>
      <Modal visible={leaderCommentsNudgeOpen} transparent animationType="fade" onRequestClose={() => setLeaderCommentsNudgeOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            padding: 24,
            paddingTop: 24 + insets.top,
            paddingBottom: 24 + insets.bottom,
          }}
          onPress={() => setLeaderCommentsNudgeOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()} style={{ backgroundColor: "white", borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>{LEADER_COMMENTS_NUDGE_TITLE}</Text>
            <Text style={{ fontSize: 14, color: "#64748B", marginTop: 8, lineHeight: 20 }}>{LEADER_COMMENTS_NUDGE_COPY}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable
                onPress={onContinueWithoutLeaderNotes}
                disabled={saving}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#F1F5F9", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "700", color: "#64748B" }}>Continue</Text>
              </Pressable>
              <Pressable
                onPress={onAddLeaderNotesFromNudge}
                disabled={saving}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#4361EE", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "700", color: "white" }}>Add notes</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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
              Request associate feedback and commitments from {memberName}? They&apos;ll receive a task to share their notes.
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
    </>
  );

  if (view === "fill") {
    return (
      <>
        {renderFillView()}
        {renderPublishModals()}
      </>
    );
  }
  if (view === "pick") return renderPickView();

  const showHistorySection = upcomingPlanned.length > 0 || meetings.length > 0;
  const showEmptyState = !loadingMeetings && upcomingPlanned.length === 0 && meetings.length === 0;

  return (
    <View style={{ gap: 16 }}>
      {canCreate ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <Pressable
            onPress={() =>
              router.push(
                planOneOnOneHref(teamId, {
                  memberUserId,
                }),
              )
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "white",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
            testID="plan-one-on-one-button"
          >
            <CalendarCheck size={16} color="#475569" />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>Plan check-in</Text>
          </Pressable>
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
            testID="new-check-in-button"
          >
            <Plus size={16} color="white" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>New check-in</Text>
          </Pressable>
        </View>
      ) : null}

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

      {plannedLoadError ? (
        <Text style={{ fontSize: 13, color: "#DC2626", lineHeight: 18 }}>
          Could not load upcoming check-ins
          {plannedLoadErrorDetail instanceof Error ? `: ${plannedLoadErrorDetail.message}` : "."}
        </Text>
      ) : null}

      {canViewUpcoming && upcomingPlanned.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: "#94A3B8",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Upcoming
          </Text>
          <View
            style={{
              height: PLANNED_ONE_ON_ONE_LIST_HEIGHT,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#FAFBFC",
              overflow: "hidden",
            }}
            testID="planned-one-on-one-list"
          >
            <FlatList
              data={upcomingPlanned}
              keyExtractor={(event) => event.id}
              renderItem={renderPlannedOneOnOneRow}
              nestedScrollEnabled
              style={{ flex: 1 }}
              scrollEnabled={upcomingPlanned.length > PLANNED_ONE_ON_ONE_VISIBLE_ROWS}
              showsVerticalScrollIndicator={upcomingPlanned.length > PLANNED_ONE_ON_ONE_VISIBLE_ROWS}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 8 }}
              ItemSeparatorComponent={() => <View style={{ height: PLANNED_ONE_ON_ONE_ROW_GAP }} />}
            />
          </View>
        </View>
      ) : null}

      {loadingMeetings ? (
        <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
      ) : showEmptyState ? (
        <CheckInEmptyState
          memberName={memberName}
          canCreate={canCreate}
          error={err}
          onStart={canCreate ? () => void startCreate() : undefined}
        />
      ) : showHistorySection ? (
        <View style={{ gap: 10 }}>
          {upcomingPlanned.length > 0 ? (
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              History
            </Text>
          ) : null}
          {[...meetings]
            .sort((a, b) => oneOnOneDisplayDateMs(b) - oneOnOneDisplayDateMs(a))
            .map((meeting) => {
              const isDraft = meeting.status === "draft";
              const overdueCount = countOverdueFollowUpTasks(meeting.followUpTasks, todayStart);
              const status = getOneOnOneMeetingStatusFromMeeting(meeting);
              const colors = isDraft
                ? { bg: "#EEF2FF", text: "#4338CA" }
                : oneOnOneMeetingStatusColors(status);
              const statusLabel = isDraft ? "Draft" : oneOnOneMeetingStatusLabel(status);
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
                      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", flexShrink: 1 }}>
                          {meeting.templateTitle}
                        </Text>
                        {overdueCount > 0 ? (
                          <View
                            style={{
                              backgroundColor: "#FEE2E2",
                              borderRadius: 6,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderWidth: 1,
                              borderColor: "#FECACA",
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: "700", color: "#DC2626" }}>
                              {overdueCount} overdue
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                        {formatMeetingDate(oneOnOneDisplayDate(meeting))}
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
                          {statusLabel}
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
                      {canPrintCheckIn(meeting) ? (
                        <>
                          <Pressable
                            onPress={() => void onPrint(meeting)}
                            disabled={printingPdf}
                            style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}
                          >
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#334155" }}>
                              {printingPdf ? "Printing…" : "Print"}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void onDownloadPdf(meeting)}
                            disabled={downloadingPdfId === meeting.id}
                            style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}
                          >
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#334155" }}>
                              {downloadingPdfId === meeting.id ? "Downloading…" : "Download PDF"}
                            </Text>
                          </Pressable>
                        </>
                      ) : null}
                      <Pressable
                        onPress={() => startEdit(meeting)}
                        style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: "#4361EE" }}>
                          {checkInEditMenuLabel(meeting)}
                        </Text>
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
      ) : null}

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
                  {previewMeeting ? formatMeetingDate(oneOnOneDisplayDate(previewMeeting)) : ""}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {previewMeeting && canPrintCheckIn(previewMeeting) ? (
                  <>
                    <Pressable
                      onPress={() => void onPrint(previewMeeting)}
                      disabled={printingPdf}
                      style={{
                        borderWidth: 1,
                        borderColor: "#D8DEE8",
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        opacity: printingPdf ? 0.55 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }}>
                        {printingPdf ? "Printing…" : "Print"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void onDownloadPdf(previewMeeting)}
                      disabled={downloadingPdfId === previewMeeting.id}
                      style={{
                        borderWidth: 1,
                        borderColor: "#D8DEE8",
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        opacity: downloadingPdfId === previewMeeting.id ? 0.55 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }}>
                        {downloadingPdfId === previewMeeting.id ? "Downloading…" : "Download PDF"}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
                <Pressable onPress={() => setPreviewMeeting(null)} hitSlop={12}>
                  <X size={22} color="#64748B" />
                </Pressable>
              </View>
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
                            {field.type === "yes_no"
                              ? formatYesNoResponseDisplay(previewMeeting.responses[field.id])
                              : formatAssociateResponseDisplay(previewMeeting.responses[field.id])}
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
                    {previewMeeting.followUpTasks.map((task) => {
                      const isDone = task.status === "done";
                      return (
                        <View
                          key={task.id}
                          style={{
                            marginBottom: 8,
                            padding: 10,
                            backgroundColor: "#F8FAFC",
                            borderRadius: 8,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{task.title}</Text>
                            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                              {task.assignee?.name ?? "Unassigned"}
                              {task.dueDate ? ` · Due ${formatMeetingDate(task.dueDate)}` : ""}
                              {task.status !== "todo" && !isDone ? ` · ${task.status.replace("_", " ")}` : ""}
                            </Text>
                          </View>
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              borderWidth: 2,
                              borderColor: isDone ? "#22C55E" : "#EF4444",
                              backgroundColor: isDone ? "#22C55E" : "#FEF2F2",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {isDone ? (
                              <Check size={12} color="#FFFFFF" strokeWidth={3} />
                            ) : (
                              <X size={11} color="#EF4444" strokeWidth={3} />
                            )}
                          </View>
                        </View>
                      );
                    })}
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
                  <Text style={{ fontWeight: "700", color: "white" }}>
                    {checkInEditActionLabel(previewMeeting)}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {renderPublishModals()}
    </View>
  );
}
