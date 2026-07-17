import { apiGet, apiPatch, apiPost } from "./api";
import type { Team, WalkOccurrence, WalkRun } from "./types";

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
  const qs = new URLSearchParams({
    from: start.toISOString(),
    to: end.toISOString(),
  });
  return apiGet<{ data: WalkOccurrence[] }>(`${walks(teamId)}/occurrences?${qs}`).then((r) => r.data);
}

export function startCheckRun(teamId: string, occurrenceId: string) {
  return apiPost<{ data: WalkRun }>(
    `${walks(teamId)}/occurrences/${encodeURIComponent(occurrenceId)}/runs`,
    {},
  ).then((r) => r.data);
}

export function fetchRun(teamId: string, runId: string) {
  return apiGet<{ data: WalkRun }>(
    `${walks(teamId)}/runs/${encodeURIComponent(runId)}`,
  ).then((r) => r.data);
}

export function submitTemperature(
  teamId: string,
  runId: string,
  itemId: string,
  value: number,
  unit: "F" | "C" = "F",
) {
  return apiPatch<{ data: WalkRun }>(
    `${walks(teamId)}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}`,
    {
      response: { value, unit, source: "manual" as const },
    },
  ).then((r) => r.data);
}

export function completeRun(teamId: string, runId: string) {
  return apiPost<{ data: WalkRun }>(
    `${walks(teamId)}/runs/${encodeURIComponent(runId)}/complete`,
    {},
  ).then((r) => r.data);
}

export function flattenRunItems(run: WalkRun) {
  return [...run.items].sort((a, b) => a.position - b.position);
}
