import { prisma } from "../prisma";

export function normalizeTeamName(name: string): string {
  return name.trim();
}

/** True if another team already uses this name (case-insensitive). */
export async function isTeamDisplayNameTaken(name: string, excludeTeamId?: string): Promise<boolean> {
  const n = normalizeTeamName(name);
  if (!n) return false;
  const row = await prisma.team.findFirst({
    where: {
      name: { equals: n, mode: "insensitive" },
      ...(excludeTeamId ? { NOT: { id: excludeTeamId } } : {}),
    },
    select: { id: true },
  });
  return !!row;
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
