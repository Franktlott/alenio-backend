import { useSyncExternalStore } from "react";

/**
 * Reader's personal Discover shelf: saved articles and reading progress.
 * Kept in this browser for now; moves to the account once the API has a home for it.
 */

export type DiscoverProgress = {
  slug: string;
  title: string;
  coverImageUrl: string | null;
  categoryName: string | null;
  pct: number; // 0..100
  at: string; // ISO time of the last read
};

type LibraryState = {
  saved: string[];
  progress: Record<string, DiscoverProgress>;
};

const SAVED_KEY = "alenio-web:discover-saved";
const PROGRESS_KEY = "alenio-web:discover-progress";
const EMPTY: LibraryState = { saved: [], progress: {} };

let cache: LibraryState | null = null;
const listeners = new Set<() => void>();

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function load(): LibraryState {
  if (typeof window === "undefined") return EMPTY;
  if (!cache) {
    cache = {
      saved: readJson<string[]>(SAVED_KEY, []).filter((v) => typeof v === "string"),
      progress: readJson<Record<string, DiscoverProgress>>(PROGRESS_KEY, {}),
    };
  }
  return cache;
}

function commit(next: LibraryState) {
  cache = next;
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(next.saved));
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next.progress));
  } catch {
    // Storage full or blocked; keep the in-memory copy.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SAVED_KEY || event.key === PROGRESS_KEY || event.key === null) {
      cache = null;
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDiscoverLibrary() {
  const state = useSyncExternalStore(subscribe, load, () => EMPTY);
  return {
    saved: state.saved,
    isSaved: (slug: string) => state.saved.includes(slug),
    toggleSaved: (slug: string) => {
      const current = load();
      const saved = current.saved.includes(slug)
        ? current.saved.filter((s) => s !== slug)
        : [slug, ...current.saved];
      commit({ ...current, saved });
    },
    progress: state.progress,
  };
}

/** Remembers how far someone got; never moves backwards. */
export function recordDiscoverProgress(entry: Omit<DiscoverProgress, "at" | "pct"> & { pct: number }) {
  const current = load();
  const previous = current.progress[entry.slug];
  const pct = Math.max(0, Math.min(100, Math.round(entry.pct)));
  const nextPct = Math.max(previous?.pct ?? 0, pct);
  if (previous && previous.pct === nextPct && Date.now() - Date.parse(previous.at) < 15_000) return;
  commit({
    ...current,
    progress: {
      ...current.progress,
      [entry.slug]: { ...entry, pct: nextPct, at: new Date().toISOString() },
    },
  });
}
