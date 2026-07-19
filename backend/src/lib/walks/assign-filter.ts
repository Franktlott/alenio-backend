import { canManageWalks } from "./permissions";

function parseAssignUserIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parseAssignUserIds(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Whether an occurrence/schedule assignment includes this viewer.
 * WORKSPACE / EVERY_ASSIGNEE / unknown → everyone.
 * USER(S) → assignUserIds must include viewer.
 * ROLE → assignRole must match membership role.
 */
export function occurrenceAssignedToViewer(
  occ: {
    assignScope?: string | null;
    assignRole?: string | null;
    assignUserIds?: unknown;
  },
  viewer: { userId: string; role: string },
): boolean {
  const scope = (occ.assignScope ?? "WORKSPACE").toUpperCase();
  if (scope === "WORKSPACE" || scope === "EVERY_ASSIGNEE" || scope === "ALL") {
    return true;
  }
  if (scope === "USER" || scope === "USERS") {
    const ids = parseAssignUserIds(occ.assignUserIds);
    if (ids.length === 0) return true;
    return ids.includes(viewer.userId);
  }
  if (scope === "ROLE") {
    if (!occ.assignRole) return true;
    return occ.assignRole === viewer.role;
  }
  return true;
}

/** Managers see all; associates only see assigned checks. */
export function filterOccurrencesForViewer<
  T extends {
    assignScope?: string | null;
    assignRole?: string | null;
    assignUserIds?: unknown;
  },
>(rows: T[], viewer: { userId: string; role: string }): T[] {
  if (canManageWalks(viewer.role)) return rows;
  return rows.filter((row) => occurrenceAssignedToViewer(row, viewer));
}
