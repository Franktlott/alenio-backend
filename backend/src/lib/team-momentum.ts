import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import type {
  TeamMomentumActiveTaskSummary,
  TeamMomentumBand,
  TeamMomentumCompletionEvidence,
  TeamMomentumLeaderSummary,
  TeamMomentumMemberDetail,
  TeamMomentumMemberSummary,
  TeamMomentumOverdueTaskSummary,
  TeamMomentumStreakBreakingLateCompletion,
  TeamMomentumTaskSummary,
} from "../types";
import { calendarDayFromInstant, instantFromCalendarDateAndTime, resolveTimeZone } from "./timezone";
import type { WorkspaceAccessState } from "./workspace-access";
import { getWorkspaceAccess } from "./workspace-access";
import { canAccessWorkspaceManagerInsights } from "./workspace-role-policy";
import { getWorkspaceTimeZone } from "./workspace-timezone";

const ACTIVE_WINDOW_DAYS = 30 as const;
const DAY_MS = 86_400_000;

export const TEAM_MOMENTUM_LEADER_REQUIRED = "TEAM_MOMENTUM_LEADER_REQUIRED";
export const TEAM_MOMENTUM_PLAN_REQUIRED = "TEAM_MOMENTUM_PLAN_REQUIRED";

export class TeamMomentumAccessError extends Error {
  constructor(
    readonly status: 403 | 404,
    readonly code:
      | "WORKSPACE_MEMBERSHIP_REQUIRED"
      | typeof TEAM_MOMENTUM_LEADER_REQUIRED
      | typeof TEAM_MOMENTUM_PLAN_REQUIRED
      | "MEMBER_NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

type MemberRow = {
  id: string;
  userId: string;
  role: string;
  currentStreak: number;
  personalBestStreak: number;
  momentumRunStartedAt: Date | null;
  momentumLastQualifiedAt: Date | null;
  user: {
    name: string;
    email: string;
    image: string | null;
  };
};

type CreditRow = {
  id: string;
  sourceTaskId: string;
  creditedUserId: string;
  sourceTaskTitle: string | null;
  sourceTaskIncognito: boolean;
  dueAt: Date;
  completedAt: Date;
  onTime: boolean;
};

type TaskRow = {
  id: string;
  title: string;
  incognito: boolean;
  priority: string;
  status: string;
  isJoint: boolean;
  dueDate: Date | null;
};

export function teamMomentumPlanEnabled(
  access: Pick<WorkspaceAccessState, "hasTeamFeatures" | "status">,
): boolean {
  return access.hasTeamFeatures && (access.status === "active" || access.status === "trialing");
}

export function assertTeamMomentumAccess(
  membership: { role: string } | null | undefined,
  access?: Pick<WorkspaceAccessState, "hasTeamFeatures" | "status">,
): void {
  if (!membership) {
    throw new TeamMomentumAccessError(
      403,
      "WORKSPACE_MEMBERSHIP_REQUIRED",
      "Active workspace membership is required.",
    );
  }
  if (!canAccessWorkspaceManagerInsights(membership.role)) {
    throw new TeamMomentumAccessError(
      403,
      TEAM_MOMENTUM_LEADER_REQUIRED,
      "Only workspace owners and team leaders can view Team Momentum.",
    );
  }
  if (!access || !teamMomentumPlanEnabled(access)) {
    throw new TeamMomentumAccessError(
      403,
      TEAM_MOMENTUM_PLAN_REQUIRED,
      "Team Momentum requires an active trial or paid Team plan.",
    );
  }
}

export function calendarMonthRange(now: Date, rawTimeZone?: string | null) {
  const timeZone = resolveTimeZone(rawTimeZone);
  const localDay = calendarDayFromInstant(now, timeZone);
  const [year = 1970, month = 1] = localDay.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const startDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDay = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return {
    timeZone,
    start: instantFromCalendarDateAndTime(startDay, 0, 0, timeZone),
    end: instantFromCalendarDateAndTime(endDay, 0, 0, timeZone),
  };
}

function isActiveMember(member: MemberRow, now: Date): boolean {
  return (
    member.currentStreak > 0 &&
    member.momentumLastQualifiedAt !== null &&
    member.momentumLastQualifiedAt.getTime() >= now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS
  );
}

function memberBand(member: MemberRow, now: Date): TeamMomentumBand | null {
  if (!isActiveMember(member, now)) return null;
  return member.currentStreak >= 3 ? "strong" : "building";
}

function toMemberSummary(
  member: MemberRow,
  completedThisMonth: number,
  overdueTaskCount: number,
): TeamMomentumMemberSummary {
  return {
    teamMemberId: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    image: member.user.image,
    role: member.role,
    currentStreak: member.currentStreak,
    personalBestStreak: member.personalBestStreak,
    momentumRunStartedAt: member.momentumRunStartedAt?.toISOString() ?? null,
    momentumLastQualifiedAt: member.momentumLastQualifiedAt?.toISOString() ?? null,
    completedThisMonth,
    overdueTaskCount,
  };
}

export function buildTeamMomentumSummary(input: {
  teamId: string;
  now: Date;
  monthStart: Date;
  monthEnd: Date;
  members: MemberRow[];
  credits: Array<Pick<CreditRow, "creditedUserId" | "completedAt">>;
  overdueAssignments: Array<{ userId: string }>;
}): TeamMomentumLeaderSummary {
  const historyUserIds = new Set(input.credits.map((credit) => credit.creditedUserId));
  const monthCounts = new Map<string, number>();
  for (const credit of input.credits) {
    if (credit.completedAt >= input.monthStart && credit.completedAt < input.monthEnd) {
      monthCounts.set(credit.creditedUserId, (monthCounts.get(credit.creditedUserId) ?? 0) + 1);
    }
  }
  const overdueCounts = new Map<string, number>();
  for (const assignment of input.overdueAssignments) {
    overdueCounts.set(assignment.userId, (overdueCounts.get(assignment.userId) ?? 0) + 1);
  }

  const strong: TeamMomentumLeaderSummary["groups"]["strong"] = [];
  const building: TeamMomentumLeaderSummary["groups"]["building"] = [];
  const readyToRebuild: TeamMomentumLeaderSummary["groups"]["readyToRebuild"] = [];
  const notEnoughActivity: TeamMomentumLeaderSummary["notEnoughActivity"]["members"] = [];

  const members = input.members
    .filter((item) => item.role !== "owner")
    .sort((left, right) => {
      const nameOrder = left.user.name.localeCompare(right.user.name, undefined, {
        sensitivity: "base",
      });
      return nameOrder || left.user.email.localeCompare(right.user.email) ||
        left.userId.localeCompare(right.userId);
    });
  for (const member of members) {
    const summary = toMemberSummary(
      member,
      monthCounts.get(member.userId) ?? 0,
      overdueCounts.get(member.userId) ?? 0,
    );
    if (!historyUserIds.has(member.userId)) {
      notEnoughActivity.push({ ...summary, reason: "no_qualifying_completions" });
      continue;
    }
    const band = memberBand(member, input.now);
    if (band === "strong") strong.push({ ...summary, band });
    else if (band === "building") building.push({ ...summary, band });
    else readyToRebuild.push({ ...summary, band: "ready_to_rebuild" });
  }

  return {
    teamId: input.teamId,
    generatedAt: input.now.toISOString(),
    activeWindowDays: ACTIVE_WINDOW_DAYS,
    activeCount: strong.length + building.length,
    eligibleCount: strong.length + building.length + readyToRebuild.length + notEnoughActivity.length,
    groups: { strong, building, readyToRebuild },
    notEnoughActivity: { count: notEnoughActivity.length, members: notEnoughActivity },
  };
}

function normalizePriority(priority: string): TeamMomentumTaskSummary["priority"] {
  return priority === "low" || priority === "high" || priority === "urgent"
    ? priority
    : "medium";
}

function taskBase(task: TaskRow): TeamMomentumTaskSummary {
  return {
    id: task.id,
    title: task.incognito ? null : task.title,
    incognito: task.incognito,
    priority: normalizePriority(task.priority),
    status: task.status,
    isJoint: task.isJoint,
  };
}

function completionEvidence(
  credit: CreditRow,
  availableTaskIds: ReadonlySet<string>,
): TeamMomentumCompletionEvidence {
  return {
    creditId: credit.id,
    sourceTaskId: credit.sourceTaskId,
    sourceTaskAvailable: availableTaskIds.has(credit.sourceTaskId),
    title: credit.sourceTaskIncognito ? null : credit.sourceTaskTitle,
    incognito: credit.sourceTaskIncognito,
    dueAt: credit.dueAt.toISOString(),
    completedAt: credit.completedAt.toISOString(),
    onTime: credit.onTime,
  };
}

function newestFirst(a: CreditRow, b: CreditRow): number {
  return b.completedAt.getTime() - a.completedAt.getTime() || b.id.localeCompare(a.id);
}

export function buildTeamMomentumMemberDetail(input: {
  teamId: string;
  now: Date;
  monthStart: Date;
  monthEnd: Date;
  member: MemberRow;
  credits: CreditRow[];
  tasks: TaskRow[];
  availableTaskIds: ReadonlySet<string>;
  currentRunLimit: number;
}): TeamMomentumMemberDetail {
  const ordered = [...input.credits].sort(newestFirst);
  const currentRunCredits: CreditRow[] = [];
  for (const credit of ordered) {
    if (!credit.onTime) break;
    currentRunCredits.push(credit);
  }

  let streak = 0;
  let latestLate:
    | { credit: CreditRow; streakBeforeBreak: number }
    | undefined;
  for (const credit of [...ordered].reverse()) {
    if (credit.onTime) {
      streak += 1;
    } else {
      latestLate = { credit, streakBeforeBreak: streak };
      streak = 0;
    }
  }

  const overdueTasks: TeamMomentumOverdueTaskSummary[] = [];
  const activeTasks: TeamMomentumActiveTaskSummary[] = [];
  for (const task of input.tasks) {
    if (task.dueDate && task.dueDate < input.now) {
      overdueTasks.push({
        ...taskBase(task),
        dueAt: task.dueDate.toISOString(),
        overdueSince: task.dueDate.toISOString(),
      });
    } else {
      activeTasks.push({
        ...taskBase(task),
        dueAt: task.dueDate?.toISOString() ?? null,
      });
    }
  }

  const completedThisMonth = ordered.filter(
    (credit) => credit.completedAt >= input.monthStart && credit.completedAt < input.monthEnd,
  ).length;
  const member = toMemberSummary(input.member, completedThisMonth, overdueTasks.length);
  const band = memberBand(input.member, input.now);
  const hasHistory = ordered.length > 0;
  const returnedRun = currentRunCredits.slice(0, input.currentRunLimit);

  return {
    teamId: input.teamId,
    generatedAt: input.now.toISOString(),
    activeWindowDays: ACTIVE_WINDOW_DAYS,
    member,
    active: band !== null,
    band: band ?? (hasHistory ? "ready_to_rebuild" : null),
    notEnoughActivityReason: hasHistory ? null : "no_qualifying_completions",
    currentRun: {
      startedAt: input.member.momentumRunStartedAt?.toISOString() ?? null,
      lastQualifiedAt: input.member.momentumLastQualifiedAt?.toISOString() ?? null,
      totalCount: currentRunCredits.length,
      returnedCount: returnedRun.length,
      truncated: returnedRun.length < currentRunCredits.length,
      completions: returnedRun.map((credit) =>
        completionEvidence(credit, input.availableTaskIds),
      ),
    },
    latestStreakBreakingLateCompletion: latestLate
      ? ({
          ...completionEvidence(latestLate.credit, input.availableTaskIds),
          onTime: false,
          streakBeforeBreak: latestLate.streakBeforeBreak,
        } satisfies TeamMomentumStreakBreakingLateCompletion)
      : null,
    activeTasks,
    overdueTasks,
  };
}

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  currentStreak: true,
  personalBestStreak: true,
  momentumRunStartedAt: true,
  momentumLastQualifiedAt: true,
  user: { select: { name: true, email: true, image: true } },
} as const;

const creditSelect = {
  id: true,
  sourceTaskId: true,
  creditedUserId: true,
  sourceTaskTitle: true,
  sourceTaskIncognito: true,
  dueAt: true,
  completedAt: true,
  onTime: true,
} as const;

async function authorize(
  teamId: string,
  viewerUserId: string,
  now: Date,
  db: PrismaClient,
) {
  const membership = await db.teamMember.findUnique({
    where: { userId_teamId: { userId: viewerUserId, teamId } },
    select: { role: true, user: { select: { timezone: true } } },
  });
  if (!membership || !canAccessWorkspaceManagerInsights(membership.role)) {
    assertTeamMomentumAccess(membership);
  }
  const access = await getWorkspaceAccess(teamId, now, db);
  assertTeamMomentumAccess(membership, access);
  return membership!;
}

async function authorizeMemberDetail(
  teamId: string,
  memberUserId: string,
  viewerUserId: string,
  now: Date,
  db: PrismaClient,
) {
  if (memberUserId !== viewerUserId) {
    return authorize(teamId, viewerUserId, now, db);
  }
  const membership = await db.teamMember.findUnique({
    where: { userId_teamId: { userId: viewerUserId, teamId } },
    select: { role: true, user: { select: { timezone: true } } },
  });
  if (!membership) {
    throw new TeamMomentumAccessError(
      403,
      "WORKSPACE_MEMBERSHIP_REQUIRED",
      "Active workspace membership is required.",
    );
  }
  const access = await getWorkspaceAccess(teamId, now, db);
  if (!teamMomentumPlanEnabled(access)) {
    throw new TeamMomentumAccessError(
      403,
      TEAM_MOMENTUM_PLAN_REQUIRED,
      "Momentum requires an active trial or paid Team plan.",
    );
  }
  return membership;
}

export async function getTeamMomentumSummary(
  teamId: string,
  viewerUserId: string,
  now = new Date(),
  db: PrismaClient = prisma,
): Promise<TeamMomentumLeaderSummary> {
  await authorize(teamId, viewerUserId, now, db);
  const month = calendarMonthRange(now, await getWorkspaceTimeZone(db, teamId));
  const members = await db.teamMember.findMany({
    where: { teamId, role: { not: "owner" } },
    select: memberSelect,
  });
  const userIds = members.map((member) => member.userId);
  const [credits, overdueAssignments] = userIds.length
    ? await Promise.all([
        db.momentumCompletionCredit.findMany({
          where: { teamId, creditedUserId: { in: userIds }, revokedAt: null },
          select: { creditedUserId: true, completedAt: true },
        }),
        db.taskAssignment.findMany({
          where: {
            userId: { in: userIds },
            task: {
              teamId,
              kind: "workspace_task",
              status: { not: "done" },
              archivedAt: null,
              dueDate: { lt: now },
            },
          },
          select: { userId: true },
        }),
      ])
    : [[], []];

  return buildTeamMomentumSummary({
    teamId,
    now,
    monthStart: month.start,
    monthEnd: month.end,
    members,
    credits,
    overdueAssignments,
  });
}

export async function getTeamMomentumMemberDetail(
  teamId: string,
  memberUserId: string,
  viewerUserId: string,
  currentRunLimit = 50,
  now = new Date(),
  db: PrismaClient = prisma,
): Promise<TeamMomentumMemberDetail> {
  await authorizeMemberDetail(
    teamId,
    memberUserId,
    viewerUserId,
    now,
    db,
  );
  const member = await db.teamMember.findUnique({
    where: { userId_teamId: { userId: memberUserId, teamId } },
    select: memberSelect,
  });
  if (!member || member.role === "owner") {
    throw new TeamMomentumAccessError(
      404,
      "MEMBER_NOT_FOUND",
      "Active non-owner team member not found.",
    );
  }

  const month = calendarMonthRange(now, await getWorkspaceTimeZone(db, teamId));
  const [credits, tasks] = await Promise.all([
    db.momentumCompletionCredit.findMany({
      where: { teamId, creditedUserId: memberUserId, revokedAt: null },
      select: creditSelect,
    }),
    db.task.findMany({
      where: {
        teamId,
        kind: "workspace_task",
        status: { not: "done" },
        archivedAt: null,
        assignments: { some: { userId: memberUserId } },
      },
      select: {
        id: true,
        title: true,
        incognito: true,
        priority: true,
        status: true,
        isJoint: true,
        dueDate: true,
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }),
  ]);
  const availableTasks = credits.length
    ? await db.task.findMany({
        where: { teamId, id: { in: [...new Set(credits.map((credit) => credit.sourceTaskId))] } },
        select: { id: true },
      })
    : [];

  return buildTeamMomentumMemberDetail({
    teamId,
    now,
    monthStart: month.start,
    monthEnd: month.end,
    member,
    credits,
    tasks,
    availableTaskIds: new Set(availableTasks.map((task) => task.id)),
    currentRunLimit,
  });
}
