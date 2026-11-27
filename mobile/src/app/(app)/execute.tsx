import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Image,
  ScrollView,
  Modal,
  TextInput,
  Platform,
  Switch,
  Alert,
  Dimensions,
  StyleSheet,
  useWindowDimensions,
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MEETING_ASSIGNEE_SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.62);
const MEETING_DURATION_SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.55);

function EventScheduleTile({
  icon: Icon,
  label,
  value,
  open,
  disabled,
  onPress,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  open?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[eventFormStyles.tile, open ? eventFormStyles.tileOpen : null]}
    >
      <Icon size={16} color="#6d28d9" strokeWidth={2} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={eventFormStyles.tileLabel}>{label}</Text>
        <Text style={eventFormStyles.tileValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <ChevronRight size={14} color="#C5CAD3" strokeWidth={2.2} />
    </Pressable>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  Plus,
  User,
  ChevronRight,
  ChevronDown,
  X,
  CalendarDays,
  CheckSquare,
  Calendar,
  Check,
  UserRound,
  Video,
  Clock,
  Users,
  ImagePlus,
  Camera,
  Trash2,
  Pencil,
  Search,
  Globe2,
} from "lucide-react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSession } from "@/lib/auth/use-session";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import { useMeetingBannerStore } from "@/lib/state/meeting-banner-store";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { useTaskStore } from "@/lib/state/task-store";
import type {
  Task,
  Team,
  TeamMember,
  TeamRole,
  CalendarEvent,
} from "@/lib/types";
import { toast } from "burnt";
import { pickImage, takePhoto } from "@/lib/file-picker";
import { uploadFile } from "@/lib/upload";
import { NoWorkspaceTabState } from "@/components/people/NoWorkspaceTabState";
import { isFeedbackTaskDescription } from "@/lib/one-on-one-feedback";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import { hasWorkspaceTaskAccess } from "@/lib/plan-access-copy";
import { useTabBarClearanceFn, WORKSPACE_CARD_BOTTOM_GAP } from "@/lib/tab-bar";
import { MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/modal-supported-orientations";
import {
  fitsFormSheet,
  PANE_GAP,
  splitPaneWidths,
  useAdaptiveLayout,
} from "@/lib/adaptive-layout";

import { AlenioHeaderBrand } from "@/components/AlenioHeaderBrand";
import { ProFeatureLockedView } from "@/components/ProFeatureLockedView";
import { CurvedTabLayout } from "@/components/CurvedTabLayout";
import { StreakCelebrationModal } from "@/components/StreakCelebrationModal";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import {
  WorkspaceViewToggle,
  type WorkspaceViewMode,
} from "@/components/workspace/WorkspaceViewToggle";
import { WorkspaceOverviewCard } from "@/components/workspace/WorkspaceOverviewCard";
import { WorkspaceOverviewQuickActions } from "@/components/workspace/WorkspaceOverviewQuickActions";
import { WorkspaceOverviewPulse } from "@/components/workspace/WorkspaceOverviewPulse";
import { WorkspaceOverviewUpcomingEvents } from "@/components/workspace/WorkspaceOverviewUpcomingEvents";
import { WorkspaceOverviewRecentUpdates } from "@/components/workspace/WorkspaceOverviewRecentUpdates";
import { WorkspaceOverviewPage } from "@/components/workspace/WorkspaceOverviewPage";
import { WorkspaceOverviewTeamDevelopment } from "@/components/workspace/WorkspaceOverviewRail";
import type { ActivityFeedItem } from "@/components/activity";
import {
  CalendarCard,
  type CalendarDisplayMode,
} from "@/components/workspace/CalendarCard";
import { EventPreviewSheet } from "@/components/workspace/EventPreviewSheet";
import { TaskPreviewSheet } from "@/components/workspace/TaskPreviewSheet";
import { WorkspaceCreateGrid } from "@/components/workspace/WorkspaceCreateGrid";
import { EventStockPhotoSearch } from "@/components/workspace/EventStockPhotoSearch";
import { EventsSection } from "@/components/workspace/EventsSection";
import { WorkspaceOpeningState } from "@/components/workspace/WorkspaceOpeningState";
import { TaskShowingRow } from "@/components/workspace/TaskShowingRow";
import { TaskListCard } from "@/components/workspace/TaskListCard";
import { AssigneesSheet } from "@/components/workspace/AssigneesSheet";
import { TeamDevelopmentCard } from "@/components/development/TeamDevelopmentCard";
import { MemberManageSheet } from "@/components/development/MemberManageSheet";
import { AddMemberModal } from "@/components/AddMemberModal";
import { inviteMemberByEmail } from "@/lib/team-invites-api";
import { teamInviteErrorMessage } from "@/lib/team-invite-errors";
import type { WorkspaceInviteRole } from "@/lib/workspace-members";
import { WorkspaceMemberDevelopment } from "@/components/development/WorkspaceMemberDevelopment";
import { MemberTasksEmptyState } from "@/components/workspace/MemberTasksEmptyState";
import { TaskDetail } from "@/app/task-detail";
import { UserAvatar } from "@/components/UserAvatar";
import {
  TeamOverviewTasksSheet,
  type TeamOverviewTaskFilter,
} from "@/components/TeamOverviewTasksSheet";
import {
  TeamInsightsSheet,
  type TeamInsightsStatusKey,
} from "@/components/TeamInsightsSheet";
import {
  SnapshotDevelopmentSheet,
  SnapshotScheduledSheet,
} from "@/components/SnapshotDetailSheets";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import {
  DEFAULT_WORKSPACE_FILTERS,
  type FilterPicker,
  type WorkspaceFiltersState,
} from "@/components/workspace/workspace-types";
import { WorkspaceFilterPicker } from "@/components/workspace/WorkspaceFilterPicker";
import { splitPaneCard, WS } from "@/components/workspace/workspace-ui";
import { buttonInk, EmptyState, tintInk } from "@/components/ui";
import { ScheduleKindIcon } from "@/components/schedule/ScheduleKindIcon";
import {
  assignedToQueryKey,
  buildWorkspaceTasksPath,
  filterTasksClientSide,
  groupTasksBySchedule,
  groupTasksByWeek,
  startOfDay,
  startOfWeekSunday,
  toLocalIso,
} from "@/components/workspace/workspace-utils";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { getUSHolidays } from "@/lib/us-federal-holidays";
import { mergeViewerReminders, workspaceTasksOnly } from "@/lib/task-kind";
import {
  datedItemLocalIso,
  dedupeDatedTasksAgainstEvents,
  eventsOnLocalIso,
  holidaysOnLocalIso,
} from "@/lib/calendar-month-view";
import {
  countCompletedToday,
  countDueToday,
  countOverdue,
  personalHealthPercent,
  workspaceHealthPercent,
} from "@/lib/workspace-summary-metrics";
import {
  mergeWorkplaceStandards,
  type MemberStatsPayload,
} from "@/lib/workplace-standards";
import { buildNeedsAttention } from "@/lib/coaching-priorities";
import { computeTeamCompliancePercentages } from "@/lib/member-stats-display";
import type { TeamHealthHistoryPoint } from "@/lib/team-health-history";
import {
  teamMomentumSummaryQueryKey,
  type TeamMomentumLeaderSummary,
} from "@/lib/team-momentum";
import {
  buildGoalCoverageItems,
  oneOnOneMember,
  selectSnapshotTasks,
  selectTodaysOneOnOnes,
  snapshotAttentionReason,
  type SnapshotDetail,
  type SnapshotTaskDetail,
} from "@/lib/workspace-snapshot-details";
import {
  workspaceDevelopmentHref,
  type WorkspaceDevelopmentSection,
} from "@/lib/workspace-development-navigation";
import { planOneOnOneHref } from "@/lib/plan-one-on-one";
import { scheduleCheckInHref, videoCallHref } from "@/lib/meeting-navigation";
import { selectUpcomingDevelopmentCheckIns } from "@/lib/development-overview";
import { memberDevelopmentStatus } from "@/lib/member-development-preview";
import {
  fetchExternalCalendarEvents,
  type ExternalCalendarEventItem,
} from "@/lib/outlook-calendar-api";
import {
  VIDEO_MEETING_DURATION_OPTIONS,
  durationMinutesFromRange,
  formatVideoMeetingDuration,
  formatVideoMeetingEndPreview,
  videoMeetingEndFromDuration,
} from "@/lib/video-meeting-duration";

import {
  CALENDAR_EVENT_COLORS,
  resolveCalendarEventColor,
} from "@/lib/calendar-event-colors";

const EXTERNAL_BUSY_COLOR = CALENDAR_EVENT_COLORS.outlook;

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearanceFn();
  const adaptive = useAdaptiveLayout();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const eventFormAsDialog = fitsFormSheet(windowWidth, windowHeight);
  const {
    openModal,
    teamId: linkedTeamId,
    memberUserId: linkedMemberUserId,
    memberTaskFilter,
    mode: linkedMode,
    developmentSection: linkedDevelopmentSection,
    createGoal: linkedCreateGoal,
    startCheckIn: linkedStartCheckIn,
    checkInId: linkedCheckInId,
    plannedEventId: linkedPlannedEventId,
    checkInLaunchId: linkedCheckInLaunchId,
  } = useLocalSearchParams<{
    openModal?: string;
    teamId?: string;
    memberUserId?: string;
    memberTaskFilter?: "overdue" | "due-soon";
    mode?: "development" | "goals" | "check-ins" | "check-in";
    developmentSection?: WorkspaceDevelopmentSection;
    createGoal?: string;
    startCheckIn?: string;
    checkInId?: string;
    plannedEventId?: string;
    checkInLaunchId?: string;
  }>();
  const [filters, setFilters] = useState<WorkspaceFiltersState>(
    DEFAULT_WORKSPACE_FILTERS,
  );
  const [filterPicker, setFilterPicker] = useState<FilterPicker>(null);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const deferredTaskSearchQuery = React.useDeferredValue(taskSearchQuery);
  const [workspaceMode, setWorkspaceMode] =
    useState<WorkspaceViewMode>("overview");
  const lastWorkspaceTabRef =
    useRef<Exclude<WorkspaceViewMode, "development">>("overview");
  const openMembers = useCallback(() => {
    setWorkspaceMode((current) => {
      if (current !== "development") lastWorkspaceTabRef.current = current;
      return "development";
    });
  }, []);
  // The member whose development is open, kept as an id so the row survives a
  // members refetch. Null means the team list is showing.
  const [developmentFocus, setDevelopmentFocus] = useState<{
    userId: string;
    section: WorkspaceDevelopmentSection;
    /** Set by links that ask to land straight in a goal or check-in. */
    createGoal?: boolean;
    startCheckInToken?: number;
    plannedEventId?: string | null;
    checkInId?: string | null;
  } | null>(null);
  /** Null until a day is tapped — Duo/stacked calendars keep the day pane closed until then. */
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showCalendarDayDetail, setShowCalendarDayDetail] = useState(false);
  const [selectedSnapshotDetail, setSelectedSnapshotDetail] =
    useState<SnapshotDetail | null>(null);
  const [manageMember, setManageMember] = useState<TeamMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [calendarYear, setCalendarYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [calendarMonth, setCalendarMonth] = useState(() =>
    new Date().getMonth(),
  );
  const [assigneesSheetTask, setAssigneesSheetTask] = useState<Task | null>(
    null,
  );
  const [actionMenuEvent, setActionMenuEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [confirmDeleteActionEvent, setConfirmDeleteActionEvent] =
    useState(false);
  const [reassignTask, setReassignTask] = useState<Task | null>(null);
  const [confirmReassign, setConfirmReassign] = useState<{
    task: Task;
    newUserId: string;
    newUserName: string;
  } | null>(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState<{
    count: number;
    userName: string;
  } | null>(null);
  const [personalBestModal, setPersonalBestModal] = useState<{
    count: number;
    userName: string;
  } | null>(null);
  /**
   * Null hands the choice to the layout; a tap on Month or Week pins it until
   * the amount of room changes.
   */
  const [calendarModeChoice, setCalendarModeChoice] =
    useState<CalendarDisplayMode | null>(null);
  /** Height of the area the calendar actually got, once it has laid out. */
  const [calendarAreaHeight, setCalendarAreaHeight] = useState(0);
  /**
   * A six-row month card runs about 390pt and an agenda needs roughly 180 more
   * below it. Under the two together the month keeps the whole area and the day
   * list steps aside, rather than the list being pushed off the bottom.
   *
   * Only stacked layouts can run short. A wide screen puts the day list beside
   * the grid, where they compete for width and not for height, so a landscape
   * tablet keeps its month however little vertical room it has.
   */
  const calendarHeightTight =
    !adaptive.isSplit && calendarAreaHeight > 0 && calendarAreaHeight < 570;
  /** Month is the view a resize lands on; the week strip is always a choice. */
  const calendarDisplayMode: CalendarDisplayMode =
    calendarModeChoice ?? "month";
  /**
   * An explicit choice was made against the room there was at the time, so any
   * change in that room releases it: unfolding a Duo, rotating, or entering a
   * multitasking pane. Without this, a week picked on the closed screen is
   * still a week once the device opens, which is the one place it fits worst.
   */
  useEffect(() => {
    setCalendarModeChoice(null);
  }, [calendarHeightTight, adaptive.isSplit]);
  /**
   * Two panes side by side. Month view only — the week agenda already uses the
   * full screen, so splitting it would just halve the agenda.
   */
  const splitCalendar =
    adaptive.isSplit &&
    adaptive.detailPaneWidth >= 420 &&
    calendarDisplayMode === "month";
  const calendarUsesDaySheet =
    adaptive.isSplit &&
    !splitCalendar &&
    calendarDisplayMode === "month";
  /** Keep task details beside the task list whenever the workspace is split. */
  const showTaskDetailPane = adaptive.isSplit;
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  /** The shared Workspace divider, so Tasks splits where Calendar does. */
  const taskDetailPaneWidth = Math.round(adaptive.detailPaneWidth);
  /** Same divider again: the roster is this tab's primary column. */
  const rosterPaneWidth = Math.round(adaptive.gridPaneWidth);
  /**
   * Month day schedule opens in a sheet so the grid can stay full-height.
   * Side-by-side Duo keeps the day list in the right pane instead.
   */
  const useMonthDaySheet =
    !splitCalendar && calendarDisplayMode === "month";
  /** The week card carries its own agenda, so it still takes the area. */
  const calendarCardFillsArea = !splitCalendar;
  /** Duo already clears the dock; keep a light gutter beside the grid. */
  const calendarGutter = adaptive.iconRailEdge ? 8 : WS.pageGutter;
  /**
   * Members keeps the roster beside the open member instead of replacing it,
   * which is also what fills the width a single stretched list cannot.
   */
  const splitMembers = adaptive.isSplit;
  /**
   * Measured in window coordinates so the divider can be placed against the
   * hinge; the hook alone cannot know what padding our ancestors added.
   */
  const [calendarRowFrame, setCalendarRowFrame] = useState<{
    x: number;
    width: number;
  } | null>(null);
  /**
   * Both measurements describe the window they were taken in, so a resize
   * throws them out instead of laying out the new window from the old one.
   * Null and zero mean "not measured yet", which falls back to the hook's
   * estimate until the next layout pass reports the real numbers.
   */
  useEffect(() => {
    setCalendarRowFrame(null);
    setCalendarAreaHeight(0);
  }, [adaptive.width, adaptive.height]);
  const calendarPanes = calendarRowFrame
    ? splitPaneWidths(
        calendarRowFrame.x,
        calendarRowFrame.width,
        adaptive.hingeX,
      )
    : null;
  /**
   * Shares rather than widths, so the two panes always add up to the row: a
   * pane can end up narrower than intended but never zero, which is what a
   * pinned width did when it failed to reach the view after a resize.
   */
  const gridPaneShare = Math.max(
    1,
    Math.round(calendarPanes?.gridPaneWidth ?? adaptive.gridPaneWidth),
  );
  const detailPaneShare = Math.max(
    1,
    Math.round(calendarPanes?.detailPaneWidth ?? adaptive.detailPaneWidth),
  );
  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [previewEvent, setPreviewEvent] = useState<CalendarEvent | null>(null);
  const [previewTask, setPreviewTask] = useState<Task | null>(null);
  const [eventModalReadOnly, setEventModalReadOnly] = useState(false);
  const [eventModalType, setEventModalType] = useState<
    "event" | "meeting" | "checkin"
  >("event");
  const [eventIncludeVideo, setEventIncludeVideo] = useState(false);
  const [checkInFormat, setCheckInFormat] = useState<"virtual" | "in_person">(
    "virtual",
  );
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStart, setEventStart] = useState<Date>(new Date());
  const [eventEnd, setEventEnd] = useState<Date>(new Date());
  const [eventIsHidden, setEventIsHidden] = useState(true);
  const [eventImageUrl, setEventImageUrl] = useState<string | null>(null);
  const [eventImageUploading, setEventImageUploading] = useState(false);
  const [showEventPhotoPicker, setShowEventPhotoPicker] = useState(false);
  const [showEventStockPhotoSearch, setShowEventStockPhotoSearch] =
    useState(false);
  const [meetingAssigneeIds, setMeetingAssigneeIds] = useState<string[]>([]);
  const [showMeetingAssigneeDropdown, setShowMeetingAssigneeDropdown] =
    useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [meetingDurationMinutes, setMeetingDurationMinutes] = useState(60);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedTaskSections, setExpandedTaskSections] = useState<
    Record<string, boolean>
  >({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const queryClient = useQueryClient();
  const acknowledge = useTaskStore((s) => s.acknowledge);
  const acknowledgeEvents = useTaskStore((s) => s.acknowledgeEvents);
  const acknowledgedCounts = useTaskStore((s) => s.acknowledgedCounts);
  const acknowledgedEventCounts = useTaskStore(
    (s) => s.acknowledgedEventCounts,
  );
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const workspacePollInterval = isScreenFocused ? 3_000 : false;
  const appliedMemberTaskLinkRef = React.useRef<string | null>(null);
  const appliedDevelopmentLinkRef = React.useRef<string | null>(null);
  // A deep link names a workspace once. Leaving the id on the route made every
  // later switch snap back to that workspace.
  const appliedLinkedTeamRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!linkedTeamId) {
      appliedLinkedTeamRef.current = null;
      return;
    }
    if (appliedLinkedTeamRef.current === linkedTeamId) return;
    appliedLinkedTeamRef.current = linkedTeamId;
    if (linkedTeamId !== useTeamStore.getState().activeTeamId) {
      setActiveTeamId(linkedTeamId);
    }
    router.setParams({ teamId: undefined });
  }, [linkedTeamId, setActiveTeamId]);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      if (activeTeamId) {
        invalidateTaskCaches(queryClient, activeTeamId);
        const ignoreCancel = (promise: Promise<unknown>) => {
          void promise.catch(() => {});
        };
        ignoreCancel(
          queryClient.invalidateQueries({
            queryKey: ["team", activeTeamId],
          }),
        );
        ignoreCancel(queryClient.invalidateQueries({ queryKey: ["teams"] }));
        ignoreCancel(
          queryClient.invalidateQueries({
            queryKey: ["member-stats", activeTeamId],
          }),
        );
        ignoreCancel(
          queryClient.invalidateQueries({
            queryKey: ["team-stars", activeTeamId],
          }),
        );
        ignoreCancel(
          queryClient.invalidateQueries({
            queryKey: ["calendar-events", activeTeamId],
          }),
        );
      }
      return () => {
        setIsScreenFocused(false);
      };
    }, [activeTeamId, queryClient]),
  );

  const [refreshing, setRefreshing] = useState(false);

  // Auto-open event modal when navigated from another tab
  useEffect(() => {
    if (linkedTeamId && linkedTeamId !== activeTeamId) return;
    if (
      openModal === "event" ||
      openModal === "meeting" ||
      openModal === "checkin"
    ) {
      if (openModal === "meeting")
        openEventModal({ withVideo: true, day: toLocalIso(new Date()) });
      else if (openModal === "checkin")
        openCheckInModal(toLocalIso(new Date()));
      else openEventModal();
      router.setParams({ openModal: undefined });
    }
  }, [activeTeamId, linkedTeamId, openModal]);

  const handleViewMonthChange = useCallback((year: number, month: number) => {
    setCalendarYear(year);
    setCalendarMonth(month);
    setSelectedDay(null);
    setShowCalendarDayDetail(false);
    setNextCursor(null);
  }, []);

  useEffect(() => {
    const now = new Date();
    setCalendarYear(now.getFullYear());
    setCalendarMonth(now.getMonth());
    setSelectedDay(null);
    setShowCalendarDayDetail(false);
    setNextCursor(null);
    setExpandedTaskSections({});
  }, [activeTeamId]);

  const onRefresh = async () => {
    setRefreshing(true);
    setNextCursor(null);
    invalidateTaskCaches(queryClient, activeTeamId);
    await queryClient.invalidateQueries({
      queryKey: ["calendar-events", activeTeamId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["external-calendar-events"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["upcoming-video-meetings"],
    });
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!activeTeamId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    const queryKey =
      filters.statusTab === "archived"
        ? ([
            "tasks",
            activeTeamId,
            assignedToQueryKey(filters.assignedTo),
            "archived",
          ] as const)
        : filters.statusTab === "completed"
          ? ([
              "tasks",
              activeTeamId,
              assignedToQueryKey(filters.assignedTo),
              calendarYear,
              calendarMonth,
              "completed",
            ] as const)
          : ([
              "tasks",
              activeTeamId,
              assignedToQueryKey(filters.assignedTo),
              "active",
            ] as const);
    try {
      const result = await api.get<{
        tasks: Task[];
        nextCursor: string | null;
      }>(
        buildWorkspaceTasksPath(activeTeamId, {
          statusTab: filters.statusTab,
          calendarYear,
          calendarMonth,
          assignedTo: filters.assignedTo,
          cursor: nextCursor,
        }),
      );
      queryClient.setQueryData<{ tasks: Task[]; nextCursor: string | null }>(
        queryKey,
        (prev) => ({
          tasks: [...(prev?.tasks ?? []), ...result.tasks],
          nextCursor: result.nextCursor,
        }),
      );
      setNextCursor(result.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });
  const { switchWorkspace } = useSwitchWorkspace();

  const activeTeam = teams?.find((t) => t.id === activeTeamId);
  const currentRole = activeTeam?.role ?? "member";
  const activeTeamName = activeTeam?.name?.trim() || "Workspace";
  const isRegularMember = currentRole === "member";
  const isWorkspaceOwner = currentRole === "owner";
  const isOwnerOrLeader =
    currentRole === "owner" || currentRole === "team_leader";
  const isCalendarManager = isOwnerOrLeader;
  const summaryAssignedTo = isCalendarManager ? "entire_team" : "me";
  const summaryToday = new Date();
  const summaryYear = summaryToday.getFullYear();
  const summaryMonth = summaryToday.getMonth();
  const { access } = useWorkspaceAccess(activeTeamId);
  const workspacePageBottom = tabClearance(WORKSPACE_CARD_BOTTOM_GAP);
  const openWorkspaceCreate = () => {
    if (!access.canWrite) return;
    setShowAddModal(true);
  };
  const canManageTaskMenu = useCallback(
    (task: Task) => {
      if (!access.canWrite) return false;
      // Check-in follow-ups are completed via the form, not the edit menu.
      if (isFeedbackTaskDescription(task.description)) return false;
      if (currentRole === "owner" || currentRole === "team_leader") return true;
      const creatorId = task.creator?.id;
      return !!session?.user?.id && creatorId === session.user.id;
    },
    [access.canWrite, currentRole, session?.user?.id],
  );

  const canManageEvent = useCallback(
    (ev: CalendarEvent) => {
      if (!access.canWrite) return false;
      if (ev.isExternal) return false;
      const creatorId = ev.createdById ?? ev.createdBy?.id;
      if (!session?.user?.id) return false;
      if (isCalendarManager) return true;
      // Members: only their own non-meeting entries (matches backend calendar permissions).
      if (ev.isVideoMeeting) return false;
      return creatorId === session.user.id;
    },
    [access.canWrite, isCalendarManager, session?.user?.id],
  );

  React.useEffect(() => {
    if (teams && teams.length > 0 && !activeTeamId) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId, setActiveTeamId]);

  const {
    data: subscription,
    isFetched: subscriptionFetched,
    isLoading: subscriptionLoading,
  } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () =>
      api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
        `/api/teams/${activeTeamId}/subscription`,
      ),
    enabled: !!activeTeamId,
  });
  const plan = useSubscriptionStore((s) => s.plan);
  const hasTaskAccess = hasWorkspaceTaskAccess(subscription, plan);

  const {
    data: activeTasksData,
    isPending: activePending,
    isLoading: activeTasksLoading,
    isError: activeError,
    error: activeLoadError,
    refetch: refetchActiveTasks,
  } = useQuery({
    queryKey: [
      "tasks",
      activeTeamId,
      assignedToQueryKey(filters.assignedTo),
      "active",
    ],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        buildWorkspaceTasksPath(activeTeamId!, {
          statusTab: "active",
          calendarYear,
          calendarMonth,
          assignedTo: filters.assignedTo,
        }),
      ),
    enabled: !!activeTeamId && hasTaskAccess,
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });

  const { data: completedTasksData, isPending: completedPending } = useQuery({
    queryKey: [
      "tasks",
      activeTeamId,
      assignedToQueryKey(filters.assignedTo),
      calendarYear,
      calendarMonth,
      "completed",
    ],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        buildWorkspaceTasksPath(activeTeamId!, {
          statusTab: "completed",
          calendarYear,
          calendarMonth,
          assignedTo: filters.assignedTo,
        }),
      ),
    enabled: !!activeTeamId && hasTaskAccess,
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });

  const { data: summaryActiveTasksData, isPending: summaryActivePending } =
    useQuery({
      queryKey: [
        "tasks",
        activeTeamId,
        assignedToQueryKey(summaryAssignedTo),
        "active",
      ],
      queryFn: async () =>
        api.get<{ tasks: Task[]; nextCursor: string | null }>(
          buildWorkspaceTasksPath(activeTeamId!, {
            statusTab: "active",
            calendarYear: summaryYear,
            calendarMonth: summaryMonth,
            assignedTo: summaryAssignedTo,
          }),
        ),
      enabled: !!activeTeamId && hasTaskAccess,
      refetchInterval: workspacePollInterval,
      refetchIntervalInBackground: false,
    });

  const {
    data: summaryCompletedTasksData,
    isPending: summaryCompletedPending,
  } = useQuery({
    queryKey: [
      "tasks",
      activeTeamId,
      assignedToQueryKey(summaryAssignedTo),
      summaryYear,
      summaryMonth,
      "completed",
    ],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        buildWorkspaceTasksPath(activeTeamId!, {
          statusTab: "completed",
          calendarYear: summaryYear,
          calendarMonth: summaryMonth,
          assignedTo: summaryAssignedTo,
        }),
      ),
    enabled: !!activeTeamId && hasTaskAccess,
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });

  const { data: archivedTasksData, isPending: archivedPending } = useQuery({
    queryKey: [
      "tasks",
      activeTeamId,
      assignedToQueryKey(filters.assignedTo),
      "archived",
      deferredTaskSearchQuery.trim(),
    ],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        buildWorkspaceTasksPath(activeTeamId!, {
          statusTab: "archived",
          calendarYear,
          calendarMonth,
          assignedTo: filters.assignedTo,
          search: deferredTaskSearchQuery,
        }),
      ),
    enabled:
      !!activeTeamId && hasTaskAccess && filters.statusTab === "archived",
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });

  // Workspace lists omit other people's reminders. This viewer's own reminders
  // still belong on the Tasks tab, including the counts at the top.
  const includeOwnReminders =
    filters.assignedTo === "entire_team" || filters.assignedTo === "me";
  const ownReminderPath = (statusTab: "active" | "completed" | "archived") =>
    buildWorkspaceTasksPath(activeTeamId!, {
      statusTab,
      calendarYear,
      calendarMonth,
      assignedTo: "me",
      search: statusTab === "archived" ? deferredTaskSearchQuery : undefined,
    });
  const { data: ownActiveRemindersData } = useQuery({
    queryKey: ["tasks", activeTeamId, "own-reminders", "active"],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        ownReminderPath("active"),
      ),
    enabled: !!activeTeamId && hasTaskAccess,
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });
  const { data: ownCompletedRemindersData } = useQuery({
    queryKey: [
      "tasks",
      activeTeamId,
      "own-reminders",
      calendarYear,
      calendarMonth,
      "completed",
    ],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        ownReminderPath("completed"),
      ),
    enabled:
      !!activeTeamId &&
      hasTaskAccess &&
      includeOwnReminders &&
      (filters.statusTab === "completed" || filters.statusTab === "all"),
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });
  const { data: ownArchivedRemindersData } = useQuery({
    queryKey: [
      "tasks",
      activeTeamId,
      "own-reminders",
      "archived",
      deferredTaskSearchQuery.trim(),
    ],
    queryFn: async () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        ownReminderPath("archived"),
      ),
    enabled:
      !!activeTeamId &&
      hasTaskAccess &&
      includeOwnReminders &&
      filters.statusTab === "archived",
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });

  const workspaceTasks: Task[] =
    filters.statusTab === "archived"
      ? (archivedTasksData?.tasks ?? [])
      : filters.statusTab === "completed"
        ? (completedTasksData?.tasks ?? [])
        : filters.statusTab === "all"
          ? [
              ...new Map(
                [
                  ...(activeTasksData?.tasks ?? []),
                  ...(completedTasksData?.tasks ?? []),
                ].map((task) => [task.id, task]),
              ).values(),
            ]
          : (activeTasksData?.tasks ?? []);
  const ownRemindersForTab: Task[] = includeOwnReminders
    ? filters.statusTab === "archived"
      ? (ownArchivedRemindersData?.tasks ?? [])
      : filters.statusTab === "completed"
        ? (ownCompletedRemindersData?.tasks ?? [])
        : filters.statusTab === "all"
          ? [
              ...(ownActiveRemindersData?.tasks ?? []),
              ...(ownCompletedRemindersData?.tasks ?? []),
            ]
          : (ownActiveRemindersData?.tasks ?? [])
    : [];
  const rawTasks: Task[] = mergeViewerReminders(
    workspaceTasks,
    ownRemindersForTab,
  );
  const { data: teamData } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
    refetchInterval: workspacePollInterval,
  });

  useEffect(() => {
    if (
      !linkedMemberUserId ||
      !memberTaskFilter ||
      !activeTeamId ||
      (linkedTeamId && linkedTeamId !== activeTeamId)
    ) {
      return;
    }
    const member = teamData?.members?.find(
      (candidate) => candidate.userId === linkedMemberUserId,
    );
    if (!member) return;
    const linkKey = `${activeTeamId}:${linkedMemberUserId}:${memberTaskFilter}`;
    if (appliedMemberTaskLinkRef.current === linkKey) return;
    appliedMemberTaskLinkRef.current = linkKey;
    setWorkspaceMode("tasks");
    setFilters({
      ...DEFAULT_WORKSPACE_FILTERS,
      assignedTo: {
        memberId: linkedMemberUserId,
        memberName: member.user.name?.trim() || member.user.email,
      },
      dueDate: memberTaskFilter === "overdue" ? "overdue" : "due_soon",
    });
  }, [
    activeTeamId,
    linkedMemberUserId,
    linkedTeamId,
    memberTaskFilter,
    teamData?.members,
  ]);
  const {
    data: memberStatsPayload,
    dataUpdatedAt: memberStatsUpdatedAt,
    isPending: memberStatsPending,
  } = useQuery({
    queryKey: ["member-stats", activeTeamId],
    queryFn: () =>
      api.get<MemberStatsPayload>(
        `/api/teams/${activeTeamId}/tasks/member-stats`,
      ),
    enabled: !!activeTeamId && hasTaskAccess,
    // Overview rings need fresher numbers after goals/check-ins change.
    refetchInterval: isScreenFocused
      ? workspaceMode === "overview"
        ? 5_000
        : 15_000
      : false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  const { data: teamMomentumSummary } = useQuery({
    queryKey: teamMomentumSummaryQueryKey(activeTeamId ?? ""),
    queryFn: () =>
      api
        .get<TeamMomentumLeaderSummary>(`/api/teams/${activeTeamId}/stars`)
        .catch(async (error) => {
          const status =
            error && typeof error === "object" && "status" in error
              ? (error as { status?: number }).status
              : undefined;
          if (status === 404) {
            return api.get<TeamMomentumLeaderSummary>(
              `/api/teams/${activeTeamId}/momentum`,
            );
          }
          throw error;
        }),
    enabled: !!activeTeamId && isCalendarManager,
  });
  const { data: healthHistoryResponse } = useQuery({
    queryKey: ["team-health-history", activeTeamId, 14],
    queryFn: () =>
      api.get<TeamHealthHistoryPoint[]>(
        `/api/teams/${activeTeamId}/health-history?days=14`,
      ),
    enabled:
      !!activeTeamId &&
      hasTaskAccess &&
      isCalendarManager &&
      selectedSnapshotDetail === "health",
    staleTime: 5 * 60 * 1000,
  });
  const nonOwnerMembers: TeamMember[] = (teamData?.members ?? []).filter(
    (m) => m.role !== "owner",
  );

  const meetingAssigneeOptions = React.useMemo(
    () =>
      [...(teamData?.members ?? [])]
        .filter((member) => member.userId !== session?.user?.id)
        .sort((a, b) =>
          (a.user.name?.trim() || "").localeCompare(
            b.user.name?.trim() || "",
            undefined,
            { sensitivity: "base" },
          ),
        ),
    [session?.user?.id, teamData?.members],
  );
  const allMeetingAssigneeIds = React.useMemo(
    () => meetingAssigneeOptions.map((m) => m.userId),
    [meetingAssigneeOptions],
  );
  const allMeetingAssigneesSelected =
    allMeetingAssigneeIds.length > 0 &&
    allMeetingAssigneeIds.every((id) => meetingAssigneeIds.includes(id));
  const assigneePickerOptions = meetingAssigneeOptions;
  const selectedCheckInAssignee = meetingAssigneeOptions.find(
    (member) => member.userId === meetingAssigneeIds[0],
  );

  const toggleAllMeetingAssignees = () => {
    setMeetingAssigneeIds(
      allMeetingAssigneesSelected ? [] : allMeetingAssigneeIds,
    );
  };

  const {
    data: calendarEvents = [],
    isPending: calendarEventsPending,
    isLoading: calendarLoading,
  } = useQuery({
      queryKey: ["calendar-events", activeTeamId],
      queryFn: () =>
        api.get<CalendarEvent[]>(`/api/teams/${activeTeamId}/events`),
      enabled: !!activeTeamId && hasTaskAccess,
      refetchInterval: workspacePollInterval,
      refetchIntervalInBackground: false,
    });

  const workspaceCalendarRange = React.useMemo(() => {
    const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
    const lastOfMonth = new Date(calendarYear, calendarMonth + 1, 0);
    const startPad = new Date(firstOfMonth);
    startPad.setDate(startPad.getDate() - 7);
    const endPad = new Date(lastOfMonth);
    endPad.setDate(endPad.getDate() + 7);
    return {
      start: startOfDay(startPad).toISOString(),
      end: new Date(
        endPad.getFullYear(),
        endPad.getMonth(),
        endPad.getDate(),
        23,
        59,
        59,
        999,
      ).toISOString(),
    };
  }, [calendarYear, calendarMonth]);

  const { data: externalBusyEvents = [] } = useQuery({
    queryKey: [
      "external-calendar-events",
      workspaceCalendarRange.start,
      workspaceCalendarRange.end,
    ],
    queryFn: () =>
      fetchExternalCalendarEvents(
        workspaceCalendarRange.start,
        workspaceCalendarRange.end,
      ),
    enabled:
      !!session?.user?.id && !!workspaceCalendarRange.start && hasTaskAccess,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const calendarEventsWithOutlook = React.useMemo((): CalendarEvent[] => {
    // Trust API visibility: private check-ins / meetings are already filtered to creator + assignees.
    // Do not strip isHidden here — that hid scheduled check-ins from both participants.
    const teamEvents = calendarEvents;
    const outlookEvents: CalendarEvent[] = externalBusyEvents.map(
      (event: ExternalCalendarEventItem) => ({
        id: `ext-${event.id}`,
        title: event.title?.trim() || "Untitled event",
        description: "Private · Outlook",
        startDate: event.startDate,
        endDate: event.endDate,
        allDay: event.allDay,
        color: EXTERNAL_BUSY_COLOR,
        teamId: "",
        createdAt: event.startDate,
        isExternal: true,
      }),
    );
    return [...teamEvents, ...outlookEvents];
  }, [calendarEvents, externalBusyEvents]);

  const { data: taskCount = 0 } = useQuery({
    queryKey: ["tasks-count", activeTeamId],
    queryFn: () => api.get<number>(`/api/teams/${activeTeamId}/tasks/count`),
    enabled: !!activeTeamId && hasTaskAccess,
    refetchInterval: workspacePollInterval,
    refetchIntervalInBackground: false,
  });

  const eventCount = calendarEvents.length;
  const upcomingEventCount = React.useMemo(() => {
    const todayIso = toLocalIso(new Date());
    return calendarEvents.filter((event) => {
      const day = event.startDate.slice(0, 10);
      return day >= todayIso;
    }).length;
  }, [calendarEvents]);
  const tasksBadge = Math.max(
    0,
    taskCount - (acknowledgedCounts[activeTeamId ?? ""] ?? 0),
  );
  const calendarBadge = Math.max(
    0,
    eventCount - (acknowledgedEventCounts[activeTeamId ?? ""] ?? 0),
  );

  // Clear the badge for the active Calendar/Tasks view when opened or switched
  useEffect(() => {
    if (!activeTeamId || !hasTaskAccess) return;
    if (workspaceMode === "tasks") {
      acknowledge(activeTeamId, taskCount);
    } else if (workspaceMode === "calendar") {
      acknowledgeEvents(activeTeamId, eventCount);
    }
  }, [
    activeTeamId,
    hasTaskAccess,
    workspaceMode,
    taskCount,
    eventCount,
    acknowledge,
    acknowledgeEvents,
  ]);

  // Leaving development, or moving to another workspace, drops back to the
  // team list rather than reopening whoever was last looked at.
  useEffect(() => {
    if (workspaceMode !== "development") {
      setDevelopmentFocus(null);
    }
  }, [workspaceMode]);
  useEffect(() => {
    setDevelopmentFocus(null);
  }, [activeTeamId]);
  // Team Development rings/key read member-stats; refresh as soon as Overview
  // is shown so a finished check-in or new goal is reflected immediately.
  useEffect(() => {
    if (workspaceMode !== "overview" || !activeTeamId) return;
    void queryClient
      .refetchQueries({ queryKey: ["member-stats", activeTeamId], type: "active" })
      .catch(() => {});
  }, [workspaceMode, activeTeamId, queryClient]);

  /**
   * Folding the screen or leaving Tasks takes the pane away; carry the open task
   * onto the full screen rather than dropping what someone was reading.
   */
  useEffect(() => {
    if (!openTaskId) return;
    // Tasks and Calendar keep the open item in the side pane. Anywhere else,
    // or once the screen folds, carry it onto the full task screen.
    if (
      showTaskDetailPane &&
      (workspaceMode === "tasks" || workspaceMode === "calendar")
    ) {
      return;
    }
    setOpenTaskId(null);
    if (showTaskDetailPane || !activeTeamId) return;
    router.push({
      pathname: "/task-detail",
      params: { taskId: openTaskId, teamId: activeTeamId },
    });
  }, [activeTeamId, openTaskId, showTaskDetailPane, workspaceMode]);

  const openTaskDetails = (task: Task, options?: { startEdit?: boolean }) => {
    if (!activeTeamId) return;
    queryClient.setQueryData(["task", task.id, activeTeamId], task);
    /**
     * The pane shows the task beside the list it came from. Editing still takes
     * the full screen, since the edit form needs the width.
     */
    if (showTaskDetailPane && !options?.startEdit) {
      setOpenTaskId(task.id);
      return;
    }
    router.push({
      pathname: "/task-detail",
      params: {
        taskId: task.id,
        teamId: activeTeamId,
        ...(options?.startEdit ? { startEdit: "1" } : {}),
      },
    });
  };

  const openScheduleTask = (task: Task) => {
    if (showTaskDetailPane && !calendarUsesDaySheet) {
      openTaskDetails(task);
      return;
    }
    setShowCalendarDayDetail(false);
    setPreviewTask(task);
  };

  const reassignMutation = useMutation({
    mutationFn: async ({
      task,
      newUserId,
    }: {
      task: Task;
      newUserId: string;
    }) => {
      for (const assignment of task.assignments) {
        await api.delete(
          `/api/teams/${activeTeamId}/tasks/${task.id}/assign/${assignment.userId}`,
        );
      }
      await api.post(`/api/teams/${activeTeamId}/tasks/${task.id}/assign`, {
        userIds: [newUserId],
      });
    },
    onSuccess: () => {
      invalidateTaskCaches(queryClient, activeTeamId);
      setReassignTask(null);
    },
  });

  const finishEventSave = (saved: CalendarEvent) => {
    if (saved.isVideoMeeting) {
      useMeetingBannerStore.getState().rememberMeeting({
        event: {
          id: saved.id,
          title: saved.title,
          startDate: saved.startDate,
          endDate: saved.endDate,
          teamId: saved.teamId,
        },
        teamName: teamData?.name ?? "Workspace",
        userRole: currentRole,
      });
    } else {
      useMeetingBannerStore.getState().forgetMeeting(saved.id);
    }
    queryClient.invalidateQueries({
      queryKey: ["calendar-events", activeTeamId],
    });
    queryClient.invalidateQueries({ queryKey: ["upcoming-video-meetings"] });
    const close = () => {
      setShowEventModal(false);
      setEditingEvent(null);
      setEventTitle("");
      setEventDescription("");
      setEventIsHidden(true);
      setMeetingAssigneeIds([]);
      setShowMeetingAssigneeDropdown(false);
    };
    if (
      !isOwnerOrLeader &&
      !saved.isHidden &&
      saved.approvalStatus === "pending"
    ) {
      Alert.alert(
        "Submitted for approval",
        "It was sent to workspace leaders and will appear on the calendar after approval.",
        [{ text: "OK", onPress: close }],
      );
      return;
    }
    close();
  };

  const createEventMutation = useMutation({
    mutationFn: (data: object) =>
      api.post<CalendarEvent>(`/api/teams/${activeTeamId}/events`, data),
    onSuccess: finishEventSave,
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch<CalendarEvent>(`/api/teams/${activeTeamId}/events/${id}`, data),
    onSuccess: finishEventSave,
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/teams/${activeTeamId}/events/${id}`),
    onSuccess: (_data, eventId) => {
      useMeetingBannerStore.getState().forgetMeeting(eventId);
      queryClient.invalidateQueries({
        queryKey: ["calendar-events", activeTeamId],
      });
      queryClient.invalidateQueries({ queryKey: ["upcoming-video-meetings"] });
      setShowEventModal(false);
      setEditingEvent(null);
      setConfirmDeleteEvent(false);
      setEventTitle("");
      setEventDescription("");
      setEventIsHidden(true);
      setMeetingAssigneeIds([]);
      setShowMeetingAssigneeDropdown(false);
    },
    onError: (err: Error) => {
      Alert.alert(
        "Could not delete event",
        err.message || "Something went wrong. Try again.",
      );
    },
  });

  const startOnSelectedDay = (dayIso?: string | null) => {
    const now = new Date();
    if (!dayIso) return now;
    const [y, m, day] = dayIso.split("-").map(Number);
    return new Date(y, m - 1, day, now.getHours(), now.getMinutes(), 0, 0);
  };

  const hourAfter = (value: Date) => new Date(value.getTime() + 60 * 60 * 1000);

  const applyDatePart = (current: Date, picked: Date) => {
    const next = new Date(current);
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    return next;
  };

  const applyTimePart = (current: Date, picked: Date) => {
    const next = new Date(current);
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    return next;
  };

  const shiftEndKeepingLength = (
    prevStart: Date,
    nextStart: Date,
    prevEnd: Date,
  ) => {
    const length = Math.max(
      prevEnd.getTime() - prevStart.getTime(),
      60 * 60 * 1000,
    );
    return new Date(nextStart.getTime() + length);
  };

  const openEventModal = (opts?: {
    withVideo?: boolean;
    day?: string | null;
  }) => {
    if (!access.canWrite) return;
    setEditingEvent(null);
    setEventModalReadOnly(false);
    setEventModalType("event");
    const d = startOnSelectedDay(opts?.day ?? selectedDay);
    const withVideo = opts?.withVideo === true && isOwnerOrLeader;
    setEventIncludeVideo(withVideo);
    setEventTitle("");
    setEventDescription("");
    setEventStart(d);
    setEventEnd(hourAfter(d));
    setEventIsHidden(!isOwnerOrLeader);
    setEventImageUrl(null);
    setEventImageUploading(false);
    setFormError(null);
    setConfirmDeleteEvent(false);
    setMeetingAssigneeIds([]);
    setShowMeetingAssigneeDropdown(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setShowDurationPicker(false);
    setMeetingDurationMinutes(60);
    setShowEventModal(true);
  };

  const openPersonalEventModal = () => {
    if (!access.canWrite) return;
    setEditingEvent(null);
    setEventModalReadOnly(false);
    setEventModalType("event");
    const d = startOnSelectedDay(selectedDay);
    setEventIncludeVideo(false);
    setEventTitle("");
    setEventDescription("");
    setEventStart(d);
    setEventEnd(hourAfter(d));
    setEventIsHidden(true);
    setEventImageUrl(null);
    setEventImageUploading(false);
    setFormError(null);
    setConfirmDeleteEvent(false);
    setMeetingAssigneeIds([]);
    setShowMeetingAssigneeDropdown(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setShowDurationPicker(false);
    setMeetingDurationMinutes(60);
    setShowEventModal(true);
  };

  const openMeetingModal = (initialDay = selectedDay) => {
    if (!access.canWrite) return;
    setEditingEvent(null);
    setEventModalReadOnly(false);
    setEventModalType("meeting");
    setEventIncludeVideo(false);
    const now = new Date();
    const d = initialDay
      ? (() => {
          const [y, m, day] = initialDay.split("-").map(Number);
          return new Date(
            y,
            m - 1,
            day,
            now.getHours(),
            now.getMinutes(),
            0,
            0,
          );
        })()
      : now;
    setEventTitle("");
    setEventDescription("");
    setEventStart(d);
    setEventEnd(d);
    setMeetingDurationMinutes(60);
    setEventIsHidden(true);
    setEventImageUrl(null);
    setEventImageUploading(false);
    setFormError(null);
    setConfirmDeleteEvent(false);
    setMeetingAssigneeIds([]);
    setShowMeetingAssigneeDropdown(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setShowDurationPicker(false);
    setShowEventModal(true);
  };

  const openCheckInModal = (initialDay = selectedDay) => {
    if (!access.canWrite) return;
    openMeetingModal(initialDay);
    setEventModalType("checkin");
    setCheckInFormat("virtual");
    setEventTitle("Check-in");
  };

  const openEditEventModal = (
    ev: CalendarEvent,
    opts?: { readOnly?: boolean },
  ) => {
    setEditingEvent(ev);
    setEventModalReadOnly(opts?.readOnly === true || !canManageEvent(ev));
    setEventModalType(ev.isOneOnOne ? "checkin" : "event");
    setEventIncludeVideo(!ev.isOneOnOne && ev.isVideoMeeting === true);
    setCheckInFormat(ev.isVideoMeeting ? "virtual" : "in_person");
    setEventTitle(ev.title);
    setEventDescription(ev.description ?? "");
    setEventStart(new Date(ev.startDate));
    setEventEnd(
      ev.endDate ? new Date(ev.endDate) : hourAfter(new Date(ev.startDate)),
    );
    if (ev.endDate && ev.allDay !== true) {
      setMeetingDurationMinutes(
        durationMinutesFromRange(new Date(ev.startDate), new Date(ev.endDate)),
      );
    } else {
      setMeetingDurationMinutes(60);
    }
    setEventIsHidden(ev.isHidden ?? false);
    setEventImageUrl(ev.image ?? null);
    setEventImageUploading(false);
    setMeetingAssigneeIds(
      (ev.assigneeIds ?? []).filter((id) => id !== session?.user?.id),
    );
    setFormError(null);
    setConfirmDeleteEvent(false);
    setShowMeetingAssigneeDropdown(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setShowDurationPicker(false);
    setShowEventModal(true);
  };

  const confirmAndDeleteEvent = (ev: CalendarEvent) => {
    if (!canManageEvent(ev)) {
      Alert.alert(
        "View only",
        "You can only edit or delete events you created.",
      );
      return;
    }
    setConfirmDeleteEvent(true);
  };

  const openEventActions = (ev: CalendarEvent) => {
    if (!canManageEvent(ev)) return;
    setConfirmDeleteActionEvent(false);
    setActionMenuEvent(ev);
  };

  const handleSaveEvent = () => {
    if (!access.canWrite || eventModalReadOnly) return;
    if (!eventTitle.trim()) {
      setFormError("Please enter a title");
      return;
    }
    const isCheckIn = eventModalType === "checkin";
    const eventWantsVideo =
      eventModalType === "event" && eventIncludeVideo && isOwnerOrLeader;
    const isVirtualMeeting =
      eventModalType === "meeting" ||
      eventWantsVideo ||
      (isCheckIn && checkInFormat === "virtual");
    const useEventRange = eventModalType === "event" && !eventWantsVideo;
    if ((isCheckIn || eventWantsVideo) && !isOwnerOrLeader) {
      setFormError(
        isCheckIn
          ? "Only workspace owners and team leaders can schedule check-ins."
          : "Only workspace owners and team leaders can schedule virtual meetings.",
      );
      return;
    }
    const selectedCheckInMemberId = isCheckIn
      ? (meetingAssigneeIds[0] ?? null)
      : null;
    if (isCheckIn && !selectedCheckInMemberId) {
      setFormError("Choose a team member for this check-in.");
      return;
    }
    if (useEventRange && eventEnd <= eventStart) {
      setFormError("End must be after the start time.");
      return;
    }
    const end = useEventRange
      ? eventEnd
      : videoMeetingEndFromDuration(eventStart, meetingDurationMinutes);
    // Keep the calendar focused on the saved event's day so past-dated meetings remain visible immediately.
    setSelectedDay(toLocalIso(eventStart));
    if (editingEvent) {
      updateEventMutation.mutate({
        id: editingEvent.id,
        data: {
          title: eventTitle.trim(),
          description: eventDescription.trim() || undefined,
          startDate: eventStart.toISOString(),
          endDate: end.toISOString(),
          color: resolveCalendarEventColor({
            isHidden: eventIsHidden,
            isVideoMeeting: isOwnerOrLeader && isVirtualMeeting,
            isOneOnOne: isCheckIn,
          }),
          allDay: false,
          image: eventImageUrl,
          isHidden: isCheckIn ? true : eventIsHidden,
          isVideoMeeting: isOwnerOrLeader && isVirtualMeeting,
          isOneOnOne: isCheckIn,
          oneOnOneMemberUserId: selectedCheckInMemberId,
          assigneeIds:
            (isCheckIn || eventWantsVideo) && (isCheckIn || eventIsHidden)
              ? meetingAssigneeIds
              : undefined,
        },
      });
    } else {
      createEventMutation.mutate({
        title: eventTitle.trim(),
        description: eventDescription.trim() || undefined,
        startDate: eventStart.toISOString(),
        endDate: end.toISOString(),
        color: resolveCalendarEventColor({
          isHidden: isCheckIn ? true : eventIsHidden,
          isVideoMeeting: isOwnerOrLeader && isVirtualMeeting,
          isOneOnOne: isCheckIn,
        }),
        allDay: false,
        image: eventImageUrl,
        isHidden: isCheckIn ? true : eventIsHidden,
        isVideoMeeting: isOwnerOrLeader && isVirtualMeeting,
        isOneOnOne: isCheckIn,
        oneOnOneMemberUserId: selectedCheckInMemberId ?? undefined,
        assigneeIds:
          (isCheckIn || eventWantsVideo) && (isCheckIn || eventIsHidden)
            ? meetingAssigneeIds
            : undefined,
      });
    }
  };

  const uploadEventPhoto = async (source: "library" | "camera") => {
    if (!activeTeamId) return;
    try {
      const file = source === "library" ? await pickImage() : await takePhoto();
      if (!file) return;
      setEventImageUploading(true);
      const uploaded = await uploadFile(
        file.uri,
        file.filename,
        file.mimeType,
        {
          purpose: "team",
          teamId: activeTeamId,
        },
      );
      setEventImageUrl(uploaded.url);
    } catch (err) {
      Alert.alert(
        "Could not add photo",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setEventImageUploading(false);
    }
  };

  const pickEventPhoto = () => {
    if (eventModalReadOnly) return;
    setShowEventPhotoPicker(true);
  };

  const eventUsesRange =
    eventModalType === "event" && !(eventIncludeVideo && isOwnerOrLeader);

  const currentUserId = session?.user?.id ?? null;

  const teamMembers: TeamMember[] = teamData?.members ?? [];
  // Wide Members: keep a person selected so the Goals/Check-ins pane stays open.
  // Regular members may only open themselves; leaders keep the first teammate.
  useEffect(() => {
    if (workspaceMode !== "development" || !splitMembers) return;
    if (developmentFocus) {
      if (
        !isOwnerOrLeader &&
        currentUserId &&
        developmentFocus.userId !== currentUserId
      ) {
        setDevelopmentFocus({
          userId: currentUserId,
          section: developmentFocus.section ?? "check-ins",
        });
      }
      return;
    }
    const preferred =
      (!isOwnerOrLeader && currentUserId
        ? teamMembers.find((member) => member.userId === currentUserId)
        : null) ?? teamMembers[0];
    if (!preferred) return;
    setDevelopmentFocus({ userId: preferred.userId, section: "check-ins" });
  }, [
    workspaceMode,
    splitMembers,
    developmentFocus,
    teamMembers,
    isOwnerOrLeader,
    currentUserId,
  ]);
  const developmentMember = developmentFocus
    ? (teamMembers.find(
        (member) => member.userId === developmentFocus.userId,
      ) ?? null)
    : null;
  // Whoever runs the workspace is the leader shown against goals and check-ins.
  const workspaceLeader =
    teamMembers.find((member) => member.role === "owner") ?? null;
  const workspaceLeaderName =
    workspaceLeader?.user.name?.trim() || workspaceLeader?.user.email || null;
  const summaryMember = teamMembers.find(
    (member) =>
      (!!currentUserId &&
        (member.userId === currentUserId ||
          member.user.id === currentUserId)) ||
      (!!session?.user?.email &&
        member.user.email.trim().toLowerCase() ===
          session.user.email.trim().toLowerCase()),
  );
  const summaryMemberUserId = summaryMember?.userId ?? currentUserId;
  useEffect(() => {
    const developmentRequested =
      linkedMode === "development" ||
      linkedMode === "goals" ||
      linkedMode === "check-ins" ||
      linkedMode === "check-in" ||
      linkedDevelopmentSection != null ||
      linkedCreateGoal === "1" ||
      linkedCreateGoal === "true" ||
      linkedStartCheckIn === "1" ||
      linkedStartCheckIn === "true" ||
      !!linkedCheckInId;
    if (!developmentRequested || !activeTeamId) return;
    if (linkedTeamId && linkedTeamId !== activeTeamId) {
      // Already consumed this link. A manual switch after that must stick.
      if (appliedLinkedTeamRef.current === linkedTeamId) return;
      // Development is per workspace, so a link naming another one moves the
      // whole app there rather than being quietly dropped. The effect runs
      // again once the switch lands.
      if (teams?.some((team) => team.id === linkedTeamId)) {
        void switchWorkspace(linkedTeamId);
      }
      return;
    }

    const wantsMemberProfile =
      !!linkedMemberUserId ||
      linkedMode === "goals" ||
      linkedMode === "check-ins" ||
      linkedMode === "check-in" ||
      linkedDevelopmentSection != null ||
      linkedCreateGoal === "1" ||
      linkedCreateGoal === "true" ||
      linkedStartCheckIn === "1" ||
      linkedStartCheckIn === "true" ||
      !!linkedCheckInId;
    if (!wantsMemberProfile) {
      openMembers();
      return;
    }

    const requestedUserId = linkedMemberUserId ?? summaryMemberUserId;
    if (!requestedUserId) return;
    // Members can only open their own development from a deep link.
    const targetUserId =
      !isOwnerOrLeader && summaryMemberUserId
        ? summaryMemberUserId
        : requestedUserId;

    const section: WorkspaceDevelopmentSection =
      linkedDevelopmentSection === "goals" ||
      linkedMode === "goals" ||
      linkedCreateGoal === "1" ||
      linkedCreateGoal === "true"
        ? "goals"
        : "check-ins";
    const linkKey = [
      activeTeamId,
      targetUserId,
      section,
      linkedCreateGoal,
      linkedStartCheckIn,
      linkedCheckInId,
      linkedPlannedEventId,
      linkedCheckInLaunchId,
    ].join(":");
    if (appliedDevelopmentLinkRef.current === linkKey) return;
    appliedDevelopmentLinkRef.current = linkKey;

    const wantsCheckIn =
      linkedStartCheckIn === "1" ||
      linkedStartCheckIn === "true" ||
      !!linkedCheckInId;
    openMembers();
    setDevelopmentFocus({
      userId: targetUserId,
      section,
      createGoal: linkedCreateGoal === "1" || linkedCreateGoal === "true",
      // Any non-zero value opens the check-in; the link is only applied once.
      startCheckInToken: wantsCheckIn ? Date.now() : 0,
      plannedEventId: linkedPlannedEventId,
      checkInId: linkedCheckInId,
    });
  }, [
    activeTeamId,
    isOwnerOrLeader,
    linkedCheckInId,
    linkedCheckInLaunchId,
    linkedCreateGoal,
    linkedDevelopmentSection,
    linkedMemberUserId,
    linkedMode,
    linkedPlannedEventId,
    linkedStartCheckIn,
    linkedTeamId,
    summaryMemberUserId,
    teams,
    switchWorkspace,
    openMembers,
  ]);
  const summaryStandards = React.useMemo(
    () => mergeWorkplaceStandards(memberStatsPayload?.workplaceStandards),
    [memberStatsPayload?.workplaceStandards],
  );
  const summaryActiveWorkspaceTasks = mergeViewerReminders(
    workspaceTasksOnly(summaryActiveTasksData?.tasks ?? []),
    ownActiveRemindersData?.tasks ?? [],
  );
  const summaryCompletedWorkspaceTasks = workspaceTasksOnly(
    summaryCompletedTasksData?.tasks ?? [],
  );
  const summaryCompletedToday =
    summaryCompletedPending && !summaryCompletedTasksData
      ? null
      : countCompletedToday(summaryCompletedWorkspaceTasks, summaryToday);
  const summaryDueToday =
    summaryActivePending && !summaryActiveTasksData
      ? null
      : countDueToday(summaryActiveWorkspaceTasks, summaryToday);
  const summaryOverdue =
    summaryActivePending && !summaryActiveTasksData
      ? null
      : countOverdue(summaryActiveWorkspaceTasks, summaryToday);
  const summaryHealth = isCalendarManager
    ? workspaceHealthPercent({
        members: teamMembers,
        memberStats: memberStatsPayload?.stats,
        standards: summaryStandards,
      })
    : personalHealthPercent({
        stats: summaryMemberUserId
          ? memberStatsPayload?.stats[summaryMemberUserId]
          : undefined,
        standards: summaryStandards,
      });
  const overviewDevStats = React.useMemo(() => {
    const empty = {
      goalsOnTrackPercent: 0,
      checkInsOnTrackPercent: 0,
      onTrackCount: 0,
      needsAttentionCount: 0,
      notStartedCount: 0,
    };
    if (teamMembers.length === 0) return empty;

    const stats = memberStatsPayload?.stats ?? {};
    const minimumActiveGoals = Math.max(
      1,
      summaryStandards.minimumActiveGoals || 1,
    );
    let goalsProgressUnits = 0;
    let goalsEligible = 0;
    let checkInsOnTrackCount = 0;
    let checkInsEligible = 0;
    let onTrackCount = 0;
    let needsAttentionCount = 0;
    let notStartedCount = 0;

    for (const member of teamMembers) {
      const row = stats[member.userId];
      const goals = row?.activeDevGoals ?? 0;
      const compliance = row?.standardsCompliance;
      const goalsStatus = compliance?.goalsStatus;
      const checkInStatus = compliance?.checkInStatus;
      const neverCheckedIn = row?.daysSinceLastOneOnOne == null;

      const goalsApply =
        summaryStandards.goalsRequired &&
        goalsStatus !== "not_required";
      const checkInsApply =
        summaryStandards.checkInRequired &&
        checkInStatus !== "not_required";

      // Goals ring: partial credit toward the minimum (1 of 2 goals = 50%).
      if (goalsApply) {
        goalsEligible += 1;
        goalsProgressUnits += Math.min(1, goals / minimumActiveGoals);
      }
      // Check-ins ring: current if on track or due soon.
      if (checkInsApply) {
        checkInsEligible += 1;
        if (
          checkInStatus === "on_track" ||
          checkInStatus === "due_soon"
        ) {
          checkInsOnTrackCount += 1;
        }
      }

      if (!goalsApply && !checkInsApply) continue;

      const missingGoals = goalsApply && goals < minimumActiveGoals;
      const checkInTrouble =
        checkInsApply &&
        (checkInStatus === "overdue" ||
          checkInStatus === "due_soon" ||
          !checkInStatus);

      if (neverCheckedIn && goals === 0) {
        notStartedCount += 1;
      } else if (missingGoals || checkInTrouble) {
        needsAttentionCount += 1;
      } else {
        onTrackCount += 1;
      }
    }

    return {
      goalsOnTrackPercent:
        goalsEligible > 0
          ? Math.round((goalsProgressUnits / goalsEligible) * 100)
          : 0,
      checkInsOnTrackPercent:
        checkInsEligible > 0
          ? Math.round((checkInsOnTrackCount / checkInsEligible) * 100)
          : 0,
      onTrackCount,
      needsAttentionCount,
      notStartedCount,
    };
    // dataUpdatedAt ensures rings recompute after every member-stats refetch.
  }, [
    teamMembers,
    memberStatsPayload,
    memberStatsUpdatedAt,
    summaryStandards,
  ]);
  /** Member overview card: personal rings + status (not the team scoreboard). */
  const personalOverviewDev = React.useMemo(() => {
    const row = currentUserId
      ? memberStatsPayload?.stats[currentUserId]
      : undefined;
    const status = memberDevelopmentStatus(row, summaryStandards);
    const minimumActiveGoals = Math.max(
      1,
      summaryStandards.minimumActiveGoals || 1,
    );
    const compliance = row?.standardsCompliance;
    const goalsApply =
      summaryStandards.goalsRequired &&
      compliance?.goalsStatus !== "not_required";
    const checkInsApply =
      summaryStandards.checkInRequired &&
      compliance?.checkInStatus !== "not_required";
    const activeGoals = Math.max(0, row?.activeDevGoals ?? 0);
    const checkInStatus = compliance?.checkInStatus;
    const checkInsOnTrackPercent =
      checkInsApply &&
      (checkInStatus === "on_track" || checkInStatus === "due_soon")
        ? 100
        : 0;
    const goalsOnTrackPercent = goalsApply
      ? Math.round(
          Math.min(1, activeGoals / minimumActiveGoals) * 100,
        )
      : 0;
    return {
      checkInsOnTrackPercent,
      goalsOnTrackPercent,
      status,
    };
  }, [
    currentUserId,
    memberStatsPayload,
    memberStatsUpdatedAt,
    summaryStandards,
  ]);
  const summaryMetricsLoading =
    (summaryActivePending && !summaryActiveTasksData) ||
    (summaryCompletedPending && !summaryCompletedTasksData) ||
    (memberStatsPending && !memberStatsPayload);

  const summaryAttentionItems = React.useMemo(() => {
    if (!isCalendarManager) return null;
    if (!memberStatsPayload) return null;
    return buildNeedsAttention({
      members: teamMembers,
      memberStats: memberStatsPayload.stats,
      standards: summaryStandards,
      limit: 100,
    }).map((item) => ({
      ...item,
      reason:
        snapshotAttentionReason(item.stats, summaryStandards) || item.reason,
    }));
  }, [isCalendarManager, memberStatsPayload, teamMembers, summaryStandards]);
  const summaryCheckInAttentionItems = React.useMemo(
    () =>
      summaryAttentionItems?.flatMap((item) => {
        const status = item.stats?.standardsCompliance?.checkInStatus;
        if (status !== "overdue" && status !== "due_soon") return [];
        return [
          {
            ...item,
            reason:
              status === "overdue"
                ? item.stats?.daysSinceLastOneOnOne == null
                  ? "No check-in yet"
                  : "Check-in overdue"
                : "Check-in due soon",
          },
        ];
      }) ?? [],
    [summaryAttentionItems],
  );
  // Stable across renders so the snapshot memos only recompute when the day rolls over.
  const summaryTodayIso = toLocalIso(summaryToday);
  const summaryDayStart = React.useMemo(
    () => startOfDay(new Date(`${summaryTodayIso}T12:00:00`)),
    [summaryTodayIso],
  );

  const summaryCheckInEvents = React.useMemo(
    () => selectTodaysOneOnOnes(calendarEvents, summaryDayStart),
    [calendarEvents, summaryDayStart],
  );
  const developmentUpcomingCheckIns = React.useMemo(
    () => selectUpcomingDevelopmentCheckIns(calendarEvents, new Date()),
    [calendarEvents],
  );
  const summaryCheckInsToday = summaryCheckInEvents.length;

  const summaryCompliance = React.useMemo(() => {
    if (!memberStatsPayload) {
      return { checkInCompliancePct: null, developmentPlanCompliancePct: null };
    }
    const memberUserIds = isCalendarManager
      ? teamMembers.filter((m) => m.role !== "owner").map((m) => m.userId)
      : summaryMemberUserId
        ? [summaryMemberUserId]
        : [];
    return computeTeamCompliancePercentages({
      memberUserIds,
      memberStats: memberStatsPayload.stats,
      workplaceStandards: summaryStandards,
    });
  }, [
    isCalendarManager,
    memberStatsPayload,
    summaryMemberUserId,
    summaryStandards,
    teamMembers,
  ]);
  const summaryGoalsOnTrackPct = isCalendarManager
    ? summaryCompliance.developmentPlanCompliancePct
    : null;
  const summaryGoalCoverageItems = React.useMemo(
    () =>
      buildGoalCoverageItems({
        members: teamMembers,
        memberStats: memberStatsPayload?.stats,
        minimumActiveGoals: summaryStandards.minimumActiveGoals,
      }),
    [
      memberStatsPayload?.stats,
      summaryStandards.minimumActiveGoals,
      teamMembers,
    ],
  );
  const summaryNeedsAttention = React.useMemo(() => {
    if (!memberStatsPayload) return null;
    const memberIds = new Set(
      summaryCheckInAttentionItems.map((item) => item.member.userId),
    );
    if (summaryStandards.goalsRequired) {
      for (const item of summaryGoalCoverageItems) {
        if (!item.requirementMet) memberIds.add(item.member.userId);
      }
    }
    return memberIds.size;
  }, [
    memberStatsPayload,
    summaryCheckInAttentionItems,
    summaryGoalCoverageItems,
    summaryStandards.goalsRequired,
  ]);
  const summaryMomentumCount = isCalendarManager
    ? (teamMomentumSummary?.activeCount ?? null)
    : summaryMemberUserId && memberStatsPayload
      ? (memberStatsPayload.stats[summaryMemberUserId]?.streak ?? 0)
      : null;
  const summaryMemberStats =
    !isCalendarManager && summaryMemberUserId && memberStatsPayload
      ? memberStatsPayload.stats[summaryMemberUserId]
      : undefined;
  const summaryMemberDevelopmentCount =
    !isCalendarManager && memberStatsPayload
      ? (summaryMemberStats?.activeDevGoals ?? 0)
      : null;
  const summaryMemberDevelopmentStatus =
    summaryMemberStats?.standardsCompliance?.checkInStatus === "overdue"
      ? ("check_in_overdue" as const)
      : summaryMemberStats?.standardsCompliance?.checkInStatus === "due_soon"
        ? ("check_in_due_soon" as const)
        : summaryMemberStats?.standardsCompliance?.goalsStatus ===
            "missing_goals"
          ? ("goals_missing" as const)
          : summaryMemberStats
            ? ("on_track" as const)
            : null;
  const summaryMemberMissingGoals =
    summaryMemberStats?.standardsCompliance?.missingGoals ?? null;

  const summaryTaskDetails = React.useMemo(() => {
    const active = mergeViewerReminders(
      workspaceTasksOnly(summaryActiveTasksData?.tasks ?? []),
      ownActiveRemindersData?.tasks ?? [],
    );
    const completed = workspaceTasksOnly(
      summaryCompletedTasksData?.tasks ?? [],
    );
    return {
      open: selectSnapshotTasks(active, "open", summaryDayStart),
      actionTasks: selectSnapshotTasks(active, "actionTasks", summaryDayStart),
      dueToday: selectSnapshotTasks(active, "dueToday", summaryDayStart),
      overdue: selectSnapshotTasks(active, "overdue", summaryDayStart),
      completedToday: selectSnapshotTasks(
        completed,
        "completedToday",
        summaryDayStart,
      ),
    };
  }, [
    summaryActiveTasksData?.tasks,
    ownActiveRemindersData?.tasks,
    summaryCompletedTasksData?.tasks,
    summaryDayStart,
  ]);

  const summaryOpenCount = summaryTaskDetails.open.length;
  const summaryComplianceMetrics = React.useMemo(
    () => [
      ...(summaryStandards.checkInRequired
        ? [
            {
              key: "check-ins",
              label: "Check-in compliance",
              value:
                summaryCompliance.checkInCompliancePct == null
                  ? "—"
                  : `${summaryCompliance.checkInCompliancePct}%`,
              color:
                summaryCompliance.checkInCompliancePct == null
                  ? "#94A3B8"
                  : "#2563EB",
            },
          ]
        : []),
      ...(summaryStandards.goalsRequired
        ? [
            {
              key: "goals",
              label: "Goals on track",
              value:
                summaryCompliance.developmentPlanCompliancePct == null
                  ? "—"
                  : `${summaryCompliance.developmentPlanCompliancePct}%`,
              color:
                summaryCompliance.developmentPlanCompliancePct == null
                  ? "#94A3B8"
                  : "#7C3AED",
            },
          ]
        : []),
    ],
    [
      summaryCompliance,
      summaryStandards.checkInRequired,
      summaryStandards.goalsRequired,
    ],
  );

  const handleSelectDay = useCallback(
    (iso: string | null) => {
      setSelectedDay(iso);
      if (iso && useMonthDaySheet) setShowCalendarDayDetail(true);
      else setShowCalendarDayDetail(false);
    },
    [useMonthDaySheet],
  );

  // Roster management on the Team tab. The sheet decides per member what is
  // actually allowed; this only decides whether the row menu exists at all.
  const canManageRoster = Boolean(isOwnerOrLeader && access.canWrite);
  const inviteMemberMutation = useMutation({
    mutationFn: ({
      emails,
      role,
    }: {
      emails: string[];
      role: WorkspaceInviteRole;
    }) =>
      Promise.all(
        emails.map((email) => inviteMemberByEmail(activeTeamId!, email, role)),
      ),
    onSuccess: (results) => {
      setInviteError(null);
      setInviteOpen(false);
      void queryClient.invalidateQueries({
        queryKey: ["team-invites", activeTeamId],
      });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      // Force the round trip rather than just marking these stale: the new
      // member's row and their status have to land together.
      void queryClient
        .refetchQueries({ queryKey: ["team", activeTeamId], type: "all" })
        .catch(() => {});
      void queryClient
        .refetchQueries({
          queryKey: ["member-stats", activeTeamId],
          type: "all",
        })
        .catch(() => {});
      toast({
        title:
          results.length > 1
            ? `${results.length} members invited`
            : results[0]?.added && results[0].user
              ? `${results[0].user.name} added to the workspace`
              : "Invite email sent",
        preset: "done",
      });
    },
    onError: (error: Error) => setInviteError(teamInviteErrorMessage(error)),
  });

  const selectedTaskDetail: SnapshotTaskDetail | null =
    selectedSnapshotDetail === "open" ||
    selectedSnapshotDetail === "actionTasks" ||
    selectedSnapshotDetail === "dueToday" ||
    selectedSnapshotDetail === "overdue" ||
    selectedSnapshotDetail === "completedToday"
      ? selectedSnapshotDetail
      : null;
  const selectedTaskFilter: TeamOverviewTaskFilter =
    selectedTaskDetail === "open" ? "open" : (selectedTaskDetail ?? "dueToday");
  const selectedDetailTasks = selectedTaskDetail
    ? summaryTaskDetails[selectedTaskDetail]
    : [];

  const openHealthStatusTasks = (status: TeamInsightsStatusKey) => {
    setSelectedSnapshotDetail(status);
  };

  const openEventPreview = (ev: CalendarEvent) => {
    setShowCalendarDayDetail(false);
    setPreviewEvent(ev);
  };

  const openEditFromPreview = () => {
    const ev = previewEvent;
    if (!ev) return;
    setPreviewEvent(null);
    if (ev.isOneOnOne && activeTeamId) {
      const member = oneOnOneMember(ev, teamMembers);
      router.push(
        planOneOnOneHref(activeTeamId, {
          eventId: ev.id,
          ...(member ? { memberUserId: member.userId } : {}),
          startDate: ev.startDate,
          ...(currentRole ? { myRole: currentRole } : {}),
        }),
      );
      return;
    }
    openEditEventModal(ev);
  };

  const openScheduledCheckIn = (event: CalendarEvent) => {
    setSelectedSnapshotDetail(null);
    openEventPreview(event);
  };

  const showTasksLoading =
    filters.statusTab === "archived"
      ? archivedPending
      : filters.statusTab === "completed"
        ? completedPending && rawTasks.length === 0
        : filters.statusTab === "all"
          ? (activePending || completedPending) && rawTasks.length === 0
          : activePending && rawTasks.length === 0;

  useEffect(() => {
    setExpandedTaskSections({});
    const source =
      filters.statusTab === "archived"
        ? archivedTasksData
        : filters.statusTab === "completed"
          ? completedTasksData
          : filters.statusTab === "all"
            ? undefined
            : activeTasksData;
    setNextCursor(source?.nextCursor ?? null);
  }, [
    filters.statusTab,
    filters.assignedTo,
    calendarYear,
    calendarMonth,
    activeTasksData?.nextCursor,
    completedTasksData?.nextCursor,
    archivedTasksData?.nextCursor,
  ]);

  const tasks = React.useMemo(() => {
    const filtered = filterTasksClientSide(rawTasks, {
      filters,
      currentUserId,
      members: teamMembers,
      selectedDay,
      calendarYear,
      calendarMonth,
      isLeader: isOwnerOrLeader,
    });
    const query = taskSearchQuery.trim().toLocaleLowerCase();
    if (!query) return filtered;
    return filtered.filter((task) =>
      `${task.title} ${task.description ?? ""}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [
    rawTasks,
    filters,
    currentUserId,
    teamMembers,
    selectedDay,
    calendarYear,
    calendarMonth,
    isOwnerOrLeader,
    taskSearchQuery,
  ]);

  const TASK_SECTION_PREVIEW = 4;
  const taskScheduleGroups = React.useMemo(
    () =>
      filters.statusTab === "completed" || filters.statusTab === "archived"
        ? groupTasksByWeek(tasks, "completed")
        : groupTasksBySchedule(tasks),
    [tasks, filters.statusTab],
  );
  const taskListSections = React.useMemo(
    () =>
      taskScheduleGroups.map((group) => {
        const expanded = Boolean(expandedTaskSections[group.key]);
        // Today stays complete so it matches the Home list. Longer sections
        // still open with a short preview.
        const showAll = group.key === "today" || expanded;
        const preview = showAll
          ? group.tasks
          : group.tasks.slice(0, TASK_SECTION_PREVIEW);
        return {
          id: group.key,
          title: group.label,
          tasks: preview,
          totalCount: group.tasks.length,
          onShowAll:
            !showAll && group.tasks.length > TASK_SECTION_PREVIEW
              ? () =>
                  setExpandedTaskSections((current) => ({
                    ...current,
                    [group.key]: true,
                  }))
              : undefined,
        };
      }),
    [taskScheduleGroups, expandedTaskSections],
  );

  const holidays = React.useMemo(() => {
    const years = new Set([
      calendarYear,
      calendarYear - 1,
      calendarYear + 1,
      new Date().getFullYear(),
    ]);
    return [...years].sort((a, b) => a - b).flatMap((y) => getUSHolidays(y));
  }, [calendarYear]);
  const calendarDatedTasks = React.useMemo(() => {
    const byId = new Map<string, Task>();
    for (const task of [
      ...(activeTasksData?.tasks ?? []),
      ...(completedTasksData?.tasks ?? []),
      ...(ownActiveRemindersData?.tasks ?? []),
    ]) {
      if (!task.dueDate) continue;
      byId.set(task.id, task);
    }
    return [...byId.values()];
  }, [
    activeTasksData?.tasks,
    completedTasksData?.tasks,
    ownActiveRemindersData?.tasks,
  ]);
  const visibleDatedTasks = React.useMemo(
    () =>
      dedupeDatedTasksAgainstEvents(
        calendarDatedTasks,
        calendarEventsWithOutlook,
      ),
    [calendarDatedTasks, calendarEventsWithOutlook],
  );
  const targetIso = selectedDay;
  const dayEvents = targetIso
    ? eventsOnLocalIso(calendarEventsWithOutlook, targetIso)
    : [];
  const dayHolidays = targetIso ? holidaysOnLocalIso(holidays, targetIso) : [];
  const dayTasks = React.useMemo(() => {
    if (!targetIso) return [];
    return visibleDatedTasks
      .filter(
        (task) => task.dueDate && datedItemLocalIso(task.dueDate) === targetIso,
      )
      .sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        const aTime = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const bTime = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return aTime - bTime || a.title.localeCompare(b.title);
      });
  }, [visibleDatedTasks, targetIso]);
  const daySheetTitle = targetIso
    ? new Date(`${targetIso}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "Day";
  const daySheetCount = dayEvents.length + dayHolidays.length + dayTasks.length;
  const daySheetSubtitle = `${daySheetCount} item${daySheetCount === 1 ? "" : "s"}`;
  const weekAgendaIsos = React.useMemo(() => {
    const focus = selectedDay
      ? new Date(`${selectedDay}T12:00:00`)
      : new Date();
    const start = startOfWeekSunday(focus);
    return Array.from({ length: 7 }, (_, index) =>
      toLocalIso(
        new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate() + index,
        ),
      ),
    );
  }, [selectedDay]);
  const tasksOnIso = React.useCallback(
    (iso: string) =>
      visibleDatedTasks
        .filter(
          (task) => task.dueDate && datedItemLocalIso(task.dueDate) === iso,
        )
        .sort((a, b) => {
          if (a.status === "done" && b.status !== "done") return 1;
          if (a.status !== "done" && b.status === "done") return -1;
          const aTime = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          const bTime = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          return aTime - bTime || a.title.localeCompare(b.title);
        }),
    [visibleDatedTasks],
  );

  if (!activeTeamId) {
    return (
      <CurvedTabLayout
        topInset={insets.top}
        title="Workspace"
        leftAction={<AlenioHeaderBrand tone="dark" />}
        headerTitlePlacement="leading"
        band
        sheetColor="#FFFFFF"
        testID="execute-screen"
        headerTestID="execute-header"
      >
        <NoWorkspaceTabState
          bottomInset={tabClearance(20)}
          testID="execute-no-workspace"
        />
      </CurvedTabLayout>
    );
  }

  // A locked or still-loading workspace keeps the normal header: without it
  // there is no way to switch to a workspace that is not locked.
  // The named pause only stays while this workspace has nothing to show.
  // A workspace opened a moment ago is already cached, so the screen appears.
  const openingTeam = teams?.find((team) => team.id === activeTeamId) ?? null;
  const workspaceOpening =
    subscriptionLoading ||
    (hasTaskAccess && calendarLoading && activeTasksLoading);
  if (workspaceOpening) {
    return (
      <CurvedTabLayout
        topInset={insets.top}
        title="Workspace"
        workspaceTitleSelector
        showWorkspaceSubtitle
        leftAction={<AlenioHeaderBrand tone="dark" />}
        headerTitlePlacement="leading"
        notificationsSize="large"
        band
        sheetColor="#FFFFFF"
        testID="workspace-access-loading-screen"
        headerTestID="workspace-header"
      >
        <WorkspaceOpeningState team={openingTeam} />
      </CurvedTabLayout>
    );
  }

  if (!hasTaskAccess && subscriptionFetched) {
    return (
      <CurvedTabLayout
        topInset={insets.top}
        title="Workspace"
        workspaceTitleSelector
        showWorkspaceSubtitle
        leftAction={<AlenioHeaderBrand tone="dark" />}
        headerTitlePlacement="leading"
        notificationsSize="large"
        band
        sheetColor="#FFFFFF"
        testID="workspace-paywall-screen"
        headerTestID="workspace-header"
      >
        <ProFeatureLockedView
          title="Unlock Tasks & Calendar"
          body="Upgrade this workspace to unlock tasks, scheduling, and your shared team calendar."
          variant="workspace"
          ctaLabel="Upgrade"
          testID="workspace-paywall"
        />
      </CurvedTabLayout>
    );
  }

  const tasksLoadError =
    filters.statusTab === "completed" || filters.statusTab === "archived"
      ? null
      : activeError
        ? activeLoadError instanceof Error
          ? activeLoadError.message
          : "Could not load tasks."
        : null;

  const showMemberTasksEmpty =
    !isOwnerOrLeader &&
    !showTasksLoading &&
    !tasksLoadError &&
    filters.statusTab === "active" &&
    tasks.length === 0;
  const showTasksListEmpty =
    !showTasksLoading && !tasksLoadError && tasks.length === 0;
  const showTasksWelcome =
    showTasksListEmpty &&
    !taskSearchQuery.trim() &&
    filters.statusTab === "active" &&
    filters.assignedTo === "me" &&
    filters.dueDate === "all";

  if (!teamsLoading && (!teams || teams.length === 0)) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
        edges={[]}
      >
        <ActivityIndicator color="#6d28d9" />
      </SafeAreaView>
    );
  }

  /**
   * Calendar day pieces, shared by the stacked and two-pane layouts so the
   * wide screen does not fork the day list's behaviour.
   */
  const dayPaneHeader = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 6,
        marginBottom: 2,
        flexShrink: 0,
        gap: 8,
        minHeight: 32,
      }}
    >
      <Text
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: "700",
          color: "#0F172A",
          letterSpacing: -0.2,
        }}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {daySheetTitle}
        <Text style={{ fontWeight: "600", color: "#64748B" }}>
          {`  ·  ${daySheetSubtitle}`}
        </Text>
      </Text>
      {access.canWrite ? (
      <Pressable
        onPress={openWorkspaceCreate}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Add event"
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 32,
          paddingHorizontal: 4,
        }}
        testID="calendar-day-add-event"
      >
        <Plus size={13} color="#6d28d9" strokeWidth={2.4} />
        <Text
          style={{
            marginLeft: 3,
            fontSize: 12,
            fontWeight: "700",
            color: "#6d28d9",
          }}
        >
          Add event
        </Text>
      </Pressable>
      ) : null}
    </View>
  );

  const dayPaneList = (
    <EventsSection
      dayEvents={dayEvents}
      dayHolidays={dayHolidays}
      dayTasks={dayTasks}
      members={teamMembers}
      selectedDayIso={targetIso}
      variant="dayList"
      embedded
      fillRemaining
      canManageEvent={canManageEvent}
      onEventPress={openEventPreview}
      onEventLongPress={openEventActions}
      onTaskPress={openScheduleTask}
      onToggleTask={openScheduleTask}
      onTaskLongPress={(task) => {
        if (!canManageTaskMenu(task)) return;
        openTaskDetails(task, { startEdit: true });
      }}
      onAddEvent={access.canWrite ? openWorkspaceCreate : undefined}
      isOwnerOrLeader={isOwnerOrLeader}
    />
  );

  /**
   * The stacked agenda lives inside the page scroll below the compact month,
   * so it sizes to its rows instead of filling a pane; a quiet day gets a
   * compact empty-state card with an add action.
   */
  const stackedDayList =
    daySheetCount === 0 ? (
      <EmptyState
        card
        icon={
          <CalendarDays size={20} color={tintInk("lavender")} strokeWidth={2} />
        }
        title="Nothing scheduled"
        body="No events or tasks due this day."
        actionLabel={access.canWrite ? "Add event" : undefined}
        actionIcon={
          <Plus size={13} color={buttonInk("soft")} strokeWidth={2.6} />
        }
        onAction={access.canWrite ? openWorkspaceCreate : undefined}
        testID="calendar-stacked-day-empty"
        style={{ marginTop: 10 }}
      />
    ) : (
      <View
        style={{
          marginTop: 10,
          backgroundColor: "#FFFFFF",
          borderRadius: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "#E8EAED",
          paddingHorizontal: 10,
          overflow: "hidden",
        }}
      >
        <EventsSection
          dayEvents={dayEvents}
          dayHolidays={dayHolidays}
          dayTasks={dayTasks}
          members={teamMembers}
          selectedDayIso={targetIso}
          variant="dayList"
          plainDayRows
          embedded
          scrollEnabled={false}
          canManageEvent={canManageEvent}
          onEventPress={openEventPreview}
          onEventLongPress={openEventActions}
          onTaskPress={openScheduleTask}
          onToggleTask={openScheduleTask}
          onTaskLongPress={(task) => {
            if (!canManageTaskMenu(task)) return;
            openTaskDetails(task, { startEdit: true });
          }}
          onAddEvent={access.canWrite ? openWorkspaceCreate : undefined}
          isOwnerOrLeader={isOwnerOrLeader}
        />
      </View>
    );

  const showSplitMembers = splitMembers;
  const showSplitDevelopmentDetail =
    showSplitMembers && Boolean(developmentFocus && developmentMember);
  const membersRoster = (
    <TeamDevelopmentCard
      members={teamMembers}
      currentUserId={currentUserId}
      calendarEvents={developmentUpcomingCheckIns}
      memberStats={memberStatsPayload?.stats}
      standards={summaryStandards}
      selectedUserId={
        showSplitMembers ? (developmentFocus?.userId ?? null) : null
      }
      lockOtherMembers={!isOwnerOrLeader}
      onMemberPress={(member) => {
        if (!isOwnerOrLeader && member.userId !== currentUserId) return;
        setDevelopmentFocus({
          userId: member.userId,
          section: "check-ins",
        });
      }}
      onManageMember={canManageRoster ? setManageMember : undefined}
      onInvite={canManageRoster ? () => setInviteOpen(true) : undefined}
      flush={showSplitMembers}
    />
  );

  const memberDetail =
    activeTeamId && developmentMember && developmentFocus ? (
      <WorkspaceMemberDevelopment
        teamId={activeTeamId}
        member={developmentMember}
        currentUserId={currentUserId}
        viewerRole={currentRole}
        leaderName={workspaceLeaderName}
        leaderUserId={workspaceLeader?.userId ?? null}
        section={developmentFocus.section}
        onSectionChange={(section) =>
          setDevelopmentFocus((current) =>
            current ? { ...current, section } : current,
          )
        }
        /**
         * A split keeps the roster on screen, so there is nowhere to go back
         * to and the header drops its back button.
         */
        onBack={
          showSplitDevelopmentDetail
            ? undefined
            : () => setDevelopmentFocus(null)
        }
        autoOpenCreateGoal={developmentFocus.createGoal ?? false}
        onCreateGoalIntentHandled={() =>
          setDevelopmentFocus((current) =>
            current ? { ...current, createGoal: false } : current,
          )
        }
        startCheckInToken={developmentFocus.startCheckInToken ?? 0}
        plannedEventId={developmentFocus.plannedEventId ?? null}
        initialCheckInId={developmentFocus.checkInId ?? null}
      />
    ) : null;

  return (
    <CurvedTabLayout
      topInset={insets.top}
      title="Workspace"
      workspaceTitleSelector
      showWorkspaceSubtitle
      leftAction={<AlenioHeaderBrand tone="dark" />}
      rightAction={undefined}
      headerTitlePlacement="leading"
      testID="tasks-screen"
      headerTestID="workspace-header"
      notificationsSize="large"
      band
      sheetColor="#FFFFFF"
      overlays={
        <>
          <WorkspaceFilterPicker
            picker={filterPicker}
            filters={filters}
            members={teamMembers}
            isLeader={isOwnerOrLeader}
            onClose={() => setFilterPicker(null)}
            onApply={(next) => {
              setFilters(next);
              setExpandedTaskSections({});
            }}
          />

          <AlenioBottomSheet
            visible={showCalendarDayDetail && useMonthDaySheet}
            title={daySheetTitle}
            subtitle={daySheetSubtitle}
            onClose={() => setShowCalendarDayDetail(false)}
            showCloseButton
            bodyHeightRatio={0.72}
            testID="calendar-day-detail-sheet"
            headerRight={
              access.canWrite ? (
                <Pressable
                  onPress={() => {
                    setShowCalendarDayDetail(false);
                    openWorkspaceCreate();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Add event"
                  style={{
                    minHeight: 32,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Plus size={13} color="#6d28d9" strokeWidth={2.4} />
                  <Text
                    style={{
                      marginLeft: 3,
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#6d28d9",
                    }}
                  >
                    Add
                  </Text>
                </Pressable>
              ) : undefined
            }
          >
            {stackedDayList}
          </AlenioBottomSheet>

          <TeamOverviewTasksSheet
            visible={selectedTaskDetail != null}
            filter={selectedTaskFilter}
            tasks={selectedDetailTasks}
            loading={
              selectedTaskDetail === "completedToday"
                ? summaryCompletedPending && !summaryCompletedTasksData
                : summaryActivePending && !summaryActiveTasksData
            }
            onClose={() => setSelectedSnapshotDetail(null)}
            onTaskPress={(task) => {
              setSelectedSnapshotDetail(null);
              openTaskDetails(task);
            }}
          />

          <MemberManageSheet
            visible={!!manageMember}
            teamId={activeTeamId ?? ""}
            member={manageMember}
            viewerRole={currentRole as TeamRole}
            viewerUserId={currentUserId}
            onClose={() => setManageMember(null)}
          />

          <AddMemberModal
            visible={inviteOpen}
            teamId={activeTeamId ?? ""}
            teamName={activeTeamName ?? "Workspace"}
            confirming={inviteMemberMutation.isPending}
            error={inviteError}
            onClose={() => {
              setInviteError(null);
              setInviteOpen(false);
            }}
            onClearError={() => setInviteError(null)}
            onConfirmMany={(emails, role) =>
              inviteMemberMutation.mutate({ emails, role })
            }
          />

          <SnapshotScheduledSheet
            visible={selectedSnapshotDetail === "scheduled"}
            events={
              workspaceMode === "development" && !isRegularMember
                ? developmentUpcomingCheckIns
                : summaryCheckInEvents
            }
            members={teamMembers}
            loading={calendarEventsPending}
            canSchedule={Boolean(isOwnerOrLeader && access.canWrite)}
            onClose={() => setSelectedSnapshotDetail(null)}
            onEventPress={openScheduledCheckIn}
            onSchedule={() => {
              setSelectedSnapshotDetail(null);
              router.push(scheduleCheckInHref(activeTeamId));
            }}
          />

          {isCalendarManager ? (
            <SnapshotDevelopmentSheet
              visible={selectedSnapshotDetail === "development"}
              checkInItems={summaryCheckInAttentionItems}
              goalItems={summaryGoalCoverageItems}
              loading={summaryMetricsLoading}
              goalsRequired={summaryStandards.goalsRequired}
              onClose={() => setSelectedSnapshotDetail(null)}
              onCheckInMemberPress={(member) => {
                setSelectedSnapshotDetail(null);
                setDevelopmentFocus({
                  userId: member.userId,
                  section: "check-ins",
                });
                openMembers();
              }}
              onGoalMemberPress={(member) => {
                setSelectedSnapshotDetail(null);
                setDevelopmentFocus({
                  userId: member.userId,
                  section: "goals",
                });
                openMembers();
              }}
            />
          ) : (
            <AlenioBottomSheet
              visible={selectedSnapshotDetail === "development"}
              title="Development"
              subtitle="Your growth at a glance"
              onClose={() => setSelectedSnapshotDetail(null)}
              compact
              showCloseButton
              testID="snapshot-personal-development-sheet"
            >
              <AlenioSheetCard tint="purple" compact>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#EEEAFE",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "800",
                        color: "#684BFF",
                      }}
                    >
                      {summaryMemberDevelopmentCount ?? "—"}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 13.5,
                        lineHeight: 18,
                        fontWeight: "800",
                        color: "#111827",
                      }}
                    >
                      Active development goals
                    </Text>
                    <Text
                      style={{
                        marginTop: 2,
                        fontSize: 11.5,
                        lineHeight: 16,
                        color: "#667085",
                      }}
                    >
                      {summaryMemberDevelopmentStatus === "check_in_overdue"
                        ? "Your check-in is overdue."
                        : summaryMemberDevelopmentStatus === "check_in_due_soon"
                          ? "Your next check-in is due soon."
                          : summaryMemberDevelopmentStatus === "goals_missing"
                            ? `${summaryMemberMissingGoals ?? 1} ${
                                summaryMemberMissingGoals === 1
                                  ? "goal is"
                                  : "goals are"
                              } still needed.`
                            : summaryMemberDevelopmentStatus
                              ? "Your development plan is on track."
                              : "Development status is unavailable."}
                    </Text>
                  </View>
                </View>
              </AlenioSheetCard>
            </AlenioBottomSheet>
          )}

          <TaskPreviewSheet
            visible={!!previewTask}
            task={previewTask}
            onClose={() => setPreviewTask(null)}
            onEdit={
              access.canWrite && previewTask
                ? () => {
                    const task = previewTask;
                    setPreviewTask(null);
                    openTaskDetails(task, { startEdit: true });
                  }
                : undefined
            }
            onComplete={
              access.canWrite &&
              previewTask &&
              previewTask.status !== "done"
                ? () => {
                    const task = previewTask;
                    setPreviewTask(null);
                    openTaskDetails(task);
                  }
                : undefined
            }
          />

          <EventPreviewSheet
            visible={!!previewEvent}
            event={previewEvent}
            workspaceTimeZone={teamData?.timezone}
            isOwnerOrLeader={isOwnerOrLeader}
            onClose={() => setPreviewEvent(null)}
            onEdit={
              previewEvent && canManageEvent(previewEvent)
                ? openEditFromPreview
                : undefined
            }
            onJoin={
              previewEvent?.isVideoMeeting
                ? () => {
                    const ev = previewEvent;
                    setPreviewEvent(null);
                    router.push(videoCallHref(ev.id, ev.title));
                  }
                : undefined
            }
          />

          <TeamInsightsSheet
            visible={selectedSnapshotDetail === "health"}
            title={isCalendarManager ? "Workspace Health" : "My Health"}
            openCount={summaryOpenCount}
            dueTodayCount={summaryTaskDetails.dueToday.length}
            overdueCount={summaryTaskDetails.overdue.length}
            complianceMetrics={summaryComplianceMetrics}
            teamHealthPct={summaryHealth}
            healthHistory={
              isCalendarManager ? (healthHistoryResponse ?? []) : []
            }
            onClose={() => setSelectedSnapshotDetail(null)}
            onSelectStatus={openHealthStatusTasks}
          />

          <AssigneesSheet
            visible={!!assigneesSheetTask}
            assignments={assigneesSheetTask?.assignments ?? []}
            currentUserId={currentUserId}
            taskTitle={assigneesSheetTask?.title}
            canManage={
              !!assigneesSheetTask &&
              canManageTaskMenu(assigneesSheetTask) &&
              isOwnerOrLeader &&
              assigneesSheetTask.status !== "done"
            }
            onClose={() => setAssigneesSheetTask(null)}
            onManage={() => {
              const task = assigneesSheetTask;
              setAssigneesSheetTask(null);
              if (!task) return;
              setReassignTask(task);
            }}
          />

          {/* Event action menu */}
          <AlenioBottomSheet
            visible={!!actionMenuEvent}
            title={actionMenuEvent?.title ?? "Event"}
            subtitle={
              confirmDeleteActionEvent
                ? "This cannot be undone"
                : actionMenuEvent?.isOneOnOne
                  ? "Choose a check-in action"
                  : actionMenuEvent?.isVideoMeeting
                    ? "Virtual meeting options"
                    : "Calendar event options"
            }
            onClose={() => {
              setActionMenuEvent(null);
              setConfirmDeleteActionEvent(false);
            }}
            testID="event-action-sheet"
            footer={
              <TouchableOpacity
                onPress={() => {
                  setActionMenuEvent(null);
                  setConfirmDeleteActionEvent(false);
                }}
                style={alenioSheetStyles.cancelButton}
                activeOpacity={0.8}
              >
                <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            }
          >
            {confirmDeleteActionEvent && actionMenuEvent ? (
              <AlenioSheetCard tint="danger">
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: "#991B1B",
                    textAlign: "center",
                  }}
                >
                  Delete this{" "}
                  {actionMenuEvent.isVideoMeeting ? "meeting" : "event"}?
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#B91C1C",
                    textAlign: "center",
                    lineHeight: 16,
                  }}
                >
                  "{actionMenuEvent.title}" will be removed permanently.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const ev = actionMenuEvent;
                    setActionMenuEvent(null);
                    setConfirmDeleteActionEvent(false);
                    if (!access.canWrite || !ev) return;
                    deleteEventMutation.mutate(ev.id);
                  }}
                  style={[
                    alenioSheetStyles.primaryButton,
                    { backgroundColor: "#EF4444" },
                  ]}
                  activeOpacity={0.92}
                  testID="event-action-confirm-delete"
                >
                  {deleteEventMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={alenioSheetStyles.primaryButtonText}>
                      Delete
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setConfirmDeleteActionEvent(false)}
                  style={alenioSheetStyles.cancelButton}
                  activeOpacity={0.8}
                >
                  <Text style={alenioSheetStyles.cancelButtonText}>
                    Keep it
                  </Text>
                </TouchableOpacity>
              </AlenioSheetCard>
            ) : (
              <>
                <AlenioSheetOption
                  icon={<Pencil size={20} color="white" strokeWidth={2.25} />}
                  title={actionMenuEvent?.isOneOnOne ? "Edit schedule" : "Edit"}
                  subtitle={
                    actionMenuEvent?.isOneOnOne
                      ? "Change the date, time, or template"
                      : "Update details, time, and visibility"
                  }
                  onPress={() => {
                    const ev = actionMenuEvent!;
                    setActionMenuEvent(null);
                    if (ev.isOneOnOne && activeTeamId) {
                      const member = oneOnOneMember(ev, teamMembers);
                      router.push(
                        planOneOnOneHref(activeTeamId, {
                          eventId: ev.id,
                          ...(member ? { memberUserId: member.userId } : {}),
                          startDate: ev.startDate,
                          ...(currentRole ? { myRole: currentRole } : {}),
                        }),
                      );
                    } else {
                      openEditEventModal(ev);
                    }
                  }}
                  testID="event-action-edit"
                />
                <AlenioSheetOption
                  icon={<Trash2 size={20} color="white" strokeWidth={2.25} />}
                  title="Delete"
                  subtitle="Remove this from the calendar"
                  destructive
                  onPress={() => setConfirmDeleteActionEvent(true)}
                  testID="event-action-delete"
                />
              </>
            )}
          </AlenioBottomSheet>

          {/* Reassign task modal */}
          <AlenioBottomSheet
            visible={!!reassignTask}
            title="Reassign task"
            subtitle={
              reassignTask ? `"${reassignTask.title}"` : "Pick a new teammate"
            }
            onClose={() => setReassignTask(null)}
            testID="reassign-sheet"
            footer={
              <TouchableOpacity
                onPress={() => setReassignTask(null)}
                style={alenioSheetStyles.cancelButton}
                activeOpacity={0.8}
                testID="reassign-cancel"
              >
                <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            }
          >
            {reassignTask?.assignments[0]?.user ? (
              <AlenioSheetCard tint="slate">
                <Text style={{ fontSize: 12, color: "#64748B" }}>
                  Currently assigned to{" "}
                  <Text style={{ fontWeight: "700", color: "#0F172A" }}>
                    {reassignTask.assignments[0].user.name}
                  </Text>
                </Text>
              </AlenioSheetCard>
            ) : null}
            {(teamData?.members ?? [])
              .filter(
                (m) =>
                  !reassignTask?.assignments.some((a) => a.userId === m.userId),
              )
              .map((member) => (
                <AlenioSheetOption
                  key={member.userId}
                  icon={
                    <UserAvatar
                      user={member.user}
                      size={44}
                      radius={22}
                      backgroundColor="#6d28d9"
                      textColor="#FFFFFF"
                      fontSize={16}
                    />
                  }
                  title={member.user?.name ?? "Team member"}
                  subtitle={member.role.replace("_", " ")}
                  onPress={() => {
                    if (!reassignTask) return;
                    setConfirmReassign({
                      task: reassignTask,
                      newUserId: member.userId,
                      newUserName: member.user?.name ?? "this person",
                    });
                    setReassignTask(null);
                  }}
                  testID="reassign-member-row"
                />
              ))}
          </AlenioBottomSheet>

          {/* Reassign confirmation modal */}
          <AlenioBottomSheet
            visible={!!confirmReassign}
            title="Reassign task?"
            subtitle="Confirm the new assignee"
            onClose={() => setConfirmReassign(null)}
            testID="reassign-confirm-sheet"
            footer={
              <TouchableOpacity
                onPress={() => setConfirmReassign(null)}
                style={alenioSheetStyles.cancelButton}
                activeOpacity={0.8}
                testID="reassign-confirm-cancel"
              >
                <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            }
          >
            <AlenioSheetCard>
              <Text
                style={{
                  fontSize: 14,
                  color: "#64748B",
                  lineHeight: 20,
                  textAlign: "center",
                }}
              >
                Move{" "}
                <Text style={{ fontWeight: "700", color: "#0F172A" }}>
                  "{confirmReassign?.task.title}"
                </Text>{" "}
                to{" "}
                <Text style={{ fontWeight: "700", color: "#0F172A" }}>
                  {confirmReassign?.newUserName}
                </Text>
                ?
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (!confirmReassign) return;
                  reassignMutation.mutate({
                    task: confirmReassign.task,
                    newUserId: confirmReassign.newUserId,
                  });
                  setConfirmReassign(null);
                  setReassignTask(null);
                }}
                style={alenioSheetStyles.primaryButton}
                activeOpacity={0.92}
                testID="reassign-confirm-submit"
              >
                <Text style={alenioSheetStyles.primaryButtonText}>
                  Reassign
                </Text>
              </TouchableOpacity>
            </AlenioSheetCard>
          </AlenioBottomSheet>

          {/* Add choice modal */}
          <AlenioBottomSheet
            visible={showAddModal && access.canWrite}
            title="Create"
            subtitle="Add to this workspace"
            onClose={() => setShowAddModal(false)}
            compact
            showCloseButton
            scrollEnabled={false}
            testID="workspace-add-sheet"
          >
            <WorkspaceCreateGrid
              items={[
                isOwnerOrLeader
                  ? {
                      key: "event",
                      label: "Event",
                      hint: "Team calendar, optional video call",
                      icon: (
                        <ScheduleKindIcon
                          kind="event"
                          size={16}
                          color={tintInk("lavender")}
                        />
                      ),
                      testID: "workspace-add-event",
                      onPress: () => {
                        setShowAddModal(false);
                        openEventModal();
                      },
                    }
                  : {
                      key: "event",
                      label: "Event",
                      hint: "Private event or team request",
                      icon: (
                        <ScheduleKindIcon
                          kind="event"
                          size={16}
                          color={tintInk("lavender")}
                        />
                      ),
                      testID: "workspace-add-event",
                      onPress: () => {
                        setShowAddModal(false);
                        openPersonalEventModal();
                      },
                    },
                {
                  key: "task",
                  label: "Task",
                  hint: isOwnerOrLeader
                    ? "Team work or just for you"
                    : "Private to you",
                  icon: (
                    <ScheduleKindIcon
                      kind="task"
                      size={16}
                      color={tintInk("lavender")}
                    />
                  ),
                  testID: "workspace-add-task",
                  onPress: () => {
                    setShowAddModal(false);
                    router.push({
                      pathname: "/create-task",
                      params: {
                        teamId: activeTeamId!,
                        initialDueDate: selectedDay ?? toLocalIso(new Date()),
                        kind: isOwnerOrLeader ? "workspace_task" : "reminder",
                      },
                    });
                  },
                },
              ]}
            />
          </AlenioBottomSheet>

          {/* New / Edit Event Modal */}
          <Modal
            visible={showEventModal}
            transparent
            animationType="slide"
            supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
            onRequestClose={() => {
              setShowEventModal(false);
              setEditingEvent(null);
              setEventModalReadOnly(false);
              setConfirmDeleteEvent(false);
              setShowMeetingAssigneeDropdown(false);
              setShowDurationPicker(false);
              setShowEventPhotoPicker(false);
              setShowEventStockPhotoSearch(false);
            }}
          >
            <View style={{ flex: 1 }}>
              <SafeKeyboardAvoidingView
                behavior="height"
                enabled={!showEventStockPhotoSearch}
                style={[
                  { flex: 1 },
                  eventFormAsDialog
                    ? {
                        justifyContent: "center",
                        alignItems: "center",
                        paddingHorizontal: 24,
                      }
                    : { justifyContent: "flex-end" },
                ]}
              >
                <Pressable
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.5)",
                  }}
                  onPress={() => {
                    setShowEventModal(false);
                    setEditingEvent(null);
                    setEventModalReadOnly(false);
                    setConfirmDeleteEvent(false);
                    setShowMeetingAssigneeDropdown(false);
                    setShowDurationPicker(false);
                    setShowEventPhotoPicker(false);
                    setShowEventStockPhotoSearch(false);
                  }}
                />
                <Pressable
                  style={[
                    eventFormStyles.sheet,
                    eventFormAsDialog ? eventFormStyles.sheetDialog : null,
                  ]}
                  onPress={(e) => e.stopPropagation()}
                >
                  {eventFormAsDialog ? null : (
                    <View style={eventFormStyles.handle} />
                  )}
                  <View style={eventFormStyles.header}>
                    <View style={eventFormStyles.headerBrand}>
                      <Image
                        source={require("@/assets/alenio-icon.png")}
                        style={eventFormStyles.headerLogo}
                      />
                      <Text style={eventFormStyles.headerTitle}>
                        {editingEvent
                          ? eventModalReadOnly
                            ? eventModalType === "checkin"
                              ? "Check-in details"
                              : "Event details"
                            : eventModalType === "checkin"
                              ? "Edit Check-in"
                              : "Edit Event"
                          : eventModalType === "checkin"
                            ? "Schedule Check-in"
                            : "New Event"}
                      </Text>
                    </View>
                    <View style={eventFormStyles.headerActions}>
                      {editingEvent && !eventModalReadOnly ? (
                        <Pressable
                          onPress={() =>
                            editingEvent && confirmAndDeleteEvent(editingEvent)
                          }
                          style={eventFormStyles.iconBtn}
                          testID="delete-event-button"
                          accessibilityRole="button"
                          accessibilityLabel="Delete event"
                        >
                          <Trash2 size={15} color="#94A3B8" strokeWidth={2} />
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          setShowEventModal(false);
                          setEditingEvent(null);
                          setEventModalReadOnly(false);
                          setConfirmDeleteEvent(false);
                          setShowMeetingAssigneeDropdown(false);
                          setShowDurationPicker(false);
                          setShowEventPhotoPicker(false);
                          setShowEventStockPhotoSearch(false);
                        }}
                        hitSlop={8}
                      >
                        <X size={20} color="#94A3B8" strokeWidth={2.2} />
                      </Pressable>
                    </View>
                  </View>

                  {confirmDeleteEvent ? (
                    <View
                      style={{
                        marginHorizontal: 20,
                        marginBottom: 16,
                        backgroundColor: "#F8F9FC",
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: "#E4E8F0",
                        padding: 16,
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#FEECEC",
                        }}
                      >
                        <Trash2 size={17} color="#DC2626" strokeWidth={2.2} />
                      </View>
                      <View style={{ alignItems: "center", gap: 4 }}>
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "700",
                            color: "#172033",
                            textAlign: "center",
                          }}
                        >
                          Delete this event?
                        </Text>
                        <Text
                          style={{
                            maxWidth: 280,
                            fontSize: 12,
                            lineHeight: 17,
                            color: "#6F7B8F",
                            textAlign: "center",
                          }}
                        >
                          “{editingEvent?.title}” will be permanently removed.
                          This cannot be undone.
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Pressable
                          onPress={() => setConfirmDeleteEvent(false)}
                          style={{
                            minWidth: 112,
                            borderRadius: 11,
                            paddingVertical: 10,
                            alignItems: "center",
                            backgroundColor: "#EEF1F5",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: "#536075",
                            }}
                          >
                            Keep event
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            if (!access.canWrite || !editingEvent) return;
                            deleteEventMutation.mutate(editingEvent.id);
                          }}
                          disabled={deleteEventMutation.isPending}
                          style={{
                            minWidth: 112,
                            borderRadius: 11,
                            paddingVertical: 10,
                            alignItems: "center",
                            backgroundColor: "#DC2626",
                          }}
                          testID="confirm-delete-event-button"
                        >
                          {deleteEventMutation.isPending ? (
                            <ActivityIndicator color="white" size="small" />
                          ) : (
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "700",
                                color: "white",
                              }}
                            >
                              Delete event
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  <ScrollView
                    style={eventFormStyles.scroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    contentContainerStyle={eventFormStyles.scrollContent}
                  >
                    <View style={eventFormStyles.titleRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={eventFormStyles.fieldLabel}>Title</Text>
                        <TextInput
                          style={[
                            eventFormStyles.input,
                            { marginBottom: 0 },
                            eventModalReadOnly
                              ? eventFormStyles.inputDisabled
                              : null,
                          ]}
                          placeholder="Event title"
                          placeholderTextColor="#A8B3C7"
                          value={eventTitle}
                          onChangeText={(t) => {
                            setEventTitle(t);
                            setFormError(null);
                          }}
                          editable={!eventModalReadOnly}
                          testID="event-title-input"
                        />
                      </View>
                      <Pressable
                        onPress={pickEventPhoto}
                        disabled={eventModalReadOnly || eventImageUploading}
                        style={eventFormStyles.photoBtn}
                        testID="event-photo-button"
                      >
                        {eventImageUploading ? (
                          <ActivityIndicator size="small" color="#6d28d9" />
                        ) : eventImageUrl ? (
                          <Image
                            source={{ uri: eventImageUrl }}
                            style={eventFormStyles.photoImage}
                          />
                        ) : (
                          <>
                            <ImagePlus
                              size={18}
                              color="#6d28d9"
                              strokeWidth={2}
                            />
                            <Text style={eventFormStyles.photoHint}>Photo</Text>
                          </>
                        )}
                      </Pressable>
                    </View>

                    <Text style={eventFormStyles.fieldLabel}>
                      Description (optional)
                    </Text>
                    <TextInput
                      style={[
                        eventFormStyles.input,
                        eventFormStyles.textarea,
                        eventModalReadOnly
                          ? eventFormStyles.inputDisabled
                          : null,
                      ]}
                      placeholder="Add a description"
                      placeholderTextColor="#A8B3C7"
                      value={eventDescription}
                      onChangeText={setEventDescription}
                      multiline
                      editable={!eventModalReadOnly}
                    />

                    {eventModalType === "checkin" ? (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={eventFormStyles.sectionTitle}>Format</Text>
                        <View style={eventFormStyles.segment}>
                          {(
                            [
                              ["in_person", "In person"],
                              ["virtual", "Virtual"],
                            ] as const
                          ).map(([value, label]) => {
                            const selected = checkInFormat === value;
                            return (
                              <Pressable
                                key={value}
                                onPress={() => {
                                  if (eventModalReadOnly) return;
                                  setCheckInFormat(value);
                                  setFormError(null);
                                }}
                                disabled={eventModalReadOnly}
                                style={[
                                  eventFormStyles.segmentItem,
                                  selected
                                    ? eventFormStyles.segmentItemOn
                                    : null,
                                ]}
                                testID={`check-in-format-${value}`}
                              >
                                <Text
                                  style={[
                                    eventFormStyles.segmentText,
                                    selected
                                      ? eventFormStyles.segmentTextOn
                                      : null,
                                  ]}
                                >
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    {eventModalType === "event" && isOwnerOrLeader ? (
                      <View style={eventFormStyles.videoRow}>
                        <Video size={16} color="#6d28d9" strokeWidth={2} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={eventFormStyles.settingTitle}>
                            Video call
                          </Text>
                          <Text style={eventFormStyles.settingHint}>
                            Add a join link
                          </Text>
                        </View>
                        <Switch
                          value={eventIncludeVideo}
                          disabled={eventModalReadOnly}
                          onValueChange={(on) => {
                            if (eventModalReadOnly) return;
                            setEventIncludeVideo(on);
                            setShowEndPicker(false);
                            setShowEndTimePicker(false);
                            setShowDurationPicker(false);
                            setShowEventPhotoPicker(false);
                            setEventEnd(
                              videoMeetingEndFromDuration(
                                eventStart,
                                meetingDurationMinutes,
                              ),
                            );
                          }}
                          trackColor={{ false: "#E2E8F0", true: "#6d28d9" }}
                          thumbColor="white"
                          testID="event-video-toggle"
                        />
                      </View>
                    ) : null}

                    <Text style={eventFormStyles.sectionTitle}>Schedule</Text>
                    {eventUsesRange ? (
                      <View style={eventFormStyles.tileRow}>
                        <View style={{ flex: 1 }}>
                          <EventScheduleTile
                            icon={Calendar}
                            label="Start date"
                            value={eventStart.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                            open={showStartPicker}
                            disabled={eventModalReadOnly}
                            onPress={() => {
                              if (eventModalReadOnly) return;
                              setShowEndPicker(false);
                              setShowEndTimePicker(false);
                              setShowStartTimePicker(false);
                              setShowDurationPicker(false);
                              setShowEventPhotoPicker(false);
                              setShowStartPicker(true);
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <EventScheduleTile
                            icon={Calendar}
                            label="End date"
                            value={eventEnd.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                            open={showEndPicker}
                            disabled={eventModalReadOnly}
                            onPress={() => {
                              if (eventModalReadOnly) return;
                              setShowStartPicker(false);
                              setShowStartTimePicker(false);
                              setShowEndTimePicker(false);
                              setShowEndPicker(true);
                            }}
                          />
                        </View>
                      </View>
                    ) : (
                      <EventScheduleTile
                        icon={Calendar}
                        label="Date"
                        value={eventStart.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        open={showStartPicker}
                        disabled={eventModalReadOnly}
                        onPress={() => {
                          if (eventModalReadOnly) return;
                          setShowEndPicker(false);
                          setShowEndTimePicker(false);
                          setShowStartTimePicker(false);
                          setShowDurationPicker(false);
                          setShowEventPhotoPicker(false);
                          setShowStartPicker(true);
                        }}
                      />
                    )}
                    <View style={eventFormStyles.tileRow}>
                      <View style={{ flex: 1 }}>
                        <EventScheduleTile
                          icon={Clock}
                          label="Starts"
                          value={eventStart.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                          open={showStartTimePicker}
                          disabled={eventModalReadOnly}
                          onPress={() => {
                            if (eventModalReadOnly) return;
                            setShowStartTimePicker(!showStartTimePicker);
                            setShowEndTimePicker(false);
                            setShowDurationPicker(false);
                            setShowEventPhotoPicker(false);
                            setShowStartPicker(false);
                            setShowEndPicker(false);
                          }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <EventScheduleTile
                          icon={Clock}
                          label={eventUsesRange ? "Ends" : "Duration"}
                          value={
                            eventUsesRange
                              ? eventEnd.toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })
                              : formatVideoMeetingDuration(
                                  meetingDurationMinutes,
                                )
                          }
                          open={
                            eventUsesRange
                              ? showEndTimePicker
                              : showDurationPicker
                          }
                          disabled={eventModalReadOnly}
                          onPress={() => {
                            if (eventModalReadOnly) return;
                            setShowStartTimePicker(false);
                            setShowStartPicker(false);
                            setShowEndPicker(false);
                            if (eventUsesRange) {
                              setShowDurationPicker(false);
                              setShowEventPhotoPicker(false);
                              setShowEndTimePicker(!showEndTimePicker);
                            } else {
                              setShowEndTimePicker(false);
                              setShowDurationPicker(true);
                            }
                          }}
                        />
                      </View>
                    </View>
                    {!eventUsesRange ? (
                      <Text style={eventFormStyles.caption}>
                        Ends{" "}
                        {formatVideoMeetingEndPreview(
                          eventStart,
                          meetingDurationMinutes,
                        ).replace(/, ([^,]*)$/, " at $1")}
                      </Text>
                    ) : null}

                    {showStartPicker ? (
                      <View style={eventFormStyles.pickerCard}>
                        <View style={eventFormStyles.pickerToolbar}>
                          <Pressable onPress={() => setShowStartPicker(false)}>
                            <Text style={eventFormStyles.pickerCancel}>
                              Cancel
                            </Text>
                          </Pressable>
                          <Text style={eventFormStyles.pickerTitle}>
                            Start date
                          </Text>
                          <Pressable onPress={() => setShowStartPicker(false)}>
                            <Text style={eventFormStyles.pickerDone}>Done</Text>
                          </Pressable>
                        </View>
                        <DateTimePicker
                          value={eventStart}
                          mode="date"
                          display={
                            Platform.OS === "ios" ? "inline" : "calendar"
                          }
                          onChange={(e, d) => {
                            if (Platform.OS === "android")
                              setShowStartPicker(false);
                            if (e.type === "dismissed") return;
                            if (d) {
                              setEventStart((prev) => {
                                const next = applyDatePart(prev, d);
                                if (!eventUsesRange) {
                                  setEventEnd(
                                    videoMeetingEndFromDuration(
                                      next,
                                      meetingDurationMinutes,
                                    ),
                                  );
                                  return next;
                                }
                                setEventEnd((prevEnd) =>
                                  shiftEndKeepingLength(prev, next, prevEnd),
                                );
                                return next;
                              });
                            }
                          }}
                        />
                      </View>
                    ) : null}

                    {showEndPicker && eventUsesRange ? (
                      <View style={eventFormStyles.pickerCard}>
                        <View style={eventFormStyles.pickerToolbar}>
                          <Pressable onPress={() => setShowEndPicker(false)}>
                            <Text style={eventFormStyles.pickerCancel}>
                              Cancel
                            </Text>
                          </Pressable>
                          <Text style={eventFormStyles.pickerTitle}>
                            End date
                          </Text>
                          <Pressable onPress={() => setShowEndPicker(false)}>
                            <Text style={eventFormStyles.pickerDone}>Done</Text>
                          </Pressable>
                        </View>
                        <DateTimePicker
                          value={eventEnd}
                          mode="date"
                          display={
                            Platform.OS === "ios" ? "inline" : "calendar"
                          }
                          minimumDate={eventStart}
                          onChange={(e, d) => {
                            if (Platform.OS === "android")
                              setShowEndPicker(false);
                            if (e.type === "dismissed") return;
                            if (d) {
                              setEventEnd((prev) => {
                                const next = applyDatePart(prev, d);
                                return next <= eventStart
                                  ? hourAfter(eventStart)
                                  : next;
                              });
                            }
                          }}
                        />
                      </View>
                    ) : null}

                    {showStartTimePicker ? (
                      <View style={eventFormStyles.pickerCard}>
                        <View style={eventFormStyles.pickerToolbar}>
                          <Text style={eventFormStyles.pickerTitle}>
                            Start time
                          </Text>
                          <Pressable
                            onPress={() => setShowStartTimePicker(false)}
                          >
                            <Text style={eventFormStyles.pickerDone}>Done</Text>
                          </Pressable>
                        </View>
                        <DateTimePicker
                          value={eventStart}
                          mode="time"
                          display="spinner"
                          onChange={(e, d) => {
                            if (Platform.OS === "android")
                              setShowStartTimePicker(false);
                            if (e.type === "dismissed") return;
                            if (d) {
                              setEventStart((prev) => {
                                const n = applyTimePart(prev, d);
                                if (!eventUsesRange) {
                                  setEventEnd(
                                    videoMeetingEndFromDuration(
                                      n,
                                      meetingDurationMinutes,
                                    ),
                                  );
                                  return n;
                                }
                                setEventEnd((prevEnd) =>
                                  prevEnd <= n
                                    ? hourAfter(n)
                                    : shiftEndKeepingLength(prev, n, prevEnd),
                                );
                                return n;
                              });
                            }
                          }}
                          style={{ height: 216 }}
                        />
                      </View>
                    ) : null}

                    {showEndTimePicker && eventUsesRange ? (
                      <View style={eventFormStyles.pickerCard}>
                        <View style={eventFormStyles.pickerToolbar}>
                          <Text style={eventFormStyles.pickerTitle}>
                            End time
                          </Text>
                          <Pressable
                            onPress={() => setShowEndTimePicker(false)}
                          >
                            <Text style={eventFormStyles.pickerDone}>Done</Text>
                          </Pressable>
                        </View>
                        <DateTimePicker
                          value={eventEnd}
                          mode="time"
                          display="spinner"
                          onChange={(e, d) => {
                            if (Platform.OS === "android")
                              setShowEndTimePicker(false);
                            if (e.type === "dismissed") return;
                            if (d) {
                              setEventEnd((prev) => {
                                const n = applyTimePart(prev, d);
                                return n <= eventStart
                                  ? hourAfter(eventStart)
                                  : n;
                              });
                            }
                          }}
                          style={{ height: 216 }}
                        />
                      </View>
                    ) : null}

                    {eventIsHidden &&
                    (eventModalType !== "event" || eventIncludeVideo) ? (
                      <View style={{ marginBottom: 18 }}>
                        <Text style={eventFormStyles.fieldLabel}>
                          {eventModalType === "checkin"
                            ? "Team member"
                            : "Attendees"}
                        </Text>
                        <Text style={eventFormStyles.settingHint}>
                          {eventModalType === "checkin"
                            ? "Select the person this check-in is for."
                            : "Choose who can see this private meeting. Leave empty to keep it to yourself."}
                        </Text>
                        <Pressable
                          onPress={() => {
                            setShowStartTimePicker(false);
                            setShowDurationPicker(false);
                            setShowEventPhotoPicker(false);
                            setShowMeetingAssigneeDropdown(true);
                          }}
                          style={eventFormStyles.selectBtn}
                        >
                          <Text
                            style={eventFormStyles.selectBtnText}
                            numberOfLines={1}
                          >
                            {meetingAssigneeIds.length === 0
                              ? eventModalType === "checkin"
                                ? "Select team member"
                                : "Select attendees"
                              : eventModalType === "checkin"
                                ? selectedCheckInAssignee?.user.name?.trim() ||
                                  selectedCheckInAssignee?.user.email ||
                                  "Team member selected"
                                : allMeetingAssigneesSelected
                                  ? "All team members"
                                  : `${meetingAssigneeIds.length} attendee${meetingAssigneeIds.length === 1 ? "" : "s"} selected`}
                          </Text>
                          <ChevronDown size={16} color="#94A3B8" />
                        </Pressable>
                      </View>
                    ) : null}

                    {formError ? (
                      <Text style={eventFormStyles.errorText}>{formError}</Text>
                    ) : null}

                    {eventModalType === "event" ? (
                      <>
                        <Text style={eventFormStyles.sectionTitle}>
                          Event settings
                        </Text>
                        <Pressable
                          style={eventFormStyles.videoRow}
                          disabled={eventModalReadOnly}
                          onPress={() => {
                            if (eventModalReadOnly) return;
                            const nextHidden = !eventIsHidden;
                            setEventIsHidden(nextHidden);
                            if (!nextHidden) {
                              setMeetingAssigneeIds([]);
                              setShowMeetingAssigneeDropdown(false);
                            }
                          }}
                          testID="hidden-toggle"
                        >
                          <Users size={16} color="#6d28d9" strokeWidth={2} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={eventFormStyles.settingTitle}>
                              Visibility
                            </Text>
                            <Text style={eventFormStyles.settingHint}>
                              {!eventIsHidden
                                ? isOwnerOrLeader
                                  ? "Public · Whole team"
                                  : "Public · Needs approval"
                                : "Private · Only you"}
                            </Text>
                          </View>
                          <ChevronRight
                            size={14}
                            color="#C5CAD3"
                            strokeWidth={2.2}
                          />
                        </Pressable>
                      </>
                    ) : null}
                    {!eventModalReadOnly &&
                    !isOwnerOrLeader &&
                    eventModalType === "event" &&
                    !eventIsHidden ? (
                      <Text style={eventFormStyles.caption}>
                        Public events are sent to your team leader or owner for
                        approval.
                      </Text>
                    ) : null}
                  </ScrollView>
                  <View
                    style={[
                      eventFormStyles.footer,
                      { paddingBottom: Math.max(insets.bottom, 16) },
                    ]}
                  >
                    {eventModalReadOnly ? (
                      <TouchableOpacity
                        onPress={() => {
                          setShowEventModal(false);
                          setEditingEvent(null);
                          setEventModalReadOnly(false);
                          setConfirmDeleteEvent(false);
                        }}
                        style={eventFormStyles.secondaryBtn}
                        testID="close-event-details-button"
                      >
                        <Text style={eventFormStyles.secondaryBtnText}>
                          Close
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={handleSaveEvent}
                        disabled={
                          createEventMutation.isPending ||
                          updateEventMutation.isPending
                        }
                        style={eventFormStyles.primaryBtn}
                        testID="save-event-button"
                      >
                        {createEventMutation.isPending ||
                        updateEventMutation.isPending ? (
                          <ActivityIndicator color="white" />
                        ) : (
                          <Text style={eventFormStyles.primaryBtnText}>
                            {!isOwnerOrLeader && !eventIsHidden
                              ? "Submit for approval"
                              : editingEvent
                                ? eventModalType === "checkin"
                                  ? "Update check-in"
                                  : "Save event"
                                : eventModalType === "checkin"
                                  ? "Schedule check-in"
                                  : "Create event"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </Pressable>

                {/* Attendee / duration pickers as overlays inside the event modal (nested Modals break taps on iOS). */}
                {showMeetingAssigneeDropdown ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      justifyContent: "flex-end",
                      zIndex: 30,
                    }}
                  >
                    <Pressable
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.35)",
                      }}
                      onPress={() => setShowMeetingAssigneeDropdown(false)}
                    />
                    <View
                      style={{
                        backgroundColor: "white",
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        height: MEETING_ASSIGNEE_SHEET_MAX_HEIGHT,
                        paddingBottom: insets.bottom + 12,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#E2E8F0",
                          alignSelf: "center",
                          marginTop: 10,
                          marginBottom: 14,
                        }}
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingHorizontal: 20,
                          marginBottom: 14,
                          gap: 10,
                        }}
                      >
                        <Image
                          source={require("@/assets/alenio-icon.png")}
                          style={{ width: 30, height: 30, borderRadius: 8 }}
                          resizeMode="contain"
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              fontSize: 17,
                              fontWeight: "700",
                              color: "#0F172A",
                            }}
                          >
                            {eventModalType === "checkin"
                              ? "Select team member"
                              : "Assign members"}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: "#94A3B8",
                              marginTop: 3,
                              lineHeight: 17,
                            }}
                            numberOfLines={2}
                          >
                            {eventModalType === "checkin"
                              ? "Choose the person this check-in will be saved for."
                              : "Choose who can see this private meeting. You are included automatically."}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setShowMeetingAssigneeDropdown(false)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: "#F1F5F9",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <X size={16} color="#64748B" />
                        </Pressable>
                      </View>
                      {eventModalType !== "checkin" ? (
                        <TouchableOpacity
                          onPress={toggleAllMeetingAssignees}
                          activeOpacity={0.7}
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
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: "#6d28d9",
                              fontWeight: "700",
                            }}
                          >
                            {allMeetingAssigneesSelected
                              ? "Deselect all"
                              : "Select all"}
                          </Text>
                          {allMeetingAssigneesSelected ? (
                            <Check size={16} color="#6d28d9" />
                          ) : null}
                        </TouchableOpacity>
                      ) : null}
                      <ScrollView
                        style={{ flex: 1, minHeight: 0 }}
                        contentContainerStyle={{
                          paddingHorizontal: 20,
                          paddingBottom: 8,
                        }}
                        showsVerticalScrollIndicator
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        bounces
                      >
                        {assigneePickerOptions.length === 0 ? (
                          <View
                            style={{
                              paddingVertical: 24,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                color: "#94A3B8",
                                textAlign: "center",
                              }}
                            >
                              No team members found.
                            </Text>
                          </View>
                        ) : (
                          assigneePickerOptions.map((member, idx) => {
                            const selected = meetingAssigneeIds.includes(
                              member.userId,
                            );
                            const label =
                              member.user.name?.trim() ||
                              member.user.email ||
                              "Team member";
                            return (
                              <TouchableOpacity
                                key={member.userId}
                                activeOpacity={0.7}
                                onPress={() => {
                                  setMeetingAssigneeIds((prev) =>
                                    eventModalType === "checkin"
                                      ? prev.includes(member.userId)
                                        ? []
                                        : [member.userId]
                                      : prev.includes(member.userId)
                                        ? prev.filter(
                                            (id) => id !== member.userId,
                                          )
                                        : [...prev, member.userId],
                                  );
                                  if (
                                    eventModalType === "checkin" &&
                                    (!eventTitle.trim() ||
                                      eventTitle.trim() === "Check-in")
                                  ) {
                                    setEventTitle(`Check-in — ${label}`);
                                  }
                                  setFormError(null);
                                }}
                                style={{
                                  paddingVertical: 12,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  borderBottomWidth:
                                    idx === assigneePickerOptions.length - 1
                                      ? 0
                                      : 1,
                                  borderBottomColor: "#F1F5F9",
                                }}
                              >
                                <View
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 10,
                                  }}
                                >
                                  <UserAvatar
                                    user={member.user}
                                    size={32}
                                    radius={16}
                                    backgroundColor="#EFE9FF"
                                    textColor="#6d28d9"
                                    fontSize={12}
                                  />
                                  <Text
                                    style={{
                                      fontSize: 15,
                                      color: "#334155",
                                      fontWeight: selected ? "700" : "500",
                                      flex: 1,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {label}
                                  </Text>
                                </View>
                                {selected ? (
                                  <Check size={16} color="#6d28d9" />
                                ) : (
                                  <View style={{ width: 16, height: 16 }} />
                                )}
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </ScrollView>
                      <TouchableOpacity
                        onPress={() => setShowMeetingAssigneeDropdown(false)}
                        activeOpacity={0.85}
                        testID="meeting-assignees-done"
                        style={{
                          marginHorizontal: 20,
                          marginTop: 8,
                          backgroundColor: "#6d28d9",
                          borderRadius: 14,
                          paddingVertical: 14,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: "white",
                            fontSize: 15,
                            fontWeight: "700",
                          }}
                        >
                          Done
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {showEventPhotoPicker ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      justifyContent: "flex-end",
                      zIndex: 32,
                    }}
                  >
                    <Pressable
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.35)",
                      }}
                      onPress={() => setShowEventPhotoPicker(false)}
                    />
                    <View
                      style={{
                        backgroundColor: "white",
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        paddingBottom: insets.bottom + 12,
                        paddingHorizontal: 16,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#E2E8F0",
                          alignSelf: "center",
                          marginTop: 10,
                          marginBottom: 12,
                        }}
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 12,
                        }}
                      >
                        <Image
                          source={require("@/assets/alenio-icon.png")}
                          style={{ width: 28, height: 28, borderRadius: 7 }}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "700",
                              color: "#0F172A",
                            }}
                          >
                            Event photo
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: "#94A3B8",
                              marginTop: 1,
                            }}
                          >
                            Add a photo for this event
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setShowEventPhotoPicker(false)}
                          hitSlop={8}
                        >
                          <X size={18} color="#94A3B8" strokeWidth={2.2} />
                        </Pressable>
                      </View>
                      <View style={{ gap: 8 }}>
                        <AlenioSheetOption
                          icon={<ImagePlus size={16} color="white" />}
                          title="Photo library"
                          subtitle="Choose an existing photo"
                          onPress={() => {
                            setShowEventPhotoPicker(false);
                            void uploadEventPhoto("library");
                          }}
                        />
                        <AlenioSheetOption
                          icon={<Camera size={16} color="white" />}
                          iconColor="#7C3AED"
                          tint="purple"
                          title="Camera"
                          subtitle="Take a new photo"
                          onPress={() => {
                            setShowEventPhotoPicker(false);
                            void uploadEventPhoto("camera");
                          }}
                        />
                        <AlenioSheetOption
                          icon={<Globe2 size={16} color="white" />}
                          iconColor="#0F766E"
                          tint="slate"
                          title="Search free photos"
                          subtitle="Public photos that are free to use"
                          onPress={() => {
                            setShowEventPhotoPicker(false);
                            setShowEventStockPhotoSearch(true);
                          }}
                        />
                        {eventImageUrl ? (
                          <AlenioSheetOption
                            icon={<Trash2 size={16} color="white" />}
                            destructive
                            title="Remove photo"
                            subtitle="This event will have no photo"
                            onPress={() => {
                              setEventImageUrl(null);
                              setShowEventPhotoPicker(false);
                            }}
                          />
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => setShowEventPhotoPicker(false)}
                        style={[
                          alenioSheetStyles.cancelButton,
                          { marginTop: 8 },
                        ]}
                      >
                        <Text style={alenioSheetStyles.cancelButtonText}>
                          Cancel
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {showDurationPicker ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      justifyContent: "flex-end",
                      zIndex: 30,
                    }}
                  >
                    <Pressable
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.35)",
                      }}
                      onPress={() => setShowDurationPicker(false)}
                    />
                    <View
                      style={{
                        backgroundColor: "white",
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        maxHeight: MEETING_DURATION_SHEET_MAX_HEIGHT,
                        paddingBottom: insets.bottom + 12,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#E2E8F0",
                          alignSelf: "center",
                          marginTop: 10,
                          marginBottom: 14,
                        }}
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingHorizontal: 20,
                          marginBottom: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 17,
                            fontWeight: "700",
                            color: "#0F172A",
                          }}
                        >
                          Duration
                        </Text>
                        <Pressable
                          onPress={() => setShowDurationPicker(false)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: "#F1F5F9",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <X size={16} color="#64748B" />
                        </Pressable>
                      </View>
                      <ScrollView
                        style={{
                          maxHeight: MEETING_DURATION_SHEET_MAX_HEIGHT - 120,
                        }}
                        contentContainerStyle={{
                          paddingHorizontal: 20,
                          paddingBottom: 8,
                        }}
                        showsVerticalScrollIndicator
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                      >
                        {VIDEO_MEETING_DURATION_OPTIONS.map((minutes, idx) => (
                          <TouchableOpacity
                            key={minutes}
                            activeOpacity={0.7}
                            onPress={() => {
                              setMeetingDurationMinutes(minutes);
                              setShowDurationPicker(false);
                              setShowEventPhotoPicker(false);
                            }}
                            style={{
                              paddingVertical: 14,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              borderBottomWidth:
                                idx ===
                                VIDEO_MEETING_DURATION_OPTIONS.length - 1
                                  ? 0
                                  : 1,
                              borderBottomColor: "#F1F5F9",
                              backgroundColor:
                                meetingDurationMinutes === minutes
                                  ? "#EFE9FF"
                                  : "transparent",
                              borderRadius:
                                meetingDurationMinutes === minutes ? 10 : 0,
                              paddingHorizontal:
                                meetingDurationMinutes === minutes ? 12 : 0,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 15,
                                fontWeight:
                                  meetingDurationMinutes === minutes
                                    ? "700"
                                    : "500",
                                color:
                                  meetingDurationMinutes === minutes
                                    ? "#6d28d9"
                                    : "#0F172A",
                              }}
                            >
                              {formatVideoMeetingDuration(minutes)}
                            </Text>
                            {meetingDurationMinutes === minutes ? (
                              <Check size={16} color="#6d28d9" />
                            ) : null}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                ) : null}
              </SafeKeyboardAvoidingView>
              <EventStockPhotoSearch
                visible={showEventStockPhotoSearch}
                initialQuery={eventTitle}
                bottomInset={insets.bottom}
                onClose={() => setShowEventStockPhotoSearch(false)}
                onSelect={(photo) => {
                  setEventImageUrl(photo.url);
                  setShowEventStockPhotoSearch(false);
                }}
              />
            </View>
          </Modal>

          <StreakCelebrationModal
            visible={!!milestoneModal}
            count={milestoneModal?.count ?? null}
            userName={milestoneModal?.userName ?? "You"}
            onClose={() => setMilestoneModal(null)}
          />

          <StreakCelebrationModal
            visible={!!personalBestModal && !milestoneModal}
            count={personalBestModal?.count ?? null}
            userName={personalBestModal?.userName ?? "You"}
            personalBest
            onClose={() => setPersonalBestModal(null)}
          />
        </>
      }
    >
      <View style={{ flex: 1, minHeight: 0, backgroundColor: WS.pageBg }}>
        <WorkspaceViewToggle
          mode={workspaceMode}
          onChange={(next) => {
            if (next !== "development") lastWorkspaceTabRef.current = next;
            // The tab always lands on the people directory; a member left open
            // from a previous visit would otherwise reappear instead.
            else {
              setDevelopmentFocus(null);
            }
            setWorkspaceMode(next);
          }}
          calendarBadge={calendarBadge}
          tasksBadge={tasksBadge}
        />
        <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ flex: 1 }}>
          {workspaceMode === "overview" ? (
            <WorkspaceOverviewPage
              bottomInset={workspacePageBottom}
              hero={<WorkspaceOverviewCard workspaceName={activeTeamName} />}
              quickActions={
                <WorkspaceOverviewQuickActions
                  canScheduleEvent={access.canWrite}
                  canCreateTask={access.canWrite}
                  canPostUpdate={access.canWrite}
                  canOpenSettings={Boolean(
                    activeTeamId && isOwnerOrLeader && access.canWrite,
                  )}
                  onScheduleEvent={() => {
                    if (!access.canWrite) return;
                    if (isOwnerOrLeader) openEventModal();
                    else openPersonalEventModal();
                  }}
                  onCreateTask={() => {
                    if (!access.canWrite || !activeTeamId) return;
                    router.push({
                      pathname: "/create-task",
                      params: {
                        teamId: activeTeamId,
                        initialDueDate: selectedDay ?? toLocalIso(new Date()),
                        kind: isOwnerOrLeader ? "workspace_task" : "reminder",
                      },
                    });
                  }}
                  onPostUpdate={() => {
                    if (!access.canWrite || !activeTeamId) return;
                    router.push({
                      pathname: "/create-post",
                      params: { teamId: activeTeamId },
                    });
                  }}
                  onWorkspaceSettings={() => {
                    if (!activeTeamId || !isOwnerOrLeader || !access.canWrite)
                      return;
                    router.push({
                      pathname: "/workspace-settings",
                      params: { teamId: activeTeamId },
                    });
                  }}
                />
              }
              pulse={
                <WorkspaceOverviewPulse
                  memberCount={teamMembers.length}
                  openTaskCount={taskCount}
                  upcomingEventCount={upcomingEventCount}
                  onPressMembers={() => {
                    setDevelopmentFocus(null);
                    setWorkspaceMode("development");
                  }}
                  onPressTasks={() => {
                    lastWorkspaceTabRef.current = "tasks";
                    setWorkspaceMode("tasks");
                  }}
                  onPressEvents={() => {
                    lastWorkspaceTabRef.current = "calendar";
                    setWorkspaceMode("calendar");
                  }}
                />
              }
              upcomingEvents={
                <WorkspaceOverviewUpcomingEvents
                  events={calendarEvents}
                  onViewCalendar={() => {
                    lastWorkspaceTabRef.current = "calendar";
                    setWorkspaceMode("calendar");
                  }}
                  onEventPress={(event) => {
                    openEventPreview(event);
                  }}
                />
              }
              recentUpdates={
                <WorkspaceOverviewRecentUpdates
                  teamId={activeTeamId}
                  onViewAll={() => {
                    if (!activeTeamId) return;
                    router.push({
                      pathname: "/workspace-activity",
                      params: { teamId: activeTeamId },
                    });
                  }}
                  onPressItem={(item: ActivityFeedItem) => {
                    if (!activeTeamId) return;
                    if (item.type === "post" || item.type === "celebration") {
                      router.push({
                        pathname: "/update-detail",
                        params: {
                          teamId: activeTeamId,
                          activityId: item.id,
                        },
                      });
                      return;
                    }
                    if (item.type === "task_milestone") {
                      const taskId = item.metadata.taskId;
                      if (taskId) {
                        router.push({
                          pathname: "/task-detail",
                          params: { taskId, teamId: activeTeamId },
                        });
                      }
                      return;
                    }
                    if (item.type === "calendar_event_added") {
                      const eventId =
                        item.metadata.eventId ?? item.metadata.eventIds?.[0];
                      const match = eventId
                        ? calendarEvents.find((event) => event.id === eventId)
                        : null;
                      if (match) openEventPreview(match);
                      else {
                        lastWorkspaceTabRef.current = "calendar";
                        setWorkspaceMode("calendar");
                      }
                      return;
                    }
                    if (
                      item.type === "development_goal_completed" ||
                      item.type === "check_in_completed"
                    ) {
                      const userId =
                        item.metadata.memberUserId ??
                        item.metadata.targetUserId ??
                        null;
                      if (userId) {
                        setDevelopmentFocus({
                          userId,
                          section:
                            item.type === "check_in_completed"
                              ? "check-ins"
                              : "goals",
                        });
                      }
                      setWorkspaceMode("development");
                      return;
                    }
                    if (item.type === "member_joined") {
                      setDevelopmentFocus(null);
                      setWorkspaceMode("development");
                    }
                  }}
                />
              }
              teamDevelopment={
                <WorkspaceOverviewTeamDevelopment
                  variant={isOwnerOrLeader ? "team" : "personal"}
                  checkInsOnTrackPercent={
                    isOwnerOrLeader
                      ? overviewDevStats.checkInsOnTrackPercent
                      : personalOverviewDev.checkInsOnTrackPercent
                  }
                  goalsOnTrackPercent={
                    isOwnerOrLeader
                      ? overviewDevStats.goalsOnTrackPercent
                      : personalOverviewDev.goalsOnTrackPercent
                  }
                  onTrackCount={overviewDevStats.onTrackCount}
                  needsAttentionCount={overviewDevStats.needsAttentionCount}
                  notStartedCount={overviewDevStats.notStartedCount}
                  personalStatus={
                    isOwnerOrLeader ? null : personalOverviewDev.status
                  }
                  onPressViewMembers={() => {
                    if (!isOwnerOrLeader && currentUserId) {
                      setDevelopmentFocus({
                        userId: currentUserId,
                        section: "check-ins",
                      });
                    } else {
                      setDevelopmentFocus(null);
                    }
                    openMembers();
                  }}
                  onPressCheckIns={() => {
                    const preferred =
                      (!isOwnerOrLeader && currentUserId
                        ? teamMembers.find(
                            (member) => member.userId === currentUserId,
                          )
                        : null) ?? teamMembers[0];
                    if (preferred) {
                      setDevelopmentFocus({
                        userId: preferred.userId,
                        section: "check-ins",
                      });
                    } else {
                      setDevelopmentFocus(null);
                    }
                    openMembers();
                  }}
                  onPressGoals={() => {
                    const preferred =
                      (!isOwnerOrLeader && currentUserId
                        ? teamMembers.find(
                            (member) => member.userId === currentUserId,
                          )
                        : null) ?? teamMembers[0];
                    if (preferred) {
                      setDevelopmentFocus({
                        userId: preferred.userId,
                        section: "goals",
                      });
                    } else {
                      setDevelopmentFocus(null);
                    }
                    openMembers();
                  }}
                />
              }
            />
          ) : workspaceMode === "development" ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                paddingBottom: workspacePageBottom,
              }}
              testID="workspace-development-page"
            >
              {activeTeamId ? (
                <View
                  style={{
                    flex: 1,
                    minHeight: 0,
                    flexDirection: "row",
                    paddingBottom: 10,
                    paddingLeft: showSplitMembers
                      ? adaptive.contentPadLeft
                      : 0,
                    paddingRight: showSplitMembers
                      ? adaptive.contentPadRight
                      : 0,
                  }}
                >
                  {showSplitMembers ? (
                    <View
                      key="members-roster-pane"
                      style={{ width: rosterPaneWidth, minHeight: 0 }}
                      testID="members-roster-pane"
                    >
                      <View style={splitPaneCard}>{membersRoster}</View>
                    </View>
                  ) : null}
                  <View
                    key="members-detail-pane"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 0,
                      paddingLeft: showSplitMembers ? PANE_GAP : 0,
                    }}
                    testID="members-detail-pane"
                  >
                    <View
                      style={
                        showSplitMembers
                          ? splitPaneCard
                          : { flex: 1, minHeight: 0 }
                      }
                    >
                      {memberDetail ??
                        (showSplitMembers ? (
                          <View
                            style={{
                              flex: 1,
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 24,
                            }}
                            testID="members-detail-empty"
                          >
                            <Text
                              style={{
                                fontSize: 15,
                                fontWeight: "700",
                                color: "#160f2e",
                                textAlign: "center",
                              }}
                            >
                              Select a member
                            </Text>
                            <Text
                              style={{
                                marginTop: 6,
                                fontSize: 13,
                                lineHeight: 18,
                                color: "#6b6580",
                                textAlign: "center",
                              }}
                            >
                              Their goals and check-ins open here.
                            </Text>
                          </View>
                        ) : (
                          membersRoster
                        ))}
                    </View>
                  </View>
                </View>
              ) : (
                <ActivityIndicator
                  color="#6d28d9"
                  style={{ marginTop: 32 }}
                />
              )}
            </View>
          ) : workspaceMode === "calendar" ? (
            <View
              /**
               * Each tab's page sits in the same slot of this chain, so without
               * a key React reuses one mode's views for the next and a pane can
               * inherit a width that belonged to another layout.
               */
              key="workspace-calendar-page"
              style={{
                flex: 1,
                minHeight: 0,
                paddingBottom: workspacePageBottom,
                /**
                 * Only the split layout positions its own panes, and it uses
                 * per-edge padding because the Duo's system bar makes the
                 * horizontal insets asymmetric. The stacked layout keeps each
                 * card's own gutter so phones are untouched.
                 */
                paddingLeft:
                  splitCalendar || calendarUsesDaySheet
                    ? adaptive.contentPadLeft
                    : 0,
                paddingRight:
                  splitCalendar || calendarUsesDaySheet
                    ? adaptive.contentPadRight
                    : 0,
              }}
            >
              <View
                style={{
                  flex: 1,
                  minHeight: 0,
                  flexDirection: splitCalendar ? "row" : "column",
                  gap: splitCalendar ? PANE_GAP : 0,
                }}
                collapsable={false}
                onLayout={(event) => {
                  const { width: rowWidth, height: rowHeight } =
                    event.nativeEvent.layout;
                  /**
                   * What the calendar really has to work with, which the window
                   * height cannot say: the header, the tab row and At a Glance
                   * have already taken their share by this point.
                   */
                  const measuredHeight = Math.round(rowHeight);
                  setCalendarAreaHeight((current) =>
                    current === measuredHeight ? current : measuredHeight,
                  );
                  if (!splitCalendar) return;
                  event.currentTarget.measureInWindow((windowX) => {
                    setCalendarRowFrame((current) =>
                      current?.x === windowX && current?.width === rowWidth
                        ? current
                        : { x: windowX, width: rowWidth },
                    );
                  });
                }}
              >
                <View
                  key="calendar-grid-pane"
                  style={{
                    /**
                     * The split divides the row by share rather than pinning a
                     * width. The ratio puts the divider in the same place a
                     * fixed width would, and an out-of-date measurement moves
                     * it slightly instead of collapsing the pane to nothing.
                     */
                    flexGrow: splitCalendar
                      ? gridPaneShare
                      : calendarCardFillsArea
                        ? 1
                        : 0,
                    flexShrink: splitCalendar
                      ? 1
                      : calendarCardFillsArea
                        ? 1
                        : 0,
                    flexBasis: splitCalendar ? 0 : undefined,
                    minWidth: splitCalendar ? 0 : undefined,
                    minHeight:
                      splitCalendar || calendarCardFillsArea ? 0 : undefined,
                  }}
                >
                  <CalendarCard
                    expanded={splitCalendar || calendarCardFillsArea}
                    insetHorizontal={splitCalendar ? 0 : calendarGutter}
                    tasks={visibleDatedTasks}
                    events={calendarEventsWithOutlook}
                    members={teamMembers}
                    holidays={holidays}
                    selectedDay={selectedDay}
                    onSelectDay={handleSelectDay}
                    viewYear={calendarYear}
                    viewMonth={calendarMonth}
                    onViewMonthChange={handleViewMonthChange}
                    displayMode={calendarDisplayMode}
                    onDisplayModeChange={setCalendarModeChoice}
                    onAddPress={
                      access.canWrite ? openWorkspaceCreate : undefined
                    }
                  >
                    {calendarDisplayMode === "week" ? (
                      <ScrollView
                        style={{ flex: 1, minHeight: 0 }}
                        contentContainerStyle={{ paddingBottom: 16 }}
                        showsVerticalScrollIndicator={false}
                        testID="calendar-week-agenda"
                      >
                        {weekAgendaIsos.map((iso) => {
                          const dayDate = new Date(`${iso}T12:00:00`);
                          const isSelected = iso === selectedDay;
                          const events = eventsOnLocalIso(
                            calendarEventsWithOutlook,
                            iso,
                          );
                          const dayHolidayList = holidaysOnLocalIso(
                            holidays,
                            iso,
                          );
                          const tasks = tasksOnIso(iso);
                          const count =
                            events.length +
                            dayHolidayList.length +
                            tasks.length;
                            const heading = dayDate.toLocaleDateString(
                              "en-US",
                              {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                              },
                            );
                          return (
                            <View key={iso} style={{ marginTop: 12 }}>
                              <Pressable
                                onPress={() => handleSelectDay(iso)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isSelected }}
                              >
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: "700",
                                    color: isSelected ? "#6d28d9" : "#0F172A",
                                    letterSpacing: -0.2,
                                  }}
                                >
                                  {heading}
                                </Text>
                              </Pressable>
                              {count === 0 ? (
                                <Text
                                  style={{
                                    marginTop: 4,
                                    fontSize: 12,
                                    color: "#94A3B8",
                                  }}
                                >
                                  Nothing scheduled
                                </Text>
                              ) : (
                                <EventsSection
                                  dayEvents={events}
                                  dayHolidays={dayHolidayList}
                                  dayTasks={tasks}
                                  members={teamMembers}
                                  selectedDayIso={iso}
                                  variant="dayList"
                                  embedded
                                  scrollEnabled={false}
                                  canManageEvent={canManageEvent}
                                  onEventPress={openEventPreview}
                                  onEventLongPress={openEventActions}
                                  onTaskPress={openScheduleTask}
                                  onToggleTask={openScheduleTask}
                                  onTaskLongPress={(task) => {
                                    if (!canManageTaskMenu(task)) return;
                                      openTaskDetails(task, {
                                        startEdit: true,
                                      });
                                  }}
                                  onAddEvent={
                                    access.canWrite
                                      ? openWorkspaceCreate
                                      : undefined
                                  }
                                  isOwnerOrLeader={isOwnerOrLeader}
                                />
                              )}
                            </View>
                          );
                        })}
                      </ScrollView>
                    ) : null}
                  </CalendarCard>
                </View>
                {splitCalendar ? (
                  <View
                    key="calendar-day-pane"
                    testID="calendar-day-pane"
                    style={{
                      flexGrow: detailPaneShare,
                      flexShrink: 1,
                      flexBasis: 0,
                      minWidth: 0,
                      minHeight: 0,
                      marginTop: 2,
                    }}
                  >
                    <View style={splitPaneCard}>
                      {openTaskId && activeTeamId ? (
                        <TaskDetail
                          key={openTaskId}
                          taskId={openTaskId}
                          teamId={activeTeamId}
                          onClose={() => setOpenTaskId(null)}
                          onSelectTask={setOpenTaskId}
                        />
                      ) : selectedDay ? (
                        <View
                          style={{
                            flex: 1,
                            minHeight: 0,
                            paddingHorizontal: 12,
                            paddingTop: 4,
                          }}
                        >
                          {dayPaneHeader}
                            <View style={{ flex: 1, minHeight: 0 }}>
                              {dayPaneList}
                            </View>
                        </View>
                      ) : (
                        <View
                          style={{
                            flex: 1,
                            minHeight: 0,
                            alignItems: "center",
                            justifyContent: "center",
                            paddingHorizontal: 24,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "600",
                              color: "#64748B",
                              textAlign: "center",
                            }}
                          >
                            Select a day to see its schedule
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          ) : showMemberTasksEmpty ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                paddingBottom: workspacePageBottom,
                paddingHorizontal: WS.pageGutter,
                backgroundColor: WS.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
              }}
            >
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#6d28d9"
                    colors={["#6d28d9"]}
                  />
                }
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                  paddingTop: 4,
                  paddingBottom: 8,
                }}
              >
                <MemberTasksEmptyState />
              </ScrollView>
            </View>
          ) : (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                flexDirection: showTaskDetailPane ? "row" : "column",
              }}
            >
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  ...(showTaskDetailPane
                    ? {
                        paddingLeft: WS.pageGutter,
                        paddingBottom: workspacePageBottom,
                      }
                    : null),
                }}
              >
                  <View
                    style={
                      showTaskDetailPane
                        ? splitPaneCard
                        : { flex: 1, minHeight: 0 }
                    }
                  >
                <View
                  style={{
                    flexShrink: 0,
                        paddingHorizontal: showTaskDetailPane
                          ? 12
                          : WS.pageGutter,
                    paddingTop: 6,
                    paddingBottom: 4,
                    backgroundColor: WS.pageBg,
                  }}
                >
                  <TaskShowingRow
                    filters={filters}
                    searchQuery={taskSearchQuery}
                    onChangeSearch={setTaskSearchQuery}
                    onOpenFilterView={() => setFilterPicker("filterView")}
                    canCreateTask={access.canWrite}
                    createLabel="Task"
                    onCreateTask={() => {
                      if (!access.canWrite || !activeTeamId) return;
                      router.push({
                        pathname: "/create-task",
                        params: {
                          teamId: activeTeamId,
                              initialDueDate:
                                selectedDay ?? toLocalIso(new Date()),
                              kind: isOwnerOrLeader
                                ? "workspace_task"
                                : "reminder",
                        },
                      });
                    }}
                  />
                </View>

                <View
                  style={{
                    flex: 1,
                    minHeight: 140,
                    paddingHorizontal: showTaskDetailPane
                      ? 12
                      : WS.pageGutter,
                    paddingBottom: showTaskDetailPane
                      ? 8
                      : workspacePageBottom,
                  }}
                >
                  <ScrollView
                    style={{ flex: 1 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#6d28d9"
                        colors={["#6d28d9"]}
                      />
                    }
                    contentContainerStyle={{
                      flexGrow: 1,
                      justifyContent:
                        showTasksListEmpty && !showTasksWelcome
                          ? "center"
                          : "flex-start",
                      paddingBottom: 8,
                    }}
                  >
                    <TaskListCard
                      sections={taskListSections}
                      raisedSections={!showTaskDetailPane}
                      loading={showTasksLoading}
                      loadError={tasksLoadError}
                      onRetry={() => void refetchActiveTasks()}
                      currentUserId={currentUserId}
                          selectedTaskId={
                            showTaskDetailPane ? openTaskId : null
                          }
                      onToggle={openTaskDetails}
                      onPress={openTaskDetails}
                          onAssigneesPress={(task) =>
                            setAssigneesSheetTask(task)
                          }
                      onLongPress={(task) => {
                        if (!canManageTaskMenu(task)) return;
                        openTaskDetails(task, { startEdit: true });
                      }}
                      emptyWelcome={showTasksWelcome}
                      emptyTitle={
                        taskSearchQuery.trim()
                          ? "No tasks"
                          : filters.statusTab === "archived"
                            ? "No archived tasks"
                            : filters.statusTab === "completed"
                              ? "Nothing completed"
                              : filters.dueDate === "calendar_day"
                                ? "No active tasks"
                                : "No tasks yet"
                      }
                      emptyAccentTitle={
                        taskSearchQuery.trim()
                          ? "found."
                          : filters.statusTab === "archived"
                            ? "yet."
                            : filters.statusTab === "completed"
                              ? filters.dueDate === "calendar_day"
                                ? "for this day."
                                : "yet."
                              : filters.dueDate === "calendar_day"
                                ? "for this day."
                                : "caught up."
                      }
                      emptySubtitle={
                        taskSearchQuery.trim()
                          ? "Try a different task name or adjust your filters."
                          : filters.statusTab === "archived"
                            ? "Completed tasks move here after 30 days."
                                : filters.dueDate === "calendar_day" &&
                                    selectedDay
                              ? "Try viewing upcoming tasks or adjust your filters."
                              : filters.statusTab === "completed"
                                ? "Completed work from the last 30 days shows here."
                                : filters.assignedTo === "me"
                                  ? "Nothing is assigned to you right now."
                                  : filters.assignedTo === "entire_team"
                                    ? "No one on the team has a task here yet."
                                    : typeof filters.assignedTo === "object"
                                      ? `Nothing is assigned to ${filters.assignedTo.memberName}.`
                                      : "Nothing matches this filter."
                      }
                      emptyActionLabel={
                        !taskSearchQuery.trim() &&
                        filters.dueDate === "calendar_day"
                          ? "View upcoming tasks"
                          : !taskSearchQuery.trim() &&
                              filters.statusTab === "active" &&
                              access.canWrite
                            ? "Create a Task"
                            : undefined
                      }
                      onEmptyAction={
                        !taskSearchQuery.trim() &&
                        filters.dueDate === "calendar_day"
                              ? () =>
                                  setFilters((f) => ({ ...f, dueDate: "all" }))
                          : !taskSearchQuery.trim() &&
                              filters.statusTab === "active" &&
                              access.canWrite &&
                              activeTeamId
                            ? () => {
                                router.push({
                                  pathname: "/create-task",
                                  params: {
                                    teamId: activeTeamId,
                                    initialDueDate: selectedDay ?? toLocalIso(new Date()),
                                    kind: isOwnerOrLeader ? "workspace_task" : "reminder",
                                  },
                                });
                              }
                            : undefined
                      }
                      footer={
                        nextCursor !== null ? (
                          <Pressable
                            onPress={handleLoadMore}
                            style={{
                              margin: 12,
                              marginTop: 0,
                              paddingVertical: 12,
                              borderRadius: 10,
                              alignItems: "center",
                              backgroundColor: "#EFE9FF",
                              flexDirection: "row",
                              justifyContent: "center",
                              gap: 8,
                            }}
                            testID="load-more-button"
                            disabled={loadingMore}
                          >
                            {loadingMore ? (
                              <ActivityIndicator
                                size="small"
                                color="#6d28d9"
                                testID="load-more-indicator"
                              />
                            ) : null}
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "600",
                                color: "#6d28d9",
                              }}
                            >
                              {loadingMore ? "Loading..." : "Load more tasks"}
                            </Text>
                          </Pressable>
                        ) : null
                      }
                    />
                  </ScrollView>
                </View>
                </View>
              </View>
              {showTaskDetailPane ? (
                <View
                  style={{
                    /**
                     * The shared width is the pane's card, so the gap and the
                     * page gutter are added on top of it rather than eaten out
                     * of it — otherwise this divider sits a gutter off the ones
                     * on the other tabs.
                     */
                    width: taskDetailPaneWidth + PANE_GAP + WS.pageGutter,
                    alignSelf: "stretch",
                    flexShrink: 0,
                    minHeight: 0,
                    paddingRight: WS.pageGutter,
                    paddingLeft: PANE_GAP,
                    paddingBottom: workspacePageBottom,
                  }}
                  testID="task-detail-pane"
                >
                  <View style={splitPaneCard}>
                    {openTaskId && activeTeamId ? (
                      <TaskDetail
                        key={openTaskId}
                        taskId={openTaskId}
                        teamId={activeTeamId}
                        onClose={() => setOpenTaskId(null)}
                        onSelectTask={setOpenTaskId}
                      />
                    ) : (
                      <View
                        style={{
                          flex: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: 24,
                          gap: 8,
                        }}
                        testID="task-detail-pane-empty"
                      >
                        <CheckSquare
                          size={26}
                          color="#C3CBD8"
                          strokeWidth={2}
                        />
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            letterSpacing: -0.2,
                            color: "#475467",
                          }}
                        >
                          No task selected
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            lineHeight: 16,
                            fontWeight: "500",
                            color: "#98A2B3",
                            textAlign: "center",
                          }}
                        >
                          Pick a task from the list to see its details here.
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>
        </View>
      </View>
    </CurvedTabLayout>
  );
}

const eventFormStyles = StyleSheet.create({
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    flexShrink: 1,
    overflow: "hidden",
  },
  sheetDialog: {
    maxWidth: 460,
    maxHeight: "88%",
    borderRadius: 22,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 18,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginTop: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 12,
  },
  headerLogo: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F6FB",
  },
  scroll: {
    paddingHorizontal: 16,
    flexShrink: 1,
  },
  scrollContent: {
    paddingTop: 6,
    paddingBottom: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: 10,
  },
  photoBtn: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#F4F6FB",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImage: {
    width: 56,
    height: 56,
  },
  photoHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: "#6d28d9",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
    marginTop: 2,
  },
  input: {
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#F4F6FB",
    marginBottom: 10,
  },
  textarea: {
    minHeight: 48,
    textAlignVertical: "top",
    fontSize: 14,
    lineHeight: 19,
  },
  inputDisabled: {
    color: "#64748B",
  },
  tile: {
    backgroundColor: "#F4F6FB",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  tileOpen: {
    backgroundColor: "#EFE9FF",
  },
  tileRow: {
    flexDirection: "row",
    gap: 10,
  },
  tileLabel: {
    fontSize: 11,
    color: "#64748B",
    marginBottom: 0,
  },
  tileValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  videoRow: {
    backgroundColor: "#F4F6FB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    minHeight: 52,
  },
  settingsCard: {
    backgroundColor: "#F4F6FB",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  settingRow: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  settingsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E4E8F0",
    marginLeft: 44,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  settingHint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  caption: {
    fontSize: 11,
    lineHeight: 15,
    color: "#94A3B8",
    marginTop: -2,
    marginBottom: 10,
  },
  segment: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 14,
    backgroundColor: "#F4F6FB",
  },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentItemOn: {
    backgroundColor: "#FFFFFF",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  segmentTextOn: {
    color: "#0F172A",
  },
  pickerCard: {
    backgroundColor: "#F4F6FB",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  pickerToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  pickerCancel: {
    fontSize: 15,
    color: "#64748B",
  },
  pickerDone: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6d28d9",
  },
  selectBtn: {
    backgroundColor: "#F4F6FB",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  selectBtnText: {
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "500",
    flex: 1,
    paddingRight: 8,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    marginBottom: 12,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: "#FFFFFF",
  },
  primaryBtn: {
    backgroundColor: "#6d28d9",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryBtn: {
    backgroundColor: "#F4F6FB",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "700",
  },
});
