import { getErrorCode } from "./api";
import {
  clearCheckDraft,
  getCheckDraft,
  isConflictErrorCode,
  listPendingSyncDrafts,
  saveCheckDraft,
  type CheckDraft,
} from "./check-draft-store";
import { clearCachedRun } from "./day-cache";
import { uploadPendingDraftPhotos } from "./sync-photos";
import { syncRun } from "./temps-api";

let flushing = false;

export type FlushPendingResult = {
  attempted: number;
  synced: number;
  failed: number;
  conflicts: number;
};

/**
 * Upload photos + syncRun for every finished-but-unsynced draft.
 * Safe to call from Today focus / AppState active — no-ops when already flushing.
 */
export async function flushPendingSyncDrafts(
  teamId?: string | null,
): Promise<FlushPendingResult> {
  const result: FlushPendingResult = {
    attempted: 0,
    synced: 0,
    failed: 0,
    conflicts: 0,
  };
  if (flushing) return result;
  flushing = true;
  try {
    const drafts = await listPendingSyncDrafts();
    const scoped = teamId ? drafts.filter((d) => d.teamId === teamId) : drafts;
    for (const draft of scoped) {
      result.attempted += 1;
      const outcome = await flushOneDraft(draft);
      if (outcome === "synced") result.synced += 1;
      else if (outcome === "conflict") result.conflicts += 1;
      else result.failed += 1;
    }
    return result;
  } finally {
    flushing = false;
  }
}

async function flushOneDraft(
  draft: CheckDraft,
): Promise<"synced" | "failed" | "conflict"> {
  try {
    const withPhotos = await uploadPendingDraftPhotos(draft);
    const nextDraft: CheckDraft = {
      ...draft,
      syncItems: withPhotos,
      updatedAt: new Date().toISOString(),
    };
    await saveCheckDraft(nextDraft);

    await syncRun(
      draft.teamId,
      draft.runId,
      withPhotos.map((item) => ({
        itemId: item.itemId,
        response: item.response,
        notes: item.notes,
        photoUrls: item.photoUrls.length > 0 ? item.photoUrls : undefined,
        correctiveActionIdsCompleted: item.correctiveActionIdsCompleted,
      })),
      true,
    );

    await clearCheckDraft(draft.occurrenceId);
    await clearCachedRun(draft.teamId, draft.occurrenceId);
    return "synced";
  } catch (err) {
    const code = getErrorCode(err);
    if (isConflictErrorCode(code)) {
      await clearCheckDraft(draft.occurrenceId);
      await clearCachedRun(draft.teamId, draft.occurrenceId);
      return "conflict";
    }
    const message = err instanceof Error ? err.message : "Couldn’t sync results";
    const latest = (await getCheckDraft(draft.occurrenceId)) ?? draft;
    await saveCheckDraft({
      ...latest,
      finishedLocally: true,
      lastSyncError: message,
      lastSyncErrorCode: code,
      syncedAt: null,
    });
    return "failed";
  }
}
