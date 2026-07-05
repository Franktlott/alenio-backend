import { apiGetJson, apiPostJson } from "./api";

export type HaccpDueStatus = "due_now" | "due_later" | "completed" | "missed" | "in_progress";
export type HaccpItemStatus = "pass" | "needs_attention" | "na";
export type HaccpCorrectiveActionType =
  | "discarded"
  | "moved_cooler"
  | "rapid_chilled"
  | "maintenance"
  | "rechecked_passed"
  | "other";

export type FoodSafetyDashboard = {
  stats: {
    completionPct: number;
    completedChecks: number;
    missedChecks: number;
    openCorrectiveActions: number;
    overdueItems: number;
  };
  cards: {
    tempChecks: Array<{
      templateId: string;
      name: string;
      kind: string;
      dueStatus: HaccpDueStatus;
      dueLabel: string;
      itemCount: number;
      runId: string | null;
    }>;
    coolingActive: number;
    probeCalibrationNextDue: string | null;
    openCorrectiveActions: number;
  };
  timeline: Array<{
    id: string;
    eventType: string;
    message: string;
    actorName: string | null;
    createdAt: string;
  }>;
};

export type HaccpRunRow = {
  id: string;
  templateId: string;
  templateName: string;
  kind: string;
  status: string;
  windowStart: string | null;
  windowEnd: string | null;
  dueLabel: string | null;
  itemsTotal: number;
  itemsCompleted: number;
  progressPct: number;
  items: Array<{
    id: string;
    label: string;
    minTempF: number | null;
    maxTempF: number | null;
    tempRangeLabel: string;
    allowNa: boolean;
    readingF: number | null;
    status: HaccpItemStatus | null;
    notes: string | null;
    photoUrl: string | null;
    sortOrder: number;
    completedAt: string | null;
  }>;
};

export type HaccpTemplateRow = {
  id: string;
  name: string;
  kind: string;
  workplace: string;
  windowStart: string | null;
  windowEnd: string | null;
  dueLabel: string | null;
  photoRequired: boolean;
  noteRequired: boolean;
  bluetoothMode: string;
  itemCount: number;
  items: Array<{
    id: string;
    label: string;
    minTempF: number | null;
    maxTempF: number | null;
    tempRangeLabel: string;
    allowNa: boolean;
  }>;
};

export function fetchTeamFoodSafetyDashboard(teamId: string) {
  return apiGetJson<{ data: { dashboard: FoodSafetyDashboard; canManage: boolean } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/dashboard`,
  ).then((r) => r.data);
}

export function fetchTeamFoodSafetyManager(teamId: string) {
  return apiGetJson<{ data: { manager: Record<string, unknown> } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/manager`,
  ).then((r) => r.data.manager);
}

export function postTeamFoodSafetySeed(teamId: string) {
  return apiPostJson<{ data: { seeded: boolean } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/seed`,
    {},
  ).then((r) => r.data);
}

export function fetchTeamHaccpTemplates(teamId: string) {
  return apiGetJson<{ data: { templates: HaccpTemplateRow[]; canManage: boolean } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/templates`,
  ).then((r) => r.data);
}

export function postTeamHaccpTemplate(
  teamId: string,
  body: {
    name: string;
    kind: string;
    workplace?: string;
    windowStart?: string | null;
    windowEnd?: string | null;
    dueLabel?: string | null;
    photoRequired?: boolean;
    noteRequired?: boolean;
    bluetoothMode?: string;
    items: Array<{ label: string; minTempF?: number | null; maxTempF?: number | null; allowNa?: boolean }>;
  },
) {
  return apiPostJson<{ data: HaccpTemplateRow }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/templates`,
    body,
  ).then((r) => r.data);
}

export function postTeamHaccpRunStart(teamId: string, templateId: string) {
  return apiPostJson<{ data: { run: HaccpRunRow } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/templates/${encodeURIComponent(templateId)}/start`,
    {},
  ).then((r) => r.data.run);
}

export function fetchTeamHaccpRun(teamId: string, runId: string) {
  return apiGetJson<{ data: { run: HaccpRunRow } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/runs/${encodeURIComponent(runId)}`,
  ).then((r) => r.data.run);
}

export function postTeamHaccpRunItem(
  teamId: string,
  runId: string,
  itemId: string,
  body: {
    readingF?: number | null;
    status: HaccpItemStatus;
    entryMethod?: "manual" | "bluetooth";
    notes?: string | null;
    photoUrl?: string | null;
  },
) {
  return apiPostJson<{ data: { item: HaccpRunRow["items"][number]; needsCorrectiveAction: boolean } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}`,
    body,
  ).then((r) => r.data);
}

export function postTeamHaccpRunComplete(teamId: string, runId: string) {
  return apiPostJson<{ data: { run: HaccpRunRow } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/runs/${encodeURIComponent(runId)}/complete`,
    {},
  ).then((r) => r.data.run);
}

export function postTeamHaccpCorrectiveAction(
  teamId: string,
  body: {
    runId?: string | null;
    runItemId?: string | null;
    coolingLogId?: string | null;
    actionType: HaccpCorrectiveActionType;
    notes?: string | null;
    photoUrl?: string | null;
  },
) {
  return apiPostJson<{ data: { id: string } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/corrective-actions`,
    body,
  ).then((r) => r.data);
}

export function postTeamHaccpProbeCalibration(teamId: string, actualTempF: number) {
  return apiPostJson<{ data: { passed: boolean; nextDueAt: string } }>(
    `/api/teams/${encodeURIComponent(teamId)}/food-safety/probe-calibrations`,
    { actualTempF },
  ).then((r) => r.data);
}

export function fetchGoFoodSafetyDashboard(hubToken: string, deviceId: string) {
  const q = new URLSearchParams({ hubToken, deviceId });
  return apiGetJson<{ data: { dashboard: FoodSafetyDashboard } }>(`/api/public/go/food-safety/dashboard?${q}`).then(
    (r) => r.data.dashboard,
  );
}

export function postGoHaccpRunStart(
  hubToken: string,
  deviceId: string,
  templateId: string,
  actorName: string,
  leaderUserId?: string,
) {
  return apiPostJson<{ data: { run: HaccpRunRow } }>(
    `/api/public/go/food-safety/templates/${encodeURIComponent(templateId)}/start`,
    { hubToken, deviceId, actorName, leaderUserId },
  ).then((r) => r.data.run);
}

export function fetchGoHaccpRun(hubToken: string, deviceId: string, runId: string) {
  const q = new URLSearchParams({ hubToken, deviceId });
  return apiGetJson<{ data: { run: HaccpRunRow } }>(
    `/api/public/go/food-safety/runs/${encodeURIComponent(runId)}?${q}`,
  ).then((r) => r.data.run);
}

export function postGoHaccpRunItem(
  hubToken: string,
  deviceId: string,
  runId: string,
  itemId: string,
  body: {
    actorName: string;
    readingF?: number | null;
    status: HaccpItemStatus;
    entryMethod?: "manual" | "bluetooth";
    notes?: string | null;
    photoUrl?: string | null;
  },
) {
  return apiPostJson<{ data: { item: HaccpRunRow["items"][number]; needsCorrectiveAction: boolean } }>(
    `/api/public/go/food-safety/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}`,
    { hubToken, deviceId, ...body },
  ).then((r) => r.data);
}

export function postGoHaccpRunComplete(hubToken: string, deviceId: string, runId: string, actorName: string) {
  return apiPostJson<{ data: { run: HaccpRunRow } }>(
    `/api/public/go/food-safety/runs/${encodeURIComponent(runId)}/complete`,
    { hubToken, deviceId, actorName },
  ).then((r) => r.data.run);
}

export function postGoHaccpCorrectiveAction(
  hubToken: string,
  deviceId: string,
  body: {
    runId?: string | null;
    runItemId?: string | null;
    coolingLogId?: string | null;
    actionType: HaccpCorrectiveActionType;
    notes?: string | null;
    photoUrl?: string | null;
    performedByName: string;
    performedByUserId?: string | null;
  },
) {
  return apiPostJson<{ data: { id: string } }>(`/api/public/go/food-safety/corrective-actions`, {
    hubToken,
    deviceId,
    ...body,
  }).then((r) => r.data);
}

export function postGoHaccpProbeCalibration(
  hubToken: string,
  deviceId: string,
  actualTempF: number,
  performedByName: string,
  performedByUserId?: string,
) {
  return apiPostJson<{ data: { passed: boolean; nextDueAt: string } }>(
    `/api/public/go/food-safety/probe-calibrations`,
    { hubToken, deviceId, actualTempF, performedByName, performedByUserId },
  ).then((r) => r.data);
}

export function postGoHaccpCoolingLog(
  hubToken: string,
  deviceId: string,
  body: { itemName: string; firstTempF: number; createdByName: string },
) {
  return apiPostJson<{ data: { id: string } }>(`/api/public/go/food-safety/cooling-logs`, {
    hubToken,
    deviceId,
    ...body,
  }).then((r) => r.data);
}

export function postGoHaccpCoolingReading(
  hubToken: string,
  deviceId: string,
  logId: string,
  body: { tempF: number; actorName: string },
) {
  return apiPostJson<{ data: { needsCorrectiveAction: boolean; log: { status: string } } }>(
    `/api/public/go/food-safety/cooling-logs/${encodeURIComponent(logId)}/readings`,
    { hubToken, deviceId, ...body },
  ).then((r) => r.data);
}

export const CORRECTIVE_ACTION_LABELS: Record<HaccpCorrectiveActionType, string> = {
  discarded: "Discarded product",
  moved_cooler: "Moved to working cooler",
  rapid_chilled: "Rapid chilled",
  maintenance: "Maintenance notified",
  rechecked_passed: "Rechecked and passed",
  other: "Other",
};

export function dueStatusPill(status: HaccpDueStatus): string {
  if (status === "due_now") return "Due now";
  if (status === "due_later") return "Scheduled";
  if (status === "completed") return "Completed";
  if (status === "missed") return "Missed";
  return "In progress";
}
