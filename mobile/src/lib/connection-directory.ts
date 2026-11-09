import type { AcceptedConnectionEntry } from "./types";

export type ConnectionDirectoryQuickScope =
  | "all"
  | "active"
  | "recent"
  | "shared_workspace";

export type ConnectionDirectoryFilters = {
  active: boolean;
  recent: boolean;
  sharedWorkspace: boolean;
};

export type ConnectionDirectoryOptions = {
  search?: string;
  quickScope?: ConnectionDirectoryQuickScope;
  filters?: Partial<ConnectionDirectoryFilters>;
  now?: Date;
};

export const RECENT_CONNECTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type ConnectionDirectorySort = "recent" | "name" | "active";

export const CONNECTION_DIRECTORY_SORT_LABELS: Record<
  ConnectionDirectorySort,
  string
> = {
  recent: "Recently connected",
  name: "Last name (A–Z)",
  active: "Active now first",
};

/** The letter the A–Z rail uses. Surname first, so "Maya Chen" files under C. */
export function connectionIndexLetter(entry: AcceptedConnectionEntry): string {
  const name = connectionName(entry);
  const first = name.charAt(0).toLocaleUpperCase();
  const base = first.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^[A-Z]$/.test(base) ? base : "#";
}

function connectionName(entry: AcceptedConnectionEntry): string {
  const name = (entry.person.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return (entry.person.username ?? "").trim();
  const parts = name.split(" ");
  if (parts.length === 1) return name;
  const last = parts[parts.length - 1]!;
  const rest = parts.slice(0, -1).join(" ");
  return `${last} ${rest}`;
}

function connectedAt(entry: AcceptedConnectionEntry): number {
  const time = new Date(entry.updatedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Returns a new array; ties always fall back to name so the order stays stable. */
export function sortConnectionDirectory(
  entries: readonly AcceptedConnectionEntry[],
  sort: ConnectionDirectorySort = "recent",
): AcceptedConnectionEntry[] {
  const byName = (a: AcceptedConnectionEntry, b: AcceptedConnectionEntry) =>
    connectionName(a).localeCompare(connectionName(b)) ||
    a.person.id.localeCompare(b.person.id);

  return [...entries].sort((a, b) => {
    if (sort === "name") return byName(a, b);
    if (sort === "active") {
      const activeDifference = Number(b.activeNow) - Number(a.activeNow);
      if (activeDifference !== 0) return activeDifference;
      return byName(a, b);
    }
    return connectedAt(b) - connectedAt(a) || byName(a, b);
  });
}

export function isRecentConnection(updatedAt: string, now = new Date()): boolean {
  const updatedTime = new Date(updatedAt).getTime();
  const nowTime = now.getTime();

  if (!Number.isFinite(updatedTime) || !Number.isFinite(nowTime)) return false;

  const age = nowTime - updatedTime;
  return age >= 0 && age <= RECENT_CONNECTION_WINDOW_MS;
}

export function filterConnectionDirectory(
  entries: readonly AcceptedConnectionEntry[],
  options: ConnectionDirectoryOptions = {},
): AcceptedConnectionEntry[] {
  const normalizedSearch = (options.search ?? "").trim().toLocaleLowerCase();
  const normalizedUsernameSearch = normalizedSearch.replace(/^@/, "");
  const quickScope = options.quickScope ?? "all";
  const active = options.filters?.active ?? false;
  const recent = options.filters?.recent ?? false;
  const sharedWorkspace = options.filters?.sharedWorkspace ?? false;
  const now = options.now ?? new Date();

  return entries.filter((entry) => {
    const name = entry.person.name?.toLocaleLowerCase() ?? "";
    const username = entry.person.username?.toLocaleLowerCase() ?? "";
    const title = entry.person.profileTitle?.toLocaleLowerCase() ?? "";
    const workspaces = (entry.sharedWorkspaceNames ?? []).map((workspace) =>
      workspace.toLocaleLowerCase(),
    );
    const matchesSearch =
      normalizedSearch.length === 0 ||
      name.includes(normalizedSearch) ||
      title.includes(normalizedSearch) ||
      workspaces.some((workspace) => workspace.includes(normalizedSearch)) ||
      (normalizedUsernameSearch.length > 0 &&
        username.includes(normalizedUsernameSearch));

    if (!matchesSearch) return false;

    const isRecent = isRecentConnection(entry.updatedAt, now);
    const matchesQuickScope =
      quickScope === "all" ||
      (quickScope === "active" && entry.activeNow) ||
      (quickScope === "recent" && isRecent) ||
      (quickScope === "shared_workspace" && entry.sharesWorkspace);

    if (!matchesQuickScope) return false;
    if (active && !entry.activeNow) return false;
    if (recent && !isRecent) return false;
    if (sharedWorkspace && !entry.sharesWorkspace) return false;

    return true;
  });
}
