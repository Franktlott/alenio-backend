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
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const CALENDAR_DAY_PANE_HEIGHT = Math.max(
  108,
  Math.min(136, Math.round(SCREEN_HEIGHT * 0.13)),
);
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
      style={[
        eventFormStyles.tile,
        open ? eventFormStyles.tileOpen : null,
      ]}
    >
      <Icon size={16} color="#4361EE" strokeWidth={2} />
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  CalendarDays,
  MessageSquarePlus,
  CheckSquare,
  Calendar,
  Check,
  UserRound,
  Video,
  Clock,
  Users,
  ImagePlus,
  Camera,
  Lock,
  Trash2,
  Pencil,
  RefreshCw,
  AlertTriangle,
  Search,
  Globe2,
  Award,
  Bell,
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
import { earlierIncompleteSeriesTasks } from "@/lib/recurring-task";
import { incompleteSubtasks } from "@/lib/subtask-completion";
import { formatTaskDueDateLabel } from "@/lib/timezone";
import { hasWorkspaceTaskAccess } from "@/lib/plan-access-copy";
import { tabBarClearance, WORKSPACE_CARD_BOTTOM_GAP } from "@/lib/tab-bar";
import { AlenioHeaderBrand } from "@/components/AlenioHeaderBrand";
import { ProFeatureLockedView } from "@/components/ProFeatureLockedView";
import { CurvedTabLayout } from "@/components/CurvedTabLayout";
import { HeaderAddButton } from "@/components/HeaderAddButton";
import { StreakCelebrationModal } from "@/components/StreakCelebrationModal";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import {
  WorkspaceViewToggle,
  type WorkspaceViewMode,
} from "@/components/workspace/WorkspaceViewToggle";
import {
  CalendarCard,
  type CalendarDisplayMode,
} from "@/components/workspace/CalendarCard";
import { EventPreviewSheet } from "@/components/workspace/EventPreviewSheet";
import { EventStockPhotoSearch } from "@/components/workspace/EventStockPhotoSearch";
import { EventsSection } from "@/components/workspace/EventsSection";
import { TaskShowingRow } from "@/components/workspace/TaskShowingRow";
import { TaskListCard } from "@/components/workspace/TaskListCard";
import { TeamDevelopmentCard } from "@/components/development/TeamDevelopmentCard";
import { MemberManageSheet } from "@/components/development/MemberManageSheet";
import { AddMemberModal } from "@/components/AddMemberModal";
import { inviteMemberByEmail } from "@/lib/team-invites-api";
import { teamInviteErrorMessage } from "@/lib/team-invite-errors";
import type { WorkspaceInviteRole } from "@/lib/workspace-members";
import { WorkspaceMemberDevelopment } from "@/components/development/WorkspaceMemberDevelopment";
import { MemberTasksEmptyState } from "@/components/workspace/MemberTasksEmptyState";
import { WorkspaceUpdatesFeed } from "@/components/workspace/WorkspaceUpdatesFeed";
import { UserAvatar } from "@/components/UserAvatar";
import {
  TeamOverviewTasksSheet,
  type TeamOverviewTaskFilter,
} from "@/components/TeamOverviewTasksSheet";
import {
  TeamInsightsSheet,
  type TeamInsightsStatusKey,
} from "@/components/TeamInsightsSheet";
import { SnapshotScheduledSheet } from "@/components/SnapshotDetailSheets";
import { WorkspaceSnapshotCarousel } from "@/components/workspace/snapshot/WorkspaceSnapshotCarousel";
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
import { WS } from "@/components/workspace/workspace-ui";
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
import { workspaceTasksOnly } from "@/lib/task-kind";
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
import { buildSnapshotPages } from "@/lib/workspace-snapshot-pages";
import {
  buildGoalCoverageItems,
  oneOnOneMember,
  selectSnapshotTasks,
  selectTodaysOneOnOnes,
  snapshotAttentionReason,
  type SnapshotDetail,
  type SnapshotTaskDetail,
} from "@/lib/workspace-snapshot-details";
import { workspaceDevelopmentHref, type WorkspaceDevelopmentSection } from "@/lib/workspace-development-navigation";
import { planOneOnOneHref } from "@/lib/plan-one-on-one";
import { scheduleCheckInHref, videoCallHref } from "@/lib/meeting-navigation";
import { selectUpcomingDevelopmentCheckIns } from "@/lib/development-overview";
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
    templateId: linkedTemplateId,
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
    templateId?: string;
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
    useState<WorkspaceViewMode>("calendar");
  const lastWorkspaceTabRef = useRef<Exclude<WorkspaceViewMode, "development">>(
    "calendar",
  );
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
    templateId?: string | null;
    plannedEventId?: string | null;
    checkInId?: string | null;
  } | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(
    toLocalIso(new Date()),
  );
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
  const [confirmCompleteTask, setConfirmCompleteTask] = useState<Task | null>(
    null,
  );
  const [seriesOrderWarning, setSeriesOrderWarning] = useState<{
    task: Task;
    earlierCount: number;
    nextDueLabel: string;
  } | null>(null);
  const [checkingSeriesOrder, setCheckingSeriesOrder] = useState(false);
  const [actionMenuTask, setActionMenuTask] = useState<Task | null>(null);
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
  const [blockedSubtasks, setBlockedSubtasks] = useState<string[] | null>(
    null,
  );
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState<{
    count: number;
    userName: string;
  } | null>(null);
  const [personalBestModal, setPersonalBestModal] = useState<{
    count: number;
    userName: string;
  } | null>(null);
  const [calendarDisplayMode, setCalendarDisplayMode] =
    useState<CalendarDisplayMode>("month");
  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [previewEvent, setPreviewEvent] = useState<CalendarEvent | null>(null);
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
  const [showEventStockPhotoSearch, setShowEventStockPhotoSearch] = useState(false);
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
  const appliedLeaderTaskScopeRef = React.useRef(false);
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

  useEffect(() => {
    if (linkedTeamId && linkedTeamId !== activeTeamId) {
      setActiveTeamId(linkedTeamId);
    }
  }, [activeTeamId, linkedTeamId, setActiveTeamId]);

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
            queryKey: ["team-momentum", activeTeamId],
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
    const now = new Date();
    const keepToday =
      now.getFullYear() === year && now.getMonth() === month
        ? toLocalIso(now)
        : toLocalIso(new Date(year, month, 1));
    setSelectedDay(keepToday);
    setNextCursor(null);
  }, []);

  useEffect(() => {
    const now = new Date();
    setCalendarYear(now.getFullYear());
    setCalendarMonth(now.getMonth());
    setSelectedDay(toLocalIso(now));
    setNextCursor(null);
    appliedLeaderTaskScopeRef.current = false;
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

  const currentRole =
    teams?.find((t) => t.id === activeTeamId)?.role ?? "member";
  const isRegularMember = currentRole === "member";
  const isWorkspaceOwner = currentRole === "owner";
  const isOwnerOrLeader =
    currentRole === "owner" || currentRole === "team_leader";
  const isCalendarManager = isOwnerOrLeader;

  React.useEffect(() => {
    if (!isOwnerOrLeader || appliedLeaderTaskScopeRef.current) return;
    appliedLeaderTaskScopeRef.current = true;
    setFilters((current) =>
      current.assignedTo === "me"
        ? { ...current, assignedTo: "entire_team" }
        : current,
    );
  }, [isOwnerOrLeader]);
  const summaryAssignedTo = isCalendarManager ? "entire_team" : "me";
  const summaryToday = new Date();
  const summaryYear = summaryToday.getFullYear();
  const summaryMonth = summaryToday.getMonth();
  const canManageTaskMenu = useCallback(
    (task: Task) => {
      // Check-in follow-ups are completed via the form, not the edit menu.
      if (isFeedbackTaskDescription(task.description)) return false;
      if (currentRole === "owner" || currentRole === "team_leader") return true;
      const creatorId = task.creator?.id;
      return !!session?.user?.id && creatorId === session.user.id;
    },
    [currentRole, session?.user?.id],
  );

  const canManageEvent = useCallback(
    (ev: CalendarEvent) => {
      if (ev.isExternal) return false;
      const creatorId = ev.createdById ?? ev.createdBy?.id;
      if (!session?.user?.id) return false;
      if (isCalendarManager) return true;
      // Members: only their own non-meeting entries (matches backend calendar permissions).
      if (ev.isVideoMeeting) return false;
      return creatorId === session.user.id;
    },
    [isCalendarManager, session?.user?.id],
  );

  React.useEffect(() => {
    if (teams && teams.length > 0 && !activeTeamId) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId, setActiveTeamId]);

  const { data: subscription, isFetched: subscriptionFetched } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () =>
      api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
        `/api/teams/${activeTeamId}/subscription`,
      ),
    enabled: !!activeTeamId,
  });
  const plan = useSubscriptionStore((s) => s.plan);
  const hasTaskAccess = hasWorkspaceTaskAccess(subscription, plan);
  const { access } = useWorkspaceAccess(activeTeamId);

  const {
    data: activeTasksData,
    isPending: activePending,
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

  const rawTasks: Task[] =
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
  const { data: memberStatsPayload, isPending: memberStatsPending } = useQuery({
    queryKey: ["member-stats", activeTeamId],
    queryFn: () =>
      api.get<MemberStatsPayload>(
        `/api/teams/${activeTeamId}/tasks/member-stats`,
      ),
    enabled: !!activeTeamId && hasTaskAccess,
  });
  const { data: teamMomentumSummary } = useQuery({
    queryKey: teamMomentumSummaryQueryKey(activeTeamId ?? ""),
    queryFn: () =>
      api.get<TeamMomentumLeaderSummary>(`/api/teams/${activeTeamId}/momentum`),
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

  const { data: calendarEvents = [], isPending: calendarEventsPending } =
    useQuery({
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
    if (workspaceMode !== "development") setDevelopmentFocus(null);
  }, [workspaceMode]);
  useEffect(() => {
    setDevelopmentFocus(null);
  }, [activeTeamId]);

  const toggleMutation = useMutation({
    mutationFn: (task: Task) =>
      api.patchFull<Task>(`/api/teams/${activeTeamId}/tasks/${task.id}`, {
        status: task.status === "done" ? "todo" : "done",
      }),
    onSuccess: (result) => {
      invalidateTaskCaches(queryClient, activeTeamId);
      if (result.milestone) {
        setMilestoneModal({
          count: result.milestone,
          userName: session?.user?.name ?? "You",
        });
      }
      if (result.comeback) {
        setPersonalBestModal({
          count: result.comeback,
          userName: session?.user?.name ?? "You",
        });
      }
    },
    onError: (error: Error, task: Task) => {
      if (!/subtask/i.test(error.message)) return;
      setBlockedSubtasks(incompleteSubtasks(task.subtasks).map((s) => s.title));
    },
  });

  const openTaskDetails = (task: Task, options?: { startEdit?: boolean }) => {
    if (!activeTeamId) return;
    queryClient.setQueryData(["task", task.id, activeTeamId], task);
    router.push({
      pathname: "/task-detail",
      params: {
        taskId: task.id,
        teamId: activeTeamId,
        ...(options?.startEdit ? { startEdit: "1" } : {}),
      },
    });
  };

  const handleToggleTask = (task: Task) => {
    if (isFeedbackTaskDescription(task.description)) {
      // Check-in follow-ups must be completed via the feedback form, not the quick toggle.
      if (task.status === "done") return;
      openTaskDetails(task);
      return;
    }
    setConfirmCompleteTask(task);
  };

  const completeTaskFromList = (task: Task) => {
    if (task.status !== "done") {
      const incomplete = incompleteSubtasks(task.subtasks);
      if (incomplete.length > 0) {
        setBlockedSubtasks(incomplete.map((s) => s.title));
        setConfirmCompleteTask(null);
        setSeriesOrderWarning(null);
        return;
      }
    }
    toggleMutation.mutate(task);
    setConfirmCompleteTask(null);
    setSeriesOrderWarning(null);
  };

  const confirmListComplete = async () => {
    const task = confirmCompleteTask;
    if (!task) return;

    if (task.status !== "done" && isFeedbackTaskDescription(task.description)) {
      setConfirmCompleteTask(null);
      openTaskDetails(task);
      return;
    }

    if (task.status === "done" || !task.recurrenceSeriesId || !activeTeamId) {
      completeTaskFromList(task);
      return;
    }

    setCheckingSeriesOrder(true);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["series-tasks", activeTeamId, task.recurrenceSeriesId],
        queryFn: () =>
          api.get<{ tasks: Task[]; nextCursor: string | null }>(
            `/api/teams/${activeTeamId}/tasks?recurrenceSeriesId=${encodeURIComponent(task.recurrenceSeriesId!)}&limit=400`,
          ),
        staleTime: 15_000,
      });
      const earlier = earlierIncompleteSeriesTasks(data.tasks, task.id);
      if (earlier.length > 0) {
        setConfirmCompleteTask(null);
        setSeriesOrderWarning({
          task,
          earlierCount: earlier.length,
          nextDueLabel: formatTaskDueDateLabel(earlier[0]!.dueDate),
        });
        return;
      }
    } catch {
      // If series check fails, still allow completion.
    } finally {
      setCheckingSeriesOrder(false);
    }

    completeTaskFromList(task);
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

  const openEventModal = (opts?: { withVideo?: boolean; day?: string | null }) => {
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
    if (eventModalReadOnly) return;
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
      ? meetingAssigneeIds[0] ?? null
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
      const uploaded = await uploadFile(file.uri, file.filename, file.mimeType, {
        purpose: "team",
        teamId: activeTeamId,
      });
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

    const targetUserId = linkedMemberUserId ?? summaryMemberUserId;
    if (!targetUserId) return;

    const section: WorkspaceDevelopmentSection =
      linkedDevelopmentSection === "check-ins" ||
      linkedMode === "check-ins" ||
      linkedMode === "check-in" ||
      linkedStartCheckIn === "1" ||
      linkedStartCheckIn === "true" ||
      !!linkedCheckInId
        ? "check-ins"
        : "goals";
    const linkKey = [
      activeTeamId,
      targetUserId,
      section,
      linkedCreateGoal,
      linkedStartCheckIn,
      linkedCheckInId,
      linkedTemplateId,
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
      templateId: linkedTemplateId,
      plannedEventId: linkedPlannedEventId,
      checkInId: linkedCheckInId,
    });
  }, [
    activeTeamId,
    linkedCheckInId,
    linkedCheckInLaunchId,
    linkedCreateGoal,
    linkedDevelopmentSection,
    linkedMemberUserId,
    linkedMode,
    linkedPlannedEventId,
    linkedStartCheckIn,
    linkedTeamId,
    linkedTemplateId,
    summaryMemberUserId,
    teams,
    switchWorkspace,
    openMembers,
  ]);
  const summaryStandards = React.useMemo(
    () => mergeWorkplaceStandards(memberStatsPayload?.workplaceStandards),
    [memberStatsPayload?.workplaceStandards],
  );
  const summaryActiveWorkspaceTasks = workspaceTasksOnly(
    summaryActiveTasksData?.tasks ?? [],
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
    const active = workspaceTasksOnly(summaryActiveTasksData?.tasks ?? []);
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

  const handleSelectDay = useCallback((iso: string | null) => {
    setSelectedDay(iso);
  }, []);

  const snapshotPages = React.useMemo(
    () =>
      buildSnapshotPages({
        isManager: isCalendarManager,
        dueToday: summaryDueToday,
        overdue: summaryOverdue,
        completedToday: summaryCompletedToday,
        checkInsToday: summaryCheckInsToday,
        needsAttention: summaryNeedsAttention,
        momentumCount: summaryMomentumCount,
        memberDevelopmentCount: summaryMemberDevelopmentCount,
        memberDevelopmentStatus: summaryMemberDevelopmentStatus,
        memberMissingGoals: summaryMemberMissingGoals,
        health: summaryHealth,
        goalsOnTrackPct: summaryGoalsOnTrackPct,
        goalsRequired: summaryStandards.goalsRequired,
        onPressActionTasks: () => setSelectedSnapshotDetail("actionTasks"),
        onPressDueToday: () => setSelectedSnapshotDetail("dueToday"),
        onPressOverdue: () => setSelectedSnapshotDetail("overdue"),
        onPressCompletedToday: () =>
          setSelectedSnapshotDetail("completedToday"),
        onPressCheckIns: () => setSelectedSnapshotDetail("scheduled"),
        onPressNeedsAttention: isCalendarManager
          ? openMembers
          : undefined,
        onPressMomentum:
          activeTeamId && (isCalendarManager || summaryMemberUserId)
            ? () =>
                router.push({
                  pathname: "/team-momentum",
                  params: {
                    teamId: activeTeamId,
                    ...(isCalendarManager
                      ? {}
                      : { memberUserId: summaryMemberUserId }),
                  },
                })
            : undefined,
        onPressHealth: () => setSelectedSnapshotDetail("health"),
        onPressGoals:
          isCalendarManager
            ? openMembers
            : summaryMemberUserId && activeTeamId
              ? () =>
                  router.push(
                    workspaceDevelopmentHref(activeTeamId, {
                      memberUserId: summaryMemberUserId,
                      section: "goals",
                    }),
                  )
              : undefined,
      }),
    [
      isCalendarManager,
      summaryDueToday,
      summaryOverdue,
      summaryCompletedToday,
      summaryCheckInsToday,
      summaryNeedsAttention,
      summaryMomentumCount,
      summaryMemberDevelopmentCount,
      summaryMemberDevelopmentStatus,
      summaryMemberMissingGoals,
      teamMembers.length,
      summaryHealth,
      summaryGoalsOnTrackPct,
      summaryStandards.goalsRequired,
      activeTeamId,
      summaryMemberUserId,
      openMembers,
    ],
  );
  const activeTeamName = teams?.find((team) => team.id === activeTeamId)?.name;

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
      void queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      void queryClient.invalidateQueries({
        queryKey: ["member-stats", activeTeamId],
      });
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
          templateId: ev.oneOnOneTemplateId ?? undefined,
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
        const preview = expanded
          ? group.tasks
          : group.tasks.slice(0, TASK_SECTION_PREVIEW);
        return {
          id: group.key,
          title: group.label,
          tasks: preview,
          totalCount: group.tasks.length,
          onShowAll:
            !expanded && group.tasks.length > TASK_SECTION_PREVIEW
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
    ]) {
      if (!task.dueDate) continue;
      byId.set(task.id, task);
    }
    return [...byId.values()];
  }, [activeTasksData?.tasks, completedTasksData?.tasks]);
  const visibleDatedTasks = React.useMemo(
    () => dedupeDatedTasksAgainstEvents(calendarDatedTasks, calendarEventsWithOutlook),
    [calendarDatedTasks, calendarEventsWithOutlook],
  );
  const targetIso = selectedDay;
  const dayEvents = targetIso ? eventsOnLocalIso(calendarEventsWithOutlook, targetIso) : [];
  const dayHolidays = targetIso ? holidaysOnLocalIso(holidays, targetIso) : [];
  const dayTasks = React.useMemo(() => {
    if (!targetIso) return [];
    return visibleDatedTasks
      .filter((task) => task.dueDate && datedItemLocalIso(task.dueDate) === targetIso)
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
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
      ),
    );
  }, [selectedDay]);
  const tasksOnIso = React.useCallback(
    (iso: string) =>
      visibleDatedTasks
        .filter((task) => task.dueDate && datedItemLocalIso(task.dueDate) === iso)
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
        leftAction={<AlenioHeaderBrand />}
        headerTitlePlacement="leading"
        testID="execute-screen"
        headerTestID="execute-header"
      >
        <NoWorkspaceTabState
          bottomInset={tabBarClearance(insets.bottom, 20)}
          testID="execute-no-workspace"
        />
      </CurvedTabLayout>
    );
  }

  // A locked or still-loading workspace keeps the normal header: without it
  // there is no way to switch to a workspace that is not locked.
  if (!hasTaskAccess && !subscriptionFetched) {
    return (
      <CurvedTabLayout
        topInset={insets.top}
        title="Workspace"
        workspaceTitleSelector
        showWorkspaceSubtitle
        leftAction={<AlenioHeaderBrand />}
        headerTitlePlacement="leading"
        notificationsSize="large"
        testID="workspace-access-loading-screen"
        headerTestID="workspace-header"
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#4361EE" />
        </View>
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
        leftAction={<AlenioHeaderBrand />}
        headerTitlePlacement="leading"
        notificationsSize="large"
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
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  return (
    <CurvedTabLayout
      topInset={insets.top}
      title="Workspace"
      workspaceTitleSelector
      showWorkspaceSubtitle
      leftAction={<AlenioHeaderBrand />}
      headerTitlePlacement="leading"
      testID="tasks-screen"
      headerTestID="workspace-header"
      notificationsSize="large"
      rightAction={
        activeTeamId ? (
          <View
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <HeaderAddButton
              onPress={() => setShowAddModal(true)}
              accessibilityLabel="Add"
              testID="workspace-header-add-button"
              tone="light"
              size="large"
            />
          </View>
        ) : null
      }
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

          <AlenioBottomSheet
            visible={confirmCompleteTask != null}
            title={
              confirmCompleteTask?.status === "done"
                ? `Reopen ${confirmCompleteTask.kind === "reminder" ? "reminder" : "task"}?`
                : `Complete ${confirmCompleteTask?.kind === "reminder" ? "reminder" : "task"}?`
            }
            subtitle={
              confirmCompleteTask?.status === "done"
                ? "This will return it to your active list"
                : "This will move it to completed"
            }
            onClose={() => {
              if (checkingSeriesOrder || toggleMutation.isPending) return;
              setConfirmCompleteTask(null);
            }}
            compact
            showCloseButton
            testID="complete-confirm-overlay"
            footer={
              <View style={{ gap: 4 }}>
                <Pressable
                  onPress={() => void confirmListComplete()}
                  disabled={checkingSeriesOrder || toggleMutation.isPending}
                  style={[
                    alenioSheetStyles.primaryButton,
                    {
                      backgroundColor:
                        confirmCompleteTask?.status === "done"
                          ? "#D97706"
                          : confirmCompleteTask?.kind === "reminder"
                            ? "#635BDB"
                            : "#16A36A",
                      opacity:
                        checkingSeriesOrder || toggleMutation.isPending
                          ? 0.65
                          : 1,
                    },
                  ]}
                  testID="complete-confirm-yes"
                >
                  {checkingSeriesOrder || toggleMutation.isPending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={alenioSheetStyles.primaryButtonText}>
                      {confirmCompleteTask?.status === "done"
                        ? `Reopen ${confirmCompleteTask.kind === "reminder" ? "reminder" : "task"}`
                        : `Complete ${confirmCompleteTask?.kind === "reminder" ? "reminder" : "task"}`}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setConfirmCompleteTask(null)}
                  disabled={checkingSeriesOrder || toggleMutation.isPending}
                  style={alenioSheetStyles.cancelButton}
                  testID="complete-confirm-cancel"
                >
                  <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </View>
            }
          >
            {confirmCompleteTask ? (
              <AlenioSheetCard
                tint={
                  confirmCompleteTask.kind === "reminder" ? "purple" : "slate"
                }
                compact
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        confirmCompleteTask.kind === "reminder"
                          ? "#E9E5FF"
                          : "#E7F7F0",
                    }}
                  >
                    {confirmCompleteTask.kind === "reminder" ? (
                      <Bell size={17} color="#635BDB" strokeWidth={2.2} />
                    ) : (
                      <CheckSquare
                        size={17}
                        color="#15805D"
                        strokeWidth={2.2}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 13.5,
                        lineHeight: 18,
                        fontWeight: "700",
                        color: "#172033",
                      }}
                      numberOfLines={2}
                    >
                      {confirmCompleteTask.title}
                    </Text>
                    <Text
                      style={{
                        marginTop: 2,
                        fontSize: 10.5,
                        lineHeight: 14,
                        color: "#7C8799",
                      }}
                    >
                      {confirmCompleteTask.kind === "reminder"
                        ? "Private reminder"
                        : "Workspace task"}
                    </Text>
                  </View>
                </View>
              </AlenioSheetCard>
            ) : null}
          </AlenioBottomSheet>

          <AlenioBottomSheet
            visible={!!seriesOrderWarning}
            title="Earlier tasks still open"
            subtitle="You're completing this out of order"
            onClose={() => setSeriesOrderWarning(null)}
            compact
            showCloseButton
            testID="series-order-warning-sheet"
            footer={
              <TouchableOpacity
                onPress={() => setSeriesOrderWarning(null)}
                style={alenioSheetStyles.cancelButton}
                activeOpacity={0.8}
                testID="series-order-warning-cancel"
              >
                <Text style={alenioSheetStyles.cancelButtonText}>Go back</Text>
              </TouchableOpacity>
            }
          >
            <AlenioSheetCard tint="danger" compact>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: "#FEE2E2",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AlertTriangle size={18} color="#EF4444" strokeWidth={2.25} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#991B1B",
                    }}
                  >
                    {seriesOrderWarning?.earlierCount === 1
                      ? "1 earlier task is still incomplete"
                      : `${seriesOrderWarning?.earlierCount ?? 0} earlier tasks are still incomplete`}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#B91C1C",
                      marginTop: 4,
                      lineHeight: 17,
                    }}
                  >
                    {seriesOrderWarning
                      ? `The next open date is ${seriesOrderWarning.nextDueLabel}. You can still complete this one if you want.`
                      : "You can still complete this one if you want."}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!seriesOrderWarning) return;
                  completeTaskFromList(seriesOrderWarning.task);
                }}
                disabled={toggleMutation.isPending}
                style={[alenioSheetStyles.primaryButton, { marginTop: 14 }]}
                activeOpacity={0.92}
                testID="series-order-warning-continue"
              >
                {toggleMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={alenioSheetStyles.primaryButtonText}>
                    Complete anyway
                  </Text>
                )}
              </TouchableOpacity>
            </AlenioSheetCard>
          </AlenioBottomSheet>

          {/* Subtask block modal */}
          {blockedSubtasks ? (
            <View
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.45)",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 101,
              }}
              testID="subtask-block-overlay"
            >
              <View
                style={{
                  backgroundColor: "white",
                  borderRadius: 20,
                  marginHorizontal: 32,
                  padding: 24,
                  shadowColor: "#000",
                  shadowOpacity: 0.2,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 12,
                  width: "85%",
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: "#FEF3C7",
                    alignItems: "center",
                    justifyContent: "center",
                    alignSelf: "center",
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ fontSize: 26 }}>⚠️</Text>
                </View>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "700",
                    color: "#0F172A",
                    textAlign: "center",
                    marginBottom: 6,
                  }}
                >
                  Subtasks Incomplete
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: "#64748B",
                    textAlign: "center",
                    marginBottom: 24,
                  }}
                >
                  Subtasks are incomplete. Finish them before marking this task as done.
                </Text>
                <Pressable
                  onPress={() => setBlockedSubtasks(null)}
                  style={{
                    backgroundColor: "#4361EE",
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                  testID="subtask-block-ok"
                >
                  <Text
                    style={{ color: "white", fontSize: 15, fontWeight: "700" }}
                  >
                    Got it
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Task action menu */}
          <AlenioBottomSheet
            visible={!!actionMenuTask}
            title={actionMenuTask?.title ?? "Task"}
            subtitle="Choose an action"
            onClose={() => setActionMenuTask(null)}
            testID="task-action-sheet"
            footer={
              <TouchableOpacity
                onPress={() => setActionMenuTask(null)}
                style={alenioSheetStyles.cancelButton}
                activeOpacity={0.8}
              >
                <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            }
          >
            {actionMenuTask && canManageTaskMenu(actionMenuTask) ? (
              <AlenioSheetOption
                icon={<Pencil size={20} color="white" strokeWidth={2.25} />}
                title="Edit"
                subtitle="Change title, due date, priority, and more"
                onPress={() => {
                  const task = actionMenuTask;
                  setActionMenuTask(null);
                  openTaskDetails(task, { startEdit: true });
                }}
                testID="task-action-edit"
              />
            ) : null}
            {isOwnerOrLeader &&
            actionMenuTask?.status !== "done" &&
            (actionMenuTask?.assignments.length ?? 0) > 0 ? (
              <AlenioSheetOption
                icon={<RefreshCw size={20} color="white" strokeWidth={2.25} />}
                iconColor="#7C3AED"
                title="Reassign"
                subtitle="Move this task to another teammate"
                onPress={() => {
                  const t = actionMenuTask!;
                  setActionMenuTask(null);
                  setReassignTask(t);
                }}
                testID="task-action-reassign"
              />
            ) : null}
          </AlenioBottomSheet>

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
                          templateId: ev.oneOnOneTemplateId ?? undefined,
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
                      backgroundColor="#4361EE"
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
            visible={showAddModal}
            title="What would you like to add?"
            subtitle="Create something for this workspace"
            onClose={() => setShowAddModal(false)}
            compact
            testID="workspace-add-sheet"
            footer={
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={alenioSheetStyles.cancelButton}
                activeOpacity={0.8}
              >
                <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            }
          >
            <AlenioSheetOption
              icon={<MessageSquarePlus size={16} color="white" />}
              iconColor="#4361EE"
              title="Post"
              subtitle="Share an update with the workspace"
              onPress={() => {
                setShowAddModal(false);
                router.push({
                  pathname: "/create-post",
                  params: { teamId: activeTeamId! },
                });
              }}
            />
            {isOwnerOrLeader ? (
              <AlenioSheetOption
                icon={<CalendarDays size={16} color="white" />}
                iconColor="#7C3AED"
                title="Calendar Event"
                subtitle="Add to the team calendar, with an optional video call"
                onPress={() => {
                  setShowAddModal(false);
                  openEventModal();
                }}
              />
            ) : (
              <AlenioSheetOption
                icon={<CalendarDays size={16} color="white" />}
                iconColor="#64748B"
                title="Calendar event"
                subtitle="Create a private event or request a team event"
                onPress={() => {
                  setShowAddModal(false);
                  openPersonalEventModal();
                }}
              />
            )}
            {isOwnerOrLeader ? (
              <AlenioSheetOption
                icon={<CheckSquare size={16} color="white" />}
                title="Task"
                subtitle="Create a new task for the team"
                onPress={() => {
                  setShowAddModal(false);
                  router.push({
                    pathname: "/create-task",
                    params: {
                      teamId: activeTeamId!,
                      initialDueDate: selectedDay ?? toLocalIso(new Date()),
                      kind: "workspace_task",
                    },
                  });
                }}
              />
            ) : null}
            <AlenioSheetOption
              icon={<CheckSquare size={16} color="white" />}
              iconColor="#4F46E5"
              title="Reminder"
              subtitle="Private to you and separate from Team Momentum"
              onPress={() => {
                setShowAddModal(false);
                router.push({
                  pathname: "/create-task",
                  params: {
                    teamId: activeTeamId!,
                    initialDueDate: selectedDay ?? toLocalIso(new Date()),
                    kind: "reminder",
                  },
                });
              }}
            />
            <AlenioSheetOption
              icon={<Award size={16} color="white" />}
              iconColor="#D97706"
              title="Celebrate someone"
              subtitle="Recognize a teammate on Updates"
              onPress={() => {
                setShowAddModal(false);
                router.push({
                  pathname: "/recognition-hub",
                  params: { openGive: "1", teamId: activeTeamId! },
                });
              }}
            />
          </AlenioBottomSheet>

          {/* New / Edit Event Modal */}
          <Modal
            visible={showEventModal}
            transparent
            animationType="slide"
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
              style={{ flex: 1, justifyContent: "flex-end" }}
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
                style={eventFormStyles.sheet}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={eventFormStyles.handle} />
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
                        onPress={() =>
                          editingEvent &&
                          deleteEventMutation.mutate(editingEvent.id)
                        }
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
                        <ActivityIndicator size="small" color="#4361EE" />
                      ) : eventImageUrl ? (
                        <Image
                          source={{ uri: eventImageUrl }}
                          style={eventFormStyles.photoImage}
                        />
                      ) : (
                        <>
                          <ImagePlus size={18} color="#4361EE" strokeWidth={2} />
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
                      eventModalReadOnly ? eventFormStyles.inputDisabled : null,
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
                                selected ? eventFormStyles.segmentItemOn : null,
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
                      <Video size={16} color="#4361EE" strokeWidth={2} />
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
                        trackColor={{ false: "#E2E8F0", true: "#4361EE" }}
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
                            : formatVideoMeetingDuration(meetingDurationMinutes)
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
                          <Text style={eventFormStyles.pickerCancel}>Cancel</Text>
                        </Pressable>
                        <Text style={eventFormStyles.pickerTitle}>Start date</Text>
                        <Pressable onPress={() => setShowStartPicker(false)}>
                          <Text style={eventFormStyles.pickerDone}>Done</Text>
                        </Pressable>
                      </View>
                      <DateTimePicker
                        value={eventStart}
                        mode="date"
                        display={Platform.OS === "ios" ? "inline" : "calendar"}
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
                          <Text style={eventFormStyles.pickerCancel}>Cancel</Text>
                        </Pressable>
                        <Text style={eventFormStyles.pickerTitle}>End date</Text>
                        <Pressable onPress={() => setShowEndPicker(false)}>
                          <Text style={eventFormStyles.pickerDone}>Done</Text>
                        </Pressable>
                      </View>
                      <DateTimePicker
                        value={eventEnd}
                        mode="date"
                        display={Platform.OS === "ios" ? "inline" : "calendar"}
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
                        <Text style={eventFormStyles.pickerTitle}>Start time</Text>
                        <Pressable onPress={() => setShowStartTimePicker(false)}>
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
                        <Text style={eventFormStyles.pickerTitle}>End time</Text>
                        <Pressable onPress={() => setShowEndTimePicker(false)}>
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
                        <Users size={16} color="#4361EE" strokeWidth={2} />
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
                      <Text style={eventFormStyles.secondaryBtnText}>Close</Text>
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
                            color: "#4361EE",
                            fontWeight: "700",
                          }}
                        >
                          {allMeetingAssigneesSelected
                            ? "Deselect all"
                            : "Select all"}
                        </Text>
                        {allMeetingAssigneesSelected ? (
                          <Check size={16} color="#4361EE" />
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
                          style={{ paddingVertical: 24, alignItems: "center" }}
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
                                  backgroundColor="#EEF2FF"
                                  textColor="#4361EE"
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
                                <Check size={16} color="#4361EE" />
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
                        backgroundColor: "#4361EE",
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
                      style={[alenioSheetStyles.cancelButton, { marginTop: 8 }]}
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
                              idx === VIDEO_MEETING_DURATION_OPTIONS.length - 1
                                ? 0
                                : 1,
                            borderBottomColor: "#F1F5F9",
                            backgroundColor:
                              meetingDurationMinutes === minutes
                                ? "#EEF2FF"
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
                                  ? "#4361EE"
                                  : "#0F172A",
                            }}
                          >
                            {formatVideoMeetingDuration(minutes)}
                          </Text>
                          {meetingDurationMinutes === minutes ? (
                            <Check size={16} color="#4361EE" />
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
      <View style={{ flex: 1, minHeight: 0, backgroundColor: "#FFFFFF" }}>
        <WorkspaceViewToggle
          mode={workspaceMode}
          onChange={(next) => {
            if (next !== "development") lastWorkspaceTabRef.current = next;
            setWorkspaceMode(next);
          }}
          calendarBadge={calendarBadge}
          tasksBadge={tasksBadge}
        />

        <WorkspaceSnapshotCarousel
          pages={snapshotPages}
          loading={summaryMetricsLoading}
          members={teamMembers}
          memberCount={teamData?._count?.members ?? teamMembers.length}
          onPressMembers={openMembers}
        />

        {activeTeamId && !access.canWrite ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/choose-plan",
                params: { teamId: activeTeamId },
              })
            }
            disabled={!isWorkspaceOwner}
            accessibilityRole={isWorkspaceOwner ? "button" : "text"}
            accessibilityLabel={
              isWorkspaceOwner
                ? "Read-only workspace. Upgrade to create and manage workspace content. View plan."
                : "Read-only workspace. Your workspace owner can restore access."
            }
            testID="workspace-read-only-status"
            style={{
              minHeight: 54,
              marginHorizontal: 12,
              marginTop: 8,
              paddingHorizontal: 11,
              paddingVertical: 8,
              borderRadius: 13,
              borderWidth: 1,
              borderColor: "#E8E7FC",
              backgroundColor: "#F7F6FF",
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#EBE9FF",
              }}
            >
              <Lock size={13} color="#635BEE" strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 11,
                  lineHeight: 14,
                  fontWeight: "700",
                  color: "#29324A",
                }}
              >
                Read-only workspace
              </Text>
              <Text
                style={{
                  marginTop: 1,
                  fontSize: 9,
                  lineHeight: 12,
                  fontWeight: "500",
                  color: "#778198",
                }}
                numberOfLines={2}
              >
                {isWorkspaceOwner
                  ? "Upgrade to create and manage workspace content."
                  : "Your workspace owner can restore access."}
              </Text>
            </View>
            {isWorkspaceOwner ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    lineHeight: 14,
                    fontWeight: "700",
                    color: "#635BEE",
                  }}
                >
                  View plan
                </Text>
                <ChevronRight size={12} color="#635BEE" strokeWidth={2.2} />
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <View style={{ flex: 1 }}>
          {workspaceMode === "development" ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                paddingBottom: tabBarClearance(
                  insets.bottom,
                  WORKSPACE_CARD_BOTTOM_GAP,
                ),
              }}
              testID="workspace-development-page"
            >
              {activeTeamId ? (
                <View style={{ flex: 1, minHeight: 0, paddingBottom: 10 }}>
                  {developmentMember && developmentFocus ? (
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
                      onBack={() => setDevelopmentFocus(null)}
                      autoOpenCreateGoal={developmentFocus.createGoal ?? false}
                      onCreateGoalIntentHandled={() =>
                        setDevelopmentFocus((current) =>
                          current ? { ...current, createGoal: false } : current,
                        )
                      }
                      startCheckInToken={developmentFocus.startCheckInToken ?? 0}
                      preferredTemplateId={developmentFocus.templateId ?? null}
                      plannedEventId={developmentFocus.plannedEventId ?? null}
                      initialCheckInId={developmentFocus.checkInId ?? null}
                    />
                  ) : (
                    <TeamDevelopmentCard
                      members={teamMembers}
                      currentUserId={currentUserId}
                      calendarEvents={developmentUpcomingCheckIns}
                      memberStats={memberStatsPayload?.stats}
                      standards={summaryStandards}
                      onMemberPress={(member) =>
                        setDevelopmentFocus({
                          userId: member.userId,
                          section: "goals",
                        })
                      }
                      onManageMember={
                        canManageRoster ? setManageMember : undefined
                      }
                      onInvite={
                        canManageRoster ? () => setInviteOpen(true) : undefined
                      }
                      onBack={() =>
                        setWorkspaceMode(lastWorkspaceTabRef.current)
                      }
                    />
                  )}
                </View>
              ) : (
                <ActivityIndicator color="#4361EE" style={{ marginTop: 32 }} />
              )}
            </View>
          ) : workspaceMode === "calendar" ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                paddingBottom: tabBarClearance(
                  insets.bottom,
                  WORKSPACE_CARD_BOTTOM_GAP,
                ),
              }}
            >
              <View style={{ flex: 1, minHeight: 0 }} collapsable={false}>
                <View
                  style={{
                    flex: calendarDisplayMode === "week" ? 1 : 0,
                    flexGrow: calendarDisplayMode === "week" ? 1 : 0,
                    flexShrink: calendarDisplayMode === "week" ? 1 : 0,
                    minHeight: calendarDisplayMode === "week" ? 0 : undefined,
                  }}
                >
                  <CalendarCard
                    tasks={visibleDatedTasks}
                    events={calendarEventsWithOutlook}
                    members={teamMembers}
                    holidays={holidays}
                    selectedDay={selectedDay}
                    onSelectDay={handleSelectDay}
                    viewYear={calendarYear}
                    viewMonth={calendarMonth}
                    onViewMonthChange={handleViewMonthChange}
                    onDisplayModeChange={setCalendarDisplayMode}
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
                          const dayHolidayList = holidaysOnLocalIso(holidays, iso);
                          const tasks = tasksOnIso(iso);
                          const count =
                            events.length +
                            dayHolidayList.length +
                            tasks.length;
                          const heading = dayDate.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          });
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
                                    color: isSelected ? "#4361EE" : "#0F172A",
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
                                  onTaskPress={openTaskDetails}
                                  onToggleTask={handleToggleTask}
                                  onTaskLongPress={(task) => {
                                    if (!canManageTaskMenu(task)) return;
                                    setActionMenuTask(task);
                                  }}
                                  onAddEvent={() => setShowAddModal(true)}
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
                {calendarDisplayMode === "week" ? null : (
                  <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginHorizontal: WS.pageGutter,
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
                  <Pressable
                    onPress={() => setShowAddModal(true)}
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
                    <Plus size={13} color="#4361EE" strokeWidth={2.4} />
                    <Text
                      style={{
                        marginLeft: 3,
                        fontSize: 12,
                        fontWeight: "700",
                        color: "#4361EE",
                      }}
                    >
                      Add event
                    </Text>
                  </Pressable>
                </View>
                <View
                  testID="calendar-day-pane"
                  style={{
                    flex: 1,
                    minHeight: CALENDAR_DAY_PANE_HEIGHT,
                    marginHorizontal: WS.pageGutter,
                  }}
                >
                  <View style={{ flex: 1, minHeight: 0 }}>
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
                      onTaskPress={openTaskDetails}
                      onToggleTask={handleToggleTask}
                      onTaskLongPress={(task) => {
                        if (!canManageTaskMenu(task)) return;
                        setActionMenuTask(task);
                      }}
                      onAddEvent={() => setShowAddModal(true)}
                      isOwnerOrLeader={isOwnerOrLeader}
                    />
                  </View>
                </View>
                  </>
                )}
              </View>
            </View>
          ) : workspaceMode === "updates" ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                paddingBottom: tabBarClearance(
                  insets.bottom,
                  WORKSPACE_CARD_BOTTOM_GAP,
                ),
              }}
              testID="workspace-updates-page"
            >
              <WorkspaceUpdatesFeed
                teamId={activeTeamId}
                canManageWorkspace={isOwnerOrLeader}
              />
            </View>
          ) : showMemberTasksEmpty ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                paddingBottom: tabBarClearance(
                  insets.bottom,
                  WORKSPACE_CARD_BOTTOM_GAP,
                ),
              }}
            >
              <ScrollView
                style={{
                  flex: 1,
                  backgroundColor: WS.surface,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#4361EE"
                    colors={["#4361EE"]}
                  />
                }
                contentContainerStyle={{
                  flexGrow: 1,
                }}
              >
                <MemberTasksEmptyState />
              </ScrollView>
            </View>
          ) : (
            <>
              <View
                style={{
                  flexShrink: 0,
                  paddingHorizontal: WS.pageGutter,
                  paddingTop: 8,
                  paddingBottom: 6,
                  backgroundColor: WS.pageBg,
                }}
              >
                <TaskShowingRow
                  filters={filters}
                  searchQuery={taskSearchQuery}
                  onChangeSearch={setTaskSearchQuery}
                  onOpenFilterView={() => setFilterPicker("filterView")}
                  canCreateTask={access.canWrite}
                  createLabel={isOwnerOrLeader ? "Task" : "Reminder"}
                  onCreateTask={() =>
                    router.push({
                      pathname: "/create-task",
                      params: {
                        teamId: activeTeamId!,
                        initialDueDate: selectedDay ?? toLocalIso(new Date()),
                        kind: isOwnerOrLeader ? "workspace_task" : "reminder",
                      },
                    })
                  }
                />
              </View>

              <View
                style={{
                  flex: 1,
                  minHeight: 140,
                  paddingHorizontal: WS.pageGutter,
                  paddingBottom: tabBarClearance(
                    insets.bottom,
                    WORKSPACE_CARD_BOTTOM_GAP,
                  ),
                }}
              >
                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      tintColor="#4361EE"
                      colors={["#4361EE"]}
                    />
                  }
                  contentContainerStyle={{
                    paddingTop: 0,
                    flexGrow: 1,
                  }}
                >
                  <TaskListCard
                    sections={taskListSections}
                    loading={showTasksLoading}
                    loadError={tasksLoadError}
                    onRetry={() => void refetchActiveTasks()}
                    currentUserId={currentUserId}
                    onToggle={handleToggleTask}
                    onPress={openTaskDetails}
                    onLongPress={(task) => {
                      if (!canManageTaskMenu(task)) return;
                      setActionMenuTask(task);
                    }}
                    emptyTitle={
                      taskSearchQuery.trim()
                        ? "No tasks"
                        : filters.statusTab === "archived"
                          ? "No archived tasks"
                          : filters.statusTab === "completed"
                            ? "Nothing completed"
                            : filters.dueDate === "calendar_day"
                              ? "No active tasks"
                              : "You're all"
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
                          : filters.dueDate === "calendar_day" && selectedDay
                            ? "Try viewing upcoming tasks or adjust your filters."
                            : filters.statusTab === "completed"
                              ? "Completed work from the last 30 days shows here."
                              : "No active tasks for the current filters."
                    }
                    emptyActionLabel={
                      !taskSearchQuery.trim() &&
                      filters.dueDate === "calendar_day"
                        ? "View upcoming tasks"
                        : undefined
                    }
                    onEmptyAction={
                      !taskSearchQuery.trim() &&
                      filters.dueDate === "calendar_day"
                        ? () => setFilters((f) => ({ ...f, dueDate: "all" }))
                        : undefined
                    }
                    footer={
                      <>
                        {nextCursor !== null ? (
                          <Pressable
                            onPress={handleLoadMore}
                            style={{
                              margin: 12,
                              marginTop: 0,
                              paddingVertical: 12,
                              borderRadius: 10,
                              alignItems: "center",
                              backgroundColor: "#EEF2FF",
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
                                color="#4361EE"
                                testID="load-more-indicator"
                              />
                            ) : null}
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "600",
                                color: "#4361EE",
                              }}
                            >
                              {loadingMore ? "Loading..." : "Load more tasks"}
                            </Text>
                          </Pressable>
                        ) : null}
                      </>
                    }
                  />
                </ScrollView>
              </View>
            </>
          )}
        </View>
      </View>
    </CurvedTabLayout>
  );
}

const eventFormStyles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    flexShrink: 1,
    overflow: "hidden",
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
    color: "#4361EE",
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
    backgroundColor: "#EEF2FF",
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
    color: "#4361EE",
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
    backgroundColor: "#4361EE",
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
