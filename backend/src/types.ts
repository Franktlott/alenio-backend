export type TeamHealthHistoryPoint = {
  date: string;
  teamHealthPct: number;
  checkInPct: number | null;
  goalsPct: number | null;
  tasksPct: number;
  memberCount: number;
  capturedAt: string;
};

export type TeamHealthHistoryResponse = TeamHealthHistoryPoint[];

export type GetStartedCompletionResponse = {
  data: {
    getStartedCompletedAt: string;
  };
};

export type WorkspaceTrialEligibility = {
  canStartWorkspaceTrial: boolean;
  workspaceTrialStartedAt: string | null;
  workspaceTrialConsumedAt: string | null;
};

export type CreatePaidWorkspaceCheckoutRequest = {
  name: string;
  industry?: string;
  location?: string;
  plan: "pro" | "operations";
};

export type CreatePaidWorkspaceCheckoutResponse = {
  data: {
    checkoutId: string;
    url: string;
    expiresAt: string;
  };
};

export type PaidWorkspaceCheckoutStatusResponse = {
  data: {
    checkoutId: string;
    status: "pending" | "completed" | "expired" | "failed";
    teamId: string | null;
    team: {
      id: string;
      name: string;
      industry: string | null;
      location: string | null;
      image: string | null;
      timezone: string | null;
      inviteCode: string;
      role: "owner";
      createdAt: string;
      _count: { members: number; tasks: number };
    } | null;
  };
};

export type { TaskClassification, TaskKind } from "./lib/task-kind";

export type MemberNextActionId =
  | "first_check_in"
  | "overdue_check_in"
  | "schedule_next_check_in"
  | "no_active_development_goals"
  | "development_goal_review_due"
  | "overdue_tasks"
  | "tasks_due_soon"
  | "everything_up_to_date";

export type MemberNextActionRoute =
  | "/(app)/execute"
  | "/plan-one-on-one"
  | "/person"
  | "/team-priority"
  | "/(app)/chat";

export type MemberNextAction = {
  id: MemberNextActionId;
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  title: string;
  copy: string;
  ctaLabel: string;
  affectedEntityIds: string[];
  generatedAt: string;
  cta: {
    route: MemberNextActionRoute;
    params: Record<string, string>;
  } | null;
};

export type MemberNextActionResponse = {
  data: MemberNextAction;
};

export type {
  ConnectionSuggestion,
  ConnectionSuggestionDismissalResponse,
  ConnectionSuggestionReason,
  ConnectionSuggestionReasonKey,
  ConnectionSuggestionWorkspace,
} from "./lib/connection-suggestions";

export type SenecaFocusCategory =
  | "check_ins"
  | "goals"
  | "tasks"
  | "recognition"
  | "health"
  | "workload"
  | "momentum"
  | "low_data";

export type SenecaFocusImpact = "high" | "medium" | "low" | "positive";
export type SenecaFocusStatus =
  | "generated"
  | "positive"
  | "low_data"
  | "fallback"
  | "stale"
  | "completed";

export type SenecaFocusActionId =
  | "view_check_ins"
  | "view_goals"
  | "view_overdue_tasks"
  | "view_workload"
  | "create_recognition"
  | "open_team";

export type SenecaFocusKeyInsight = {
  id: string;
  label: string;
  detail: string;
  status: "risk" | "priority" | "opportunity" | "on_track";
};

export type SenecaFocusAction = {
  id: string;
  action: SenecaFocusActionId;
  title: string;
  description: string;
  route:
    | "/team-priority"
    | "/person"
    | "/(app)/execute"
    | "/(app)/chat"
    | "/(app)/team";
  params: Record<string, string>;
  estimatedMinutes: number;
  measurable: boolean;
  completedAt: string | null;
};

export type SenecaFocusSourceMetrics = {
  memberCount: number;
  overdueCheckInMemberIds: string[];
  dueSoonCheckInMemberIds: string[];
  membersWithoutGoalsIds: string[];
  staleGoalIds: string[];
  overdueTaskIds: string[];
  upcomingTaskIds: string[];
  highPriorityOverdueTaskIds: string[];
  managerAssignedOpenTaskIds: string[];
  managerAssignedMemberIds: string[];
  recognizedMemberIdsLast14Days: string[];
  recentlyCompletedMemberIds: string[];
  health: {
    currentPct: number | null;
    checkInPct: number | null;
    goalsPct: number | null;
    tasksPct: number | null;
    recentBuckets: number[];
    projectedPct: number | null;
  };
};

export type SenecaFocusBrief = {
  id: string;
  teamId: string;
  localDate: string;
  category: SenecaFocusCategory;
  impact: SenecaFocusImpact;
  status: SenecaFocusStatus;
  summary: string;
  rationale: string;
  estimatedMinutes: number;
  affectedCount: number;
  affectedMemberIds: string[];
  confidence: number;
  score: number;
  projectedHealthPct: number | null;
  keyInsights: SenecaFocusKeyInsight[];
  actions: SenecaFocusAction[];
  generatedAt: string;
  expiresAt: string;
  completedAt: string | null;
};

export type SenecaFocusResponse = {
  brief: SenecaFocusBrief;
  reused: boolean;
  stale: boolean;
  generatedBy: "seneca" | "deterministic";
  refreshAvailableAt: string | null;
};

export type SenecaContextRef =
  | { type: "personal" }
  | { type: "workspace"; workspaceId: string };

export type SenecaContextOption =
  | {
      type: "personal";
      name: "Personal";
      available: true;
    }
  | {
      type: "workspace";
      workspaceId: string;
      name: string;
      role: string;
      available: boolean;
    };

export type SenecaChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SenecaChatAttachment = {
  url: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  fileName: string;
  sizeBytes: number;
};

type SenecaAskRequestBase = {
  context: SenecaContextRef;
  messages?: SenecaChatMessage[];
  conversationId?: string;
};

export type SenecaAskRequest = SenecaAskRequestBase &
  (
    | { question: string; attachment?: SenecaChatAttachment }
    | {
        /** The server uses its visible default review prompt when omitted. */
        question?: string;
        attachment: SenecaChatAttachment;
      }
  );

export type SenecaGeneratedImage = {
  generationId: string;
  url: string;
  prompt: string;
  revisedPrompt: string | null;
  width: number;
  height: number;
  mimeType: "image/png";
  quota: {
    limit: number;
    remaining: number;
    windowHours: number;
  };
};

export type SenecaImageRequest = {
  context: SenecaContextRef;
  prompt: string;
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  conversationId?: string;
};

export type SenecaImageEditRequest = {
  context: SenecaContextRef;
  prompt: string;
  attachment: Omit<SenecaChatAttachment, "mimeType"> & {
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  };
  conversationId?: string;
};

export type SenecaImageResponse = {
  data: SenecaGeneratedImage & { conversationId: string };
};

export type SenecaAskActionId =
  | "view_overdue_tasks"
  | "schedule_check_in"
  | "create_recognition"
  | "create_follow_up_task"
  | "build_checklist"
  | "open_team";

export type SenecaAskPlanOneOnOne = {
  memberUserId: string;
  memberName: string;
  startDate: string;
  durationMinutes: number;
  dateLabel: string;
  timeLabel: string;
};

export type SenecaAskCancelOneOnOne = {
  eventId: string;
  memberUserId: string;
  memberName: string;
  startDate: string;
  dateLabel: string;
  timeLabel: string;
};

export type SenecaAskCreateTask = {
  title: string;
  description: string | null;
  assigneeUserIds: string[];
  assigneeNames: string[];
  isJoint: boolean;
  dueDate: string | null;
  dueDateLabel: string | null;
  priority: "low" | "medium" | "high";
};

export type SenecaAskResponse = {
  data: {
    available: boolean;
    message: string;
    insights: Array<{ label: string; detail?: string }>;
    suggestedActions: Array<{
      title: string;
      description: string;
      action: SenecaAskActionId;
    }>;
    planOneOnOne: SenecaAskPlanOneOnOne | null;
    cancelOneOnOne: SenecaAskCancelOneOnOne | null;
    createTask: SenecaAskCreateTask | null;
    conversationId?: string;
  };
};

export type SenecaContextsResponse = {
  data: SenecaContextOption[];
};

export type TeamMomentumBand = "strong" | "building" | "ready_to_rebuild";

export type TeamMomentumNotEnoughActivityReason = "no_qualifying_completions";

export type TeamMomentumMemberSummary = {
  teamMemberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  currentStreak: number;
  personalBestStreak: number;
  momentumRunStartedAt: string | null;
  momentumLastQualifiedAt: string | null;
  completedThisMonth: number;
  overdueTaskCount: number;
};

export type TeamMomentumGroupedMember = TeamMomentumMemberSummary & {
  band: TeamMomentumBand;
};

export type TeamMomentumNotEnoughActivityMember = TeamMomentumMemberSummary & {
  reason: TeamMomentumNotEnoughActivityReason;
};

export type TeamMomentumLeaderSummaryRequest = {
  teamId: string;
};

export type TeamMomentumLeaderSummary = {
  teamId: string;
  generatedAt: string;
  activeWindowDays: 30;
  activeCount: number;
  eligibleCount: number;
  groups: {
    strong: TeamMomentumGroupedMember[];
    building: TeamMomentumGroupedMember[];
    readyToRebuild: TeamMomentumGroupedMember[];
  };
  notEnoughActivity: {
    count: number;
    members: TeamMomentumNotEnoughActivityMember[];
  };
};

export type TeamMomentumLeaderSummaryResponse = {
  data: TeamMomentumLeaderSummary;
};

export type TeamMomentumCompletionEvidence = {
  creditId: string;
  sourceTaskId: string;
  sourceTaskAvailable: boolean;
  title: string | null;
  incognito: boolean;
  dueAt: string;
  completedAt: string;
  onTime: boolean;
};

export type TeamMomentumCurrentRunEvidence = {
  startedAt: string | null;
  lastQualifiedAt: string | null;
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  completions: TeamMomentumCompletionEvidence[];
};

export type TeamMomentumStreakBreakingLateCompletion =
  TeamMomentumCompletionEvidence & {
    onTime: false;
    streakBeforeBreak: number;
  };

export type TeamMomentumTaskSummary = {
  id: string;
  title: string | null;
  incognito: boolean;
  priority: "low" | "medium" | "high" | "urgent";
  status: string;
  isJoint: boolean;
};

export type TeamMomentumActiveTaskSummary = TeamMomentumTaskSummary & {
  dueAt: string | null;
};

export type TeamMomentumOverdueTaskSummary = TeamMomentumTaskSummary & {
  dueAt: string;
  overdueSince: string;
};

export type TeamMomentumMemberDetailRequest = {
  teamId: string;
  memberUserId: string;
  currentRunLimit?: number;
};

export type TeamMomentumMemberDetail = {
  teamId: string;
  generatedAt: string;
  activeWindowDays: 30;
  member: TeamMomentumMemberSummary;
  active: boolean;
  band: TeamMomentumBand | null;
  notEnoughActivityReason: TeamMomentumNotEnoughActivityReason | null;
  currentRun: TeamMomentumCurrentRunEvidence;
  latestStreakBreakingLateCompletion: TeamMomentumStreakBreakingLateCompletion | null;
  activeTasks: TeamMomentumActiveTaskSummary[];
  overdueTasks: TeamMomentumOverdueTaskSummary[];
};

export type TeamMomentumMemberDetailResponse = {
  data: TeamMomentumMemberDetail;
};

export type PersonalRecognition = {
  id: string;
  createdAt: string;
  celebrationType: string;
  message: string | null;
  workspace: { id: string; name: string } | null;
  giver: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  recipient?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
};

export type PersonalRecognitionsResponse = {
  total: number;
  items: PersonalRecognition[];
  givenTotal: number;
  givenItems: PersonalRecognition[];
};

export type HomeTodayItemType =
  | "task"
  | "reminder"
  | "event"
  | "meeting"
  | "check_in"
  | "holiday"
  | "external";

export type HomeTodayItem = {
  id: string;
  type: HomeTodayItemType;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  workspace: { id: string; name: string } | null;
};

export type HomeTodayResponse = {
  date: string;
  timeZone: string;
  dateStart: string;
  dateEnd: string;
  items: HomeTodayItem[];
};

export type CreatePersonalRecognitionRequest = {
  targetUserId: string;
  celebrationType: string;
  message: string;
};

export type CreatePersonalRecognitionResponse = {
  id: string;
};

export type StockPhoto = {
  id: string;
  title: string;
  thumbUrl: string;
  url: string;
};

export type StockPhotoSearchResponse = {
  photos: StockPhoto[];
};

export type EndVideoMeetingResponse = {
  ended: true;
  roomId: string;
};

export type VideoCheckInContextResponse = {
  data: {
    sourceVideoRoomId: string;
    roomKind: "calendar" | "dm" | "group" | "team";
    calendarEventId: string | null;
    eligiblePairs: Array<{
      workspace: { id: string; name: string };
      member: {
        id: string;
        name: string | null;
        email: string;
        image: string | null;
      };
    }>;
  };
};
