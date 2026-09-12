import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../prisma";
import { authorize, type AuthzActor } from "../authorization";
import { loadWorkspaceMembership } from "../authorization/loaders";
import {
  canAccessWorkspaceManagerInsights,
  canManageAssignedDevelopmentGoals,
  canManageDevelopmentGoals,
  canManageWorkspaceTasks,
} from "../workspace-role-policy";
import { taskVisibilityWhere, workspaceTaskWhere } from "../task-policy";
import { canViewCalendarEvent } from "../calendar-permissions";
import { parseCalendarAssignees } from "../authorization/calendar-assignees";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;

function clampLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function unavailable(workspaceId: string) {
  return { status: "unavailable" as const, workspaceId, reason: "unavailable" as const };
}

export async function listVisibleTasks(
  actor: AuthzActor,
  input: { workspaceId: string; limit?: number },
  db: PrismaClient = prisma,
) {
  const gate = await authorize({
    actor,
    action: "task.view",
    resource: { type: "workspace", id: input.workspaceId },
    db,
  });
  if (!gate.allow) return unavailable(input.workspaceId);
  const membership = await loadWorkspaceMembership(actor.userId, input.workspaceId, db);
  const manager = canManageWorkspaceTasks(membership?.role);
  const tasks = await db.task.findMany({
    where: {
      teamId: input.workspaceId,
      archivedAt: null,
      AND: [
        taskVisibilityWhere(actor.userId),
        manager
          ? workspaceTaskWhere
          : {
              OR: [
                { creatorId: actor.userId },
                { assignments: { some: { userId: actor.userId } } },
              ],
            },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      kind: true,
      assignments: {
        select: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: clampLimit(input.limit),
  });
  return {
    status: "ok" as const,
    items: tasks.map((task) => ({
      id: task.id,
      workspaceId: input.workspaceId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString() ?? null,
      assignees: task.assignments.map((assignment) => ({
        userId: assignment.user.id,
        name: assignment.user.name?.trim() || "Team member",
      })),
      overdue:
        Boolean(task.dueDate) &&
        task.status !== "done" &&
        task.dueDate!.getTime() < Date.now(),
      source: `/task-detail?id=${task.id}`,
    })),
    count: tasks.length,
  };
}

export async function listVisibleGoals(
  actor: AuthzActor,
  input: { workspaceId: string; limit?: number },
  db: PrismaClient = prisma,
) {
  const gate = await authorize({
    actor,
    action: "goal.view",
    resource: { type: "workspace", id: input.workspaceId },
    db,
  });
  if (!gate.allow) return unavailable(input.workspaceId);
  const membership = await loadWorkspaceMembership(actor.userId, input.workspaceId, db);
  const manager = canManageDevelopmentGoals(membership?.role);
  const goals = await db.developmentGoal.findMany({
    where: {
      teamId: input.workspaceId,
      archivedAt: null,
      ...(manager ? {} : { memberUserId: actor.userId }),
    },
    select: {
      id: true,
      skill: true,
      description: true,
      status: true,
      dueDate: true,
      memberUserId: true,
    },
    orderBy: { createdAt: "desc" },
    take: clampLimit(input.limit),
  });
  const visible = goals.filter((goal) =>
    canManageAssignedDevelopmentGoals(membership?.role, actor.userId, goal.memberUserId),
  );
  return {
    status: "ok" as const,
    items: visible.map((goal) => ({
      id: goal.id,
      workspaceId: input.workspaceId,
      skill: goal.skill,
      status: goal.status,
      dueDate: goal.dueDate?.toISOString() ?? null,
      source: `/teams/${input.workspaceId}/development`,
    })),
    count: visible.length,
  };
}

export async function listVisibleEvents(
  actor: AuthzActor,
  input: { workspaceId: string; from: Date; to: Date; limit?: number },
  db: PrismaClient = prisma,
) {
  const gate = await authorize({
    actor,
    action: "event.view",
    resource: { type: "workspace", id: input.workspaceId },
    db,
  });
  if (!gate.allow) return unavailable(input.workspaceId);
  const membership = await loadWorkspaceMembership(actor.userId, input.workspaceId, db);
  const events = await db.calendarEvent.findMany({
    where: {
      teamId: input.workspaceId,
      startDate: { gte: input.from, lte: input.to },
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      isHidden: true,
      approvalStatus: true,
      createdById: true,
      isVideoMeeting: true,
      isOneOnOne: true,
      oneOnOneMemberUserId: true,
      reminderMinutes: true,
    },
    orderBy: { startDate: "asc" },
    take: clampLimit(input.limit),
  });
  const visible = events.filter((event) => {
    const assigneeIds = [
      ...parseCalendarAssignees(event.reminderMinutes),
      ...(event.oneOnOneMemberUserId ? [event.oneOnOneMemberUserId] : []),
    ];
    return canViewCalendarEvent(event, actor.userId, membership?.role ?? "member", assigneeIds);
  });
  return {
    status: "ok" as const,
    items: visible.map((event) => ({
      id: event.id,
      workspaceId: input.workspaceId,
      title: event.title,
      startDate: event.startDate.toISOString(),
      source: `/teams/${input.workspaceId}/calendar`,
    })),
    count: visible.length,
  };
}

export async function listAttentionItems(
  actor: AuthzActor,
  input: { workspaceId: string; limit?: number },
  db: PrismaClient = prisma,
) {
  const tasks = await listVisibleTasks(actor, input, db);
  if (tasks.status !== "ok") return tasks;
  const overdue = tasks.items.filter((item) => item.overdue);
  return {
    status: "ok" as const,
    items: overdue,
    count: overdue.length,
  };
}

function rosterRoleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team leader";
  if (role === "admin") return "Admin";
  return "Member";
}

export type VisibleRosterMember = {
  userId: string;
  name: string;
  role: string;
};

export async function listVisibleRoster(
  actor: AuthzActor,
  input: { workspaceId: string },
  db: PrismaClient = prisma,
): Promise<
  | { status: "ok"; items: VisibleRosterMember[] }
  | { status: "unavailable"; workspaceId: string; reason: string }
> {
  const gate = await authorize({
    actor,
    action: "seneca.use",
    resource: { type: "workspace", id: input.workspaceId },
    db,
  });
  if (!gate.allow || !canAccessWorkspaceManagerInsights(gate.role)) {
    return unavailable(input.workspaceId);
  }
  const members = await db.teamMember.findMany({
    where: { teamId: input.workspaceId },
    select: {
      userId: true,
      role: true,
      user: { select: { name: true, email: true } },
    },
  });
  return {
    status: "ok",
    items: members.map((member) => ({
      userId: member.userId,
      name: member.user.name?.trim() || member.user.email || "Team member",
      role: rosterRoleLabel(member.role),
    })),
  };
}

export async function listUpcomingPlannedCheckIns(
  actor: AuthzActor,
  input: { workspaceId: string },
  db: PrismaClient = prisma,
) {
  const roster = await listVisibleRoster(actor, input, db);
  if (roster.status !== "ok") return roster;
  const now = Date.now();
  const events = await db.calendarEvent.findMany({
    where: {
      teamId: input.workspaceId,
      createdById: actor.userId,
      isOneOnOne: true,
      oneOnOneMemberUserId: { not: null },
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      oneOnOneMemberUserId: true,
      isHidden: true,
      approvalStatus: true,
      createdById: true,
      isVideoMeeting: true,
      isOneOnOne: true,
      reminderMinutes: true,
    },
  });
  const membership = await loadWorkspaceMembership(actor.userId, input.workspaceId, db);
  const names = new Map(roster.items.map((member) => [member.userId, member.name]));
  const items = events
    .filter((event) => new Date(event.endDate ?? event.startDate).getTime() >= now)
    .filter((event) => {
      const assigneeIds = event.oneOnOneMemberUserId ? [event.oneOnOneMemberUserId] : [];
      return canViewCalendarEvent(event, actor.userId, membership?.role ?? "member", assigneeIds);
    })
    .map((event) => ({
      id: event.id,
      memberUserId: event.oneOnOneMemberUserId!,
      memberName: names.get(event.oneOnOneMemberUserId!) ?? "Team member",
      startDate: event.startDate,
    }));
  return { status: "ok" as const, items };
}
