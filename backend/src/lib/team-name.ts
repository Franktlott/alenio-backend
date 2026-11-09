import { prisma } from "../prisma";

export function normalizeTeamName(name: string): string {
  return name.trim();
}

/**
 * True if one of the user's own workspaces already uses this name (case-insensitive).
 * Names only need to be unique per person so they can tell workspaces apart; other
 * people's workspaces may share a name.
 */
export async function isTeamNameTakenForUser(
  name: string,
  userId: string,
  excludeTeamId?: string,
): Promise<boolean> {
  const n = normalizeTeamName(name);
  if (!n) return false;
  const row = await prisma.team.findFirst({
    where: {
      name: { equals: n, mode: "insensitive" },
      members: { some: { userId } },
      ...(excludeTeamId ? { NOT: { id: excludeTeamId } } : {}),
    },
    select: { id: true },
  });
  return !!row;
}

/** True if another workspace in the same enterprise organization uses this name. */
export async function isTeamNameTakenInOrganization(
  name: string,
  organizationId: string,
  excludeTeamId?: string,
): Promise<boolean> {
  const n = normalizeTeamName(name);
  if (!n) return false;
  const row = await prisma.team.findFirst({
    where: {
      name: { equals: n, mode: "insensitive" },
      organizationId,
      ...(excludeTeamId ? { NOT: { id: excludeTeamId } } : {}),
    },
    select: { id: true },
  });
  return !!row;
}

/** Reservation key for a workspace name held during paid checkout (per user). */
export function pendingWorkspaceNameKey(userId: string, name: string): string {
  return `${userId}:${normalizeTeamName(name).toLocaleLowerCase()}`;
}

export function isPrismaUniqueOnName(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; meta?: { target?: string | string[] } };
  if (e.code !== "P2002") return false;
  const t = e.meta?.target;
  if (Array.isArray(t)) return t.includes("name");
  if (typeof t === "string") return t === "name" || t.includes("name");
  return true;
}
