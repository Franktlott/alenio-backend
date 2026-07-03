import { prisma } from "../prisma";
import { parseLeaderPrep } from "./leader-prep";
import {
  buildRuleBasedLastCheckInInsights,
  extractLastCheckInSource,
  type LastCheckInInsightSource,
} from "./seneca-last-check-in-insights";
import { oneOnOnePublishedAt } from "./one-on-one-meeting-dates";

function parseJsonRecord(raw: string): Record<string, string | number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string | number>;
  } catch {
    return {};
  }
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function formatMeetingResponses(
  fields: Array<{ id: string; label: string; type: string }>,
  responses: Record<string, string | number>,
): string {
  const lines: string[] = [];
  for (const field of fields) {
    if (field.type === "section" || field.type === "associate_notes") continue;
    const val = responses[field.id];
    if (val === undefined || val === "") continue;
    lines.push(`${field.label}: ${String(val)}`);
  }
  return lines.join("\n");
}

export type SenecaLastCheckInContext = LastCheckInInsightSource & {
  openFollowUps: Array<{ title: string; status: string; dueDate: string | null }>;
  /** @deprecated Raw dump for AI debugging only — use lastCheckInInsights in prep UI */
  notesSummary: string;
};

export type SenecaRawContext = {
  memberName: string;
  managerName: string | null;
  memberStats: {
    activeTasks: number;
    overdueTasks: number;
    completedTasks: number;
    streak: number;
    activeDevGoals: number;
    daysSinceLastOneOnOne: number | null;
  } | null;
  lastCheckIn: SenecaLastCheckInContext | null;
  lastCheckInInsights: string[];
  activeDevelopmentGoals: Array<{ skill: string; steps: string[]; recentNote: string | null }>;
  openTasks: Array<{ title: string; status: string; dueDate: string | null }>;
  /** Titles of open Alenio tasks past due — authoritative current overdue state */
  alenioOverdueTasks: string[];
  recentWins: string[];
  completionPatterns: string | null;
  templateTitle: string | null;
  templateFields: Array<{ label: string; type: string }>;
  templateLeaderPrep: string[];
};

export async function buildSenecaRawContext(
  teamId: string,
  memberUserId: string,
  options?: { templateId?: string; memberName?: string; managerName?: string | null },
): Promise<SenecaRawContext> {
  const member = await prisma.user.findUnique({
    where: { id: memberUserId },
    select: { name: true, email: true },
  });
  const memberName = options?.memberName ?? member?.name ?? member?.email ?? "Team member";

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [assignments, devGoals, meetings, activities, template] = await Promise.all([
    prisma.taskAssignment.findMany({
      where: { userId: memberUserId, task: { teamId, status: { not: "done" } } },
      include: { task: { select: { title: true, status: true, dueDate: true } } },
      take: 20,
    }),
    prisma.developmentGoal.findMany({
      where: { teamId, memberUserId, status: "active" },
      include: {
        notes: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.oneOnOneMeeting.findMany({
      where: { teamId, memberUserId, status: "published" },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 3,
    }),
    prisma.teamActivity.findMany({
      where: {
        teamId,
        createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        userId: memberUserId,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    options?.templateId
      ? prisma.oneOnOneTemplate.findFirst({
          where: { id: options.templateId, teamId },
          select: { title: true, fields: true, leaderPrep: true },
        })
      : Promise.resolve(null),
  ]);

  const memberTasks = assignments.map((a) => a.task);
  const alenioOverdueTasks = memberTasks
    .filter((t) => t.dueDate && t.dueDate < now)
    .map((t) => t.title);
  let activeTasks = 0;
  let overdueTasks = 0;
  let completedThisMonth = 0;

  const allAssignments = await prisma.taskAssignment.findMany({
    where: { userId: memberUserId, task: { teamId } },
    include: { task: { select: { status: true, dueDate: true, completedAt: true } } },
  });
  for (const a of allAssignments) {
    const t = a.task;
    if (t.status !== "done") {
      activeTasks++;
      if (t.dueDate && t.dueDate < now) overdueTasks++;
    } else if (t.completedAt && t.completedAt >= monthStart && t.completedAt <= monthEnd) {
      completedThisMonth++;
    }
  }

  const streakRow = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: memberUserId, teamId } },
    select: { currentStreak: true },
  });

  const lastMeeting = meetings[0] ?? null;
  let lastCheckIn: SenecaLastCheckInContext | null = null;
  let lastCheckInInsights: string[] = [];

  if (lastMeeting) {
    const fields = parseJsonArray<{ id: string; label: string; type: string }>(lastMeeting.templateFields);
    const responses = parseJsonRecord(lastMeeting.responses);

    const followUpTasks = await prisma.task.findMany({
      where: {
        teamId,
        oneOnOneMeetingId: lastMeeting.id,
        status: { not: "done" },
      },
      select: { title: true, status: true, dueDate: true },
      take: 10,
    });

    const source = extractLastCheckInSource(
      lastMeeting,
      fields,
      responses,
      followUpTasks.map((task) => ({ title: task.title })),
      now,
    );

    lastCheckInInsights = buildRuleBasedLastCheckInInsights(source);
    lastCheckIn = {
      ...source,
      notesSummary: formatMeetingResponses(fields, responses) || "No discussion captured.",
      openFollowUps: followUpTasks.map((t) => ({
        title: t.title,
        status: t.status,
        dueDate: t.dueDate?.toISOString() ?? null,
      })),
    };
  }

  const daysSinceLastOneOnOne = lastMeeting
    ? Math.floor(
        (now.getTime() - (oneOnOnePublishedAt(lastMeeting)?.getTime() ?? lastMeeting.createdAt.getTime())) /
          (24 * 60 * 60 * 1000),
      )
    : null;

  const recentWins: string[] = [];
  for (const act of activities) {
    let meta: Record<string, unknown> | null = null;
    if (act.metadata) {
      try {
        meta = JSON.parse(act.metadata) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }
    if (act.type === "celebration") {
      const message = typeof meta?.message === "string" ? meta.message : null;
      if (message) recentWins.push(message);
      else recentWins.push("Team recognition received");
    } else if (act.type === "task_completed") {
      const taskTitle = typeof meta?.taskTitle === "string" ? meta.taskTitle : null;
      if (taskTitle) {
        recentWins.push(
          `Completed task: ${taskTitle}${meta?.completedOnTime === false ? " (late)" : ""}`,
        );
      }
    }
    if (recentWins.length >= 5) break;
  }

  const completionPatterns =
    completedThisMonth > 0 || streakRow?.currentStreak
      ? `${completedThisMonth} task${completedThisMonth !== 1 ? "s" : ""} completed this month. Current streak: ${streakRow?.currentStreak ?? 0} day${(streakRow?.currentStreak ?? 0) !== 1 ? "s" : ""}.`
      : null;

  const templateFields = template
    ? parseJsonArray<{ label: string; type: string }>(template.fields)
    : [];

  return {
    memberName,
    managerName: options?.managerName ?? null,
    memberStats: {
      activeTasks,
      overdueTasks,
      completedTasks: completedThisMonth,
      streak: streakRow?.currentStreak ?? 0,
      activeDevGoals: devGoals.length,
      daysSinceLastOneOnOne,
    },
    lastCheckIn,
    lastCheckInInsights,
    activeDevelopmentGoals: devGoals.map((g) => ({
      skill: g.skill,
      steps: parseJsonArray<string>(g.steps),
      recentNote: g.notes[0]?.body ?? null,
    })),
    openTasks: memberTasks.map((t) => ({
      title: t.title,
      status: t.status,
      dueDate: t.dueDate?.toISOString() ?? null,
    })),
    alenioOverdueTasks,
    recentWins,
    completionPatterns,
    templateTitle: template?.title ?? null,
    templateFields: templateFields.filter((f) => f.type !== "section"),
    templateLeaderPrep: parseLeaderPrep(template?.leaderPrep),
  };
}

export function senecaContextToPrompt(ctx: SenecaRawContext): string {
  return JSON.stringify(ctx, null, 2);
}
