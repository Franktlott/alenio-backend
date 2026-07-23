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
  KeyboardAvoidingView,
  InputAccessoryView,
  Platform,
  Image,
  Alert,
} from "react-native";
import { toast } from "burnt";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Check,
  CalendarCheck,
  PlayCircle,
  Calendar,
  Clock,
  Users,
  Trash2,
  Printer,
  Download,
  Pencil,
} from "lucide-react-native";
import { api } from "@/lib/api/api";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import { bottomSheetMenu } from "@/lib/bottom-sheet-menu-styles";
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
  memberImage?: string | null;
  managerName: string | null;
  leaderUserId: string | null;
  canCreate: boolean;
  canModify: boolean;
  isSelf?: boolean;
  myRole?: string | null;
  /** Increment to open the template picker (safe across tab remounts). */
  startCheckInToken?: number;
  preferredTemplateId?: string | null;
  plannedEventId?: string | null;
  onFlowActiveChange?: (active: boolean) => void;
};

type OneOneView = "list" | "pick" | "fill";

const CHECK_IN_INPUT_ACCESSORY_ID = "check-in-save-actions";

type CheckInActionMenu =
  | { kind: "planned"; event: PlannedOneOnOneEvent }
  | { kind: "history"; meeting: OneOnOneMeeting };

function checkInActionSheetStyle(bottomInset: number) {
  return {
    ...bottomSheetMenu.sheet,
    marginBottom: Math.max(bottomInset, 12),
    paddingBottom: 12,
  };
}

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

function plannedOneOnOneListHeight(count: number): number {
  const visible = Math.min(Math.max(count, 0), PLANNED_ONE_ON_ONE_VISIBLE_ROWS);
  if (visible === 0) return 0;
  return visible * PLANNED_ONE_ON_ONE_ROW_HEIGHT + (visible - 1) * PLANNED_ONE_ON_ONE_ROW_GAP;
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match?.[1] ? match[0] : undefined;
}

const TEMPLATE_CARD_ACCENTS = [
  { color: "#7C3AED", bg: "#F3E8FF" },
  { color: "#2563EB", bg: "#DBEAFE" },
  { color: "#16A34A", bg: "#DCFCE7" },
  { color: "#EA580C", bg: "#FFEDD5" },
] as const;

function estimateTemplateDuration(template: OneOnOneTemplate): string {
  const title = template.title.toLowerCase();
  if (title.includes("quarter") || title.includes("annual") || title.includes("review")) {
    return "30-45 min";
  }
  if (title.includes("custom")) return "Custom time";
  const fieldCount = template.fields.filter(
    (f) => f.type !== "section" && f.type !== "associate_notes",
  ).length;
  if (fieldCount <= 5) return "15-20 min";
  if (fieldCount <= 9) return "20-30 min";
  return "30-45 min";
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
  const firstName = memberName.trim().split(/\s+/)[0] || memberName || "this teammate";

  if (error) {
    return (
      <View
        style={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 16,
          alignItems: "center",
        }}
        testID="check-in-empty-state-error"
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#EEF2FF",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <CalendarCheck size={26} color="#4361EE" />
        </View>
        <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A", textAlign: "center", marginBottom: 8 }}>
          Could not load check-ins
        </Text>
        <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20, maxWidth: 300 }}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
        alignItems: "center",
      }}
      testID="check-in-empty-state"
    >
      <Image
        source={require("@/assets/checkin-empty-develop.png")}
        style={{ width: 168, height: 168, marginBottom: 8 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: "#0F172A",
          textAlign: "center",
          letterSpacing: -0.3,
          lineHeight: 25,
          marginBottom: 8,
          maxWidth: 300,
        }}
      >
        Great managers are built{"\n"}
        <Text style={{ color: "#7C3AED" }}>one conversation at a time.</Text>
      </Text>
      <Text
        style={{
          fontSize: 13.5,
          color: "#64748B",
          textAlign: "center",
          lineHeight: 20,
          maxWidth: 300,
          marginBottom: canCreate && onStart ? 18 : 0,
        }}
      >
        {canCreate
          ? `Use check-ins to coach ${firstName}, spot growth opportunities, and turn feedback into clear next steps.`
          : `When a leader runs a check-in with ${firstName}, coaching notes and follow-ups will show up here.`}
      </Text>
      {canCreate && onStart ? (
        <Pressable
          onPress={onStart}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: "#4361EE",
            borderRadius: 12,
            paddingHorizontal: 18,
            paddingVertical: 12,
            width: "100%",
            maxWidth: 280,
          }}
          testID="check-in-empty-start-button"
          accessibilityRole="button"
          accessibilityLabel="Start first check-in"
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
  memberImage = null,
  managerName,
  leaderUserId,
  canCreate,
  canModify,
  isSelf = false,
  myRole = null,
  startCheckInToken = 0,
  preferredTemplateId = null,
  plannedEventId = null,
  onFlowActiveChange,
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
  const [checkInActionMenu, setCheckInActionMenu] = useState<CheckInActionMenu | null>(null);
  const [checkInActionDeleteConfirm, setCheckInActionDeleteConfirm] = useState(false);
  const [deletingCheckInActionId, setDeletingCheckInActionId] = useState<string | null>(null);
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
  const lastStartCheckInTokenRef = useRef(0);
  const [prepAcknowledged, setPrepAcknowledged] = useState(false);
  const [linkedPlannedEventId, setLinkedPlannedEventId] = useState<string | null>(null);
  const memberInitial = memberName.trim()[0]?.toUpperCase() || "?";

  useEffect(() => {
    onFlowActiveChange?.(view !== "list");
    return () => onFlowActiveChange?.(false);
  }, [onFlowActiveChange, view]);

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

  const recentMeetings = useMemo(
    () =>
      [...meetings]
        .sort((a, b) => oneOnOneDisplayDateMs(b) - oneOnOneDisplayDateMs(a))
        .slice(0, 4),
    [meetings],
  );

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
    setCheckInActionMenu(null);
    setCheckInActionDeleteConfirm(false);
    setErr(null);
    setTemplates([]);
    setLinkedPlannedEventId(null);
    lastStartCheckInTokenRef.current = 0;
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

  const closeCheckInActionMenu = () => {
    setCheckInActionMenu(null);
    setCheckInActionDeleteConfirm(false);
  };

  const deletePlannedEvent = async (event: PlannedOneOnOneEvent) => {
    setDeletingCheckInActionId(event.id);
    try {
      await api.delete(`/api/teams/${teamId}/events/${event.id}`);
      if (linkedPlannedEventId === event.id) setLinkedPlannedEventId(null);
      void refetchPlannedOneOnOnes();
      void queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["planned-one-on-ones", teamId] });
      toast({ title: "Check-in deleted", preset: "done" });
      closeCheckInActionMenu();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Could not delete check-in",
        preset: "error",
      });
    } finally {
      setDeletingCheckInActionId(null);
    }
  };

  const deleteHistoryMeeting = async (meeting: OneOnOneMeeting) => {
    setDeletingCheckInActionId(meeting.id);
    try {
      await deleteOneOnOneMeeting(teamId, memberUserId, meeting.id);
      if (previewMeeting?.id === meeting.id) setPreviewMeeting(null);
      await loadMeetings();
      toast({ title: "Check-in deleted", preset: "done" });
      closeCheckInActionMenu();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not delete", preset: "error" });
    } finally {
      setDeletingCheckInActionId(null);
    }
  };

  const openPlannedEventMenu = (event: PlannedOneOnOneEvent) => {
    setCheckInActionDeleteConfirm(false);
    setCheckInActionMenu({ kind: "planned", event });
  };

  const openHistoryMeetingMenu = (meeting: OneOnOneMeeting) => {
    setCheckInActionDeleteConfirm(false);
    setCheckInActionMenu({ kind: "history", meeting });
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
        onLongPress={() => openPlannedEventMenu(event)}
        delayLongPress={400}
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
    if (!startCheckInToken || !canCreate) return;
    if (startCheckInToken === lastStartCheckInTokenRef.current) return;
    lastStartCheckInTokenRef.current = startCheckInToken;
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
  }, [startCheckInToken, canCreate, preferredTemplateId, plannedEventId, teamId]);

  const startEdit = (meeting: OneOnOneMeeting) => {
    setPreviewMeeting(null);
    closeCheckInActionMenu();
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
      invalidateTaskCaches(queryClient, teamId);
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
    closeCheckInActionMenu();
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
    closeCheckInActionMenu();
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
    const labelLower = field.label.trim().toLowerCase();
    const placeholder =
      labelLower.length > 42 ? "Enter response…" : `Enter ${labelLower}…`;

    if (field.type === "rating") {
      const max = field.ratingMax ?? 5;
      const current = typeof value === "number" ? value : Number(value) || 0;
      return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              onPress={() => setFieldValue(field.id, n)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: current === n ? "#4361EE" : "#F1F5F9",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: current === n ? "white" : "#64748B" }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      );
    }

    if (field.type === "yes_no") {
      const current = String(value).toLowerCase();
      return (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["yes", "no"] as const).map((option) => {
            const active = current === option;
            return (
              <Pressable
                key={option}
                onPress={() => setFieldValue(field.id, option)}
                style={{
                  minWidth: 64,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? "#4361EE" : "#F1F5F9",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "white" : "#64748B" }}>
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
        inputAccessoryViewID={Platform.OS === "ios" ? CHECK_IN_INPUT_ACCESSORY_ID : undefined}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={{
          borderWidth: 1,
          borderColor: "#E2E8F0",
          borderRadius: 10,
          paddingHorizontal: 11,
          paddingVertical: Platform.OS === "ios" ? 10 : 8,
          fontSize: 14,
          color: "#0F172A",
          minHeight: isLong ? 72 : undefined,
          textAlignVertical: isLong ? "top" : "center",
          backgroundColor: "#F8FAFC",
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

    const renderSaveActions = (keyboardAccessory = false) => (
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: keyboardAccessory ? 8 : Math.max(8, insets.bottom > 0 ? 4 : 8),
          borderTopWidth: 1,
          borderTopColor: "#F1F5F9",
          backgroundColor: "white",
          gap: 8,
        }}
      >
        {!editingMeeting || editingMeeting.status === "draft" ? (
          <Pressable
            onPress={onSaveDraftClick}
            disabled={saving}
            style={{
              flex: 1,
              borderRadius: 10,
              paddingVertical: 11,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#FFFFFF",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569" }}>
              {saving ? "Saving…" : "Save draft"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onPublishClick}
          disabled={saving}
          style={{
            flex: 1.2,
            backgroundColor: "#4361EE",
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: "center",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>
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
    );

    return (
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: "#F1F5F9",
            gap: 8,
            backgroundColor: "#FFFFFF",
          }}
        >
          <Pressable onPress={exitFill} hitSlop={8}>
            <ChevronLeft size={20} color="#4361EE" />
          </Pressable>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: "#EEF2FF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "800", color: "#4F46E5" }}>2</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#0F172A" }} numberOfLines={1}>
              {editingMeeting
                ? editingMeeting.status === "draft"
                  ? "Resume editing"
                  : "Edit check-in"
                : selectedTemplate.title}
            </Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 1 }} numberOfLines={1}>
              Complete the check-in form
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            ref={fillScrollRef}
            contentContainerStyle={{
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: Math.max(110, insets.bottom + 88),
              gap: 14,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {err ? <Text style={{ fontSize: 12, color: "#DC2626" }}>{err}</Text> : null}
            {fillFields.map((field) => {
              const isRequiredHighlight = highlightRequiredFieldId === field.id;
              const isLeaderHighlight = highlightLeaderFieldId === field.id;
              return (
              <View
                key={field.id}
                style={
                  isRequiredHighlight
                    ? {
                        borderWidth: 1.5,
                        borderColor: "#DC2626",
                        borderRadius: 10,
                        padding: 8,
                        backgroundColor: "#FEF2F2",
                      }
                    : isLeaderHighlight
                      ? {
                          borderWidth: 1.5,
                          borderColor: "#818CF8",
                          borderRadius: 10,
                          padding: 8,
                          backgroundColor: "#EEF2FF",
                        }
                      : {
                          borderWidth: 1,
                          borderColor: "#E8ECFA",
                          borderRadius: 12,
                          padding: 10,
                          backgroundColor: "#FFFFFF",
                        }
                }
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: "700",
                    color: "#0F172A",
                    marginBottom: 6,
                    lineHeight: 17,
                  }}
                >
                  {field.label}
                  {field.required ? <Text style={{ color: "#DC2626" }}> *</Text> : null}
                </Text>
                {field.helpText ? (
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 5, lineHeight: 15 }}>
                    {field.helpText}
                  </Text>
                ) : null}
                {renderFieldInput(field)}
              </View>
            );
            })}

            {!editingMeeting ? (
              <View style={{ marginTop: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>Follow-up tasks</Text>
                  <Pressable onPress={() => setFollowUpDrafts([...followUpDrafts, newFollowUpDraft()])}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#4361EE" }}>Add task</Text>
                  </Pressable>
                </View>
                {followUpDrafts.map((draft) => (
                  <View
                    key={draft.id}
                    style={{
                      marginBottom: 8,
                      padding: 10,
                      backgroundColor: "#F8FAFC",
                      borderRadius: 10,
                      gap: 6,
                    }}
                  >
                    <TextInput
                      value={draft.title}
                      inputAccessoryViewID={
                        Platform.OS === "ios" ? CHECK_IN_INPUT_ACCESSORY_ID : undefined
                      }
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
                      inputAccessoryViewID={
                        Platform.OS === "ios" ? CHECK_IN_INPUT_ACCESSORY_ID : undefined
                      }
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

          {renderSaveActions()}
        </KeyboardAvoidingView>
        {Platform.OS === "ios" ? (
          <InputAccessoryView nativeID={CHECK_IN_INPUT_ACCESSORY_ID}>
            {renderSaveActions(true)}
          </InputAccessoryView>
        ) : null}
      </View>
    );
  };

  const showTemplateGuide = () => {
    if (templates.length === 0) return;
    const body = templates
      .map((t, index) => {
        const desc = t.description?.trim() || "No description yet.";
        return `${index + 1}. ${t.title}\n${desc}`;
      })
      .join("\n\n");
    Alert.alert("Check-in template guide", body);
  };

  const renderPickView = () => (
    <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 4, backgroundColor: "#F8FAFC" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Pressable
          onPress={() => setView("list")}
          hitSlop={8}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: "#EEF2FF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={18} color="#4361EE" />
        </Pressable>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: "#EEF2FF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "800", color: "#4F46E5" }}>1</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#0F172A" }}>Choose check-in template</Text>
          <Text style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>
            Select the type of conversation you'd like to have.
          </Text>
        </View>
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
        <View style={{ width: "100%", gap: 8, paddingBottom: 12 }}>
          {templates.map((t, index) => {
            const accent = TEMPLATE_CARD_ACCENTS[index % TEMPLATE_CARD_ACCENTS.length]!;
            const duration = estimateTemplateDuration(t);
            return (
              <Pressable
                key={t.id}
                onPress={() => pickTemplate(t)}
                style={({ pressed }) => ({
                  width: "100%",
                  backgroundColor: pressed ? "#F8FAFF" : "#FFFFFF",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E0E7FF",
                  shadowColor: "#0F172A",
                  shadowOpacity: 0.03,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", padding: 10, gap: 10 }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      backgroundColor: accent.bg,
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <CalendarCheck size={17} color={accent.color} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                      {t.title}
                    </Text>
                    {t.description ? (
                      <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2, lineHeight: 15 }} numberOfLines={2}>
                        {t.description}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 5 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Clock size={10} color="#94A3B8" />
                        <Text style={{ fontSize: 10, fontWeight: "600", color: "#64748B" }}>{duration}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1 }}>
                        <Users size={10} color="#94A3B8" />
                        <Text style={{ fontSize: 10, fontWeight: "600", color: "#64748B" }} numberOfLines={1}>
                          Manager + Associate
                        </Text>
                      </View>
                    </View>
                  </View>
                  <ChevronRight size={17} color={accent.color} strokeWidth={2.2} />
                </View>
              </Pressable>
            );
          })}

          <Pressable
            onPress={showTemplateGuide}
            style={{
              marginTop: 2,
              backgroundColor: "#EEF2FF",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text style={{ flex: 1, fontSize: 11, color: "#475569", lineHeight: 15 }}>
              Not sure which one to use? View descriptions for each template.
            </Text>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#4F46E5" }}>View guide ›</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderCheckInActionMenuModal = () => {
    if (!checkInActionMenu) return null;

    const isPlanned = checkInActionMenu.kind === "planned";
    const title = isPlanned
      ? (checkInActionMenu.event.oneOnOneTemplateId
          ? templateTitleById.get(checkInActionMenu.event.oneOnOneTemplateId) ?? null
          : null) ?? "Check-in"
      : checkInActionMenu.meeting.templateTitle;
    const whenLabel = isPlanned
      ? formatScheduledOneOnOneWhen(checkInActionMenu.event)
      : formatMeetingDate(oneOnOneDisplayDate(checkInActionMenu.meeting));
    const deleteTargetId = isPlanned ? checkInActionMenu.event.id : checkInActionMenu.meeting.id;
    const isDeleting = deletingCheckInActionId === deleteTargetId;
    const historyMeeting = checkInActionMenu.kind === "history" ? checkInActionMenu.meeting : null;

    return (
      <Modal visible transparent animationType="slide" onRequestClose={closeCheckInActionMenu}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)", justifyContent: "flex-end" }}
          onPress={closeCheckInActionMenu}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View style={checkInActionSheetStyle(insets.bottom)}>
              <View style={bottomSheetMenu.handleWrap}>
                <View style={bottomSheetMenu.handle} />
              </View>

              <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Image
                    source={require("@/assets/alenio-icon.png")}
                    style={{ width: 28, height: 28, borderRadius: 7 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }} numberOfLines={2}>
                      {title}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#667085", marginTop: 2 }} numberOfLines={2}>
                      {whenLabel}
                    </Text>
                  </View>
                  <Pressable
                    onPress={closeCheckInActionMenu}
                    hitSlop={8}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: "#F1F5F9",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={15} color="#64748B" />
                  </Pressable>
                </View>
              </View>

              {checkInActionDeleteConfirm ? (
                <View
                  style={{
                    marginHorizontal: 16,
                    marginBottom: 12,
                    backgroundColor: "#FEF2F2",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#FECACA",
                    padding: 14,
                    gap: 10,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#991B1B", textAlign: "center" }}>
                    Delete this check-in?
                  </Text>
                  <Text style={{ fontSize: 12, color: "#B91C1C", textAlign: "center", lineHeight: 16 }}>
                    {isPlanned
                      ? "This removes the scheduled check-in from both calendars. This cannot be undone."
                      : `This removes the check-in from ${whenLabel}. This cannot be undone.`}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => setCheckInActionDeleteConfirm(false)}
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: "center",
                        backgroundColor: "#FFFFFF",
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B" }}>Keep it</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (checkInActionMenu.kind === "planned") {
                          void deletePlannedEvent(checkInActionMenu.event);
                        } else {
                          void deleteHistoryMeeting(checkInActionMenu.meeting);
                        }
                      }}
                      disabled={isDeleting}
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: "center",
                        backgroundColor: "#EF4444",
                        minHeight: 40,
                        justifyContent: "center",
                      }}
                      testID="confirm-delete-check-in"
                    >
                      {isDeleting ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>Delete</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : isPlanned ? (
                <View style={{ paddingBottom: 4 }}>
                  <Pressable
                    onPress={() => {
                      const event = checkInActionMenu.event;
                      closeCheckInActionMenu();
                      void startPlannedOneOnOne(event);
                    }}
                    style={bottomSheetMenu.row}
                    testID="planned-check-in-start"
                  >
                    <Text style={bottomSheetMenu.rowLabel}>Start check-in</Text>
                    <PlayCircle size={bottomSheetMenu.iconSize} color="#4361EE" />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const event = checkInActionMenu.event;
                      closeCheckInActionMenu();
                      router.push(
                        planOneOnOneHref(teamId, {
                          eventId: event.id,
                          memberUserId,
                          templateId: event.oneOnOneTemplateId ?? undefined,
                          startDate: event.startDate,
                          ...(myRole ? { myRole } : {}),
                        }),
                      );
                    }}
                    style={bottomSheetMenu.row}
                    testID="planned-check-in-edit"
                  >
                    <Text style={bottomSheetMenu.rowLabel}>Edit schedule</Text>
                    <Calendar size={bottomSheetMenu.iconSize} color="#4361EE" />
                  </Pressable>
                  <Pressable
                    onPress={() => setCheckInActionDeleteConfirm(true)}
                    style={bottomSheetMenu.row}
                    testID="planned-check-in-delete"
                  >
                    <Text style={bottomSheetMenu.rowLabelDestructive}>Delete check-in</Text>
                    <Trash2 size={bottomSheetMenu.iconSize} color="#EF4444" />
                  </Pressable>
                </View>
              ) : historyMeeting ? (
                <View style={{ paddingBottom: 4 }}>
                  <Pressable
                    onPress={() => {
                      const meeting = historyMeeting;
                      closeCheckInActionMenu();
                      startEdit(meeting);
                    }}
                    style={bottomSheetMenu.row}
                    testID="history-check-in-edit"
                  >
                    <Text style={[bottomSheetMenu.rowLabel, { color: "#4361EE" }]}>
                      {checkInEditMenuLabel(historyMeeting)}
                    </Text>
                    <Pencil size={bottomSheetMenu.iconSize} color="#4361EE" />
                  </Pressable>
                  <Pressable
                    onPress={() => setCheckInActionDeleteConfirm(true)}
                    style={bottomSheetMenu.row}
                    testID="history-check-in-delete"
                  >
                    <Text style={bottomSheetMenu.rowLabelDestructive}>Delete check-in</Text>
                    <Trash2 size={bottomSheetMenu.iconSize} color="#EF4444" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

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

  const closeCheckInFlow = () => {
    setView("list");
    setSelectedTemplate(null);
    setEditingMeeting(null);
    setResponses({});
    setFollowUpDrafts([]);
    setErr(null);
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setHighlightRequiredFieldId(null);
    setHighlightLeaderFieldId(null);
    setLinkedPlannedEventId(null);
  };

  const renderCheckInFlowModal = () => (
    <Modal
      visible={view !== "list"}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={closeCheckInFlow}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#F8FAFC",
          paddingTop: Platform.OS === "ios" ? 18 : insets.top + 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingBottom: 8,
            gap: 10,
            backgroundColor: "#F8FAFC",
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: "#EEF2FF",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {memberImage ? (
              <Image source={{ uri: memberImage }} style={{ width: 34, height: 34 }} />
            ) : (
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#4F46E5" }}>{memberInitial}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 9,
                fontWeight: "700",
                color: "#818CF8",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              Starting check-in with
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
              {memberName}
            </Text>
          </View>
          <Pressable
            onPress={closeCheckInFlow}
            hitSlop={10}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} color="#64748B" />
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          {view === "pick" ? renderPickView() : renderFillView()}
        </View>
        {renderPublishModals()}
        {renderCheckInActionMenuModal()}
      </View>
    </Modal>
  );

  const showEmptyState = !loadingMeetings && upcomingPlanned.length === 0 && meetings.length === 0;

  return (
    <View style={{ gap: 10, flexGrow: showEmptyState ? 1 : undefined }}>
      {renderCheckInFlowModal()}
      {canCreate ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
          <Pressable
            onPress={() =>
              router.push(
                planOneOnOneHref(teamId, {
                  memberUserId,
                  ...(myRole ? { myRole } : {}),
                }),
              )
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "white",
              borderRadius: 9,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
            testID="plan-one-on-one-button"
          >
            <CalendarCheck size={14} color="#475569" />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#334155" }}>Schedule</Text>
          </Pressable>
          <Pressable
            onPress={() => void startCreate()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#4361EE",
              borderRadius: 9,
              paddingHorizontal: 10,
              paddingVertical: 7,
            }}
            testID="new-check-in-button"
          >
            <Plus size={14} color="white" />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>New check-in</Text>
          </Pressable>
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
              height: plannedOneOnOneListHeight(upcomingPlanned.length),
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
              ItemSeparatorComponent={() => <View style={{ height: PLANNED_ONE_ON_ONE_ROW_GAP }} />}
            />
          </View>
        </View>
      ) : null}

      {loadingMeetings ? (
        <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
      ) : showEmptyState ? (
        <View style={{ flexGrow: 1, justifyContent: "center" }}>
          <CheckInEmptyState
            memberName={memberName}
            canCreate={canCreate}
            error={err}
            onStart={canCreate ? () => void startCreate() : undefined}
          />
        </View>
      ) : recentMeetings.length > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: "#64748B",
                textTransform: "uppercase",
                letterSpacing: 1.1,
              }}
            >
              Recent check-ins
            </Text>
            {meetings.length > 4 ? (
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8" }}>
                Showing 4 of {meetings.length}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E8ECFA",
              overflow: "hidden",
            }}
          >
            {recentMeetings.map((meeting, index) => {
              const taskCount = meeting.followUpTasks?.length ?? 0;
              const openTaskCount = (meeting.followUpTasks ?? []).filter(
                (task) => task.status !== "done",
              ).length;
              const allTasksDone = taskCount > 0 && openTaskCount === 0;
              return (
                <Pressable
                  key={meeting.id}
                  onPress={() => setPreviewMeeting(meeting)}
                  onLongPress={canModify ? () => openHistoryMeetingMenu(meeting) : undefined}
                  delayLongPress={400}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: "#F1F5F9",
                    backgroundColor: "white",
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: index === 0 ? "#6366F1" : "#CBD5E1",
                    }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: index === 0 ? "700" : "600",
                        color: index === 0 ? "#4F46E5" : "#0F172A",
                      }}
                      numberOfLines={1}
                    >
                      {meeting.templateTitle}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 2 }} numberOfLines={1}>
                      {formatMeetingDate(oneOnOneDisplayDate(meeting))}
                    </Text>
                  </View>
                  {taskCount > 0 ? (
                    <View
                      style={{
                        backgroundColor: allTasksDone ? "#DCFCE7" : "#FFF7ED",
                        borderRadius: 999,
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9.5,
                          fontWeight: "700",
                          color: allTasksDone ? "#15803D" : "#C2410C",
                        }}
                        numberOfLines={1}
                      >
                        {allTasksDone
                          ? "Tasks done"
                          : `${openTaskCount} open`}
                      </Text>
                    </View>
                  ) : null}
                  {canModify ? (
                    <Pressable
                      onPress={() => openHistoryMeetingMenu(meeting)}
                      hitSlop={10}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: "#F8FAFC",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      testID={`check-in-menu-${meeting.id}`}
                    >
                      <MoreVertical size={15} color="#64748B" />
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
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
      {renderCheckInActionMenuModal()}
    </View>
  );
}
