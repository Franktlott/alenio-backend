import { prisma } from "../prisma";
import { findTeamByChecklistHubToken } from "./checklist-locations";
import { canManageGoLoginRequests } from "./go-login-requests";
import { isGoDeviceReachable } from "./workplace-alerts";
import { sendPushToUsers } from "./push";

export type BriefingStatus = "not_started" | "reviewed" | "overdue";

export type CreateBriefingInput = {
  title: string;
  description: string;
  documentUrl: string;
  documentFilename?: string | null;
  contentType?: string | null;
  dueAt?: string | null;
  requireSignature?: boolean;
  allowInitials?: boolean;
};

export type CompleteBriefingInput = {
  initials?: string;
  signatureData?: string | null;
  reviewerName?: string | null;
  deviceId?: string | null;
};

const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function briefingStatus(
  dueAt: Date | null,
  completedAt: Date | null,
  now = new Date(),
): BriefingStatus {
  if (completedAt) return "reviewed";
  if (dueAt && dueAt.getTime() < now.getTime()) return "overdue";
  return "not_started";
}

function normalizeInitials(value: string): string {
  return value.trim().toUpperCase().slice(0, 8);
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 120);
}

export function buildCompletionKey(input: {
  userId?: string | null;
  deviceId?: string | null;
  initials: string;
  reviewerName?: string | null;
}): string {
  const initials = normalizeInitials(input.initials);
  if (input.userId) return `user:${input.userId}`;
  const deviceId = input.deviceId?.trim() || "unknown";
  const name = normalizeName(input.reviewerName);
  return `kiosk:${deviceId}:${initials}:${name.toLowerCase()}`;
}

export { canManageGoLoginRequests as canManageBriefings };

async function assertTeamMember(teamId: string, userId: string) {
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true },
  });
  return member;
}

function serializeBriefingRow(
  row: {
    id: string;
    teamId: string;
    title: string;
    description: string;
    documentUrl: string;
    documentFilename: string | null;
    contentType: string | null;
    dueAt: Date | null;
    requireSignature: boolean;
    allowInitials: boolean;
    publishedAt: Date;
    createdByUserId: string;
    createdAt: Date;
  },
  status: BriefingStatus,
  completedAt: Date | null,
) {
  return {
    id: row.id,
    teamId: row.teamId,
    title: row.title,
    description: row.description,
    documentUrl: row.documentUrl,
    documentFilename: row.documentFilename,
    contentType: row.contentType,
    dueAt: row.dueAt?.toISOString() ?? null,
    requireSignature: row.requireSignature,
    allowInitials: row.allowInitials,
    publishedAt: row.publishedAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    status,
    completedAt: completedAt?.toISOString() ?? null,
  };
}

export async function createBriefing(teamId: string, createdByUserId: string, input: CreateBriefingInput) {
  const title = input.title.trim();
  const description = input.description.trim();
  const documentUrl = input.documentUrl.trim();
  if (!title || !description || !documentUrl) {
    return { ok: false as const, code: "VALIDATION" as const };
  }
  if (input.contentType && !ALLOWED_DOC_TYPES.includes(input.contentType)) {
    return { ok: false as const, code: "INVALID_FILE" as const };
  }

  const briefing = await prisma.briefing.create({
    data: {
      teamId,
      title,
      description,
      documentUrl,
      documentFilename: input.documentFilename?.trim() || null,
      contentType: input.contentType?.trim() || null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      requireSignature: input.requireSignature === true,
      allowInitials: input.allowInitials !== false,
      createdByUserId,
    },
  });

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  const userIds = members.map((m) => m.userId).filter((id) => id !== createdByUserId);
  if (userIds.length > 0) {
    await sendPushToUsers(
      userIds,
      "New briefing",
      title,
      { teamId, type: "briefing", briefingId: briefing.id },
      "notifMessages",
      teamId,
    );
  }

  return { ok: true as const, briefing };
}

export async function listBriefingsForUser(teamId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const [briefings, completions] = await Promise.all([
    prisma.briefing.findMany({
      where: { teamId, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.briefingCompletion.findMany({
      where: { teamId, userId },
      select: { briefingId: true, completedAt: true },
    }),
  ]);

  const completionByBriefing = new Map(completions.map((c) => [c.briefingId, c.completedAt]));
  const now = new Date();

  return {
    ok: true as const,
    briefings: briefings.map((b) =>
      serializeBriefingRow(
        b,
        briefingStatus(b.dueAt, completionByBriefing.get(b.id) ?? null, now),
        completionByBriefing.get(b.id) ?? null,
      ),
    ),
    canManage: canManageGoLoginRequests(member.role),
  };
}

export async function getBriefingForUser(teamId: string, briefingId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  const completion = await prisma.briefingCompletion.findFirst({
    where: { briefingId, userId },
  });

  return {
    ok: true as const,
    briefing: serializeBriefingRow(
      briefing,
      briefingStatus(briefing.dueAt, completion?.completedAt ?? null),
      completion?.completedAt ?? null,
    ),
    canManage: canManageGoLoginRequests(member.role),
  };
}

export async function completeBriefingForUser(
  teamId: string,
  briefingId: string,
  userId: string,
  userName: string | null,
  input: CompleteBriefingInput,
) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  const initials = normalizeInitials(input.initials ?? "");
  const signatureData = input.signatureData?.trim() || null;
  if (briefing.requireSignature && !signatureData) {
    return { ok: false as const, code: "SIGNATURE_REQUIRED" as const };
  }
  if (!briefing.requireSignature && briefing.allowInitials && !initials) {
    return { ok: false as const, code: "INITIALS_REQUIRED" as const };
  }
  if (!briefing.requireSignature && !briefing.allowInitials && !initials && !signatureData) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const completionKey = buildCompletionKey({ userId, initials: initials || "OK" });

  try {
    const completion = await prisma.briefingCompletion.create({
      data: {
        briefingId,
        teamId,
        completionKey,
        userId,
        initials: initials || "—",
        signatureData,
        reviewerName: userName?.trim() || null,
        documentUrl: briefing.documentUrl,
      },
    });
    return { ok: true as const, completion };
  } catch {
    return { ok: false as const, code: "ALREADY_COMPLETED" as const };
  }
}

export async function getBriefingAdminStats(teamId: string, briefingId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !canManageGoLoginRequests(member.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  const [members, completions] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.briefingCompletion.findMany({
      where: { briefingId },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const now = new Date();
  const userCompletion = new Map(
    completions.filter((c) => c.userId).map((c) => [c.userId!, c]),
  );
  const kioskCompletions = completions.filter((c) => !c.userId);

  const users = members.map((m) => {
    const done = userCompletion.get(m.userId);
    const status = briefingStatus(briefing.dueAt, done?.completedAt ?? null, now);
    return {
      completionId: done?.id ?? null,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      status,
      completedAt: done?.completedAt.toISOString() ?? null,
      initials: done?.initials ?? null,
      source: "account" as const,
    };
  });

  const kioskRows = kioskCompletions.map((c) => ({
    completionId: c.id,
    userId: null,
    name: c.reviewerName || "Floor associate",
    email: null,
    status: "reviewed" as BriefingStatus,
    completedAt: c.completedAt.toISOString(),
    initials: c.initials,
    deviceId: c.deviceId,
    source: "kiosk" as const,
  }));

  const reviewedUserCount = users.filter((u) => u.status === "reviewed").length;
  const pendingCount = users.filter((u) => u.status === "not_started").length;
  const overdueCount = users.filter((u) => u.status === "overdue").length;
  const totalAssigned = members.length;

  return {
    ok: true as const,
    stats: {
      totalAssigned,
      reviewed: reviewedUserCount + kioskCompletions.length,
      pending: pendingCount,
      overdue: overdueCount,
      completionPct: totalAssigned > 0 ? Math.round((reviewedUserCount / totalAssigned) * 100) : 0,
      users,
      kioskCompletions: kioskRows,
    },
    briefing: serializeBriefingRow(briefing, "reviewed", null),
  };
}

export async function deleteBriefingCompletion(
  teamId: string,
  briefingId: string,
  completionId: string,
  userId: string,
) {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !canManageGoLoginRequests(member.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const completion = await prisma.briefingCompletion.findFirst({
    where: { id: completionId, briefingId, teamId },
  });
  if (!completion) return { ok: false as const, code: "NOT_FOUND" as const };

  await prisma.briefingCompletion.delete({ where: { id: completionId } });
  return { ok: true as const };
}

export async function listPublicBriefings(hubToken: string, deviceId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const reachable = await isGoDeviceReachable(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };

  const [briefings, completions] = await Promise.all([
    prisma.briefing.findMany({
      where: { teamId: team.id, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.briefingCompletion.findMany({
      where: { teamId: team.id, deviceId },
      select: { briefingId: true, completedAt: true },
    }),
  ]);

  const completionByBriefing = new Map(completions.map((c) => [c.briefingId, c.completedAt]));
  const now = new Date();

  return {
    ok: true as const,
    briefings: briefings.map((b) =>
      serializeBriefingRow(
        b,
        // Kiosk list: due-date status only; each associate completes with their own initials.
        briefingStatus(b.dueAt, null, now),
        null,
      ),
    ),
  };
}

export async function getPublicBriefing(hubToken: string, deviceId: string, briefingId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const reachable = await isGoDeviceReachable(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId: team.id } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  const completion = await prisma.briefingCompletion.findFirst({
    where: { briefingId, deviceId },
  });

  return {
    ok: true as const,
    briefing: serializeBriefingRow(
      briefing,
      briefingStatus(briefing.dueAt, completion?.completedAt ?? null),
      completion?.completedAt ?? null,
    ),
  };
}

export async function completePublicBriefing(
  hubToken: string,
  deviceId: string,
  briefingId: string,
  input: CompleteBriefingInput,
) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const reachable = await isGoDeviceReachable(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId: team.id } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  const initials = normalizeInitials(input.initials ?? "");
  const signatureData = input.signatureData?.trim() || null;
  const reviewerName = normalizeName(input.reviewerName) || null;

  if (briefing.requireSignature && !signatureData) {
    return { ok: false as const, code: "SIGNATURE_REQUIRED" as const };
  }
  if (!initials && !signatureData) {
    return { ok: false as const, code: "INITIALS_REQUIRED" as const };
  }

  const completionKey = buildCompletionKey({ deviceId, initials: initials || "SIG", reviewerName });

  try {
    const completion = await prisma.briefingCompletion.create({
      data: {
        briefingId,
        teamId: team.id,
        completionKey,
        deviceId,
        reviewerName,
        initials: initials || "—",
        signatureData,
        documentUrl: briefing.documentUrl,
      },
    });
    return { ok: true as const, completion };
  } catch {
    return { ok: false as const, code: "ALREADY_COMPLETED" as const };
  }
}
