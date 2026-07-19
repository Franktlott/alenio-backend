import { apiGet, apiPatch, apiPost } from "./api";
import type { TemperatureConfig, Team, WalkOccurrence, WalkRun } from "./types";

const walks = (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}/walks`;

export function listTeams() {
  return apiGet<{ data: Team[] }>("/api/teams").then((r) => r.data);
}

export function listAvailableChecks(teamId: string) {
  return apiGet<{ data: WalkOccurrence[] }>(`${walks(teamId)}/occurrences/available`).then(
    (r) => r.data,
  );
}

/** Day window in local time → ISO for occurrence list. */
export function listChecksForDay(teamId: string, day = new Date()) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return listChecksInRange(teamId, start, end);
}

/** Inclusive local date range for history. */
export function listChecksInRange(teamId: string, from: Date, to: Date) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const qs = new URLSearchParams({
    from: start.toISOString(),
    to: end.toISOString(),
  });
  return apiGet<{ data: WalkOccurrence[] }>(`${walks(teamId)}/occurrences?${qs}`).then((r) => r.data);
}

export function fetchTempsFloorStatus(teamId: string) {
  return apiGet<{
    data: {
      moduleKey: string;
      moduleName: string;
      status: string;
      operatingMode: "testing" | "live" | null;
    };
  }>(`/api/teams/${encodeURIComponent(teamId)}/modules/temp-checks/floor-status`).then(
    (r) => r.data,
  );
}

export function startCheckRun(
  teamId: string,
  occurrenceId: string,
  opts?: { prepareOnly?: boolean },
) {
  return apiPost<{ data: WalkRun }>(
    `${walks(teamId)}/occurrences/${encodeURIComponent(occurrenceId)}/runs`,
    opts?.prepareOnly ? { prepareOnly: true } : {},
  ).then((r) => r.data);
}

/** Warm run snapshot for offline open without claiming FIRST_START_OWNS. */
export function prepareCheckRun(teamId: string, occurrenceId: string) {
  return startCheckRun(teamId, occurrenceId, { prepareOnly: true });
}

export function fetchRun(teamId: string, runId: string) {
  return apiGet<{ data: WalkRun }>(
    `${walks(teamId)}/runs/${encodeURIComponent(runId)}`,
  ).then((r) => r.data);
}

export type TemperatureSource = "manual" | "bluetooth";

export function submitTemperature(
  teamId: string,
  runId: string,
  itemId: string,
  value: number,
  unit: "F" | "C" = "F",
  source: TemperatureSource = "manual",
  retestCount = 0,
) {
  return apiPatch<{ data: WalkRun }>(
    `${walks(teamId)}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}`,
    {
      response: {
        value,
        unit,
        source,
        ...(retestCount > 0 ? { retestCount } : {}),
      },
    },
  ).then((r) => r.data);
}

export function completeCorrectiveAction(
  teamId: string,
  runId: string,
  itemId: string,
  actionId: string,
) {
  return apiPost<{ data: WalkRun }>(
    `${walks(teamId)}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}/corrective-actions/${encodeURIComponent(actionId)}/complete`,
    {},
  ).then((r) => r.data);
}

export function resetItemCheck(teamId: string, runId: string, itemId: string) {
  return apiPost<{ data: WalkRun }>(
    `${walks(teamId)}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}/reset`,
    {},
  ).then((r) => r.data);
}

export function completeRun(teamId: string, runId: string) {
  return apiPost<{ data: WalkRun }>(
    `${walks(teamId)}/runs/${encodeURIComponent(runId)}/complete`,
    {},
  ).then((r) => r.data);
}

export type SyncRunItem = {
  itemId: string;
  response: unknown;
  notes?: string | null;
  photoUrls?: string[] | null;
  correctiveActionIdsCompleted?: string[];
};

/** Batch-apply item responses + corrective completions, optionally complete the run. */
export function syncRun(
  teamId: string,
  runId: string,
  items: SyncRunItem[],
  complete = false,
) {
  return apiPost<{ data: WalkRun }>(
    `${walks(teamId)}/runs/${encodeURIComponent(runId)}/sync`,
    { items, complete },
  ).then((r) => r.data);
}

export function flattenRunItems(run: WalkRun) {
  return [...run.items].sort((a, b) => a.position - b.position);
}

/** Procedure UI only when the server still requires corrective action — not on PASS. */
export function itemNeedsProcedure(item: WalkRun["items"][number]): boolean {
  if (!item.response) return false;
  if (item.response.status !== "NEEDS_ACTION") return false;
  const actions = item.response.correctiveActions ?? [];
  // If status says NEEDS_ACTION but every step is done, treat as done (stale status).
  if (actions.length === 0) return true;
  return actions.some((a) => a.status === "PENDING");
}

/**
 * First-failure steps are done and a retemp is still required before the item
 * can advance (no PENDING CA rows remain, so itemNeedsProcedure is false).
 */
export function itemAwaitingRetemp(item: WalkRun["items"][number]): boolean {
  if (item.type !== "TEMPERATURE" || !item.response) return false;
  if (item.response.status !== "NEEDS_ACTION") return false;
  const config = (item.config ?? {}) as TemperatureConfig;
  if (!config.requireRetestOnFailure) return false;

  const payload =
    item.response.response && typeof item.response.response === "object"
      ? (item.response.response as Record<string, unknown>)
      : null;
  const retestCount =
    typeof payload?.retestCount === "number" ? payload.retestCount : 0;
  const maxRetests =
    typeof config.maximumRetests === "number" && Number.isFinite(config.maximumRetests)
      ? Math.max(1, Math.floor(config.maximumRetests))
      : 1;
  if (retestCount >= maxRetests) return false;

  const actions = item.response.correctiveActions ?? [];
  if (actions.some((a) => a.status === "PENDING")) return false;

  const firstFailure = actions.filter(
    (a) => a.branch === "first_failure" || a.branch == null,
  );
  const ifFailOpened = actions.some(
    (a) =>
      a.branch === "if_fail" &&
      (a.status === "PENDING" || a.status === "COMPLETED"),
  );
  if (ifFailOpened) return false;

  return (
    firstFailure.length === 0 ||
    firstFailure.every((a) => a.status === "COMPLETED" || a.status === "SKIPPED")
  );
}

/** True when a fail was saved but no procedure step has been completed yet. */
export function itemHasUnstartedProcedure(item: WalkRun["items"][number]): boolean {
  if (!itemNeedsProcedure(item)) return false;
  const actions = item.response?.correctiveActions ?? [];
  return !actions.some((a) => a.status === "COMPLETED");
}

export function isOpenTempItem(item: WalkRun["items"][number]): boolean {
  if (item.type !== "TEMPERATURE") return false;
  if (!item.response || item.response.status === "NOT_STARTED") return true;
  return itemNeedsProcedure(item) || itemAwaitingRetemp(item);
}
