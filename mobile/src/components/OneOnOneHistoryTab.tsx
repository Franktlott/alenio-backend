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
  Keyboard,
  KeyboardAvoidingView,
  InputAccessoryView,
  Platform,
  Image,
  Alert,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { toast } from "burnt";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Plus,
  X,
  ChevronLeft,
  ClipboardList,
  ChevronRight,
  FileAudio,
  CircleAlert,
  Mic,
  Sparkles,
  MoreVertical,
  Check,
  CalendarCheck,
  Calendar,
  Clock,
  Users,
  Trash2,
  Printer,
  Download,
  Pencil,
  MoreHorizontal,
  LayoutTemplate,
  Video,
  FileText,
  LogOut,
} from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Task } from "@/lib/types";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import { invalidateDevelopmentCaches } from "@/lib/invalidate-development-caches";
import { bottomSheetMenu } from "@/lib/bottom-sheet-menu-styles";
import { router, useFocusEffect } from "expo-router";
import {
  planOneOnOneHref,
  type PlannedOneOnOneEvent,
} from "@/lib/plan-one-on-one";
import { formatEventTimeRange, eventShowsScheduledTime } from "@/lib/format-event-time";
import { UserAvatar } from "@/components/UserAvatar";
import { EmbeddedVideoCall } from "@/components/video/EmbeddedVideoCall";
import { AlenioHeaderBrand } from "@/components/AlenioHeaderBrand";
import { CheckInEmptyState } from "@/components/development/CheckInEmptyState";
import { CheckInRecordingSheet } from "@/components/development/CheckInRecordingSheet";
import { CheckInTranscriptPanel } from "@/components/development/CheckInTranscriptPanel";
import { isAudioRecordingSupported } from "@/lib/expo-audio-module";
import {
  cancelCheckInRecording,
  fetchActiveCheckInRecordings,
  createCheckInFromTranscript,
  fetchCheckInRecording,
  type ActiveCheckInRecording,
} from "@/lib/check-in-recordings-api";
import { realtimeClient } from "@/lib/realtime-client";
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
import { canManageWorkspace } from "@/lib/workspace-management";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";

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
  initialMeetingId?: string | null;
  onFlowActiveChange?: (active: boolean) => void;
  onFormActiveChange?: (active: boolean) => void;
  embeddedListScroll?: boolean;
  sourceVideoRoomId?: string | null;
  sourceCalendarEventId?: string | null;
  meetingToolMode?: boolean;
  meetingToolHeaderControls?: React.ReactNode;
  onDraftSaveReady?: (saveDraft: (() => Promise<void>) | null) => void;
  /**
   * The live transcript of the video call this form is open inside of, once
   * there is enough of it to write up. Null when live notes are off.
   */
  callTranscript?: string | null;
  callTranscriptActive?: boolean;
  onStopCallTranscript?: () => void;
  /** Lets a parent summarize check-in history without fetching it again. */
  onMeetingsChange?: (meetings: OneOnOneMeeting[]) => void;
};

function CheckInListContainer({
  scroll,
  children,
}: {
  scroll: boolean;
  children: React.ReactNode;
}) {
  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, gap: 10, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        bounces
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={{ gap: 10 }}>{children}</View>;
}

type OneOneView = "list" | "mode" | "pick" | "capture" | "fill";

/** Title for a recording with no template, until Seneca names it. */
const OPEN_CHECK_IN_TITLE = "Open check-in";

const CHECK_IN_INPUT_ACCESSORY_ID = "check-in-save-actions";

type CheckInActionMenu =
  | { kind: "planned"; event: PlannedOneOnOneEvent }
  | { kind: "history"; meeting: OneOnOneMeeting };

function checkInActionSheetStyle(
  bottomInset: number,
  expandedForConfirmation = false,
) {
  return {
    ...bottomSheetMenu.sheet,
    marginBottom: Math.max(bottomInset, 12),
    paddingBottom: 12,
    maxHeight: expandedForConfirmation ? ("92%" as const) : bottomSheetMenu.sheet.maxHeight,
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

/**
 * Rebuilds the editable drafts from what a resumed check-in has stored. The
 * assignee comes back as a role, which is all the editor works in.
 */
function followUpDraftsFromMeeting(
  meeting: OneOnOneMeeting,
  memberUserId: string,
): FollowUpDraft[] {
  return (meeting.followUpDrafts ?? []).map((task, index) => ({
    id: `${meeting.id}-${index}`,
    title: task.title,
    assigneeRole: task.assigneeUserId === memberUserId ? "associate" : "leader",
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
  }));
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

function formatCompactScheduledOneOnOneWhen(
  event: PlannedOneOnOneEvent,
): string {
  const date = new Date(event.startDate);
  const datePart = Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : formatMeetingDate(event.startDate);
  if (
    eventShowsScheduledTime({
      allDay: event.allDay ?? false,
      isVideoMeeting: event.isVideoMeeting,
    })
  ) {
    return `${datePart} · ${formatEventTimeRange(event.startDate, event.endDate)}`;
  }
  return datePart;
}

const PLANNED_ONE_ON_ONE_VISIBLE_ROWS = 2;
const PLANNED_ONE_ON_ONE_ROW_HEIGHT = 60;
const PLANNED_ONE_ON_ONE_ROW_GAP = 8;
const CHECK_IN_HISTORY_PAGE_SIZE = 5;
/** Rows visible in the View all sheet before it scrolls. */
const CHECK_IN_LIST_VISIBLE_ROWS = 3;
const CHECK_IN_LIST_ROW_GAP = 5;
const CHECK_IN_LIST_ROW_HEIGHT = 56;
const CHECK_IN_SCREEN_HEIGHT = Dimensions.get("window").height;
const VIDEO_SHEET_WORKING_TOP = Math.round(CHECK_IN_SCREEN_HEIGHT * 0.4);
const VIDEO_SHEET_COLLAPSED_TOP = CHECK_IN_SCREEN_HEIGHT - 28;
const PUBLISH_PROMPT_TOP = Math.round(CHECK_IN_SCREEN_HEIGHT * 0.34);

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

function dateToDueDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dueDateInputToDate(value: string): Date {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
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
  initialMeetingId = null,
  onFlowActiveChange,
  onFormActiveChange,
  embeddedListScroll = false,
  sourceVideoRoomId = null,
  sourceCalendarEventId = null,
  meetingToolMode = false,
  meetingToolHeaderControls,
  onDraftSaveReady,
  callTranscript = null,
  callTranscriptActive = false,
  onStopCallTranscript,
  onMeetingsChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const canViewUpcoming = canCreate || isSelf;
  const canManageTemplates = canManageWorkspace(myRole);
  const [view, setView] = useState<OneOneView>("list");
  const [meetings, setMeetings] = useState<OneOnOneMeeting[]>([]);
  const [visibleCheckInCount, setVisibleCheckInCount] = useState(
    CHECK_IN_HISTORY_PAGE_SIZE,
  );
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([]);
  const [upcomingListOpen, setUpcomingListOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<OneOnOneTemplate | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<OneOnOneMeeting | null>(null);
  const [recordingTemplate, setRecordingTemplate] = useState<OneOnOneTemplate | null>(null);
  /** Chosen template awaiting a capture method, before the form is built. */
  const [captureTemplate, setCaptureTemplate] = useState<OneOnOneTemplate | null>(null);
  /** An open check-in records with no template, so there is none to hold here. */
  const [openRecording, setOpenRecording] = useState(false);
  const [transcriptMeetingId, setTranscriptMeetingId] = useState<string | null>(null);
  /** A recording handed off to the backend, watched so its draft opens itself. */
  const [processingRecordingId, setProcessingRecordingId] = useState<string | null>(null);
  /** False on app builds that shipped before the audio module. */
  const recordingSupported = useMemo(() => isAudioRecordingSupported(), []);
  /**
   * On a video call the device microphone only hears the leader, so recording
   * in the room is not offered there. The call's own live transcript has both
   * voices and takes its place.
   */
  const micRecordingAvailable = recordingSupported && !meetingToolMode;
  const callWriteUpAvailable = meetingToolMode && (callTranscript?.trim().length ?? 0) > 0;
  const senecaCaptureAvailable = micRecordingAvailable || callWriteUpAvailable;
  const [callWriteUpBusy, setCallWriteUpBusy] = useState(false);
  /** Fields Alenio filled in from a recording, so the leader knows what to verify. */
  const [aiDraftFieldIds, setAiDraftFieldIds] = useState<Set<string>>(new Set());
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [previewMeeting, setPreviewMeeting] = useState<OneOnOneMeeting | null>(null);
  const [openingTaskId, setOpeningTaskId] = useState<string | null>(null);
  const previewHasOpenFollowUps =
    previewMeeting?.status !== "draft" &&
    (previewMeeting?.followUpTasks ?? []).some((task) => task.status !== "done");
  const previewStatusLabel =
    previewMeeting?.status === "draft"
      ? "Draft"
      : previewHasOpenFollowUps
        ? "In progress"
        : "Completed";
  const reopenMeetingAfterTaskRef = useRef<OneOnOneMeeting | null>(null);
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
  const [followUpEditorDraft, setFollowUpEditorDraft] =
    useState<FollowUpDraft | null>(null);
  const [showFollowUpDueDatePicker, setShowFollowUpDueDatePicker] =
    useState(false);
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);
  const [leaderCommentsNudgeOpen, setLeaderCommentsNudgeOpen] = useState(false);
  const [endMeetingPromptOpen, setEndMeetingPromptOpen] = useState(false);
  const [videoCheckInSubmitted, setVideoCheckInSubmitted] = useState(false);
  const [endAfterPublish, setEndAfterPublish] = useState(false);
  const [videoCallActive, setVideoCallActive] = useState(false);
  const [highlightLeaderFieldId, setHighlightLeaderFieldId] = useState<string | null>(null);
  const [highlightRequiredFieldId, setHighlightRequiredFieldId] = useState<string | null>(null);
  const fillScrollRef = useRef<ScrollView>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingMeetingRef = useRef<OneOnOneMeeting | null>(null);
  const saveDraftNowRef = useRef<() => Promise<void>>(async () => {});
  const lastStartCheckInTokenRef = useRef(0);
  const openedInitialMeetingIdRef = useRef<string | null>(null);
  const [prepAcknowledged, setPrepAcknowledged] = useState(false);
  const [linkedPlannedEventId, setLinkedPlannedEventId] = useState<string | null>(null);

  useEffect(() => {
    editingMeetingRef.current = editingMeeting;
  }, [editingMeeting]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    onFlowActiveChange?.(view !== "list");
  }, [onFlowActiveChange, view]);

  useEffect(
    () => () => {
      onFlowActiveChange?.(false);
    },
    [onFlowActiveChange],
  );

  useEffect(() => {
    onFormActiveChange?.(view === "fill");
  }, [onFormActiveChange, view]);

  useEffect(
    () => () => {
      onFormActiveChange?.(false);
    },
    [onFormActiveChange],
  );

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
  const activePlannedVideoEvent = useMemo(
    () =>
      linkedPlannedEventId
        ? upcomingPlanned.find(
            (event) =>
              event.id === linkedPlannedEventId && event.isVideoMeeting,
          ) ?? null
        : null,
    [linkedPlannedEventId, upcomingPlanned],
  );
  const videoSheetTop = useRef(
    new Animated.Value(VIDEO_SHEET_WORKING_TOP),
  ).current;
  const videoSheetDragStart = useRef(VIDEO_SHEET_WORKING_TOP);
  const videoSheetExpandedTop = Math.max(insets.top + 8, 24);
  const snapVideoSheet = useCallback(
    (top: number) => {
      const clampedTop = Math.max(
        videoSheetExpandedTop,
        Math.min(VIDEO_SHEET_COLLAPSED_TOP, top),
      );
      Animated.spring(videoSheetTop, {
        toValue: clampedTop,
        useNativeDriver: false,
        damping: 24,
        stiffness: 230,
        mass: 0.85,
      }).start();
    },
    [videoSheetExpandedTop, videoSheetTop],
  );
  const videoSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 4 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          videoSheetTop.stopAnimation((value) => {
            videoSheetDragStart.current = value;
          });
        },
        onPanResponderMove: (_event, gesture) => {
          const nextTop = Math.max(
            videoSheetExpandedTop,
            Math.min(
              VIDEO_SHEET_COLLAPSED_TOP,
              videoSheetDragStart.current + gesture.dy,
            ),
          );
          videoSheetTop.setValue(nextTop);
        },
        onPanResponderRelease: (_event, gesture) => {
          const projectedTop =
            videoSheetDragStart.current + gesture.dy + gesture.vy * 55;
          const snapPoints = [
            videoSheetExpandedTop,
            VIDEO_SHEET_WORKING_TOP,
            VIDEO_SHEET_COLLAPSED_TOP,
          ];
          const nearest = snapPoints.reduce((best, point) =>
            Math.abs(point - projectedTop) < Math.abs(best - projectedTop)
              ? point
              : best,
          );
          snapVideoSheet(nearest);
        },
        onPanResponderTerminate: () =>
          snapVideoSheet(VIDEO_SHEET_WORKING_TOP),
      }),
    [snapVideoSheet, videoSheetExpandedTop, videoSheetTop],
  );

  useEffect(() => {
    if (!activePlannedVideoEvent || view === "list") return;
    videoSheetTop.setValue(VIDEO_SHEET_WORKING_TOP);
  }, [activePlannedVideoEvent, videoSheetTop, view]);

  useEffect(() => {
    if (!activePlannedVideoEvent || view === "list") return;
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () =>
      snapVideoSheet(videoSheetExpandedTop),
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      snapVideoSheet(VIDEO_SHEET_WORKING_TOP),
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [
    activePlannedVideoEvent,
    snapVideoSheet,
    videoSheetExpandedTop,
    view,
  ]);

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

  // Recordings the backend is still writing up. Polled only while something is
  // actually in flight so an idle profile is not making requests on a timer.
  const { data: activeRecordings = [], refetch: refetchActiveRecordings } = useQuery({
    queryKey: ["check-in-recordings-active", teamId, memberUserId],
    queryFn: () => fetchActiveCheckInRecordings(teamId, memberUserId),
    enabled: !!teamId && !!memberUserId && canCreate,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((recording) => recording.status !== "failed")
        ? 2500
        : false,
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

  const sortedMeetings = useMemo(
    () =>
      [...meetings]
        .sort((a, b) => oneOnOneDisplayDateMs(b) - oneOnOneDisplayDateMs(a)),
    [meetings],
  );
  const recentMeetings = sortedMeetings.slice(0, visibleCheckInCount);
  const hasOlderCheckIns = visibleCheckInCount < sortedMeetings.length;
  const visibleUpcomingCount = embeddedListScroll
    ? Math.min(upcomingPlanned.length, PLANNED_ONE_ON_ONE_VISIBLE_ROWS)
    : 1;
  const latestMeeting = sortedMeetings[0] ?? null;

  /** One history row, shared by the latest-check-in preview and the View all sheet. */
  /** Clears a write-up that failed, so a dead row does not sit there forever. */
  const dismissFailedRecording = async (recording: ActiveCheckInRecording) => {
    try {
      await cancelCheckInRecording(teamId, memberUserId, recording.id);
    } catch {
      /* the cleanup sweep gets it eventually */
    }
    void refetchActiveRecordings();
  };

  /**
   * A check-in that exists but cannot be opened yet, shown while the recording
   * is turned into a draft. Deliberately looks like a real row so the leader can
   * see the conversation was captured.
   */
  const renderProcessingCheckInRow = (recording: ActiveCheckInRecording) => {
    const failed = recording.status === "failed";
    const statusLabel = failed ? "Could not be written up" : "Writing up";
    return (
      <Pressable
        key={recording.id}
        onPress={() => {
          if (failed) {
            Alert.alert(
              "That recording could not be written up",
              recording.error ??
                "Something went wrong turning the conversation into a check-in.",
              [
                { text: "Keep it", style: "cancel" },
                {
                  text: "Dismiss",
                  style: "destructive",
                  onPress: () => void dismissFailedRecording(recording),
                },
              ],
            );
            return;
          }
          toast({
            title: "Still writing up — this opens on its own when it is ready.",
            preset: "none",
          });
        }}
        style={{
          backgroundColor: failed ? "#FFFBFA" : "#FBFAFF",
          borderRadius: 11,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: failed ? "#FBD5D5" : "#E4DEFF",
          paddingVertical: 7,
          paddingHorizontal: 10,
        }}
        accessibilityRole="button"
        accessibilityLabel={`${recording.templateTitle}, ${statusLabel}`}
        testID={`processing-check-in-${recording.id}`}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: failed ? "#FEF2F2" : "#F0ECFF",
            }}
          >
            {failed ? (
              <CircleAlert size={15} color="#DC2626" strokeWidth={2.2} />
            ) : (
              <ActivityIndicator size="small" color="#684BFF" />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ fontSize: 12.5, fontWeight: "700", color: "#0F172A" }}
              numberOfLines={1}
            >
              {recording.templateTitle}
            </Text>
            <Text style={{ fontSize: 10.5, color: "#7A8698" }} numberOfLines={1}>
              {failed
                ? "Tap for what went wrong"
                : "Alenio is turning your conversation into a draft"}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: failed ? "#FEF2F2" : "#EEF2FF",
            }}
          >
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "800",
                color: failed ? "#B91C1C" : "#4F46E5",
              }}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderCheckInHistoryRow = (
    meeting: OneOnOneMeeting,
    onPress?: () => void,
  ) => {
            const taskCount = meeting.followUpTasks?.length ?? 0;
            const openTaskCount = (meeting.followUpTasks ?? []).filter(
              (task) => task.status !== "done",
            ).length;
            const isDraft = meeting.status === "draft";
            const hasOpenFollowUps = !isDraft && openTaskCount > 0;
            const statusLabel = isDraft
              ? "Draft"
              : hasOpenFollowUps
                ? "In progress"
                : "Completed";
            const statusBackground = isDraft
              ? "#FFF7ED"
              : hasOpenFollowUps
                ? "#EEF2FF"
                : "#ECFDF3";
            const statusColor = isDraft
              ? "#B45309"
              : hasOpenFollowUps
                ? "#4F46E5"
                : "#15803D";
            return (
              <Pressable
                key={meeting.id}
                onPress={onPress ?? (() => setPreviewMeeting(meeting))}
                onLongPress={canModify ? () => openHistoryMeetingMenu(meeting) : undefined}
                delayLongPress={400}
                style={{
                  backgroundColor: "white",
                  borderRadius: 11,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: "#ECEEF5",
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  shadowColor: "#1E1B4B",
                  shadowOpacity: 0.035,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 2 },
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#F0ECFF",
                    }}
                  >
                    <CalendarCheck size={15} color="#684BFF" strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Text
                        style={{ flex: 1, fontSize: 12, fontWeight: "700", color: "#111827" }}
                        numberOfLines={1}
                      >
                        {meeting.templateTitle}
                      </Text>
                      <View
                        style={{
                          borderRadius: 999,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          backgroundColor: statusBackground,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: "800",
                            color: statusColor,
                          }}
                        >
                          {statusLabel}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 9.5, color: "#667085", marginTop: 1 }} numberOfLines={1}>
                      {formatMeetingDate(oneOnOneDisplayDate(meeting))}
                      {" · "}
                      {meeting.createdBy?.name?.trim() || managerName || "Team leader"}
                    </Text>
                    <Text style={{ fontSize: 9.5, color: "#8A96AA", marginTop: 2 }} numberOfLines={1}>
                      {taskCount === 0
                        ? "No follow-up actions"
                        : openTaskCount === 0
                          ? `${taskCount} follow-up ${taskCount === 1 ? "action" : "actions"} complete`
                          : `${openTaskCount} follow-up ${openTaskCount === 1 ? "action" : "actions"} open`}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#A0A9B8" />
                </View>
              </Pressable>
    );
  };

  useEffect(() => {
    setVisibleCheckInCount(CHECK_IN_HISTORY_PAGE_SIZE);
  }, [memberUserId, teamId]);

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
    onMeetingsChange?.(meetings);
  }, [meetings, onMeetingsChange]);

  useFocusEffect(
    useCallback(() => {
      const meetingToReopen = reopenMeetingAfterTaskRef.current;
      if (!meetingToReopen || !teamId || !memberUserId) return;
      reopenMeetingAfterTaskRef.current = null;
      let active = true;
      void fetchOneOnOneMeetings(teamId, memberUserId)
        .then((list) => {
          if (!active) return;
          setMeetings(list);
          setPreviewMeeting(
            list.find((meeting) => meeting.id === meetingToReopen.id) ??
              meetingToReopen,
          );
        })
        .catch(() => {
          if (active) setPreviewMeeting(meetingToReopen);
        });
      return () => {
        active = false;
      };
    }, [memberUserId, teamId]),
  );

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(
    () =>
      realtimeClient.onInboxUpdated((event) => {
        if (event.kind !== "team" || event.teamId !== teamId) return;
        if (
          event.resource &&
          event.resource !== "calendar" &&
          event.resource !== "check_ins"
        ) {
          return;
        }
        void loadMeetings();
        void refetchPlannedOneOnOnes();
      }),
    [loadMeetings, refetchPlannedOneOnOnes, teamId],
  );

  useEffect(() => {
    if (
      !initialMeetingId ||
      openedInitialMeetingIdRef.current === initialMeetingId
    ) {
      return;
    }
    const requestedMeeting = meetings.find(
      (meeting) => meeting.id === initialMeetingId,
    );
    if (!requestedMeeting) return;
    openedInitialMeetingIdRef.current = initialMeetingId;
    setPreviewMeeting(requestedMeeting);
  }, [initialMeetingId, meetings]);

  useEffect(() => {
    setView("list");
    setSelectedTemplate(null);
    setEditingMeeting(null);
    setResponses({});
    setFollowUpDrafts([]);
    setFollowUpEditorDraft(null);
    setPreviewMeeting(null);
    setCheckInActionMenu(null);
    setCheckInActionDeleteConfirm(false);
    setEndMeetingPromptOpen(false);
    setVideoCheckInSubmitted(false);
    setEndAfterPublish(false);
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
    // Only offer the choice where recording is possible; otherwise an open
    // check-in cannot happen and the templates are the only way through.
    setView(senecaCaptureAvailable ? "mode" : "pick");
    try {
      const list = templateCatalog.length > 0 ? templateCatalog : await fetchOneOnOneTemplates(teamId);
      setTemplates(list);
      if (list.length === 0) {
        setErr("No check-in templates yet.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load templates.");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const pickTemplate = (template: OneOnOneTemplate) => {
    setAiDraftFieldIds(new Set());
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
    setFollowUpDrafts([]);
    setFollowUpEditorDraft(null);
    setPrepAcknowledged(false);
    setErr(null);
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setView("fill");
  };

  /**
   * Selecting a template asks how the conversation will be captured, rather
   * than dropping straight into the form. Where recording is impossible there
   * is only one answer, so the question is skipped.
   */
  const chooseTemplate = (template: OneOnOneTemplate) => {
    if (!senecaCaptureAvailable || !canCreate) {
      pickTemplate(template);
      return;
    }
    setErr(null);
    setCaptureTemplate(template);
    setView("capture");
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
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
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
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
      toast({ title: "Check-in deleted", preset: "done" });
      closeCheckInActionMenu();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not delete", preset: "error" });
    } finally {
      setDeletingCheckInActionId(null);
    }
  };

  const openPlannedEventMenu = (event: PlannedOneOnOneEvent) => {
    if (!canCreate) return;
    setCheckInActionDeleteConfirm(false);
    setCheckInActionMenu({ kind: "planned", event });
  };

  const openHistoryMeetingMenu = (meeting: OneOnOneMeeting) => {
    if (!canModify) return;
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
      ? `With ${schedulerName} · ${formatCompactScheduledOneOnOneWhen(event)}`
      : formatCompactScheduledOneOnOneWhen(event);

    const rowContent = (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#F3F4F6",
            flexShrink: 0,
          }}
        >
          <CalendarCheck size={16} color="#1F2937" strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: "#172033" }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: 9.5,
              lineHeight: 14,
              fontWeight: "500",
              color: "#7C8799",
              marginTop: 1,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {memberSubtitle}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 7,
            paddingVertical: 4,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: "#E1E5EA",
            backgroundColor: "#F5F6F8",
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "700", color: "#344054" }}>
            Scheduled
          </Text>
        </View>
      </View>
    );

    if (!canCreate) {
      return (
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 13,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderWidth: 1,
            borderColor: "#F3F5F8",
            minHeight: PLANNED_ONE_ON_ONE_ROW_HEIGHT,
            justifyContent: "center",
            shadowOpacity: 0,
            elevation: 0,
          }}
          testID={`planned-one-on-one-${event.id}`}
        >
          {rowContent}
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => openPlannedEventMenu(event)}
        onLongPress={() => openPlannedEventMenu(event)}
        delayLongPress={400}
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 13,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderWidth: 1,
          borderColor: "#F3F5F8",
          minHeight: PLANNED_ONE_ON_ONE_ROW_HEIGHT,
          justifyContent: "center",
          shadowOpacity: 0,
          elevation: 0,
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
          setErr("No check-in templates yet.");
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
    // Bring back anything jotted down before the draft was put away.
    setFollowUpDrafts(followUpDraftsFromMeeting(meeting, memberUserId));
    setPrepAcknowledged(true);
    setErr(null);
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setView("fill");
  };

  /**
   * Closes the transcript when the screen hosting it has gone.
   *
   * Modal keeps its children mounted when it is merely hidden, so a transcript
   * left open when the check-in or preview closed would keep its audio playing
   * with nothing on screen to stop it.
   */
  useEffect(() => {
    if (!transcriptMeetingId) return;
    if (view === "list" && !previewMeeting) setTranscriptMeetingId(null);
  }, [transcriptMeetingId, view, previewMeeting]);

  /**
   * Watches the recording the leader just handed off and opens its draft the
   * moment it lands, so finishing a conversation and walking away still ends up
   * in front of the write-up.
   */
  useEffect(() => {
    if (!processingRecordingId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const current = await fetchCheckInRecording(
          teamId,
          memberUserId,
          processingRecordingId,
        );
        if (cancelled) return;
        if (current.status === "ready" && current.meetingId) {
          setProcessingRecordingId(null);
          void refetchActiveRecordings();
          void openRecordedDraft(current.meetingId);
          return;
        }
        if (current.status === "failed") {
          setProcessingRecordingId(null);
          void refetchActiveRecordings();
          toast({
            title: current.error ?? "We could not turn that recording into a check-in.",
            preset: "error",
          });
          return;
        }
      } catch {
        /* a dropped poll is not fatal; the row stays and we try again */
      }
      if (!cancelled) timer = setTimeout(tick, 2500);
    };

    timer = setTimeout(tick, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // openRecordedDraft is recreated every render; depending on it would restart
    // the poll constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processingRecordingId, teamId, memberUserId, refetchActiveRecordings]);

  /**
   * Hands the call's transcript to Seneca and waits for the draft, which the
   * existing poll opens as soon as it lands. Live notes stop here: the
   * conversation being written up is the one that just happened.
   */
  const writeUpFromCall = async (template: OneOnOneTemplate | null) => {
    const transcript = callTranscript?.trim();
    if (!transcript || callWriteUpBusy) return;
    setCallWriteUpBusy(true);
    setErr(null);
    onStopCallTranscript?.();
    try {
      const recording = await createCheckInFromTranscript(teamId, memberUserId, {
        templateId: template?.id ?? null,
        transcript,
      });
      setProcessingRecordingId(recording.id);
      void refetchActiveRecordings();
      toast({ title: "Writing up your check-in\u2026", preset: "done" });
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "We could not write up that conversation.",
      );
    } finally {
      setCallWriteUpBusy(false);
    }
  };

  /** Opens the draft Alenio built from a recording, flagging what it filled in. */
  const openRecordedDraft = async (meetingId: string) => {
    setRecordingTemplate(null);
    try {
      const list = await fetchOneOnOneMeetings(teamId, memberUserId);
      setMeetings(list);
      const meeting = list.find((m) => m.id === meetingId);
      if (!meeting) {
        toast({ title: "Could not open that check-in.", preset: "error" });
        return;
      }
      const filled = Object.entries(meeting.responses)
        .filter(([, value]) => value !== "" && value !== 0 && value !== null)
        .map(([fieldId]) => fieldId);
      startEdit(meeting);
      setAiDraftFieldIds(new Set(filled));
      toast({
        title:
          filled.length > 0
            ? "Draft ready. Check what Alenio wrote before publishing."
            : "We could not pull answers out of that conversation.",
        preset: filled.length > 0 ? "done" : "error",
      });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Could not open that check-in.",
        preset: "error",
      });
    }
  };

  const setFieldValue = (fieldId: string, value: string | number) => {
    const nextResponses = { ...responses, [fieldId]: value };
    setResponses(nextResponses);
    if (aiDraftFieldIds.has(fieldId)) {
      setAiDraftFieldIds((prev) => {
        const next = new Set(prev);
        next.delete(fieldId);
        return next;
      });
    }
    if (meetingToolMode) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null;
        void performSaveDraft(false, true, nextResponses);
      }, 900);
    }
    if (highlightLeaderFieldId === fieldId && String(value).trim()) {
      setHighlightLeaderFieldId(null);
    }
    if (highlightRequiredFieldId === fieldId) {
      setHighlightRequiredFieldId(null);
      setErr(null);
    }
  };

  const requestPublish = (endMeetingAfterSave: boolean) => {
    if (!selectedTemplate || saving) return;
    setEndAfterPublish(endMeetingAfterSave);
    const validationError = validateCheckInResponses(selectedTemplate.fields, responses);
    if (validationError) {
      setErr(validationError.message);
      setHighlightRequiredFieldId(validationError.fieldId);
      toast({ title: validationError.message, preset: "error" });
      return;
    }
    setHighlightRequiredFieldId(null);
    setErr(null);
    const needsLeaderComments =
      canCreate && isLeaderCommentsEmpty(selectedTemplate.fields, responses);
    Keyboard.dismiss();
    if (activePlannedVideoEvent) {
      snapVideoSheet(VIDEO_SHEET_WORKING_TOP);
    }
    setTimeout(
      () => {
        if (needsLeaderComments) {
          setLeaderCommentsNudgeOpen(true);
        } else {
          setFeedbackPromptOpen(true);
        }
      },
      Platform.OS === "ios" ? 280 : 220,
    );
  };

  const onPublishClick = () => requestPublish(false);

  const onSaveDraftClick = () => {
    if (!selectedTemplate || saving) return;
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    void performSaveDraft(false);
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
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
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
        ...(sourceVideoRoomId ? { sourceVideoRoomId } : {}),
        ...(sourceCalendarEventId ? { calendarEventId: sourceCalendarEventId } : {}),
      };
      const savedMeeting = editingMeeting
        ? await updateOneOnOneMeeting(
            teamId,
            memberUserId,
            editingMeeting.id,
            payload,
          )
        : await createOneOnOneMeeting(teamId, memberUserId, {
          templateId: selectedTemplate.id,
          ...payload,
        });
      await loadMeetings();
      if (activePlannedVideoEvent || meetingToolMode) {
        editingMeetingRef.current = savedMeeting;
        setEditingMeeting(savedMeeting);
        setVideoCheckInSubmitted(true);
        if (activePlannedVideoEvent && endAfterPublish) {
          closeCheckInFlow();
          void refetchPlannedOneOnOnes();
        }
      } else {
        setView("list");
        setSelectedTemplate(null);
        setEditingMeeting(null);
        setResponses({});
        setFollowUpDrafts([]);
        setLinkedPlannedEventId(null);
        setVideoCheckInSubmitted(false);
        setEndAfterPublish(false);
        void refetchPlannedOneOnOnes();
      }
      void queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["planned-one-on-ones", teamId] });
      invalidateTaskCaches(queryClient, teamId);
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
      toast({
        title:
          activePlannedVideoEvent || meetingToolMode
            ? "Check-in submitted"
            : "Check-in saved",
        preset: "done",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save check-in.";
      setErr(message);
      toast({ title: message, preset: "error" });
    } finally {
      setSaving(false);
    }
  };

  const performSaveDraft = async (
    endMeetingAfterSave = false,
    silent = false,
    responseOverride?: Record<string, string | number>,
  ) => {
    if (!selectedTemplate || saving) return;
    if (!silent && autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setSaving(true);
    setErr(null);
    try {
      const currentResponses = responseOverride ?? responses;
      const normalized: Record<string, string | number> = {};
      for (const field of selectedTemplate.fields) {
        if (field.type === "section" || field.type === "associate_notes") continue;
        const raw = currentResponses[field.id];
        normalized[field.id] =
          field.type === "rating"
            ? typeof raw === "number"
              ? raw
              : Number(raw) || 0
            : typeof raw === "string"
              ? raw
              : String(raw ?? "");
      }
      const payload = {
        responses: normalized,
        status: "draft" as const,
        // Kept with the draft so putting it down and coming back does not
        // throw away the follow-ups. They become tasks only on publish.
        followUpTasks: buildFollowUpPayload(editingMeetingRef.current),
        ...(linkedPlannedEventId
          ? { plannedCalendarEventId: linkedPlannedEventId }
          : {}),
        ...(sourceVideoRoomId ? { sourceVideoRoomId } : {}),
        ...(sourceCalendarEventId ? { calendarEventId: sourceCalendarEventId } : {}),
      };
      const currentMeeting = editingMeetingRef.current;
      const savedMeeting = currentMeeting
        ? await updateOneOnOneMeeting(
            teamId,
            memberUserId,
            currentMeeting.id,
            payload,
          )
        : await createOneOnOneMeeting(teamId, memberUserId, {
          templateId: selectedTemplate.id,
          ...payload,
        });
      if (!silent || endMeetingAfterSave) await loadMeetings();
      if ((activePlannedVideoEvent || meetingToolMode) && !endMeetingAfterSave) {
        editingMeetingRef.current = savedMeeting;
        setEditingMeeting(savedMeeting);
      } else {
        setView("list");
        setSelectedTemplate(null);
        setEditingMeeting(null);
        setResponses({});
        setFollowUpDrafts([]);
        setLinkedPlannedEventId(null);
        setEndMeetingPromptOpen(false);
        setEndAfterPublish(false);
        setVideoCheckInSubmitted(false);
        void refetchPlannedOneOnOnes();
      }
      if (!silent) toast({ title: "Draft saved", preset: "done" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setSaving(false);
    }
  };

  saveDraftNowRef.current = () => performSaveDraft(false, true);

  useEffect(() => {
    if (!meetingToolMode || view !== "fill" || videoCheckInSubmitted) {
      onDraftSaveReady?.(null);
      return;
    }
    const saveDraft = () => saveDraftNowRef.current();
    onDraftSaveReady?.(saveDraft);
    return () => onDraftSaveReady?.(null);
  }, [meetingToolMode, onDraftSaveReady, videoCheckInSubmitted, view]);

  const closeMeetingToolForm = () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const hasDraftContent =
      Object.values(responses).some((value) =>
        typeof value === "number" ? value > 0 : value.trim().length > 0,
      ) || followUpDrafts.length > 0;
    if (videoCheckInSubmitted || (!editingMeetingRef.current && !hasDraftContent)) {
      closeCheckInFlow();
      return;
    }
    void performSaveDraft(true, true);
  };

  const finishVideoMeeting = () => {
    setEndMeetingPromptOpen(false);
    closeCheckInFlow();
    void refetchPlannedOneOnOnes();
  };

  const requestEndVideoMeeting = () => {
    Keyboard.dismiss();
    if (videoCheckInSubmitted) {
      Alert.alert(
        "End video meeting?",
        "The check-in has been submitted. The video call will close for you.",
        [
          { text: "Keep meeting open", style: "cancel" },
          {
            text: "End meeting",
            style: "destructive",
            onPress: finishVideoMeeting,
          },
        ],
      );
      return;
    }
    setEndMeetingPromptOpen(true);
  };

  const requestEndBeforeTemplateSelection = () => {
    Keyboard.dismiss();
    if (!videoCallActive) {
      finishVideoMeeting();
      return;
    }
    Alert.alert(
      "Leave the active video call?",
      "You're active in a call, but no check-in template has been selected. Ending now will leave the video call.",
      [
        { text: "Stay in video", style: "cancel" },
        {
          text: "Leave video",
          style: "destructive",
          onPress: finishVideoMeeting,
        },
      ],
    );
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
    setEndMeetingPromptOpen(false);
    setVideoCheckInSubmitted(false);
    setEndAfterPublish(false);
    setVideoCallActive(false);
    setHighlightRequiredFieldId(null);
    setLinkedPlannedEventId(null);
  };

  const returnToVideoTemplatePicker = () => {
    Keyboard.dismiss();
    setSelectedTemplate(null);
    setEditingMeeting(null);
    setResponses({});
    setFollowUpDrafts([]);
    setFollowUpEditorDraft(null);
    setShowFollowUpDueDatePicker(false);
    setPrepAcknowledged(false);
    setErr(null);
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setVideoCheckInSubmitted(false);
    setEndAfterPublish(false);
    setHighlightRequiredFieldId(null);
    setHighlightLeaderFieldId(null);
    setView("pick");
  };

  const requestVideoTemplateChange = () => {
    const hasEnteredResponses = Object.values(responses).some((value) =>
      typeof value === "number" ? value > 0 : value.trim().length > 0,
    );
    if (!hasEnteredResponses && followUpDrafts.length === 0) {
      returnToVideoTemplatePicker();
      return;
    }
    Alert.alert(
      "Change check-in template?",
      "Your current responses and unsaved follow-up tasks will be cleared. The video call will stay connected.",
      [
        { text: "Keep this template", style: "cancel" },
        {
          text: "Change template",
          style: "destructive",
          onPress: returnToVideoTemplatePicker,
        },
      ],
    );
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
          backgroundColor: "#FFFFFF",
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
                    backgroundColor: "#FFFFFF",
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

    const renderSaveActions = (keyboardAccessory = false) => {
      if (activePlannedVideoEvent && videoCheckInSubmitted) {
        return (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingTop: 8,
              paddingBottom: keyboardAccessory
                ? 8
                : Math.max(16, insets.bottom + 8),
              borderTopWidth: 1,
              borderTopColor: "#DDF3E6",
              backgroundColor: "#F5FCF8",
              gap: 8,
            }}
          >
            <View
              style={{
                flex: 1,
                minHeight: 42,
                paddingHorizontal: 12,
                borderRadius: 11,
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                backgroundColor: "#E8F8EF",
                borderWidth: 1,
                borderColor: "#BCE8CE",
              }}
            >
              <View
                style={{
                  width: 21,
                  height: 21,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#16A34A",
                }}
              >
                <Check size={13} color="#FFFFFF" strokeWidth={3} />
              </View>
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#15803D" }}>
                Check-in submitted
              </Text>
            </View>
            <Pressable
              onPress={requestEndVideoMeeting}
              style={{
                minHeight: 42,
                paddingHorizontal: 15,
                borderRadius: 11,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#E11D48",
              }}
              accessibilityRole="button"
              accessibilityLabel="End video meeting"
            >
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#FFFFFF" }}>
                End meeting
              </Text>
            </Pressable>
          </View>
        );
      }

      return (
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: keyboardAccessory ? 8 : Math.max(16, insets.bottom + 8),
          borderTopWidth: 1,
          borderTopColor: "#F1F5F9",
          backgroundColor: "white",
          gap: 8,
        }}
      >
        {meetingToolMode ? (
          <View
            style={{
              flex: 1,
              borderRadius: 10,
              paddingVertical: 11,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#F8FAFC",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748B" }}>
              {saving ? "Saving draft…" : "Draft autosaves"}
            </Text>
          </View>
        ) : !editingMeeting || editingMeeting.status === "draft" ? (
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
                ? "Publish Check-in"
                : editingMeeting
                  ? "Save changes"
                  : "Publish Check-in"}
          </Text>
        </Pressable>
      </View>
      );
    };

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: activePlannedVideoEvent ? "#0A0F1E" : "#FFFFFF",
          overflow: "hidden",
        }}
      >
        {activePlannedVideoEvent ? (
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              left: 0,
              height: videoSheetTop,
              overflow: "hidden",
              backgroundColor: "#0A0F1E",
            }}
          >
            <EmbeddedVideoCall
              roomId={activePlannedVideoEvent.id}
              roomName={activePlannedVideoEvent.title}
              presentation="background"
              onCallActiveChange={setVideoCallActive}
            />
          </Animated.View>
        ) : null}
        <Animated.View
          style={
            activePlannedVideoEvent
              ? {
                  position: "absolute",
                  top: videoSheetTop,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  borderTopLeftRadius: 22,
                  borderTopRightRadius: 22,
                  backgroundColor: "#FFFFFF",
                  overflow: "hidden",
                  shadowColor: "#000000",
                  shadowOpacity: 0.18,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: -5 },
                  elevation: 16,
                }
              : { flex: 1, backgroundColor: "#FFFFFF" }
          }
        >
        {activePlannedVideoEvent ? (
          <View
            {...videoSheetPanResponder.panHandlers}
            style={{
              height: 24,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
            }}
            accessibilityLabel="Drag to resize check-in"
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#C9CED8",
              }}
            />
          </View>
        ) : null}
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
          {videoCheckInSubmitted ? (
            <View style={{ width: 20 }} />
          ) : (
            <Pressable
              onPress={
                activePlannedVideoEvent
                  ? requestVideoTemplateChange
                  : meetingToolMode
                    ? closeMeetingToolForm
                    : exitFill
              }
              hitSlop={8}
            >
              <ChevronLeft size={20} color="#4361EE" />
            </Pressable>
          )}
          <AlenioHeaderBrand />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#0F172A" }} numberOfLines={1}>
              {videoCheckInSubmitted
                ? "Check-in complete"
                : editingMeeting
                ? editingMeeting.status === "draft"
                  ? "Resume editing"
                  : "Edit check-in"
                : selectedTemplate.title}
            </Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 1 }} numberOfLines={1}>
              {activePlannedVideoEvent
                ? `With ${memberName}`
                : "Complete the check-in form"}
            </Text>
          </View>
          {activePlannedVideoEvent ? (
            <Pressable
              onPress={requestEndVideoMeeting}
              hitSlop={6}
              style={{
                minHeight: 28,
                paddingHorizontal: 10,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FFF1F2",
                borderWidth: 1,
                borderColor: "#FECDD3",
              }}
              accessibilityRole="button"
              accessibilityLabel="End video meeting"
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: "#BE123C",
                }}
              >
                End
              </Text>
            </Pressable>
          ) : null}
        </View>

        {videoCheckInSubmitted ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingBottom: Math.max(insets.bottom, 16),
              backgroundColor: "#FBFCFE",
            }}
          >
            <View
              style={{
                width: 92,
                height: 92,
                borderRadius: 46,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#ECFDF3",
                borderWidth: 1,
                borderColor: "#C7F0D8",
              }}
            >
              <View
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 31,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#16A34A",
                  shadowColor: "#15803D",
                  shadowOpacity: 0.24,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 7 },
                  elevation: 7,
                }}
              >
                <Check size={30} color="#FFFFFF" strokeWidth={2.8} />
              </View>
            </View>
            <Text
              style={{
                marginTop: 20,
                fontSize: 10,
                lineHeight: 14,
                fontWeight: "800",
                letterSpacing: 1.4,
                color: "#16A34A",
              }}
            >
              CHECK-IN SUBMITTED
            </Text>
            <Text
              style={{
                marginTop: 7,
                fontSize: 22,
                lineHeight: 27,
                fontWeight: "800",
                letterSpacing: -0.4,
                textAlign: "center",
                color: "#172033",
              }}
            >
              Everything is saved
            </Text>
            <Text
              style={{
                maxWidth: 300,
                marginTop: 8,
                fontSize: 12,
                lineHeight: 18,
                textAlign: "center",
                color: "#667085",
              }}
            >
              Continue your conversation, or end the virtual check-in when you&apos;re ready.
            </Text>
            <View style={{ width: "100%", maxWidth: 310, marginTop: 24, gap: 9 }}>
              <Pressable
                onPress={
                  meetingToolMode
                    ? closeCheckInFlow
                    : () => snapVideoSheet(VIDEO_SHEET_COLLAPSED_TOP)
                }
                style={{
                  minHeight: 46,
                  borderRadius: 13,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#4361EE",
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  meetingToolMode ? "Close check-in form" : "Continue virtual meeting"
                }
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFFFFF" }}>
                  {meetingToolMode ? "Close form" : "Continue virtual meeting"}
                </Text>
              </Pressable>
              {!meetingToolMode ? (
                <Pressable
                  onPress={requestEndVideoMeeting}
                style={{
                  minHeight: 44,
                  borderRadius: 13,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "#DCE2EC",
                  backgroundColor: "#FFFFFF",
                }}
                accessibilityRole="button"
                accessibilityLabel="End virtual check-in"
              >
                <Text style={{ fontSize: 12.5, fontWeight: "800", color: "#344054" }}>
                  End virtual check-in
                </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
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
            {editingMeeting?.captureMode === "recorded" ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 11,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E4DEFF",
                  backgroundColor: "#F8F6FF",
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#EEE9FF",
                  }}
                >
                  <Sparkles size={13} color="#5B3FF0" strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: "#0F172A" }}>
                    Written up from your recording
                  </Text>
                  <Text style={{ fontSize: 10.5, lineHeight: 14, color: "#667085", marginTop: 1 }}>
                    Check every answer before you publish.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setTranscriptMeetingId(editingMeeting.id)}
                  hitSlop={6}
                  style={{
                    minHeight: 28,
                    paddingHorizontal: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor: "#DDD6FE",
                    backgroundColor: "#FFFFFF",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="View the transcript of this conversation"
                  testID="view-draft-transcript"
                >
                  <Text style={{ fontSize: 10.5, fontWeight: "800", color: "#5B3FF0" }}>
                    Transcript
                  </Text>
                </Pressable>
              </View>
            ) : null}
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
                {aiDraftFieldIds.has(field.id) ? (
                  <View
                    style={{
                      alignSelf: "flex-start",
                      marginTop: -2,
                      marginBottom: 6,
                      minHeight: 20,
                      paddingHorizontal: 7,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      borderRadius: 7,
                      backgroundColor: "#F5F3FF",
                    }}
                  >
                    <Sparkles size={10} color="#5B3FF0" strokeWidth={2.4} />
                    <Text style={{ fontSize: 9.5, fontWeight: "800", color: "#5B3FF0" }}>
                      From your recording
                    </Text>
                  </View>
                ) : null}
                {field.helpText ? (
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 5, lineHeight: 15 }}>
                    {field.helpText}
                  </Text>
                ) : null}
                {renderFieldInput(field)}
              </View>
            );
            })}

            {/* Available on any check-in that is not yet published, which is
                what makes recorded guided check-ins work: their draft always
                opens through startEdit. Editing an already-published check-in
                stays out, because its tasks already exist as real tasks. */}
            {!editingMeeting || editingMeeting.status === "draft" ? (
              <View style={{ marginTop: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>Follow-up tasks</Text>
                  <Pressable
                    onPress={() => {
                      setShowFollowUpDueDatePicker(false);
                      setFollowUpEditorDraft(newFollowUpDraft());
                    }}
                    style={{
                      minHeight: 30,
                      paddingHorizontal: 10,
                      borderRadius: 9,
                      borderWidth: 1,
                      borderColor: "#D9D4FF",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <Plus size={13} color="#5545D9" strokeWidth={2.4} />
                    <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#5545D9" }}>Add task</Text>
                  </Pressable>
                </View>
                {followUpDrafts.length === 0 ? (
                  <Pressable
                    onPress={() => {
                      setShowFollowUpDueDatePicker(false);
                      setFollowUpEditorDraft(newFollowUpDraft());
                    }}
                    style={{
                      minHeight: 84,
                      paddingHorizontal: 13,
                      paddingVertical: 12,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: "#D9D4FF",
                      backgroundColor: "#FAF9FF",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 11,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Create a follow-up task"
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#F0ECFF",
                      }}
                    >
                      <Check size={16} color="#684BFF" strokeWidth={2.3} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontSize: 12.5,
                          lineHeight: 16,
                          fontWeight: "700",
                          color: "#253047",
                        }}
                      >
                        No follow-up tasks yet
                      </Text>
                      <Text
                        style={{
                          marginTop: 3,
                          fontSize: 10.5,
                          lineHeight: 14,
                          color: "#7C8799",
                        }}
                      >
                        Create and assign tasks for work that needs to happen after this check-in.
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 9,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#FFFFFF",
                        borderWidth: 1,
                        borderColor: "#D9D4FF",
                      }}
                    >
                      <Plus size={13} color="#5545D9" strokeWidth={2.5} />
                    </View>
                  </Pressable>
                ) : null}
                {followUpDrafts.map((draft) => (
                  <Pressable
                    key={draft.id}
                    onPress={() => {
                      setShowFollowUpDueDatePicker(false);
                      setFollowUpEditorDraft({ ...draft });
                    }}
                    style={{
                      marginBottom: 8,
                      minHeight: 52,
                      paddingHorizontal: 11,
                      paddingVertical: 9,
                      backgroundColor: "#FFFFFF",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#E7EBF2",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 9,
                    }}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#F0ECFF",
                      }}
                    >
                      <Check size={15} color="#684BFF" strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 12.5,
                          lineHeight: 16,
                          fontWeight: "600",
                          color: "#172033",
                        }}
                      >
                        {draft.title}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          marginTop: 2,
                          fontSize: 10,
                          lineHeight: 13,
                          fontWeight: "500",
                          color: "#7C8799",
                        }}
                      >
                        {draft.assigneeRole === "associate" ? memberName : managerName ?? "Leader"}
                        {draft.dueDate ? ` · Due ${draft.dueDate}` : " · No due date"}
                      </Text>
                    </View>
                    <ChevronRight size={15} color="#A0A9B8" />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {renderSaveActions()}
        </KeyboardAvoidingView>
        )}
        </Animated.View>
        <AlenioBottomSheet
          visible={!!followUpEditorDraft}
          title={
            followUpEditorDraft &&
            followUpDrafts.some((draft) => draft.id === followUpEditorDraft.id)
              ? "Edit follow-up task"
              : "Add follow-up task"
          }
          subtitle="Add an action to complete after this check-in."
          onClose={() => {
            setShowFollowUpDueDatePicker(false);
            setFollowUpEditorDraft(null);
          }}
          compact
          showCloseButton
          headerRight={
            followUpEditorDraft &&
            followUpDrafts.some(
              (draft) => draft.id === followUpEditorDraft.id,
            ) ? (
              <Pressable
                onPress={() => {
                  setFollowUpDrafts((current) =>
                    current.filter(
                      (draft) => draft.id !== followUpEditorDraft.id,
                    ),
                  );
                  setShowFollowUpDueDatePicker(false);
                  setFollowUpEditorDraft(null);
                }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#F4F5F7",
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete follow-up task"
              >
                <Trash2 size={14} color="#111827" strokeWidth={2.2} />
              </Pressable>
            ) : null
          }
          bodyHeightRatio={showFollowUpDueDatePicker ? 0.72 : 0.5}
          footer={
            followUpEditorDraft ? (
              <View style={{ gap: 8 }}>
                <Pressable
                  disabled={!followUpEditorDraft.title.trim()}
                  onPress={() => {
                    const savedDraft = {
                      ...followUpEditorDraft,
                      title: followUpEditorDraft.title.trim(),
                    };
                    setFollowUpDrafts((current) => {
                      const existing = current.some((draft) => draft.id === savedDraft.id);
                      return existing
                        ? current.map((draft) =>
                            draft.id === savedDraft.id ? savedDraft : draft,
                          )
                        : [...current, savedDraft];
                    });
                    setShowFollowUpDueDatePicker(false);
                    setFollowUpEditorDraft(null);
                  }}
                  style={{
                    minHeight: 44,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: followUpEditorDraft.title.trim()
                      ? "#4361EE"
                      : "#CBD5E1",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>
                    Save task
                  </Text>
                </Pressable>
              </View>
            ) : null
          }
        >
          {followUpEditorDraft ? (
            <View style={{ gap: 14 }}>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.6, color: "#7C8799", textTransform: "uppercase" }}>
                  Task
                </Text>
                <TextInput
                  value={followUpEditorDraft.title}
                  onChangeText={(title) =>
                    setFollowUpEditorDraft((current) =>
                      current ? { ...current, title } : current,
                    )
                  }
                  placeholder="What needs to be completed?"
                  placeholderTextColor="#A0A9B8"
                  autoFocus
                  style={{
                    minHeight: 44,
                    borderWidth: 1,
                    borderColor: "#DFE5EE",
                    borderRadius: 11,
                    paddingHorizontal: 12,
                    fontSize: 13,
                    color: "#172033",
                    backgroundColor: "#FFFFFF",
                  }}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.6, color: "#7C8799", textTransform: "uppercase" }}>
                  Assign to
                </Text>
                <View style={{ flexDirection: "row", gap: 4, padding: 3, borderRadius: 11, backgroundColor: "#EEF1F6" }}>
                  {(["associate", "leader"] as const).map((role) => {
                    const selected = followUpEditorDraft.assigneeRole === role;
                    return (
                      <Pressable
                        key={role}
                        onPress={() =>
                          setFollowUpEditorDraft((current) =>
                            current ? { ...current, assigneeRole: role } : current,
                          )
                        }
                        style={{
                          flex: 1,
                          minHeight: 36,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: selected ? "#FFFFFF" : "transparent",
                          borderWidth: 1,
                          borderColor: selected ? "#D9D4FF" : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 11.5,
                            fontWeight: selected ? "700" : "600",
                            color: selected ? "#5545D9" : "#69758B",
                          }}
                        >
                          {role === "associate" ? memberName : managerName ?? "Leader"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.6, color: "#7C8799", textTransform: "uppercase" }}>
                  Due date
                </Text>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowFollowUpDueDatePicker(true);
                  }}
                  style={{
                    minHeight: 44,
                    borderWidth: 1,
                    borderColor: "#DFE5EE",
                    borderRadius: 11,
                    paddingHorizontal: 12,
                    backgroundColor: "#FFFFFF",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: followUpEditorDraft.dueDate ? "#172033" : "#A0A9B8",
                    }}
                  >
                    {followUpEditorDraft.dueDate
                      ? dueDateInputToDate(
                          followUpEditorDraft.dueDate,
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Select a due date"}
                  </Text>
                  <Calendar size={16} color="#684BFF" strokeWidth={2.1} />
                </Pressable>
                {showFollowUpDueDatePicker ? (
                  <DateTimePicker
                    value={dueDateInputToDate(followUpEditorDraft.dueDate)}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "calendar"}
                    minimumDate={new Date()}
                    onChange={(_event, date) => {
                      if (Platform.OS !== "ios") {
                        setShowFollowUpDueDatePicker(false);
                      }
                      if (date) {
                        setFollowUpEditorDraft((current) =>
                          current
                            ? { ...current, dueDate: dateToDueDateInput(date) }
                            : current,
                        );
                      }
                    }}
                    style={Platform.OS === "ios" ? { alignSelf: "center" } : undefined}
                    testID="follow-up-due-date-picker"
                  />
                ) : null}
                {showFollowUpDueDatePicker && Platform.OS === "ios" ? (
                  <Pressable
                    onPress={() => setShowFollowUpDueDatePicker(false)}
                    style={{ alignSelf: "flex-end", paddingVertical: 5, paddingHorizontal: 4 }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#5545D9" }}>
                      Done
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </AlenioBottomSheet>
        {Platform.OS === "ios" ? (
          <InputAccessoryView nativeID={CHECK_IN_INPUT_ACCESSORY_ID}>
            {renderSaveActions(true)}
          </InputAccessoryView>
        ) : null}
      </View>
    );
  };

  const renderModeCard = (options: {
    testID: string;
    icon: React.ReactNode;
    accent: string;
    tileColors: [string, string];
    tileBorder: string;
    surface: string;
    border: string;
    shadow: string;
    title: string;
    description: string;
    points: string[];
    action: string;
    recommended?: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={options.onPress}
      style={({ pressed }) => ({
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: options.border,
        backgroundColor: options.surface,
        overflow: "hidden",
        shadowColor: options.shadow,
        shadowOpacity: pressed ? 0.03 : 0.07,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        elevation: pressed ? 0 : 2,
        transform: [{ scale: pressed ? 0.995 : 1 }],
      })}
      accessibilityRole="button"
      accessibilityLabel={options.action}
      testID={options.testID}
    >
      <View style={{ flexDirection: "row", gap: 12, padding: 15 }}>
        <LinearGradient
          colors={options.tileColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: options.tileBorder,
          }}
        >
          {options.icon}
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          {options.recommended ? (
            <View
              style={{
                alignSelf: "flex-start",
                marginBottom: 5,
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 6,
                backgroundColor: "#EDE7FF",
              }}
            >
              <Text
                style={{
                  fontSize: 8,
                  fontWeight: "800",
                  letterSpacing: 0.7,
                  color: options.accent,
                }}
              >
                RECOMMENDED
              </Text>
            </View>
          ) : null}
          <Text
            style={{
              fontSize: 16.5,
              lineHeight: 21,
              fontWeight: "800",
              letterSpacing: -0.4,
              color: "#0F172A",
            }}
          >
            {options.title}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: 12,
              lineHeight: 16,
              color: "#5A6478",
            }}
          >
            {options.description}
          </Text>
          <View style={{ marginTop: 9, gap: 6 }}>
            {options.points.map((point) => (
              <View
                key={point}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: options.accent,
                    opacity: 0.45,
                  }}
                />
                <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 15, color: "#7A8496" }}>
                  {point}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 15,
          paddingVertical: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: options.border,
        }}
      >
        <Text
          style={{
            fontSize: 12.5,
            fontWeight: "800",
            letterSpacing: -0.1,
            color: options.accent,
          }}
        >
          {options.action}
        </Text>
        <ChevronRight size={17} color={options.accent} strokeWidth={2.3} />
      </View>
    </Pressable>
  );

  const renderModeView = () => {
    const firstName = memberName.trim().split(/\s+/)[0] || memberName;
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 26, gap: 13 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 3 }}>
          <Text style={{ fontSize: 21, lineHeight: 26, fontWeight: "800", letterSpacing: -0.6, color: "#0F172A" }}>
            Choose a check-in style
          </Text>
          <Text style={{ fontSize: 12.5, lineHeight: 17, color: "#64748B" }}>
            Either way, Alenio writes it up for you to review.
          </Text>
        </View>

        {renderModeCard({
          testID: "guided-check-in-mode",
          icon: <ClipboardList size={20} color="#6D4AFF" strokeWidth={2.2} />,
          accent: "#6D4AFF",
          tileColors: ["#F1ECFF", "#E2D9FF"],
          tileBorder: "#E4DBFF",
          surface: "#F9F7FF",
          border: "#E6E0FB",
          shadow: "#4B3BA8",
          title: "Guided check-in",
          description: "Follow a template with consistent questions.",
          points: ["Best for recurring check-ins", "Easier to compare over time"],
          action: "Choose guided check-in",
          recommended: true,
          onPress: () => setView("pick"),
        })}

        {renderModeCard({
          testID: "open-check-in-mode",
          icon: callWriteUpAvailable ? (
            <Sparkles size={20} color="#2F80ED" strokeWidth={2.2} />
          ) : (
            <Mic size={20} color="#2F80ED" strokeWidth={2.2} />
          ),
          accent: "#2F80ED",
          tileColors: ["#EAF3FF", "#D9E9FF"],
          tileBorder: "#D8E7FB",
          surface: "#FFFFFF",
          border: "#E7ECF3",
          shadow: "#0F172A",
          title: "Open check-in",
          description: "Have a natural conversation without a template.",
          points: callWriteUpAvailable
            ? [
                "Written up from what you both just said",
                "Alenio organizes the important takeaways",
              ]
            : [
                "Record the conversation as you talk",
                "Alenio organizes the important takeaways",
              ],
          action: callWriteUpAvailable
            ? "Write up this conversation"
            : "Choose open check-in",
          onPress: () => {
            if (callWriteUpAvailable) {
              void writeUpFromCall(null);
              return;
            }
            setOpenRecording(true);
          },
        })}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
            padding: 13,
            borderRadius: 16,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: "#E9E4FA",
            backgroundColor: "#FAF9FE",
          }}
        >
          <Sparkles size={19} color="#6D4AFF" strokeWidth={2.2} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: -0.1, color: "#1F2739" }}>
              Seneca handles the recap
            </Text>
            <Text style={{ marginTop: 1, fontSize: 11, lineHeight: 15, color: "#7A8496" }}>
              {`Review and edit the structured summary before saving it to ${firstName}'s record.`}
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  };

  /**
   * How the selected template gets filled in: by hand, or from a recording.
   * Both land on the same review form, which is what the copy promises.
   */
  const renderCaptureView = () => {
    const template = captureTemplate;
    if (!template) return null;
    const firstName = memberName.trim().split(/\s+/)[0] || memberName;
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 26, gap: 13 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
          <Pressable
            onPress={() => {
              setCaptureTemplate(null);
              setView("pick");
            }}
            hitSlop={8}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: "#EEF2FF",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to templates"
            testID="capture-back-button"
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
              marginTop: 6,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "800", color: "#4F46E5" }}>2</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ fontSize: 21, lineHeight: 26, fontWeight: "800", letterSpacing: -0.6, color: "#0F172A" }}>
              Select a capture method
            </Text>
            <Text style={{ fontSize: 12.5, lineHeight: 17, color: "#64748B" }}>
              {`${template.title} · Both methods produce the same structured record for ${firstName}.`}
            </Text>
          </View>
        </View>

        {callWriteUpAvailable
          ? renderModeCard({
              testID: "capture-call-write-up-method",
              icon: <Sparkles size={20} color="#6D4AFF" strokeWidth={2.2} />,
              accent: "#6D4AFF",
              tileColors: ["#F1ECFF", "#E2D9FF"],
              tileBorder: "#E4DBFF",
              surface: "#F9F7FF",
              border: "#E6E0FB",
              shadow: "#4B3BA8",
              title: "Write up this call",
              description: `Let Seneca fill the form in from your conversation with ${firstName}.`,
              points: [
                "Answers drafted from what you both said",
                "Review and approve every answer before it is saved",
              ],
              action: callWriteUpBusy ? "Writing it up\u2026" : "Write up this call",
              recommended: true,
              onPress: () => void writeUpFromCall(template),
            })
          : micRecordingAvailable
            ? renderModeCard({
                testID: "capture-record-method",
                icon: <Mic size={20} color="#6D4AFF" strokeWidth={2.2} />,
                accent: "#6D4AFF",
                tileColors: ["#F1ECFF", "#E2D9FF"],
                tileBorder: "#E4DBFF",
                surface: "#F9F7FF",
                border: "#E6E0FB",
                shadow: "#4B3BA8",
                title: "Record with Seneca",
                description: "Hold the conversation and let Seneca complete the form.",
                points: [
                  "Responses drafted from the transcript",
                  "Review and approve every answer before it is saved",
                ],
                action: "Record with Seneca",
                recommended: true,
                // The chosen template stays put, so backing out of the recording
                // sheet returns here rather than to a blank screen.
                onPress: () => setRecordingTemplate(template),
              })
            : null}

        {renderModeCard({
          testID: "capture-form-method",
          icon: <ClipboardList size={20} color="#2F80ED" strokeWidth={2.2} />,
          accent: "#2F80ED",
          tileColors: ["#EAF3FF", "#D9E9FF"],
          tileBorder: "#D8E7FB",
          surface: "#FFFFFF",
          border: "#E7ECF3",
          shadow: "#0F172A",
          title: "Complete the form",
          description: "Enter each response yourself as the conversation happens.",
          points: [
            "Full control over the wording of every answer",
            "Suited to documenting as you go",
          ],
          action: "Complete the form",
          onPress: () => {
            setCaptureTemplate(null);
            pickTemplate(template);
          },
        })}
      </ScrollView>
    );
  };

  const renderPickView = () => (
    <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 4, backgroundColor: "#FFFFFF" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {!activePlannedVideoEvent ? (
          <Pressable
            onPress={() => setView(senecaCaptureAvailable ? "mode" : "list")}
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
        ) : null}
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
        {activePlannedVideoEvent ? (
          <Pressable
            onPress={requestEndBeforeTemplateSelection}
            hitSlop={6}
            style={{
              minHeight: 28,
              paddingHorizontal: 10,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFF1F2",
              borderWidth: 1,
              borderColor: "#FECDD3",
            }}
            accessibilityRole="button"
            accessibilityLabel="End video meeting"
          >
            <Text style={{ fontSize: 10, fontWeight: "800", color: "#BE123C" }}>
              End
            </Text>
          </Pressable>
        ) : null}
      </View>
      {loadingTemplates ? (
        <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
      ) : templates.length === 0 ? (
        <View
          style={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 20,
            paddingBottom: 24,
          }}
          testID="check-in-template-picker-empty"
        >
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: "#EEF2FF",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <CalendarCheck size={25} color="#4361EE" />
          </View>
          <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A", textAlign: "center" }}>
            No check-in templates yet
          </Text>
          <Text
            style={{
              marginTop: 7,
              maxWidth: 300,
              fontSize: 13,
              lineHeight: 19,
              color: "#64748B",
              textAlign: "center",
            }}
          >
            {canManageTemplates
              ? "Create a reusable conversation for leaders in this workspace."
              : "Ask your workspace owner to create a check-in template, then it will appear here."}
          </Text>
          {canManageTemplates ? (
            <Pressable
              onPress={() => {
                closeCheckInFlow();
                router.push({
                  pathname: "/check-in-templates",
                  params: { teamId },
                });
              }}
              style={{
                marginTop: 16,
                minWidth: 190,
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: "#4361EE",
              }}
              accessibilityRole="button"
              accessibilityLabel="Manage check-in templates"
              testID="manage-check-in-templates"
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>
                Manage templates
              </Text>
            </Pressable>
          ) : null}
          {err && err !== "No check-in templates yet." ? (
            <Text style={{ marginTop: 10, fontSize: 11, color: "#DC2626", textAlign: "center" }}>
              {err}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ width: "100%", gap: 8, paddingBottom: 12 }}>
          {templates.map((t, index) => {
            const accent = TEMPLATE_CARD_ACCENTS[index % TEMPLATE_CARD_ACCENTS.length]!;
            const duration = estimateTemplateDuration(t);
            return (
              <Pressable
                key={t.id}
                onPress={() => chooseTemplate(t)}
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

        </View>
      )}
    </View>
  );

  const renderCheckInActionMenuModal = () => {
    if (!checkInActionMenu) return null;
    if (
      (checkInActionMenu.kind === "planned" && !canCreate) ||
      (checkInActionMenu.kind === "history" && !canModify)
    ) {
      return null;
    }

    const isPlanned = checkInActionMenu.kind === "planned";
    const title = isPlanned
      ? checkInActionMenu.event.oneOnOneTemplateId
        ? templateTitleById.get(checkInActionMenu.event.oneOnOneTemplateId) ??
          "Check-in"
        : "Check-in"
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
            <View
              style={checkInActionSheetStyle(
                insets.bottom,
                checkInActionDeleteConfirm,
              )}
            >
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
                    marginBottom: 14,
                    backgroundColor: "#FFFCFC",
                    borderRadius: 18,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: "#F2DDE0",
                    paddingHorizontal: 16,
                    paddingTop: 17,
                    paddingBottom: 14,
                    alignItems: "center",
                    shadowColor: "#5B2130",
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.06,
                    shadowRadius: 14,
                    elevation: 2,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#FFF0F2",
                    }}
                  >
                    <Trash2 size={18} color="#D94A5C" strokeWidth={2.2} />
                  </View>
                  <Text
                    style={{
                      marginTop: 10,
                      fontSize: 15,
                      lineHeight: 19,
                      fontWeight: "700",
                      color: "#29242E",
                      textAlign: "center",
                    }}
                  >
                    Delete check-in?
                  </Text>
                  <Text
                    style={{
                      maxWidth: 270,
                      marginTop: 5,
                      fontSize: 11,
                      color: "#746C78",
                      textAlign: "center",
                      lineHeight: 16,
                    }}
                  >
                    {isPlanned
                      ? "This will remove the scheduled check-in from both calendars. This action cannot be undone."
                      : `The check-in from ${whenLabel} will be permanently removed.`}
                  </Text>
                  <View
                    style={{
                      width: "100%",
                      flexDirection: "row",
                      gap: 9,
                      marginTop: 16,
                    }}
                  >
                    <Pressable
                      onPress={() => setCheckInActionDeleteConfirm(false)}
                      style={{
                        flex: 1,
                        minHeight: 42,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#F4F5F7",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: "#505867",
                        }}
                      >
                        Keep check-in
                      </Text>
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
                        borderRadius: 12,
                        alignItems: "center",
                        backgroundColor: "#D94A5C",
                        minHeight: 42,
                        justifyContent: "center",
                        opacity: isDeleting ? 0.7 : 1,
                      }}
                      testID="confirm-delete-check-in"
                    >
                      {isDeleting ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: "#FFFFFF",
                          }}
                        >
                          Delete
                        </Text>
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
      <Modal
        visible={leaderCommentsNudgeOpen}
        transparent
        animationType="none"
        onRequestClose={() => setLeaderCommentsNudgeOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-start",
            paddingHorizontal: 24,
            paddingTop: PUBLISH_PROMPT_TOP,
            paddingBottom: 24,
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

      <Modal
        visible={feedbackPromptOpen}
        transparent
        animationType="none"
        onRequestClose={() => setFeedbackPromptOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-start",
            paddingHorizontal: 24,
            paddingTop: PUBLISH_PROMPT_TOP,
            paddingBottom: 24,
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

      <Modal
        visible={endMeetingPromptOpen}
        transparent
        animationType="none"
        onRequestClose={() => setEndMeetingPromptOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 22,
            backgroundColor: "rgba(7,16,31,0.72)",
          }}
          onPress={() => setEndMeetingPromptOpen(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={{
              width: "100%",
              maxWidth: 360,
              padding: 22,
              borderRadius: 26,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "#E5E9F0",
              backgroundColor: "#FFFFFF",
              shadowColor: "#000000",
              shadowOpacity: 0.24,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 14 },
              elevation: 18,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#F0ECFF",
                  borderWidth: 1,
                  borderColor: "#E0D9FF",
                }}
              >
                <Image
                  source={require("@/assets/alenio-icon.png")}
                  style={{ width: 32, height: 32, borderRadius: 9 }}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 9,
                    lineHeight: 12,
                    fontWeight: "800",
                    letterSpacing: 1.1,
                    color: "#684BFF",
                  }}
                >
                  VIRTUAL CHECK-IN
                </Text>
                <Text
                  style={{
                    marginTop: 3,
                    fontSize: 19,
                    lineHeight: 24,
                    fontWeight: "800",
                    letterSpacing: -0.25,
                    color: "#172033",
                  }}
                >
                  Finish this check-in?
                </Text>
              </View>
            </View>
            <View
              style={{
                marginTop: 16,
                paddingHorizontal: 13,
                paddingVertical: 11,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: "#E8ECF3",
                backgroundColor: "#F8FAFC",
              }}
            >
              <Text style={{ fontSize: 12, lineHeight: 18, color: "#667085" }}>
                Your check-in has not been submitted. Choose how you want to finish before leaving.
              </Text>
            </View>
            <View style={{ marginTop: 16, gap: 9 }}>
              <Pressable
                onPress={() => {
                  setEndMeetingPromptOpen(false);
                  requestPublish(true);
                }}
                disabled={saving}
                style={{
                  minHeight: 50,
                  borderRadius: 13,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: "#4361EE",
                  shadowColor: "#4361EE",
                  shadowOpacity: 0.22,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 4,
                }}
              >
                <Check size={16} color="#FFFFFF" strokeWidth={2.7} />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFFFFF" }}>
                  Submit check-in and finish
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEndMeetingPromptOpen(false);
                  void performSaveDraft(true);
                }}
                disabled={saving}
                style={{
                  minHeight: 48,
                  borderRadius: 13,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderWidth: 1,
                  borderColor: "#DCE2EC",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <FileText size={15} color="#344054" strokeWidth={2.2} />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#344054" }}>
                  Save draft and finish
                </Text>
              </Pressable>
              <Pressable
                onPress={finishVideoMeeting}
                disabled={saving}
                style={{
                  minHeight: 46,
                  borderRadius: 13,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  borderWidth: 1,
                  borderColor: "#F4CDD3",
                  backgroundColor: "#FFF8F8",
                }}
              >
                <LogOut size={15} color="#BE123C" strokeWidth={2.2} />
                <Text style={{ fontSize: 12.5, fontWeight: "800", color: "#BE123C" }}>
                  End without saving
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setEndMeetingPromptOpen(false)}
                style={{
                  minHeight: 36,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#667085" }}>
                  Keep meeting open
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  const renderTranscriptPanel = () => {
    if (!transcriptMeetingId) return null;
    return (
      <CheckInTranscriptPanel
        teamId={teamId}
        memberUserId={memberUserId}
        meetingId={transcriptMeetingId}
        onClose={() => setTranscriptMeetingId(null)}
      />
    );
  };

  // Section headings and the leader's own notes field are not things to ask
  // about, so they stay off the prompt list shown while recording.
  const recordingQuestions = useMemo(
    () =>
      (recordingTemplate?.fields ?? [])
        .filter((field) => field.type !== "section" && field.type !== "manager_notes")
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((field) => field.label),
    [recordingTemplate],
  );

  const renderRecordingSheet = () => {
    if (!recordingTemplate && !openRecording) return null;
    return (
      <CheckInRecordingSheet
        visible
        teamId={teamId}
        memberUserId={memberUserId}
        memberName={memberName}
        templateId={recordingTemplate?.id ?? null}
        templateTitle={recordingTemplate?.title ?? OPEN_CHECK_IN_TITLE}
        questions={recordingTemplate ? recordingQuestions : []}
        onClose={() => {
          setRecordingTemplate(null);
          setOpenRecording(false);
        }}
        onProcessingStarted={(recordingId) => {
          setRecordingTemplate(null);
          setOpenRecording(false);
          setCaptureTemplate(null);
          setProcessingRecordingId(recordingId);
          // Back to the list, where the locked row shows the write-up landing.
          setView("list");
          void refetchActiveRecordings();
        }}
      />
    );
  };

  const closeCheckInFlow = () => {
    setView("list");
    setOpenRecording(false);
    setCaptureTemplate(null);
    setSelectedTemplate(null);
    setEditingMeeting(null);
    setResponses({});
    setFollowUpDrafts([]);
    setErr(null);
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(false);
    setEndMeetingPromptOpen(false);
    setVideoCheckInSubmitted(false);
    setEndAfterPublish(false);
    setVideoCallActive(false);
    setHighlightRequiredFieldId(null);
    setHighlightLeaderFieldId(null);
    setLinkedPlannedEventId(null);
  };

  const renderVideoTemplatePicker = () => (
    <View style={{ flex: 1, overflow: "hidden", backgroundColor: "#0A0F1E" }}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          left: 0,
          height: videoSheetTop,
          overflow: "hidden",
          backgroundColor: "#0A0F1E",
        }}
      >
        <EmbeddedVideoCall
          roomId={activePlannedVideoEvent!.id}
          roomName={activePlannedVideoEvent!.title}
          presentation="background"
          onCallActiveChange={setVideoCallActive}
        />
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          top: videoSheetTop,
          right: 0,
          bottom: 0,
          left: 0,
          overflow: "hidden",
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          backgroundColor: "#FFFFFF",
          shadowColor: "#000000",
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -5 },
          elevation: 16,
        }}
      >
        <View
          {...videoSheetPanResponder.panHandlers}
          style={{
            height: 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FFFFFF",
          }}
          accessibilityLabel="Drag to resize template list"
        >
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#C9CED8",
            }}
          />
        </View>
        {renderPickView()}
        {renderRecordingSheet()}
      </Animated.View>
    </View>
  );

  const renderCheckInFlowModal = () => {
    const meetingToolFill = meetingToolMode && view === "fill";
    return (
    <Modal
      key={meetingToolMode ? view : "check-in-flow"}
      visible={view !== "list"}
      animationType={meetingToolMode ? "none" : "slide"}
      transparent={meetingToolFill}
      presentationStyle={
        meetingToolFill
          ? "overFullScreen"
          : activePlannedVideoEvent || Platform.OS !== "ios"
          ? "fullScreen"
          : "pageSheet"
      }
      onRequestClose={
        transcriptMeetingId
          ? () => setTranscriptMeetingId(null)
          : activePlannedVideoEvent
          ? view === "fill"
            ? requestVideoTemplateChange
            : requestEndBeforeTemplateSelection
          : meetingToolMode && view === "fill"
            ? closeMeetingToolForm
            : closeCheckInFlow
      }
    >
      <View
        style={{
          flex: 1,
          justifyContent: meetingToolFill ? "flex-end" : undefined,
        }}
        pointerEvents="box-none"
      >
        {meetingToolFill && meetingToolHeaderControls ? (
          <View
            style={{
              position: "absolute",
              top: insets.top + 10,
              right: 14,
              zIndex: 50,
            }}
          >
            {meetingToolHeaderControls}
          </View>
        ) : null}
      <View
        style={{
          flex: meetingToolFill ? undefined : 1,
          height: meetingToolFill ? "64%" : undefined,
          borderTopLeftRadius: meetingToolFill ? 22 : 0,
          borderTopRightRadius: meetingToolFill ? 22 : 0,
          overflow: "hidden",
          backgroundColor:
            activePlannedVideoEvent
              ? "#0A0F1E"
              : "#FFFFFF",
          paddingTop:
            activePlannedVideoEvent || meetingToolFill
              ? 0
              : Platform.OS === "ios"
                ? 8
                : insets.top + 8,
        }}
      >
        {activePlannedVideoEvent || meetingToolFill ? null : (
          <>
        <View
          style={{
            width: 38,
            height: 5,
            borderRadius: 3,
            backgroundColor: "#D8DEE8",
            alignSelf: "center",
            marginBottom: 8,
          }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingBottom: 8,
            gap: 10,
            backgroundColor: "#FFFFFF",
          }}
        >
          <Image
            source={require("@/assets/alenio-icon.png")}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
            }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 19,
                fontWeight: "800",
                color: "#172033",
                letterSpacing: -0.2,
              }}
            >
              Start a check-in
            </Text>
            <Text
              style={{
                marginTop: 1,
                fontSize: 10.5,
                lineHeight: 14,
                fontWeight: "600",
                color: "#8A96A8",
              }}
              numberOfLines={1}
            >
              With {memberName}
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
          </>
        )}

        {meetingToolFill ? (
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#C9CED8",
              alignSelf: "center",
              marginTop: 9,
              marginBottom: 4,
            }}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          {view === "mode"
            ? renderModeView()
            : view === "capture"
              ? renderCaptureView()
              : view === "pick"
                ? activePlannedVideoEvent
                  ? renderVideoTemplatePicker()
                  : renderPickView()
                : renderFillView()}
        </View>
        {/* iOS will not present these over an already-visible modal, so they
            have to live inside the check-in flow modal too. */}
        {renderRecordingSheet()}
        {renderTranscriptPanel()}
        {renderPublishModals()}
      </View>
      </View>
    </Modal>
    );
  };

  const showEmptyState =
    !loadingMeetings && meetings.length === 0 && activeRecordings.length === 0;

  return (
    <View
      style={{
        gap: 10,
        flex: embeddedListScroll ? 1 : undefined,
        flexGrow: embeddedListScroll && showEmptyState ? 1 : undefined,
      }}
    >
      {renderCheckInFlowModal()}
      <AlenioBottomSheet
        visible={upcomingListOpen}
        title="Upcoming check-ins"
        subtitle={`${upcomingPlanned.length} scheduled`}
        onClose={() => setUpcomingListOpen(false)}
        compact
        showCloseButton
        bodyMaxHeight={
          PLANNED_ONE_ON_ONE_ROW_HEIGHT * 3 +
          PLANNED_ONE_ON_ONE_ROW_GAP * 2 +
          18
        }
        showScrollIndicator={upcomingPlanned.length > 3}
        testID="upcoming-check-ins-sheet"
      >
        <View style={{ gap: PLANNED_ONE_ON_ONE_ROW_GAP }}>
          {upcomingPlanned.map((event) => (
            <View key={event.id}>{renderPlannedOneOnOneRow({ item: event })}</View>
          ))}
        </View>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={historySheetOpen}
        title="All check-ins"
        subtitle={`${sortedMeetings.length} on record`}
        onClose={() => setHistorySheetOpen(false)}
        compact
        showCloseButton
        bodyMaxHeight={
          CHECK_IN_LIST_ROW_HEIGHT * CHECK_IN_LIST_VISIBLE_ROWS +
          CHECK_IN_LIST_ROW_GAP * (CHECK_IN_LIST_VISIBLE_ROWS - 1) +
          18
        }
        showScrollIndicator={sortedMeetings.length > CHECK_IN_LIST_VISIBLE_ROWS}
        testID="all-check-ins-sheet"
      >
        <View style={{ gap: CHECK_IN_LIST_ROW_GAP }}>
          {recentMeetings.map((meeting) =>
            renderCheckInHistoryRow(meeting, () => {
              setHistorySheetOpen(false);
              requestAnimationFrame(() => setPreviewMeeting(meeting));
            }),
          )}
          {hasOlderCheckIns ? (
            <Pressable
              onPress={() =>
                setVisibleCheckInCount(
                  (count) => count + CHECK_IN_HISTORY_PAGE_SIZE,
                )
              }
              style={{
                minHeight: 32,
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel="Show five more check-ins"
            >
              <Text style={{ fontSize: 10.5, fontWeight: "700", color: "#4361EE" }}>
                5 more
              </Text>
            </Pressable>
          ) : null}
        </View>
      </AlenioBottomSheet>

      <View
        style={{
          minHeight: 28,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontSize: 11,
            lineHeight: 14,
            fontWeight: "800",
            letterSpacing: 0.75,
            color: "#475569",
            textTransform: "uppercase",
          }}
        >
          Check-ins
        </Text>
      {canCreate || upcomingPlanned.length > visibleUpcomingCount ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {upcomingPlanned.length > visibleUpcomingCount ? (
            <Pressable
              onPress={() => setUpcomingListOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="View all upcoming check-ins"
              style={{ paddingHorizontal: 4, minHeight: 28, justifyContent: "center" }}
            >
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#4361EE" }}>
                View all
              </Text>
            </Pressable>
          ) : null}
          {canCreate ? (
          <>
          {canManageTemplates ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/check-in-templates",
                  params: { teamId },
                })
              }
              hitSlop={8}
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#E2E5EA",
                backgroundColor: "#FFFFFF",
              }}
              accessibilityRole="button"
              accessibilityLabel="Manage check-in templates"
              testID="manage-check-in-templates-button"
            >
              <LayoutTemplate size={14} color="#111827" strokeWidth={2.2} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void startCreate()}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#E2E5EA",
              backgroundColor: "#FFFFFF",
            }}
            accessibilityRole="button"
            accessibilityLabel="Start a new check-in"
            testID="new-check-in-button"
          >
            <Plus size={15} color="#111827" strokeWidth={2.4} />
          </Pressable>
          </>
          ) : null}
        </View>
      ) : null}
      </View>

      <CheckInListContainer scroll={embeddedListScroll}>
      {plannedLoadError ? (
        <Text style={{ fontSize: 11, color: "#DC2626", lineHeight: 15 }}>
          Could not load scheduled check-ins
          {plannedLoadErrorDetail instanceof Error
            ? `: ${plannedLoadErrorDetail.message}`
            : "."}
        </Text>
      ) : canViewUpcoming && upcomingPlanned.length > 0 ? (
        <View
          style={{
            height: plannedOneOnOneListHeight(visibleUpcomingCount),
            overflow: "hidden",
            marginBottom: 2,
          }}
          testID="planned-one-on-one-list"
        >
          <FlatList
            data={upcomingPlanned.slice(0, visibleUpcomingCount)}
            keyExtractor={(event) => event.id}
            renderItem={renderPlannedOneOnOneRow}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      ) : null}

      {loadingMeetings ? (
        <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
      ) : showEmptyState ? (
        <View style={{ flexGrow: 1, justifyContent: "center" }}>
          <CheckInEmptyState
            memberName={memberName}
            memberImage={memberImage}
            canCreate={canCreate}
            recordingSupported={recordingSupported}
            compact={meetingToolMode || !embeddedListScroll}
            error={err}
            onStart={canCreate ? () => void startCreate() : undefined}
          />
        </View>
      ) : recentMeetings.length > 0 || activeRecordings.length > 0 ? (
        <View style={{ gap: 6, flexGrow: 1 }}>
          {activeRecordings.map((recording) => renderProcessingCheckInRow(recording))}
          {/* With a page to fill, the history reads down it. Where the list
              cannot scroll there is only room for the newest one. */}
          {embeddedListScroll
            ? recentMeetings.map((meeting) => renderCheckInHistoryRow(meeting))
            : latestMeeting
              ? renderCheckInHistoryRow(latestMeeting)
              : null}
          {embeddedListScroll ? (
            hasOlderCheckIns ? (
              <Pressable
                onPress={() =>
                  setVisibleCheckInCount(
                    (count) => count + CHECK_IN_HISTORY_PAGE_SIZE,
                  )
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  minHeight: 28,
                }}
                accessibilityRole="button"
                accessibilityLabel="Show older check-ins"
                testID="more-check-ins-button"
              >
                <Text style={{ fontSize: 10.5, fontWeight: "700", color: "#4361EE" }}>
                  Show older check-ins
                </Text>
                <ChevronRight size={13} color="#4361EE" strokeWidth={2.4} />
              </Pressable>
            ) : null
          ) : sortedMeetings.length > 1 ? (
            <Pressable
              onPress={() => setHistorySheetOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                minHeight: 28,
              }}
              accessibilityRole="button"
              accessibilityLabel="View all check-ins"
              testID="view-all-check-ins-button"
            >
              <Text style={{ fontSize: 10.5, fontWeight: "700", color: "#4361EE" }}>
                View all {sortedMeetings.length} check-ins
              </Text>
              <ChevronRight size={13} color="#4361EE" strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      </CheckInListContainer>

      <Modal
        visible={!!previewMeeting}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (transcriptMeetingId) {
            setTranscriptMeetingId(null);
            return;
          }
          setPreviewMeeting(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "white",
            paddingBottom: insets.bottom,
          }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                paddingTop: insets.top + 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 18,
                paddingBottom: 14,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: "#ECEEF3",
                backgroundColor: "#FFFFFF",
              }}
            >
              <Pressable
                onPress={() => setPreviewMeeting(null)}
                hitSlop={10}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#F2EEFF",
                }}
              >
                <ChevronLeft size={20} color="#684BFF" strokeWidth={2.1} />
              </Pressable>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 2.2,
                  color: "#606B80",
                }}
              >
                CHECK-IN
              </Text>
              {canModify ? (
                <Pressable
                  onPress={() => {
                    const meeting = previewMeeting;
                    if (!meeting) return;
                    setPreviewMeeting(null);
                    requestAnimationFrame(() => openHistoryMeetingMenu(meeting));
                  }}
                  hitSlop={10}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#F5F6F9",
                  }}
                >
                  <MoreHorizontal
                    size={19}
                    color="#596277"
                    strokeWidth={2.2}
                  />
                </Pressable>
              ) : (
                <View style={{ width: 34, height: 34 }} />
              )}
            </View>
            {previewMeeting ? (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, gap: 8, paddingBottom: 18 }}
                showsVerticalScrollIndicator={false}
              >
                <View
                  style={{
                    backgroundColor: "#FFFFFF",
                    paddingHorizontal: 4,
                    paddingVertical: 4,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#F0ECFF",
                      }}
                    >
                      <CalendarCheck size={20} color="#684BFF" strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text
                          style={{ flex: 1, fontSize: 18, lineHeight: 22, fontWeight: "500", color: "#192033" }}
                          numberOfLines={2}
                        >
                          {previewMeeting.templateTitle}
                        </Text>
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            backgroundColor:
                              previewMeeting.status === "draft"
                                ? "#FFF7ED"
                                : previewHasOpenFollowUps
                                  ? "#EEF2FF"
                                  : "#ECFDF3",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "800",
                              color:
                                previewMeeting.status === "draft"
                                  ? "#B45309"
                                  : previewHasOpenFollowUps
                                    ? "#4F46E5"
                                    : "#15803D",
                            }}
                          >
                            {previewStatusLabel}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ marginTop: 5, fontSize: 11, color: "#667085" }}>
                        {formatMeetingDate(oneOnOneDisplayDate(previewMeeting))}
                        {" · "}
                        {previewMeeting.createdBy?.name?.trim() || managerName || "Team leader"}
                      </Text>
                      <Text style={{ marginTop: 5, fontSize: 11, color: "#8A96AA" }}>
                        {(previewMeeting.followUpTasks?.length ?? 0) === 0
                          ? "No follow-up actions"
                          : `${previewMeeting.followUpTasks?.length ?? 0} follow-up ${
                              (previewMeeting.followUpTasks?.length ?? 0) === 1 ? "action" : "actions"
                            }`}
                      </Text>
                      {previewMeeting.captureMode === "recorded" && canModify ? (
                        <Pressable
                          onPress={() => setTranscriptMeetingId(previewMeeting.id)}
                          style={{
                            alignSelf: "flex-start",
                            marginTop: 8,
                            minHeight: 28,
                            paddingHorizontal: 10,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 5,
                            borderRadius: 9,
                            borderWidth: 1,
                            borderColor: "#DDD6FE",
                            backgroundColor: "#F5F3FF",
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="View the transcript of this conversation"
                          testID="view-check-in-transcript"
                        >
                          <FileAudio size={11} color="#5B3FF0" strokeWidth={2.4} />
                          <Text style={{ fontSize: 10.5, fontWeight: "800", color: "#5B3FF0" }}>
                            View transcript
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
                {groupFields(previewMeeting.templateFields).map((group) => {
                  const items = group.fields.filter((f) => {
                    const ans = previewMeeting.responses[f.id];
                    return ans !== undefined && ans !== "" && ans !== 0;
                  });
                  if (items.length === 0) return null;
                  return (
                    <View
                      key={group.section.id}
                      style={{
                        borderRadius: 18,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: "#ECEEF5",
                        backgroundColor: "#FFFFFF",
                        padding: 12,
                        shadowColor: "#26335E",
                        shadowOffset: { width: 0, height: 5 },
                        shadowOpacity: 0.04,
                        shadowRadius: 12,
                        elevation: 1,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.7, color: "#718096", marginBottom: 10, textTransform: "uppercase" }}>
                        {group.section.label}
                      </Text>
                      {items.map((field) => (
                        <View key={field.id} style={{ marginBottom: 9 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#7A8497" }}>{field.label}</Text>
                          <Text style={{ fontSize: 13, color: "#334155", marginTop: 3 }}>
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
                    <View style={{ borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: "#ECEEF5", backgroundColor: "#FFFFFF", padding: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.7, color: "#718096", marginBottom: 10, textTransform: "uppercase" }}>
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
                  <View style={{ borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: "#ECEEF5", backgroundColor: "#FFFFFF", padding: 12 }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.7, color: "#718096", marginBottom: 10, textTransform: "uppercase" }}>
                      Follow-up tasks
                    </Text>
                    {previewMeeting.followUpTasks.map((task) => {
                      const isDone = task.status === "done";
                      return (
                        <Pressable
                          key={task.id}
                          onPress={async () => {
                            if (openingTaskId) return;
                            setOpeningTaskId(task.id);
                            try {
                              await Promise.all([
                                queryClient.fetchQuery({
                                  queryKey: ["subscription", teamId],
                                  queryFn: () =>
                                    api.get<{
                                      plan: string;
                                      status: string;
                                      hasTeamFeatures?: boolean;
                                    }>(`/api/teams/${teamId}/subscription`),
                                }),
                                queryClient.fetchQuery({
                                  queryKey: ["task", task.id, teamId],
                                  queryFn: () =>
                                    api.get<Task>(
                                      `/api/teams/${teamId}/tasks/${task.id}`,
                                    ),
                                }),
                              ]);
                              reopenMeetingAfterTaskRef.current = previewMeeting;
                              setPreviewMeeting(null);
                              requestAnimationFrame(() => {
                                router.push({
                                  pathname: "/task-detail",
                                  params: { teamId, taskId: task.id },
                                });
                              });
                            } catch (error) {
                              toast({
                                title:
                                  error instanceof Error
                                    ? error.message
                                    : "Could not open task",
                                preset: "error",
                              });
                            } finally {
                              setOpeningTaskId(null);
                            }
                          }}
                          disabled={!!openingTaskId}
                          accessibilityRole="button"
                          accessibilityLabel={`Open task ${task.title}`}
                          style={{
                            marginBottom: 5,
                            minHeight: 50,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            backgroundColor: "#FFFFFF",
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: "#EEF0F5",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            opacity:
                              openingTaskId && openingTaskId !== task.id ? 0.55 : 1,
                          }}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 12, fontWeight: "500", color: "#0F172A" }}>{task.title}</Text>
                            <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>
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
                            {openingTaskId === task.id ? (
                              <ActivityIndicator size="small" color="#684BFF" />
                            ) : isDone ? (
                              <Check size={12} color="#FFFFFF" strokeWidth={3} />
                            ) : (
                              <X size={11} color="#EF4444" strokeWidth={3} />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
            {canModify && previewMeeting ? (
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingTop: 8,
                  paddingBottom:
                    Platform.OS === "android"
                      ? Math.max(30, insets.bottom + 18)
                      : Math.max(12, insets.bottom),
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: "#ECEEF3",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Pressable
                  onPress={() => {
                    const m = previewMeeting;
                    setPreviewMeeting(null);
                    startEdit(m);
                  }}
                  style={{
                    backgroundColor: "#684BFF",
                    borderRadius: 13,
                    paddingVertical: 12,
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
          {renderTranscriptPanel()}
        </View>
      </Modal>

      {renderPublishModals()}
      {renderCheckInActionMenuModal()}
    </View>
  );
}
