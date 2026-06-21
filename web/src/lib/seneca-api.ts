import { apiPostJson } from "./api";

export type SenecaPrep = {
  lastCheckInNotes: string | null;
  openDevelopmentGoals: string[];
  openFollowUpTasks: string[];
  recentWins: string[];
  completionPatterns: string | null;
  suggestedTalkingPoints: string[];
  suggestedCoachingQuestions: string[];
};

export type SenecaPrepResponse = {
  available: boolean;
  message?: string;
  raw?: unknown;
  prep: SenecaPrep;
};

export type SenecaAssistAction =
  | "suggest_next_question"
  | "rewrite_feedback"
  | "notes_to_action_items"
  | "create_follow_up_task"
  | "create_development_goal"
  | "summarize_conversation";

export type SenecaDevelopmentGoalDraft = {
  goalTitle: string;
  focusArea: string;
  actionSteps30Day: string[];
  managerSupportNeeded: string[];
  successMeasures: string[];
  targetDate: string | null;
};

export type SenecaAssistResult = {
  result: string;
  suggestions?: string[];
  followUpTasks?: Array<{ title: string; assigneeRole: "associate" | "leader"; dueDate?: string }>;
  developmentGoal?: SenecaDevelopmentGoalDraft;
};

export type SenecaSummary = {
  conversationSummary: string;
  winsDiscussed: string[];
  opportunitiesDiscussed: string[];
  actionItems: string[];
  followUpTasks: Array<{ title: string; assigneeRole: "associate" | "leader"; dueDate?: string }>;
  suggestedNextCheckInDate: string | null;
  draftDevelopmentGoal: SenecaDevelopmentGoalDraft | null;
};

function senecaPath(teamId: string, memberUserId: string, suffix: string) {
  return `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberUserId)}/seneca/${suffix}`;
}

export function fetchSenecaPrep(
  teamId: string,
  memberUserId: string,
  body: { templateId?: string; memberName?: string; managerName?: string | null },
) {
  return apiPostJson<{ data: SenecaPrepResponse }>(senecaPath(teamId, memberUserId, "prep"), body).then(
    (r) => r.data,
  );
}

export function senecaAssist(
  teamId: string,
  memberUserId: string,
  body: {
    action: SenecaAssistAction;
    templateId?: string;
    templateTitle?: string;
    templateFields?: Array<{ id: string; label: string; type: string }>;
    responses?: Record<string, string | number>;
    focusFieldId?: string;
    focusText?: string;
    memberName?: string;
    managerName?: string | null;
  },
) {
  return apiPostJson<{ data: SenecaAssistResult }>(senecaPath(teamId, memberUserId, "assist"), body).then(
    (r) => r.data,
  );
}

export function fetchSenecaSummary(
  teamId: string,
  memberUserId: string,
  body: {
    templateTitle: string;
    templateFields: Array<{ id: string; label: string; type: string }>;
    responses: Record<string, string | number>;
    followUpTasks?: Array<{ title: string; assigneeRole?: "associate" | "leader" }>;
    memberName?: string;
    managerName?: string | null;
  },
) {
  return apiPostJson<{ data: SenecaSummary }>(senecaPath(teamId, memberUserId, "summary"), body).then((r) => r.data);
}

export function fetchSenecaDevelopmentPlan(
  teamId: string,
  memberUserId: string,
  body: {
    memberName?: string;
    managerName?: string | null;
    contextNotes?: string;
    checkInSummary?: string;
  },
) {
  return apiPostJson<{ data: SenecaDevelopmentGoalDraft & { status: "active" } }>(
    senecaPath(teamId, memberUserId, "development-plan"),
    body,
  ).then((r) => r.data);
}
