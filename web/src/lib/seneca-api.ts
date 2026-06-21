import { apiPostJson } from "./api";
import { normalizeDevelopmentGoalDraft, normalizeQuickDevelopmentGoal, normalizeCheckInTemplateDraft, normalizeStringArray } from "./seneca-normalize";

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

export type SenecaQuickDevelopmentGoal = {
  skill: string;
  steps: string[];
};

export type {
  SenecaCheckInTemplateDraft,
  SenecaCheckInTemplateQuestion,
  SenecaCheckInTemplateSection,
} from "./seneca-normalize";

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
    (r) => ({
      ...r.data,
      prep: {
        ...r.data.prep,
        openDevelopmentGoals: normalizeStringArray(r.data.prep.openDevelopmentGoals),
        openFollowUpTasks: normalizeStringArray(r.data.prep.openFollowUpTasks),
        recentWins: normalizeStringArray(r.data.prep.recentWins),
        suggestedTalkingPoints: normalizeStringArray(r.data.prep.suggestedTalkingPoints),
        suggestedCoachingQuestions: normalizeStringArray(r.data.prep.suggestedCoachingQuestions),
      },
    }),
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
    (r) => ({
      ...r.data,
      suggestions: r.data.suggestions ? normalizeStringArray(r.data.suggestions) : undefined,
      developmentGoal: r.data.developmentGoal
        ? normalizeDevelopmentGoalDraft(r.data.developmentGoal) ?? undefined
        : undefined,
    }),
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
  return apiPostJson<{ data: SenecaSummary }>(senecaPath(teamId, memberUserId, "summary"), body).then((r) => ({
    ...r.data,
    winsDiscussed: normalizeStringArray(r.data.winsDiscussed),
    opportunitiesDiscussed: normalizeStringArray(r.data.opportunitiesDiscussed),
    actionItems: normalizeStringArray(r.data.actionItems),
    followUpTasks: Array.isArray(r.data.followUpTasks) ? r.data.followUpTasks : [],
    draftDevelopmentGoal: normalizeDevelopmentGoalDraft(r.data.draftDevelopmentGoal),
  }));
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
  ).then((r) => {
    const normalized = normalizeDevelopmentGoalDraft(r.data);
    if (!normalized) throw new Error("Seneca returned an invalid development plan.");
    return { ...normalized, status: "active" as const };
  });
}

export function fetchSenecaQuickGoal(
  teamId: string,
  memberUserId: string,
  body: {
    skillOrGoal: string;
    memberName?: string;
    managerName?: string | null;
  },
) {
  return apiPostJson<{ data: SenecaQuickDevelopmentGoal }>(senecaPath(teamId, memberUserId, "quick-goal"), body).then(
    (r) => {
      const normalized = normalizeQuickDevelopmentGoal(r.data);
      if (!normalized) throw new Error("Seneca returned an invalid development goal.");
      return normalized;
    },
  );
}

export function fetchSenecaCheckInTemplate(teamId: string, body: { brief: string }) {
  return apiPostJson<{ data: unknown }>(
    `/api/teams/${encodeURIComponent(teamId)}/seneca/check-in-template`,
    body,
  ).then((r) => {
    const normalized = normalizeCheckInTemplateDraft(r.data);
    if (!normalized) throw new Error("Seneca returned an invalid check-in template.");
    return normalized;
  });
}
