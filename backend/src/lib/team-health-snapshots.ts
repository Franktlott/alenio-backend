import { prisma } from "../prisma";
import {
  computeMemberStandardsCompliance,
  parseWorkplaceStandards,
} from "./workplace-standards";
import { calendarDayFromInstant, resolveTimeZone } from "./timezone";

function calendarDaysBetween(earlier: Date, later: Date, timeZone: string): number {
  const earlierDay = calendarDayFromInstant(earlier, timeZone);
  const laterDay = calendarDayFromInstant(later, timeZone);
  const earlierMs = Date.parse(`${earlierDay}T00:00:00.000Z`);
  const laterMs = Date.parse(`${laterDay}T00:00:00.000Z`);
  if (!Number.isFinite(earlierMs) || !Number.isFinite(laterMs)) return 0;
  return Math.max(0, Math.floor((laterMs - earlierMs) / 86_400_000));
}

export async function calculateCurrentTeamHealth(teamId: string, now = new Date()) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      workplaceStandards: true,
      members: {
        select: {
          userId: true,
          role: true,
          user: { select: { timezone: true } },
        },
      },
    },
  });
  if (!team) return null;

  const preferredTimeZone =
    team.members.find((member) => member.role === "owner")?.user.timezone ??
    team.members.find((member) =>
      ["team_leader", "admin"].includes(member.role),
    )?.user.timezone ??
    team.members[0]?.user.timezone;
  const timeZone = resolveTimeZone(preferredTimeZone);
  const standards = parseWorkplaceStandards(team.workplaceStandards);
  const memberUserIds = [
    ...new Set(
      team.members
        .filter((member) => member.role !== "owner")
        .map((member) => member.userId),
    ),
  ];

  if (memberUserIds.length === 0) {
    return {
      teamId,
      snapshotDate: calendarDayFromInstant(now, timeZone),
      timezone: timeZone,
      teamHealthPct: 100,
      checkInPct: standards.checkInRequired ? 100 : null,
      goalsPct: standards.goalsRequired ? 100 : null,
      tasksPct: 100,
      memberCount: 0,
    };
  }

  const [meetings, activeGoals, openTaskAssignments, overdueTaskAssignments] =
    await Promise.all([
      prisma.oneOnOneMeeting.findMany({
        where: {
          teamId,
          memberUserId: { in: memberUserIds },
          status: "published",
          ...(standards.requiredCheckInTemplateId
            ? { templateId: standards.requiredCheckInTemplateId }
            : {}),
        },
        select: { memberUserId: true, publishedAt: true, createdAt: true },
      }),
      prisma.developmentGoal.findMany({
        where: {
          teamId,
          memberUserId: { in: memberUserIds },
          status: "active",
        },
        select: { memberUserId: true },
      }),
      prisma.taskAssignment.count({
        where: {
          userId: { in: memberUserIds },
          task: { teamId, status: { not: "done" }, archivedAt: null },
        },
      }),
      prisma.taskAssignment.count({
        where: {
          userId: { in: memberUserIds },
          task: {
            teamId,
            status: { not: "done" },
            archivedAt: null,
            dueDate: { lt: now },
          },
        },
      }),
    ]);

  const lastCheckInByMember = new Map<string, Date>();
  for (const meeting of meetings) {
    const candidate = meeting.publishedAt ?? meeting.createdAt;
    const current = lastCheckInByMember.get(meeting.memberUserId);
    if (!current || candidate > current) {
      lastCheckInByMember.set(meeting.memberUserId, candidate);
    }
  }

  const activeGoalsByMember = new Map<string, number>();
  for (const goal of activeGoals) {
    activeGoalsByMember.set(
      goal.memberUserId,
      (activeGoalsByMember.get(goal.memberUserId) ?? 0) + 1,
    );
  }

  let checkInsOnTrack = 0;
  let goalsOnTrack = 0;
  for (const userId of memberUserIds) {
    const lastCheckIn = lastCheckInByMember.get(userId);
    const compliance = computeMemberStandardsCompliance(
      standards,
      lastCheckIn ? calendarDaysBetween(lastCheckIn, now, timeZone) : null,
      activeGoalsByMember.get(userId) ?? 0,
    );
    if (
      compliance.checkInStatus === "on_track" ||
      compliance.checkInStatus === "due_soon"
    ) {
      checkInsOnTrack += 1;
    }
    if (compliance.goalsStatus === "on_track") goalsOnTrack += 1;
  }

  const checkInPct = standards.checkInRequired
    ? Math.round((checkInsOnTrack / memberUserIds.length) * 100)
    : null;
  const goalsPct = standards.goalsRequired
    ? Math.round((goalsOnTrack / memberUserIds.length) * 100)
    : null;
  const tasksPct =
    openTaskAssignments > 0
      ? Math.round(
          ((openTaskAssignments -
            Math.min(openTaskAssignments, overdueTaskAssignments)) /
            openTaskAssignments) *
            100,
        )
      : 100;
  const values = [checkInPct, goalsPct, tasksPct].filter(
    (value): value is number => typeof value === "number",
  );

  return {
    teamId,
    snapshotDate: calendarDayFromInstant(now, timeZone),
    timezone: timeZone,
    teamHealthPct:
      values.length > 0
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : 100,
    checkInPct,
    goalsPct,
    tasksPct,
    memberCount: memberUserIds.length,
  };
}

export async function captureTeamHealthSnapshot(teamId: string, now = new Date()) {
  const health = await calculateCurrentTeamHealth(teamId, now);
  if (!health) return null;

  return prisma.teamHealthSnapshot.upsert({
    where: {
      teamId_snapshotDate: {
        teamId,
        snapshotDate: health.snapshotDate,
      },
    },
    create: health,
    update: {},
  });
}

export async function captureMissingDailyTeamHealthSnapshots(now = new Date()) {
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      members: {
        select: {
          role: true,
          user: { select: { timezone: true } },
        },
      },
    },
  });
  let captured = 0;

  for (const team of teams) {
    const preferredTimeZone =
      team.members.find((member) => member.role === "owner")?.user.timezone ??
      team.members.find((member) =>
        ["team_leader", "admin"].includes(member.role),
      )?.user.timezone ??
      team.members[0]?.user.timezone;
    const timeZone = resolveTimeZone(preferredTimeZone);
    const snapshotDate = calendarDayFromInstant(now, timeZone);
    const existing = await prisma.teamHealthSnapshot.findUnique({
      where: {
        teamId_snapshotDate: {
          teamId: team.id,
          snapshotDate,
        },
      },
      select: { id: true },
    });
    if (existing) continue;
    const health = await calculateCurrentTeamHealth(team.id, now);
    if (!health) continue;
    await prisma.teamHealthSnapshot.upsert({
      where: {
        teamId_snapshotDate: {
          teamId: team.id,
          snapshotDate: health.snapshotDate,
        },
      },
      create: health,
      update: {},
    });
    captured += 1;
  }

  return captured;
}
