import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../prisma";
import { authorize, type AuthzActor } from "../authorization";
import { findLeaderCommentsField } from "../check-in-leader-comments";
import { canManageCheckIns } from "../workspace-role-policy";
import { loadWorkspaceMembership } from "../authorization/loaders";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;

function clampLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export type CheckInSummary = {
  id: string;
  workspaceId: string;
  memberUserId: string;
  templateTitle: string;
  status: "draft" | "published";
  publishedAt: string | null;
  createdAt: string;
  source: string;
};

export async function canListMemberCheckIns(
  actor: AuthzActor,
  workspaceId: string,
  memberUserId: string,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const membership = await loadWorkspaceMembership(actor.userId, workspaceId, db);
  if (!membership) return false;
  if (actor.userId === memberUserId) return true;
  return canManageCheckIns(membership.role);
}

export async function getCheckInView(
  actor: AuthzActor,
  meetingId: string,
  db: PrismaClient = prisma,
): Promise<{
  summary: CheckInSummary;
  leaderNotes: { label: string; text: string } | null;
} | null> {
  const summaryDecision = await authorize({
    actor,
    action: "checkin.view_summary",
    resource: { type: "checkin", id: meetingId },
    db,
  });
  if (!summaryDecision.allow) return null;

  const meeting = await db.oneOnOneMeeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      teamId: true,
      memberUserId: true,
      templateTitle: true,
      templateFields: true,
      responses: true,
      status: true,
      publishedAt: true,
      createdAt: true,
    },
  });
  if (!meeting) return null;

  const notesDecision = await authorize({
    actor,
    action: "checkin.view_leader_notes",
    resource: { type: "checkin", id: meetingId },
    db,
  });

  const fields = parseJson<Array<{ id: string; label: string; type: string }>>(
    meeting.templateFields,
    [],
  );
  const responses = parseJson<Record<string, string | number>>(meeting.responses, {});
  let leaderNotes: { label: string; text: string } | null = null;
  if (notesDecision.allow) {
    const field = findLeaderCommentsField(fields);
    if (field) {
      const raw = responses[field.id];
      const text = raw === undefined || raw === null ? "" : String(raw).trim();
      if (text) leaderNotes = { label: field.label, text };
    }
  }

  return {
    summary: {
      id: meeting.id,
      workspaceId: meeting.teamId,
      memberUserId: meeting.memberUserId,
      templateTitle: meeting.templateTitle,
      status: meeting.status === "draft" ? "draft" : "published",
      publishedAt: meeting.publishedAt?.toISOString() ?? null,
      createdAt: meeting.createdAt.toISOString(),
      source: `/teams/${meeting.teamId}/members/${meeting.memberUserId}/one-on-ones`,
    },
    leaderNotes,
  };
}

export function maskCheckInResponsesForViewer(
  templateFields: unknown,
  responses: Record<string, string | number>,
  canViewLeaderNotes: boolean,
): Record<string, string | number> {
  if (canViewLeaderNotes) return responses;
  const fields = Array.isArray(templateFields) ? templateFields : [];
  const privateIds = new Set(
    fields
      .filter(
        (field): field is { id: string; type: string } =>
          Boolean(field) &&
          typeof field === "object" &&
          typeof (field as { id?: unknown }).id === "string" &&
          (field as { type?: unknown }).type === "manager_notes",
      )
      .map((field) => field.id),
  );
  if (privateIds.size === 0) return responses;
  const next = { ...responses };
  for (const id of privateIds) delete next[id];
  return next;
}

export async function listCheckInSummaries(
  actor: AuthzActor,
  input: { workspaceId: string; memberUserId?: string; limit?: number },
  db: PrismaClient = prisma,
): Promise<
  | { status: "ok"; items: CheckInSummary[] }
  | { status: "unavailable"; workspaceId: string; reason: string }
> {
  const seneca = await authorize({
    actor,
    action: "seneca.use",
    resource: { type: "workspace", id: input.workspaceId },
    db,
  });
  if (!seneca.allow) {
    return {
      status: "unavailable",
      workspaceId: input.workspaceId,
      reason: "unavailable",
    };
  }
  const memberUserId = input.memberUserId ?? actor.userId;
  if (!(await canListMemberCheckIns(actor, input.workspaceId, memberUserId, db))) {
    return {
      status: "unavailable",
      workspaceId: input.workspaceId,
      reason: "unavailable",
    };
  }
  const membership = await loadWorkspaceMembership(actor.userId, input.workspaceId, db);
  const manager = canManageCheckIns(membership?.role);
  const meetings = await db.oneOnOneMeeting.findMany({
    where: {
      teamId: input.workspaceId,
      memberUserId,
      ...(!manager ? { status: "published" } : {}),
    },
    select: {
      id: true,
      teamId: true,
      memberUserId: true,
      templateTitle: true,
      status: true,
      publishedAt: true,
      createdAt: true,
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: clampLimit(input.limit),
  });
  return {
    status: "ok",
    items: meetings.map((meeting) => ({
      id: meeting.id,
      workspaceId: meeting.teamId,
      memberUserId: meeting.memberUserId,
      templateTitle: meeting.templateTitle,
      status: meeting.status === "draft" ? "draft" : "published",
      publishedAt: meeting.publishedAt?.toISOString() ?? null,
      createdAt: meeting.createdAt.toISOString(),
      source: `/teams/${meeting.teamId}/members/${meeting.memberUserId}/one-on-ones`,
    })),
  };
}
