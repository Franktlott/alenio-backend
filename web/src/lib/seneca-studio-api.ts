import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson, apiPutJson } from "./api";

/** Mirrors backend/src/lib/seneca-config-types.ts */

export type SenecaTone = "supportive" | "balanced" | "direct";
export type SenecaResponseLength = "concise" | "standard" | "detailed";
export type SenecaCoachingStyle =
  | "development_first"
  | "balanced"
  | "accountability_first"
  | "recognition_focused"
  | "custom";

export type SenecaConfigStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type SenecaConfigSource = "published" | "draft" | "default";

export type SenecaStudioData = {
  tone: SenecaTone;
  responseLength: SenecaResponseLength;
  coachingStyle: SenecaCoachingStyle;
  askFollowUps: boolean;
  alwaysDo: string[];
  neverDo: string[];
  leadershipPhilosophy: string;
  approvedTerms: string[];
  avoidedTerms: string[];
};

export type SenecaOperationalGoal = {
  id: string;
  title: string;
  description: string;
  targetDate: string | null;
  priority: "low" | "medium" | "high";
  status: "active" | "completed" | "paused";
};

export type SenecaOperationalContextData = {
  currentPriorities: string[];
  currentGoals: SenecaOperationalGoal[];
  currentInitiatives: string[];
  focusAreas: string[];
  workspaceNotes: string;
  recognitionPreferences: {
    publicRecognition: boolean;
    privateRecognition: boolean;
    celebrateMilestones: boolean;
    celebrateTrainingCompletion: boolean;
    celebrateCustomerWins: boolean;
  };
};

export type SenecaConfigMeta = {
  id: string | null;
  status: SenecaConfigStatus | null;
  version: number | null;
  source: SenecaConfigSource;
  publishedAt: string | null;
  publishedBy: string | null;
  updatedAt: string | null;
  canEdit: boolean;
};

export type SenecaStudioResponse = SenecaConfigMeta & {
  studio: SenecaStudioData;
};

export type SenecaOperationalContextResponse = SenecaConfigMeta & {
  operationalContext: SenecaOperationalContextData;
};

export type SenecaConfigVersionRow = {
  id: string;
  status: SenecaConfigStatus;
  version: number;
  publishedAt: string | null;
  publishedBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SenecaKnowledgeRow = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  version: number;
  contentText: string;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  uploadedAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type SenecaPromptTemplateRow = {
  id: string;
  templateKey: string;
  title: string;
  status: string;
  version: number;
  instructions: string;
  updatedAt: string;
  createdAt: string;
};

export type SenecaPreviewResponse = {
  generationId: string;
  question: string;
  response: string;
  promptVersion: string | null;
  knowledgeUsed: string[];
  contextUsed: string[];
  studioVersion: number | null;
  operationalVersion: number | null;
};

export type SenecaFeedbackRating = "helpful" | "needs_improvement";

export const DEFAULT_STUDIO_DATA: SenecaStudioData = {
  tone: "balanced",
  responseLength: "standard",
  coachingStyle: "balanced",
  askFollowUps: true,
  alwaysDo: [
    "Give practical recommendations",
    "Focus on observable behavior",
    "Explain why the recommendation matters",
    "Celebrate wins when appropriate",
    "Recommend one next step",
    "Coach like an experienced frontline leader",
  ],
  neverDo: [
    "Invent employee history",
    "Recommend termination",
    "Give HR advice",
    "Give legal advice",
    "Shame team members",
    "Use corporate buzzwords",
  ],
  leadershipPhilosophy: "",
  approvedTerms: [
    "associate",
    "leader",
    "check-in",
    "development plan",
    "recognition",
    "shift",
    "store",
  ],
  avoidedTerms: ["employee", "write-up", "personnel issue"],
};

export const DEFAULT_OPERATIONAL_CONTEXT: SenecaOperationalContextData = {
  currentPriorities: [],
  currentGoals: [],
  currentInitiatives: [],
  focusAreas: [],
  workspaceNotes: "",
  recognitionPreferences: {
    publicRecognition: true,
    privateRecognition: true,
    celebrateMilestones: true,
    celebrateTrainingCompletion: true,
    celebrateCustomerWins: true,
  },
};

export const SENECA_PROMPT_TEMPLATE_KEYS = [
  { key: "general_coaching", title: "General Coaching" },
  { key: "check_in_prep", title: "Check-in Preparation" },
  { key: "development_plans", title: "Development Plans" },
  { key: "recognition", title: "Recognition" },
  { key: "notes_to_tasks", title: "Notes → Tasks" },
  { key: "task_prioritization", title: "Task Prioritization" },
  { key: "daily_summary", title: "Daily Summary" },
  { key: "shift_summary", title: "Shift Summary" },
  { key: "performance_review", title: "Performance Review" },
] as const;

export const COACHING_STYLE_OPTIONS: Array<{ value: SenecaCoachingStyle; label: string }> = [
  { value: "development_first", label: "Development First" },
  { value: "balanced", label: "Balanced" },
  { value: "accountability_first", label: "Accountability First" },
  { value: "recognition_focused", label: "Recognition Focused" },
  { value: "custom", label: "Custom" },
];

export const FOCUS_AREA_OPTIONS = [
  "Customer Experience",
  "Food Safety",
  "Labor",
  "Recognition",
  "Development",
  "Sales",
  "Cleanliness",
  "Training",
] as const;

function studioBase(teamId: string) {
  return `/api/teams/${encodeURIComponent(teamId)}/seneca-studio`;
}

/** Owner can edit; team_leader / admin can view; members have no access. */
export function senecaStudioAccess(role: string | null | undefined): {
  canView: boolean;
  canEdit: boolean;
} {
  const r = (role ?? "").toLowerCase();
  if (r === "owner") return { canView: true, canEdit: true };
  if (r === "team_leader" || r === "admin") return { canView: true, canEdit: false };
  return { canView: false, canEdit: false };
}

export function fetchSenecaStudio(teamId: string) {
  return apiGetJson<{ data: SenecaStudioResponse }>(`${studioBase(teamId)}/studio`).then((r) => r.data);
}

export function saveSenecaStudioDraft(teamId: string, studio: SenecaStudioData) {
  return apiPutJson<{ data: SenecaStudioResponse }>(`${studioBase(teamId)}/studio`, { studio }).then(
    (r) => r.data,
  );
}

export function publishSenecaStudio(teamId: string) {
  return apiPostJson<{ data: SenecaStudioResponse }>(`${studioBase(teamId)}/studio/publish`, {}).then(
    (r) => r.data,
  );
}

export function fetchSenecaStudioVersions(teamId: string) {
  return apiGetJson<{ data: SenecaConfigVersionRow[] }>(`${studioBase(teamId)}/studio/versions`).then(
    (r) => r.data,
  );
}

export function restoreSenecaStudioVersion(teamId: string, version: number) {
  return apiPostJson<{ data: SenecaStudioResponse }>(`${studioBase(teamId)}/studio/restore`, {
    version,
  }).then((r) => r.data);
}

export function fetchSenecaOperationalContext(teamId: string) {
  return apiGetJson<{ data: SenecaOperationalContextResponse }>(
    `${studioBase(teamId)}/operational-context`,
  ).then((r) => r.data);
}

export function saveSenecaOperationalContextDraft(
  teamId: string,
  operationalContext: SenecaOperationalContextData,
) {
  return apiPutJson<{ data: SenecaOperationalContextResponse }>(
    `${studioBase(teamId)}/operational-context`,
    { operationalContext },
  ).then((r) => r.data);
}

export function publishSenecaOperationalContext(teamId: string) {
  return apiPostJson<{ data: SenecaOperationalContextResponse }>(
    `${studioBase(teamId)}/operational-context/publish`,
    {},
  ).then((r) => r.data);
}

export function fetchSenecaOperationalContextVersions(teamId: string) {
  return apiGetJson<{ data: SenecaConfigVersionRow[] }>(
    `${studioBase(teamId)}/operational-context/versions`,
  ).then((r) => r.data);
}

export function restoreSenecaOperationalContextVersion(teamId: string, version: number) {
  return apiPostJson<{ data: SenecaOperationalContextResponse }>(
    `${studioBase(teamId)}/operational-context/restore`,
    { version },
  ).then((r) => r.data);
}

export function fetchSenecaKnowledge(teamId: string) {
  return apiGetJson<{ data: SenecaKnowledgeRow[] }>(`${studioBase(teamId)}/knowledge`).then(
    (r) => r.data,
  );
}

export function createSenecaKnowledge(
  teamId: string,
  body: {
    title: string;
    category?: string;
    description?: string;
    contentText?: string;
    status?: "ACTIVE" | "ARCHIVED";
  },
) {
  return apiPostJson<{ data: SenecaKnowledgeRow }>(`${studioBase(teamId)}/knowledge`, body).then(
    (r) => r.data,
  );
}

export function updateSenecaKnowledge(
  teamId: string,
  knowledgeId: string,
  body: Partial<{
    title: string;
    category: string;
    description: string | null;
    contentText: string;
    status: "ACTIVE" | "ARCHIVED";
  }>,
) {
  return apiPatchJson<{ data: SenecaKnowledgeRow }>(
    `${studioBase(teamId)}/knowledge/${encodeURIComponent(knowledgeId)}`,
    body,
  ).then((r) => r.data);
}

export function deleteSenecaKnowledge(teamId: string, knowledgeId: string) {
  return apiDeleteJson<{ data: { ok: true } }>(
    `${studioBase(teamId)}/knowledge/${encodeURIComponent(knowledgeId)}`,
  ).then((r) => r.data);
}

export function fetchSenecaPromptTemplates(teamId: string) {
  return apiGetJson<{ data: SenecaPromptTemplateRow[] }>(
    `${studioBase(teamId)}/prompt-templates`,
  ).then((r) => r.data);
}

export function updateSenecaPromptTemplate(
  teamId: string,
  templateKey: string,
  instructions: string,
) {
  return apiPatchJson<{ data: SenecaPromptTemplateRow }>(
    `${studioBase(teamId)}/prompt-templates/${encodeURIComponent(templateKey)}`,
    { instructions },
  ).then((r) => r.data);
}

export function previewSenecaStudio(
  teamId: string,
  body: { question: string; templateKey?: string | null },
) {
  return apiPostJson<{ data: SenecaPreviewResponse }>(`${studioBase(teamId)}/preview`, body).then(
    (r) => r.data,
  );
}

export function submitSenecaGenerationFeedback(
  teamId: string,
  generationId: string,
  body: { rating: SenecaFeedbackRating; note?: string },
) {
  return apiPostJson<{ data: { ok: true } }>(
    `${studioBase(teamId)}/generations/${encodeURIComponent(generationId)}/feedback`,
    body,
  ).then((r) => r.data);
}
