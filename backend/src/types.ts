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
  route: "/team-priority" | "/member-profile" | "/(app)/execute" | "/(app)/activity" | "/(app)/team";
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
