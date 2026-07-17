import { apiGetJson, apiPatchJson, apiPostJson, apiPutJson } from "../api";
import type { WalkItemType } from "./types";

export type WalkLibraryItem = {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  category: string;
  type: WalkItemType | string;
  status: string;
  currentVersion: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
  current: {
    id: string;
    version: number;
    name: string;
    description: string | null;
    instructions: string | null;
    requiredDefault: boolean;
    config: Record<string, unknown>;
    deviceMethods: Record<string, unknown>;
    correctiveActions: Array<{
      id: string;
      actionType: string;
      title: string;
      instructions: string | null;
      required: boolean;
      blocksCompletion: boolean;
      position: number;
    }>;
  } | null;
  versions: Array<{ id: string; version: number; name: string; createdAt: string }>;
};

const base = (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}/walks`;

export function fetchLibraryCategories(teamId: string) {
  return apiGetJson<{ data: string[] }>(`${base(teamId)}/library/categories`).then((r) => r.data);
}

export function fetchLibraryItems(
  teamId: string,
  filters?: { q?: string; type?: string; category?: string; status?: string },
) {
  const qs = new URLSearchParams();
  if (filters?.q) qs.set("q", filters.q);
  if (filters?.type) qs.set("type", filters.type);
  if (filters?.category) qs.set("category", filters.category);
  if (filters?.status) qs.set("status", filters.status);
  const q = qs.toString();
  return apiGetJson<{ data: WalkLibraryItem[] }>(
    `${base(teamId)}/library/items${q ? `?${q}` : ""}`,
  ).then((r) => r.data);
}

export function createLibraryItem(
  teamId: string,
  body: {
    name: string;
    type: WalkItemType;
    description?: string | null;
    category?: string;
    instructions?: string | null;
    requiredDefault?: boolean;
    config?: Record<string, unknown>;
  },
) {
  return apiPostJson<{ data: WalkLibraryItem }>(`${base(teamId)}/library/items`, body).then(
    (r) => r.data,
  );
}

export function patchLibraryItem(
  teamId: string,
  itemId: string,
  patch: Partial<{
    name: string;
    description: string | null;
    category: string;
    instructions: string | null;
    requiredDefault: boolean;
    config: Record<string, unknown>;
    status: "ACTIVE" | "ARCHIVED";
  }>,
) {
  return apiPatchJson<{ data: WalkLibraryItem }>(
    `${base(teamId)}/library/items/${encodeURIComponent(itemId)}`,
    patch,
  ).then((r) => r.data);
}

export function duplicateLibraryItem(teamId: string, itemId: string) {
  return apiPostJson<{ data: WalkLibraryItem }>(
    `${base(teamId)}/library/items/${encodeURIComponent(itemId)}/duplicate`,
    {},
  ).then((r) => r.data);
}

export function archiveLibraryItem(teamId: string, itemId: string) {
  return apiPostJson<{ data: WalkLibraryItem }>(
    `${base(teamId)}/library/items/${encodeURIComponent(itemId)}/archive`,
    {},
  ).then((r) => r.data);
}

export function fetchLibraryItemUsage(teamId: string, itemId: string) {
  return apiGetJson<{
    data: {
      walks: Array<{
        templateId: string;
        name: string;
        status: string;
        pinnedVersions: number[];
      }>;
    };
  }>(`${base(teamId)}/library/items/${encodeURIComponent(itemId)}/usage`).then((r) => r.data);
}

export function putLibraryCorrectiveActions(
  teamId: string,
  itemId: string,
  actions: Array<{
    actionType: string;
    title: string;
    instructions?: string | null;
    required?: boolean;
    blocksCompletion?: boolean;
  }>,
) {
  return apiPutJson<{ data: WalkLibraryItem }>(
    `${base(teamId)}/library/items/${encodeURIComponent(itemId)}/corrective-actions`,
    { actions },
  ).then((r) => r.data);
}

export function addLibraryItemToWalk(
  teamId: string,
  templateId: string,
  body: { libraryItemId: string; sectionId?: string | null },
) {
  return apiPostJson<{ data: unknown }>(
    `${base(teamId)}/templates/${encodeURIComponent(templateId)}/items/from-library`,
    body,
  ).then((r) => r.data);
}

export function publishWalk(teamId: string, templateId: string) {
  return apiPostJson<{ data: { template: unknown; publishedVersion: { version: number } } }>(
    `${base(teamId)}/templates/${encodeURIComponent(templateId)}/publish`,
    {},
  ).then((r) => r.data);
}

export function createDraftFromPublished(teamId: string, templateId: string) {
  return apiPostJson<{ data: { id: string } }>(
    `${base(teamId)}/templates/${encodeURIComponent(templateId)}/create-draft`,
    {},
  ).then((r) => r.data);
}

export function fetchOutdatedWalkItems(teamId: string, templateId: string) {
  return apiGetJson<{
    data: Array<{
      placementId: string;
      title: string;
      pinnedVersion: number;
      currentVersion: number;
    }>;
  }>(`${base(teamId)}/templates/${encodeURIComponent(templateId)}/outdated-items`).then(
    (r) => r.data,
  );
}

export function fetchWalkRuns(teamId: string) {
  return apiGetJson<{ data: Array<Record<string, unknown>> }>(`${base(teamId)}/runs`).then(
    (r) => r.data,
  );
}

export function fetchWalkReporting(teamId: string) {
  return apiGetJson<{ data: Record<string, unknown> }>(`${base(teamId)}/reporting/summary`).then(
    (r) => r.data,
  );
}

export function fetchWalkSchedules(teamId: string, templateId?: string) {
  const q = templateId ? `?templateId=${encodeURIComponent(templateId)}` : "";
  return apiGetJson<{ data: unknown[] }>(`${base(teamId)}/schedules${q}`).then((r) => r.data);
}

export function createWalkSchedule(
  teamId: string,
  body: {
    templateId: string;
    name?: string;
    recurrence?: string;
    timezone?: string;
    windows: Array<{ startMinutes: number; dueMinutes: number; graceMinutes?: number }>;
  },
) {
  return apiPostJson<{ data: unknown }>(`${base(teamId)}/schedules`, body).then((r) => r.data);
}

export function fetchWalkOccurrences(teamId: string) {
  return apiGetJson<{ data: unknown[] }>(`${base(teamId)}/occurrences`).then((r) => r.data);
}
