import { api } from "@/lib/api/api";

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

export const SENECA_FOCUS_ACTION_IDS = [
  "view_check_ins",
  "view_goals",
  "view_overdue_tasks",
  "view_workload",
  "create_recognition",
  "open_team",
] as const;

export type SenecaFocusActionId = (typeof SENECA_FOCUS_ACTION_IDS)[number];

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
    | "/member-profile"
    | "/(app)/execute"
    | "/(app)/activity"
    | "/(app)/team";
  params: Record<string, string>;
  estimatedMinutes: number;
  measurable: boolean;
  completedAt: string | null;
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

export const senecaFocusQueryKey = (teamId: string) =>
  ["seneca-focus", teamId] as const;

const focusBase = (teamId: string) => `/api/teams/${teamId}/seneca/focus`;

export const fetchSenecaFocus = (teamId: string) =>
  api.get<SenecaFocusResponse>(focusBase(teamId));

export const refreshSenecaFocus = (teamId: string) =>
  api.post<SenecaFocusResponse>(`${focusBase(teamId)}/refresh`, {});

export const recordSenecaFocusOpen = (teamId: string, briefId: string) =>
  api.post<{ opened: true }>(`${focusBase(teamId)}/${briefId}/open`, {});

export const completeSenecaFocusAction = (
  teamId: string,
  briefId: string,
  actionId: string,
) =>
  api.post<SenecaFocusResponse>(
    `${focusBase(teamId)}/${briefId}/actions/${actionId}/complete`,
    {},
  );

export function isSenecaFocusActionId(
  value: string,
): value is SenecaFocusActionId {
  return (SENECA_FOCUS_ACTION_IDS as readonly string[]).includes(value);
}
