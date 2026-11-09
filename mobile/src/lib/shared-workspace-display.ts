import type { PublicProfileWorkspace } from "./types";

/** Alenio-family tints so a wall of workspace tiles stays distinguishable. */
export const WORKSPACE_TILE_TINTS = [
  { background: "#4361EE", label: "#FFFFFF" },
  { background: "#7C3AED", label: "#FFFFFF" },
  { background: "#0E9F8C", label: "#FFFFFF" },
  { background: "#E8433F", label: "#FFFFFF" },
  { background: "#F2870D", label: "#FFFFFF" },
  { background: "#2563C9", label: "#FFFFFF" },
  { background: "#9333A8", label: "#FFFFFF" },
  { background: "#0F766E", label: "#FFFFFF" },
] as const;

export type WorkspaceTileTint = (typeof WORKSPACE_TILE_TINTS)[number];

/** Stable per workspace so a tile keeps its colour across renders and screens. */
export function workspaceTileTint(id: string): WorkspaceTileTint {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100_000;
  }
  return WORKSPACE_TILE_TINTS[hash % WORKSPACE_TILE_TINTS.length]!;
}

/** Two letters from the first two words, or the first two letters of one word. */
export function workspaceTileInitials(name: string): string {
  const words = name
    .replace(/[·|]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word));
  if (words.length === 0) return "WS";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "Sep 2026", or null when the timestamp is missing or unparseable. */
export function formatWorkspaceSince(joinedAt: string | null | undefined): string | null {
  if (!joinedAt) return null;
  const date = new Date(joinedAt);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export type SharedWorkspaceSort = "recent" | "name";

export const SHARED_WORKSPACE_SORT_LABELS: Record<SharedWorkspaceSort, string> = {
  recent: "Recently shared",
  name: "Name (A–Z)",
};

export function filterSharedWorkspaces(
  workspaces: readonly PublicProfileWorkspace[],
  search: string,
): PublicProfileWorkspace[] {
  const query = search.trim().toLocaleLowerCase();
  if (query.length === 0) return [...workspaces];
  return workspaces.filter(
    (workspace) =>
      workspace.name.toLocaleLowerCase().includes(query) ||
      workspace.role.toLocaleLowerCase().includes(query),
  );
}

/** Returns a new array; ties fall back to name so the order never jitters. */
export function sortSharedWorkspaces(
  workspaces: readonly PublicProfileWorkspace[],
  sort: SharedWorkspaceSort = "recent",
): PublicProfileWorkspace[] {
  const byName = (a: PublicProfileWorkspace, b: PublicProfileWorkspace) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

  return [...workspaces].sort((a, b) => {
    if (sort === "name") return byName(a, b);
    const aTime = new Date(a.joinedAt).getTime();
    const bTime = new Date(b.joinedAt).getTime();
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid && aTime !== bTime) return bTime - aTime;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return byName(a, b);
  });
}
