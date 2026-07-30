import { prisma } from "../prisma";
import { calculateCurrentTeamHealth } from "./team-health-snapshots";
import { calendarDayFromInstant } from "./timezone";
import {
  computeMemberStandardsCompliance,
  parseWorkplaceStandards,
} from "./workplace-standards";
import type { SenecaFocusFacts } from "./seneca-focus-engine";

function calendarDaysBetween(earlier: Date, later: Date, timeZone: string): number {
  const a = Date.parse(`${calendarDayFromInstant(earlier, timeZone)}T00:00:00.000Z`);
  const b = Date.parse(`${calendarDayFromInstant(later, timeZone)}T00:00:00.000Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((b - a) / 86_400_000)) : 0;
}

export async function loadSenecaFocusFacts(
  teamId: string,
  managerUserId: string,
  timeZone: string,
  now = new Date(),
): Promise<SenecaFocusFacts> {
  const recognitionSince = new Date(now.getTime() - 14 * 86_400_000);
  const upcomingThrough = new Date(now.getTime() + 7 * 86_400_000);
  const snapshotsSince = new Date(now.getTime() - 14 * 86_400_000);

  const [team, meetings, goals, tasks, activities, snapshots, currentHealth] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: {
        workplaceStandards: true,
        members: {
          select: { userId: true, role: true, user: { select: { name: true } } },
        },
      },
    }),
    prisma.oneOnOneMeeting.findMany({
      where: { teamId, status: "published" },
      select: { memberUserId: true, templateId: true, publishedAt: true, createdAt: true },
    }),
    prisma.developmentGoal.findMany({
      where: { teamId, status: "active" },
      select: { id: true, memberUserId: true, skill: true, createdAt: true, lastActivityAt: true },
    }),
    prisma.task.findMany({
      where: { teamId, status: { not: "done" }, archivedAt: null },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        creatorId: true,
        assignments: { select: { userId: true } },
      },
    }),
    prisma.teamActivity.findMany({
      where: {
        teamId,
        type: { in: ["celebration", "task_completed"] },
        createdAt: { gte: recognitionSince },
      },
      select: { type: true, userId: true, metadata: true },
    }),
    prisma.teamHealthSnapshot.findMany({
      where: { teamId, capturedAt: { gte: snapshotsSince } },
      select: { teamHealthPct: true },
      orderBy: { capturedAt: "asc" },
      take: 14,
    }),
    calculateCurrentTeamHealth(teamId, now),
  ]);
  if (!team) throw new Error("Workspace not found");

  const standards = parseWorkplaceStandards(team.workplaceStandards);
  const managed = team.members.filter((member) => member.role !== "owner");
  const managedIds = new Set(managed.map((member) => member.userId));
  const latestCheckInByMember = new Map<string, Date>();
  for (const meeting of meetings) {
    if (!managedIds.has(meeting.memberUserId)) continue;
    if (standards.requiredCheckInTemplateId && meeting.templateId !== standards.requiredCheckInTemplateId) continue;
    const candidate = meeting.publishedAt ?? meeting.createdAt;
    const current = latestCheckInByMember.get(meeting.memberUserId);
    if (!current || candidate > current) {
      latestCheckInByMember.set(meeting.memberUserId, candidate);
    }
  }

  const activeGoalsByMember = new Map<string, number>();
  for (const goal of goals) {
    if (!managedIds.has(goal.memberUserId)) continue;
    activeGoalsByMember.set(goal.memberUserId, (activeGoalsByMember.get(goal.memberUserId) ?? 0) + 1);
  }
  const openManagerTasksByMember = new Map<string, number>();
  for (const task of tasks) {
    if (task.creatorId !== managerUserId) continue;
    for (const assignment of task.assignments) {
      if (!managedIds.has(assignment.userId)) continue;
      openManagerTasksByMember.set(
        assignment.userId,
        (openManagerTasksByMember.get(assignment.userId) ?? 0) + 1,
      );
    }
  }

  const members = managed.map((member) => {
    const latest = latestCheckInByMember.get(member.userId);
    const compliance = computeMemberStandardsCompliance(
      standards,
      latest ? calendarDaysBetween(latest, now, timeZone) : null,
      activeGoalsByMember.get(member.userId) ?? 0,
    );
    return {
      id: member.userId,
      name: member.user.name?.trim() || "Team member",
      checkInRisk:
        compliance.checkInStatus === "overdue" && !latest
          ? ("no_check_in_yet" as const)
          : compliance.checkInStatus,
      goalsStatus: compliance.goalsStatus,
      openManagerAssignedTasks: openManagerTasksByMember.get(member.userId) ?? 0,
    };
  });

  const taskFacts = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    priority: task.priority.toLowerCase(),
    dueDate: task.dueDate?.toISOString() ?? null,
    assigneeIds: task.assignments
      .map((assignment) => assignment.userId)
      .filter((id) => managedIds.has(id))
      .sort(),
    overdue: !!task.dueDate && task.dueDate < now,
    upcoming: !!task.dueDate && task.dueDate >= now && task.dueDate <= upcomingThrough,
    createdByManager: task.creatorId === managerUserId,
  }));
  const openTaskAssignments = taskFacts.reduce((sum, task) => sum + task.assigneeIds.length, 0);
  const overdueTaskAssignments = taskFacts
    .filter((task) => task.overdue)
    .reduce((sum, task) => sum + task.assigneeIds.length, 0);

  const recognized = new Set<string>();
  const recentlyCompleted = new Set<string>();
  for (const item of activities) {
    if (!item.metadata) continue;
    try {
      const metadata = JSON.parse(item.metadata) as Record<string, unknown>;
      if (item.type === "celebration") {
        const target = typeof metadata.targetUserId === "string" ? metadata.targetUserId : null;
        if (target && managedIds.has(target)) recognized.add(target);
      } else if (item.type === "task_completed") {
        const assignees = Array.isArray(metadata.assignees) ? metadata.assignees : [];
        for (const assignee of assignees) {
          if (!assignee || typeof assignee !== "object") continue;
          const id = (assignee as Record<string, unknown>).id;
          if (typeof id === "string" && managedIds.has(id)) recentlyCompleted.add(id);
        }
        if (item.userId && managedIds.has(item.userId)) recentlyCompleted.add(item.userId);
      }
    } catch {
      // Invalid activity metadata is ignored; it never becomes a generated fact.
    }
  }

  return {
    teamId,
    memberCount: managed.length,
    members,
    tasks: taskFacts,
    goals: goals
      .filter((goal) => managedIds.has(goal.memberUserId))
      .map((goal) => ({
        id: goal.id,
        memberId: goal.memberUserId,
        skill: goal.skill,
        stale:
          calendarDaysBetween(goal.lastActivityAt ?? goal.createdAt, now, timeZone) >= 21,
      })),
    recognizedMemberIdsLast14Days: [...recognized].sort(),
    recentlyCompletedMemberIds: [...recentlyCompleted].sort(),
    health: {
      currentPct: currentHealth?.teamHealthPct ?? null,
      checkInPct: currentHealth?.checkInPct ?? null,
      goalsPct: currentHealth?.goalsPct ?? null,
      tasksPct: currentHealth?.tasksPct ?? null,
      recentPcts: snapshots.map((snapshot) => snapshot.teamHealthPct),
      openTaskAssignments,
      overdueTaskAssignments,
    },
  };
}
