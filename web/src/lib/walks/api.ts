import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "../api";
import { getWebApiBase } from "../api-base";
import type {
  WalkItem,
  WalkItemType,
  WalkItemTypeCatalogEntry,
  WalkOccurrenceListItem,
  WalkRun,
  WalkSection,
  WalkTemplate,
  WalkTemplateStatus,
} from "./types";

const walksBase = (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}/walks`;

export function fetchWalkItemTypes(teamId: string) {
  return apiGetJson<{ data: WalkItemTypeCatalogEntry[] }>(`${walksBase(teamId)}/item-types`).then(
    (r) => r.data,
  );
}

export function fetchWalkTemplates(teamId: string) {
  return apiGetJson<{ data: WalkTemplate[] }>(`${walksBase(teamId)}/templates`).then((r) => r.data);
}

export function fetchWalkTemplate(teamId: string, templateId: string) {
  return apiGetJson<{ data: WalkTemplate }>(
    `${walksBase(teamId)}/templates/${encodeURIComponent(templateId)}`,
  ).then((r) => r.data);
}

export function createWalkTemplate(
  teamId: string,
  body: {
    name: string;
    description?: string | null;
    workplace?: string;
    estimatedDurationMinutes?: number | null;
  },
) {
  return apiPostJson<{ data: WalkTemplate }>(`${walksBase(teamId)}/templates`, body).then((r) => r.data);
}

export function patchWalkTemplate(
  teamId: string,
  templateId: string,
  patch: Partial<{
    name: string;
    description: string | null;
    workplace: string;
    scoringEnabled: boolean;
    estimatedDurationMinutes: number | null;
    status: WalkTemplateStatus;
  }>,
) {
  return apiPatchJson<{ data: WalkTemplate }>(
    `${walksBase(teamId)}/templates/${encodeURIComponent(templateId)}`,
    patch,
  ).then((r) => r.data);
}

export function deleteWalkTemplate(teamId: string, templateId: string) {
  return apiDeleteJson<{ data: { ok: true } }>(
    `${walksBase(teamId)}/templates/${encodeURIComponent(templateId)}`,
  ).then((r) => r.data);
}

export function createWalkSection(
  teamId: string,
  templateId: string,
  body: { title: string; description?: string | null },
) {
  return apiPostJson<{ data: WalkSection }>(
    `${walksBase(teamId)}/templates/${encodeURIComponent(templateId)}/sections`,
    body,
  ).then((r) => r.data);
}

export function createWalkItem(
  teamId: string,
  templateId: string,
  body: {
    type: WalkItemType;
    title: string;
    sectionId?: string | null;
    description?: string | null;
    instructions?: string | null;
    required?: boolean;
    config?: Record<string, unknown>;
  },
) {
  return apiPostJson<{ data: WalkItem }>(
    `${walksBase(teamId)}/templates/${encodeURIComponent(templateId)}/items`,
    body,
  ).then((r) => r.data);
}

export function patchWalkItem(
  teamId: string,
  templateId: string,
  itemId: string,
  patch: Partial<{
    type: WalkItemType;
    title: string;
    sectionId: string | null;
    description: string | null;
    instructions: string | null;
    required: boolean;
    config: Record<string, unknown>;
    libraryItemVersionId: string;
    pinToCurrentVersion: boolean;
  }>,
) {
  return apiPatchJson<{ data: WalkItem }>(
    `${walksBase(teamId)}/templates/${encodeURIComponent(templateId)}/items/${encodeURIComponent(itemId)}`,
    patch,
  ).then((r) => r.data);
}

export function deleteWalkItem(teamId: string, templateId: string, itemId: string) {
  return apiDeleteJson<{ data: { ok: true } }>(
    `${walksBase(teamId)}/templates/${encodeURIComponent(templateId)}/items/${encodeURIComponent(itemId)}`,
  ).then((r) => r.data);
}

export function reorderWalkItems(
  teamId: string,
  templateId: string,
  orderedIds: string[],
  sectionId?: string | null,
) {
  return apiPostJson<{ data: WalkTemplate }>(
    `${walksBase(teamId)}/templates/${encodeURIComponent(templateId)}/items/reorder`,
    { orderedIds, sectionId },
  ).then((r) => r.data);
}

// ── Public Go (kiosk) ───────────────────────────────────────────────────────

function publicWalksQs(hubToken: string, deviceId: string) {
  return new URLSearchParams({ hubToken, deviceId }).toString();
}

export function fetchPublicPublishedWalks(hubToken: string, deviceId: string) {
  return apiGetJson<{ data: WalkTemplate[]; occurrences?: WalkOccurrenceListItem[] }>(
    `/api/public/go/walks?${publicWalksQs(hubToken, deviceId)}`,
  ).then((r) => ({ templates: r.data, occurrences: r.occurrences ?? [] }));
}

export function startPublicOccurrenceRun(
  hubToken: string,
  deviceId: string,
  occurrenceId: string,
  opts?: { startedByName?: string | null; isTest?: boolean },
) {
  return apiPostJson<{ data: WalkRun }>(
    `/api/public/go/walks/occurrences/${encodeURIComponent(occurrenceId)}/runs`,
    {
      hubToken,
      deviceId,
      startedByName: opts?.startedByName,
      isTest: opts?.isTest,
    },
  ).then((r) => r.data);
}

export function startPublicWalkRun(
  hubToken: string,
  deviceId: string,
  templateId: string,
  opts?: { startedByName?: string | null; isTest?: boolean },
) {
  return apiPostJson<{ data: WalkRun }>(
    `/api/public/go/walks/${encodeURIComponent(templateId)}/runs`,
    {
      hubToken,
      deviceId,
      startedByName: opts?.startedByName,
      isTest: opts?.isTest,
    },
  ).then((r) => r.data);
}

export function fetchPublicWalkRun(hubToken: string, deviceId: string, runId: string) {
  return apiGetJson<{ data: WalkRun }>(
    `/api/public/go/walks/runs/${encodeURIComponent(runId)}?${publicWalksQs(hubToken, deviceId)}`,
  ).then((r) => r.data);
}

export function submitPublicWalkItemResponse(
  hubToken: string,
  deviceId: string,
  runId: string,
  itemId: string,
  body: {
    response: unknown;
    notes?: string | null;
    photoUrls?: string[] | null;
    completedBy?: string | null;
  },
) {
  return apiPatchJson<{ data: WalkRun }>(
    `/api/public/go/walks/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}`,
    { hubToken, deviceId, ...body },
  ).then((r) => r.data);
}

export function completePublicWalkRun(hubToken: string, deviceId: string, runId: string) {
  return apiPostJson<{ data: WalkRun }>(
    `/api/public/go/walks/runs/${encodeURIComponent(runId)}/complete`,
    { hubToken, deviceId },
  ).then((r) => r.data);
}

export function completePublicCorrectiveAction(
  hubToken: string,
  deviceId: string,
  runId: string,
  itemId: string,
  actionId: string,
) {
  return apiPostJson<{ data: WalkRun }>(
    `/api/public/go/walks/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}/corrective-actions/${encodeURIComponent(actionId)}/complete`,
    { hubToken, deviceId, completedBy: "Floor associate" },
  ).then((r) => r.data);
}

export async function uploadPublicWalkPhoto(
  hubToken: string,
  deviceId: string,
  file: File,
): Promise<{ id: string; url: string }> {
  const baseUrl = getWebApiBase();
  if (import.meta.env.PROD && !baseUrl.trim()) {
    throw new Error("API URL is not configured for this build.");
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("hubToken", hubToken);
  formData.append("deviceId", deviceId);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/public/go/walks/upload`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Could not reach the API to upload the photo.");
  }
  const parsed = (await res.json().catch(() => null)) as {
    data?: { id?: string; url?: string };
    error?: { message?: string };
  } | null;
  if (!res.ok || !parsed?.data?.url) {
    throw new Error(parsed?.error?.message ?? `Upload failed (${res.status})`);
  }
  return { id: parsed.data.id ?? "", url: parsed.data.url };
}
