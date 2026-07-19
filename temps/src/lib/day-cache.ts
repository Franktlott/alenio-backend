import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WalkOccurrence, WalkRun } from "./types";

const DAY_KEY_PREFIX = "temps.dayCache.v1:";
const RUN_KEY_PREFIX = "temps.runCache.v1:";

function dayKey(teamId: string, dayIso: string) {
  return `${DAY_KEY_PREFIX}${teamId}:${dayIso}`;
}

function runKey(teamId: string, occurrenceId: string) {
  return `${RUN_KEY_PREFIX}${teamId}:${occurrenceId}`;
}

/** Local calendar day key YYYY-MM-DD. */
export function localDayKey(day = new Date()): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function saveDayOccurrences(
  teamId: string,
  occurrences: WalkOccurrence[],
  day = new Date(),
): Promise<void> {
  await AsyncStorage.setItem(
    dayKey(teamId, localDayKey(day)),
    JSON.stringify({ savedAt: new Date().toISOString(), occurrences }),
  );
}

export async function loadDayOccurrences(
  teamId: string,
  day = new Date(),
): Promise<WalkOccurrence[] | null> {
  try {
    const raw = await AsyncStorage.getItem(dayKey(teamId, localDayKey(day)));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { occurrences?: WalkOccurrence[] };
    return Array.isArray(parsed.occurrences) ? parsed.occurrences : null;
  } catch {
    return null;
  }
}

export async function saveCachedRun(
  teamId: string,
  occurrenceId: string,
  run: WalkRun,
): Promise<void> {
  await AsyncStorage.setItem(
    runKey(teamId, occurrenceId),
    JSON.stringify({ savedAt: new Date().toISOString(), run }),
  );
}

export async function loadCachedRun(
  teamId: string,
  occurrenceId: string,
): Promise<WalkRun | null> {
  try {
    const raw = await AsyncStorage.getItem(runKey(teamId, occurrenceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { run?: WalkRun };
    return parsed.run ?? null;
  } catch {
    return null;
  }
}

export async function clearCachedRun(teamId: string, occurrenceId: string): Promise<void> {
  await AsyncStorage.removeItem(runKey(teamId, occurrenceId));
}
