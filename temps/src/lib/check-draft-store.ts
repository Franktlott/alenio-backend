import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WalkRun } from "./types";

const DRAFT_PREFIX = "temps.checkDraft.v1:";
const INDEX_KEY = "temps.checkDraftIndex.v1";

export type LocalPhoto = {
  id: string;
  uri: string;
  correctiveActionId: string | null;
  uploadedUrl: string | null;
};

export type SyncDraftItem = {
  itemId: string;
  response: {
    value: number;
    unit: "F" | "C";
    source: "manual" | "bluetooth";
    retestCount?: number;
  };
  correctiveActionIdsCompleted: string[];
  localPhotos: LocalPhoto[];
  photoUrls: string[];
  capturedAt: string;
};

export type CheckDraft = {
  occurrenceId: string;
  runId: string;
  teamId: string;
  /** Working copy of the run (local pass/fail + CA state). */
  run: WalkRun;
  /** Ordered sync payload (item may appear more than once for retemp). */
  syncItems: SyncDraftItem[];
  itemIndex: number;
  finishedLocally: boolean;
  syncedAt: string | null;
  lastSyncError: string | null;
  lastSyncErrorCode: string | null;
  updatedAt: string;
};

function draftKey(occurrenceId: string) {
  return `${DRAFT_PREFIX}${occurrenceId}`;
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids: string[]) {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify([...new Set(ids)]));
}

function normalizeDraft(raw: CheckDraft): CheckDraft {
  return {
    ...raw,
    lastSyncErrorCode: raw.lastSyncErrorCode ?? null,
    syncItems: (raw.syncItems ?? []).map((item) => ({
      ...item,
      localPhotos: item.localPhotos ?? [],
      photoUrls: item.photoUrls ?? [],
      correctiveActionIdsCompleted: item.correctiveActionIdsCompleted ?? [],
    })),
  };
}

export async function getCheckDraft(occurrenceId: string): Promise<CheckDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(occurrenceId));
    if (!raw) return null;
    return normalizeDraft(JSON.parse(raw) as CheckDraft);
  } catch {
    return null;
  }
}

export async function saveCheckDraft(draft: CheckDraft): Promise<void> {
  const next: CheckDraft = normalizeDraft({
    ...draft,
    updatedAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(draftKey(next.occurrenceId), JSON.stringify(next));
  const index = await readIndex();
  if (!index.includes(next.occurrenceId)) {
    await writeIndex([...index, next.occurrenceId]);
  }
}

export async function clearCheckDraft(occurrenceId: string): Promise<void> {
  await AsyncStorage.removeItem(draftKey(occurrenceId));
  const index = await readIndex();
  await writeIndex(index.filter((id) => id !== occurrenceId));
}

/** Drafts that finished on device but never synced successfully. */
export async function listPendingSyncDrafts(): Promise<CheckDraft[]> {
  const index = await readIndex();
  const drafts: CheckDraft[] = [];
  for (const occurrenceId of index) {
    const draft = await getCheckDraft(occurrenceId);
    if (!draft) continue;
    if (draft.finishedLocally && !draft.syncedAt) drafts.push(draft);
  }
  return drafts;
}

export function createEmptyDraft(input: {
  occurrenceId: string;
  teamId: string;
  run: WalkRun;
  itemIndex?: number;
}): CheckDraft {
  return {
    occurrenceId: input.occurrenceId,
    runId: input.run.id,
    teamId: input.teamId,
    run: input.run,
    syncItems: [],
    itemIndex: input.itemIndex ?? 0,
    finishedLocally: false,
    syncedAt: null,
    lastSyncError: null,
    lastSyncErrorCode: null,
    updatedAt: new Date().toISOString(),
  };
}

/** True when another device / user already finished or owns the check. */
export function isConflictErrorCode(code: string | null | undefined): boolean {
  return (
    code === "RUN_CLOSED" ||
    code === "OCCURRENCE_CLOSED" ||
    code === "RUN_OWNED_BY_OTHER"
  );
}
