import type { Task, TeamMember } from "@/lib/types";
import type {
  MemberStandardsCompliance,
  MemberStatsPayload,
  WorkplaceStandards,
} from "@/lib/workplace-standards";

function localDayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isDone(task: Task): boolean {
  return task.status === "done";
}

export function countCompletedToday(tasks: Task[], now = new Date()): number {
  const today = localDayKey(now);
  return tasks.reduce((count, task) => {
    const completedAt = validDate(task.completedAt);
    return count + (isDone(task) && completedAt && localDayKey(completedAt) === today ? 1 : 0);
  }, 0);
}

export function countDueToday(tasks: Task[], now = new Date()): number {
  const today = localDayKey(now);
  return tasks.reduce((count, task) => {
    const dueDate = validDate(task.dueDate);
    return count + (!isDone(task) && dueDate && localDayKey(dueDate) === today ? 1 : 0);
  }, 0);
}

export function countOverdue(tasks: Task[], now = new Date()): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return tasks.reduce((count, task) => {
    const dueDate = validDate(task.dueDate);
    return count + (!isDone(task) && dueDate && dueDate.getTime() < startOfToday ? 1 : 0);
  }, 0);
}

function average(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => typeof value === "number");
  if (available.length === 0) return null;
  return Math.round(available.reduce((sum, value) => sum + value, 0) / available.length);
}

function taskHealthPercent(activeTasks: number, overdueTasks: number): number {
  if (activeTasks <= 0) return 100;
  const safeOverdue = Math.min(activeTasks, Math.max(0, overdueTasks));
  return Math.round(((activeTasks - safeOverdue) / activeTasks) * 100);
}

function personalCheckInPercent(
  compliance: MemberStandardsCompliance | undefined,
  required: boolean,
): number | null {
  if (!required) return null;
  if (!compliance) return null;
  if (compliance.checkInStatus === "on_track" || compliance.checkInStatus === "due_soon") {
    return 100;
  }
  if (compliance.checkInStatus === "overdue") return 0;
  return null;
}

function personalGoalsPercent(
  compliance: MemberStandardsCompliance | undefined,
  required: boolean,
): number | null {
  if (!required) return null;
  if (!compliance) return null;
  if (compliance.goalsStatus === "on_track") return 100;
  if (compliance.goalsStatus === "missing_goals") return 0;
  return null;
}

export function personalHealthPercent(input: {
  stats: MemberStatsPayload["stats"][string] | undefined;
  standards: Pick<WorkplaceStandards, "checkInRequired" | "goalsRequired">;
}): number | null {
  const { stats, standards } = input;
  if (!stats) return null;
  return average([
    taskHealthPercent(stats.activeTasks, stats.overdueTasks),
    personalCheckInPercent(stats.standardsCompliance, standards.checkInRequired),
    personalGoalsPercent(stats.standardsCompliance, standards.goalsRequired),
  ]);
}

export function workspaceHealthPercent(input: {
  members: TeamMember[];
  memberStats: MemberStatsPayload["stats"] | undefined;
  standards: Pick<WorkplaceStandards, "checkInRequired" | "goalsRequired">;
}): number | null {
  const { members, memberStats, standards } = input;
  if (!memberStats) return null;

  const seen = new Set<string>();
  const eligibleMembers = members.filter((member) => {
    if (member.role === "owner" || seen.has(member.userId)) return false;
    seen.add(member.userId);
    return true;
  });
  if (eligibleMembers.length === 0) return null;

  let activeTasks = 0;
  let overdueTasks = 0;
  let checkInCompliant = 0;
  let checkInTotal = 0;
  let goalsCompliant = 0;
  let goalsTotal = 0;

  for (const member of eligibleMembers) {
    const stats = memberStats[member.userId];
    activeTasks += stats?.activeTasks ?? 0;
    overdueTasks += stats?.overdueTasks ?? 0;

    if (standards.checkInRequired && stats?.standardsCompliance) {
      checkInTotal += 1;
      if (
        stats.standardsCompliance.checkInStatus === "on_track" ||
        stats.standardsCompliance.checkInStatus === "due_soon"
      ) {
        checkInCompliant += 1;
      }
    }
    if (standards.goalsRequired && stats?.standardsCompliance) {
      goalsTotal += 1;
      if (stats.standardsCompliance.goalsStatus === "on_track") goalsCompliant += 1;
    }
  }

  return average([
    taskHealthPercent(activeTasks, overdueTasks),
    standards.checkInRequired && checkInTotal > 0
      ? Math.round((checkInCompliant / checkInTotal) * 100)
      : null,
    standards.goalsRequired && goalsTotal > 0
      ? Math.round((goalsCompliant / goalsTotal) * 100)
      : null,
  ]);
}
