import { randomBytes } from "crypto";
import { prisma } from "../prisma";
import { teamHasChecklistPlan } from "./checklist-locations";

const GO_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GO_CODE_LENGTH = 8;
const SESSION_HOURS = 8;

export function normalizeGoCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function generateGoCode(): string {
  let out = "";
  const bytes = randomBytes(GO_CODE_LENGTH);
  for (let i = 0; i < GO_CODE_LENGTH; i++) {
    out += GO_CODE_CHARS[bytes[i]! % GO_CODE_CHARS.length];
  }
  return out;
}

export async function generateUniqueGoCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateGoCode();
    const existing = await prisma.goLocation.findUnique({ where: { goCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  return `${generateGoCode()}${randomBytes(2).toString("hex").toUpperCase().slice(0, 2)}`;
}

export function generateGoSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function goSessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + SESSION_HOURS * 60 * 60 * 1000);
}

export async function findActiveGoLocationByCode(code: string) {
  const goCode = normalizeGoCode(code);
  if (goCode.length < 4) return null;

  const match = await prisma.goLocation.findFirst({
    where: { goCode, isActive: true },
    select: { teamId: true },
  });
  if (match) await syncWorkspaceGoChecklists(match.teamId);

  const location = await prisma.goLocation.findFirst({
    where: { goCode, isActive: true },
    include: {
      team: { select: { id: true, name: true, image: true } },
      assignments: {
        where: { isActive: true },
        include: {
          checklist: {
            include: { items: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });

  if (!location) return null;
  const hasPlan = await teamHasChecklistPlan(location.teamId);
  if (!hasPlan) return null;

  return location;
}

export async function getRecentGoDisplayNames(goLocationId: string, limit = 8): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.goSession.findMany({
    where: { goLocationId, startedAt: { gte: since } },
    select: { displayName: true },
    orderBy: { startedAt: "desc" },
    take: 40,
  });
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of rows) {
    const name = row.displayName.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}

export async function findValidGoSession(token: string) {
  const session = await prisma.goSession.findUnique({
    where: { token },
    include: {
      goLocation: {
        include: {
          team: { select: { id: true, name: true, image: true } },
          assignments: {
            where: { isActive: true },
            include: {
              checklist: {
                include: {
                  items: { orderBy: { sortOrder: "asc" } },
                  submissions: {
                    orderBy: { submittedAt: "desc" },
                    take: 3,
                    select: {
                      id: true,
                      submittedAt: true,
                      submitterName: true,
                      isComplete: true,
                      checkedCount: true,
                      totalCount: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.goLocation.isActive) return null;

  const hasPlan = await teamHasChecklistPlan(session.teamId);
  if (!hasPlan) return null;

  return session;
}

export type GoChecklistStatus = "not_started" | "in_progress" | "complete" | "overdue";

export function deriveChecklistStatus(
  assignment: { dueTime: string | null },
  checklist: {
    items: { id: string }[];
    submissions: { submittedAt: Date; isComplete: boolean; checkedCount: number; totalCount: number }[];
  },
  todayStart: Date,
): GoChecklistStatus {
  const todaySubs = checklist.submissions.filter((s) => s.submittedAt >= todayStart);
  const latestToday = todaySubs[0];
  if (latestToday?.isComplete) return "complete";
  if (latestToday && latestToday.checkedCount > 0) return "in_progress";

  if (assignment.dueTime) {
      const hh = Number(assignment.dueTime.split(":")[0]);
      const mm = Number(assignment.dueTime.split(":")[1]);
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        const due = new Date(todayStart);
        due.setHours(hh, mm, 0, 0);
      if (Date.now() > due.getTime()) return "overdue";
    }
  }

  if (latestToday) return "in_progress";
  return "not_started";
}

export function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function ensureWorkspaceGoAccess(teamId: string, createdById?: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  let location = await prisma.goLocation.findFirst({
    where: { teamId },
    orderBy: { createdAt: "asc" },
  });

  if (!location) {
    const goCode = await generateUniqueGoCode();
    location = await prisma.goLocation.create({
      data: {
        teamId,
        name: team?.name ?? "Workspace",
        goCode,
        createdById: createdById ?? null,
      },
    });
  } else if (team?.name && location.name !== team.name) {
    location = await prisma.goLocation.update({
      where: { id: location.id },
      data: { name: team.name },
    });
  }

  await syncWorkspaceGoChecklists(teamId, location.id);
  return location;
}

/** @deprecated alias */
export async function ensureDefaultGoLocation(teamId: string, createdById?: string) {
  return ensureWorkspaceGoAccess(teamId, createdById);
}

/** All active workspace checklists are available on the workspace Go Code. */
export async function syncWorkspaceGoChecklists(teamId: string, goLocationId?: string) {
  const locationId =
    goLocationId ??
    (await prisma.goLocation.findFirst({ where: { teamId }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  if (!locationId) return;

  const checklists = await prisma.checklistLocation.findMany({
    where: { teamId, isActive: true },
    select: { id: true },
  });
  const ids = checklists.map((cl) => cl.id);

  if (ids.length === 0) {
    await prisma.goLocationChecklist.updateMany({
      where: { goLocationId: locationId },
      data: { isActive: false },
    });
    return;
  }

  await prisma.goLocationChecklist.updateMany({
    where: { goLocationId: locationId, checklistLocationId: { notIn: ids } },
    data: { isActive: false },
  });

  for (const checklistLocationId of ids) {
    await prisma.goLocationChecklist.upsert({
      where: { goLocationId_checklistLocationId: { goLocationId: locationId, checklistLocationId } },
      create: { goLocationId: locationId, checklistLocationId, isActive: true },
      update: { isActive: true },
    });
  }
}

export function serializeGoLocationRow(
  row: {
    id: string;
    name: string;
    area: string | null;
    goCode: string;
    isActive: boolean;
    guestEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    assignments?: {
      id: string;
      dueTime: string | null;
      shift: string | null;
      isActive: boolean;
      checklist: { id: string; name: string; isActive: boolean; cardColor: string | null };
    }[];
  },
  extras?: { recentSessions?: number; lastSessionAt?: Date | null },
) {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    goCode: row.goCode,
    isActive: row.isActive,
    guestEnabled: row.guestEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assignments:
      row.assignments?.map((a) => ({
        id: a.id,
        dueTime: a.dueTime,
        shift: a.shift,
        isActive: a.isActive,
        checklist: {
          id: a.checklist.id,
          name: a.checklist.name,
          isActive: a.checklist.isActive,
          cardColor: a.checklist.cardColor,
        },
      })) ?? [],
    recentSessions: extras?.recentSessions ?? 0,
    lastSessionAt: extras?.lastSessionAt?.toISOString() ?? null,
  };
}
