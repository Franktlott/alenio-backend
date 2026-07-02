import { prisma } from "../prisma";
import { findTeamByChecklistHubToken } from "./checklist-locations";
import { canManageGoLoginRequests } from "./go-login-requests";
import { fetchRemoteDocumentBytes } from "./firebase-storage";
import { isGoDeviceApproved } from "./workplace-alerts";
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
  initials: string;
  reviewerName?: string | null;
}): string {
  const initials = normalizeInitials(input.initials);
  const name = normalizeName(input.reviewerName).toLowerCase();
  return `signer:${name}:${initials}`;
}

export { canManageGoLoginRequests as canManageBriefings };

function isBriefingManagerRole(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

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

  const briefings = await prisma.briefing.findMany({
    where: { teamId },
    orderBy: { publishedAt: "desc" },
  });

  const now = new Date();

  return {
    ok: true as const,
    briefings: briefings.map((b) =>
      serializeBriefingRow(b, briefingStatus(b.dueAt, null, now), null),
    ),
    canManage: isBriefingManagerRole(member.role),
  };
}

export async function getBriefingForUser(teamId: string, briefingId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  return {
    ok: true as const,
    briefing: serializeBriefingRow(
      briefing,
      briefingStatus(briefing.dueAt, null),
      null,
    ),
    canManage: isBriefingManagerRole(member.role),
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
  const reviewerName = normalizeName(input.reviewerName || userName);
  if (!reviewerName) {
    return { ok: false as const, code: "NAME_REQUIRED" as const };
  }
  if (briefing.requireSignature && !signatureData) {
    return { ok: false as const, code: "SIGNATURE_REQUIRED" as const };
  }
  if (!briefing.requireSignature && briefing.allowInitials && !initials) {
    return { ok: false as const, code: "INITIALS_REQUIRED" as const };
  }
  if (!briefing.requireSignature && !briefing.allowInitials && !initials && !signatureData) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const completionKey = buildCompletionKey({ initials: initials || "OK", reviewerName });

  try {
    const completion = await prisma.briefingCompletion.create({
      data: {
        briefingId,
        teamId,
        completionKey,
        userId,
        initials: initials || "—",
        signatureData,
        reviewerName,
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
  if (!member || !isBriefingManagerRole(member.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  const completions = await prisma.briefingCompletion.findMany({
    where: { briefingId },
    orderBy: { completedAt: "desc" },
  });

  const signers = completions.map((c) => ({
    completionId: c.id,
    name: c.reviewerName || "Associate",
    completedAt: c.completedAt.toISOString(),
    initials: c.initials,
    deviceId: c.deviceId,
    source: c.deviceId ? ("kiosk" as const) : ("web" as const),
  }));

  const now = new Date();
  const briefingDueStatus = briefingStatus(briefing.dueAt, null, now);

  return {
    ok: true as const,
    stats: {
      signed: completions.length,
      overdue: briefingDueStatus === "overdue",
      completions: signers,
    },
    briefing: serializeBriefingRow(briefing, briefingDueStatus, null),
  };
}

export async function deleteBriefingCompletion(
  teamId: string,
  briefingId: string,
  completionId: string,
  userId: string,
) {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !isBriefingManagerRole(member.role)) {
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

  const reachable = await isGoDeviceApproved(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefings = await prisma.briefing.findMany({
    where: { teamId: team.id },
    orderBy: { publishedAt: "desc" },
  });

  const now = new Date();

  return {
    ok: true as const,
    briefings: briefings.map((b) =>
      serializeBriefingRow(
        b,
        briefingStatus(b.dueAt, null, now),
        null,
      ),
    ),
  };
}

export async function getPublicBriefing(hubToken: string, deviceId: string, briefingId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const reachable = await isGoDeviceApproved(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId: team.id } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  return {
    ok: true as const,
    briefing: serializeBriefingRow(
      briefing,
      briefingStatus(briefing.dueAt, null),
      null,
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

  const reachable = await isGoDeviceApproved(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId: team.id } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  const initials = normalizeInitials(input.initials ?? "");
  const signatureData = input.signatureData?.trim() || null;
  const reviewerName = normalizeName(input.reviewerName);
  if (!reviewerName) {
    return { ok: false as const, code: "NAME_REQUIRED" as const };
  }

  if (briefing.requireSignature && !signatureData) {
    return { ok: false as const, code: "SIGNATURE_REQUIRED" as const };
  }
  if (!initials && !signatureData) {
    return { ok: false as const, code: "INITIALS_REQUIRED" as const };
  }

  const completionKey = buildCompletionKey({ initials: initials || "SIG", reviewerName });

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

export async function getBriefingDocumentForUser(teamId: string, briefingId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  try {
    const document = await fetchRemoteDocumentBytes(briefing.documentUrl);
    return {
      ok: true as const,
      bytes: document.bytes,
      contentType: briefing.contentType || document.contentType,
      filename: briefing.documentFilename || "briefing-document",
    };
  } catch {
    return { ok: false as const, code: "DOCUMENT_UNAVAILABLE" as const };
  }
}

export async function getPublicBriefingDocument(hubToken: string, deviceId: string, briefingId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const reachable = await isGoDeviceApproved(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };

  const briefing = await prisma.briefing.findFirst({ where: { id: briefingId, teamId: team.id } });
  if (!briefing) return { ok: false as const, code: "NOT_FOUND" as const };

  try {
    const document = await fetchRemoteDocumentBytes(briefing.documentUrl);
    return {
      ok: true as const,
      bytes: document.bytes,
      contentType: briefing.contentType || document.contentType,
      filename: briefing.documentFilename || "briefing-document",
    };
  } catch {
    return { ok: false as const, code: "DOCUMENT_UNAVAILABLE" as const };
  }
}
