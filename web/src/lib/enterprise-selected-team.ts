/** Keeps the enterprise shell workspace in sync across routes (sidebar + all nav tabs). */
const STORAGE_KEY = "alenio.enterpriseSelectedTeamId";

export function getPersistedEnterpriseTeamId(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setPersistedEnterpriseTeamId(teamId: string): void {
  try {
    if (!teamId) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, teamId);
  } catch {
    /* ignore quota / private mode */
  }
}

type TeamLike = { id: string };

/** Set when the user picks a workspace from the sidebar footer (before URL catches up). */
let lastFooterWorkspaceSelectAt = 0;

export function markFooterEnterpriseWorkspaceSelect() {
  lastFooterWorkspaceSelectAt = Date.now();
}

/** Persist + notify shell routes (sidebar, Chat URL sync, etc.). */
export function switchEnterpriseWorkspace(teamId: string, setSelectedTeamId: (id: string) => void): void {
  const id = teamId.trim();
  if (!id) return;
  setPersistedEnterpriseTeamId(id);
  markFooterEnterpriseWorkspaceSelect();
  setSelectedTeamId(id);
}

/** True shortly after a footer workspace change — skip URL→shell sync so Chat does not fight the picker. */
export function isRecentFooterEnterpriseWorkspaceSelect(ms = 800) {
  return Date.now() - lastFooterWorkspaceSelectAt < ms;
}

/** Stable signature of workspace id membership — ignores new array references from refetches. */
export function teamsWorkspaceSelectionKey(teams: TeamLike[]): string {
  if (!teams.length) return "";
  return [...teams.map((t) => t.id)].sort().join("|");
}

/** After a valid `prev`, use persisted id, then first team. */
export function pickEnterpriseTeamId(teams: TeamLike[], prev: string): string {
  if (!teams.length) return "";
  if (prev && teams.some((t) => t.id === prev)) return prev;
  const persisted = getPersistedEnterpriseTeamId();
  if (persisted && teams.some((t) => t.id === persisted)) return persisted;
  return teams[0]!.id;
}

/** After optional URL `teamId`, use valid `prev`, then persisted id, then first team. */
export function resolveEnterpriseTeamId(teams: TeamLike[], opts: { teamIdFromUrl?: string }, prev: string): string {
  if (!teams.length) return "";
  const url = opts.teamIdFromUrl?.trim() ?? "";
  if (url && teams.some((t) => t.id === url)) return url;
  return pickEnterpriseTeamId(teams, prev);
}
