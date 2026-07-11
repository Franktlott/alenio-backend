import type { PrismaClient } from "@prisma/client";

export type AdminUsageMetricKey =
  | "users"
  | "workspaces"
  | "checkIns"
  | "messages"
  | "tasks";

export type AdminUsageWeekPoint = {
  /** ISO date for Monday of the week (UTC) */
  weekStart: string;
  /** Short label, e.g. "Mar 3" */
  label: string;
  users: number;
  workspaces: number;
  checkIns: number;
  messages: number;
  tasks: number;
};

export type AdminWeeklyUsage = {
  weeks: AdminUsageWeekPoint[];
  metrics: { key: AdminUsageMetricKey; label: string }[];
};

const METRICS: { key: AdminUsageMetricKey; label: string }[] = [
  { key: "users", label: "New users" },
  { key: "workspaces", label: "New workspaces" },
  { key: "checkIns", label: "Check-ins" },
  { key: "messages", label: "Messages" },
  { key: "tasks", label: "Tasks created" },
];

/** Monday 00:00 UTC for the week containing `date`. */
export function startOfIsoWeekUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function weekLabel(weekStart: Date): string {
  return weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function emptyPoint(weekStart: Date): AdminUsageWeekPoint {
  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    label: weekLabel(weekStart),
    users: 0,
    workspaces: 0,
    checkIns: 0,
    messages: 0,
    tasks: 0,
  };
}

type WeekCountRow = { week: Date; count: number | bigint };

async function mapWeekCounts(rows: WeekCountRow[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const week = startOfIsoWeekUtc(new Date(row.week));
    const key = week.toISOString().slice(0, 10);
    map.set(key, Number(row.count));
  }
  return map;
}

/**
 * Last `weekCount` ISO weeks (Mon–Sun), oldest → newest, for platform usage charts.
 */
export async function getAdminWeeklyUsage(
  prisma: PrismaClient,
  weekCount = 8,
): Promise<AdminWeeklyUsage> {
  const thisWeek = startOfIsoWeekUtc(new Date());
  const weeks: AdminUsageWeekPoint[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const start = new Date(thisWeek);
    start.setUTCDate(start.getUTCDate() - i * 7);
    weeks.push(emptyPoint(start));
  }
  const rangeStart = new Date(weeks[0]!.weekStart + "T00:00:00.000Z");

  const [userRows, teamRows, checkInRows, messageRows, taskRows] = await Promise.all([
    prisma.$queryRaw<WeekCountRow[]>`
      SELECT date_trunc('week', "createdAt")::date AS week, COUNT(*)::int AS count
      FROM "User"
      WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<WeekCountRow[]>`
      SELECT date_trunc('week', "createdAt")::date AS week, COUNT(*)::int AS count
      FROM "Team"
      WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<WeekCountRow[]>`
      SELECT date_trunc('week', "createdAt")::date AS week, COUNT(*)::int AS count
      FROM "OneOnOneMeeting"
      WHERE status = 'published' AND "createdAt" >= ${rangeStart}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<WeekCountRow[]>`
      SELECT date_trunc('week', "createdAt")::date AS week, COUNT(*)::int AS count
      FROM "Message"
      WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<WeekCountRow[]>`
      SELECT date_trunc('week', "createdAt")::date AS week, COUNT(*)::int AS count
      FROM "Task"
      WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const [users, workspaces, checkIns, messages, tasks] = await Promise.all([
    mapWeekCounts(userRows),
    mapWeekCounts(teamRows),
    mapWeekCounts(checkInRows),
    mapWeekCounts(messageRows),
    mapWeekCounts(taskRows),
  ]);

  for (const point of weeks) {
    point.users = users.get(point.weekStart) ?? 0;
    point.workspaces = workspaces.get(point.weekStart) ?? 0;
    point.checkIns = checkIns.get(point.weekStart) ?? 0;
    point.messages = messages.get(point.weekStart) ?? 0;
    point.tasks = tasks.get(point.weekStart) ?? 0;
  }

  return { weeks, metrics: METRICS };
}
