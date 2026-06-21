import type { KioskTaskState } from "../components/checklists/kiosk/checklist-kiosk-types";

const KEY_PREFIX = "alenio.kioskProgress";

type StoredProgress = {
  tasks: Record<string, KioskTaskState>;
  updatedAt: string;
};

function storageKey(hubToken: string, checklistId: string): string {
  return `${KEY_PREFIX}:${hubToken}:${checklistId}`;
}

export function loadKioskProgress(hubToken: string, checklistId: string): Record<string, KioskTaskState> | null {
  if (!hubToken || !checklistId) return null;
  try {
    const raw = localStorage.getItem(storageKey(hubToken, checklistId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProgress;
    if (!parsed?.tasks || typeof parsed.tasks !== "object") return null;
    return parsed.tasks;
  } catch {
    return null;
  }
}

export function saveKioskProgress(
  hubToken: string,
  checklistId: string,
  tasks: Record<string, KioskTaskState>,
): void {
  if (!hubToken || !checklistId) return;
  try {
    const payload: StoredProgress = { tasks, updatedAt: new Date().toISOString() };
    localStorage.setItem(storageKey(hubToken, checklistId), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function clearKioskProgress(hubToken: string, checklistId: string): void {
  if (!hubToken || !checklistId) return;
  try {
    localStorage.removeItem(storageKey(hubToken, checklistId));
  } catch {
    /* ignore */
  }
}

export function kioskProgressPercent(tasks: Record<string, KioskTaskState> | null, taskCount: number): number {
  if (taskCount <= 0) return 0;
  if (!tasks) return 0;
  const signed = Object.values(tasks).filter((t) => t.signed).length;
  return Math.min(100, Math.round((signed / taskCount) * 100));
}

export function mergeKioskProgress(
  itemIds: string[],
  stored: Record<string, KioskTaskState> | null,
): Record<string, KioskTaskState> {
  return Object.fromEntries(
    itemIds.map((id) => [
      id,
      stored?.[id] ?? { signed: false, signerName: "", signedAt: null },
    ]),
  );
}
