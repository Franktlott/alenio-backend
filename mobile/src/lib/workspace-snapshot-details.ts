import type { CalendarEvent, Task, TeamMember } from "@/lib/types";
import type { MemberStatsRow, WorkplaceStandards } from "@/lib/workplace-standards";

export type SnapshotDetail =
  | "open"
  /** Overdue and due today together: everything needing action right now. */
  | "actionTasks"
  | "dueToday"
  | "overdue"
  | "completedToday"
  | "attention"
  | "development"
  | "scheduled"
  | "goals"
  | "health";

export type SnapshotTaskDetail = Extract<
  SnapshotDetail,
  "open" | "actionTasks" | "dueToday" | "overdue" | "completedToday"
>;

export type GoalCoverageItem = {
  member: TeamMember;
  activeGoals: number;
  requiredGoals: number;
  missingGoals: number;
  percentage: number;
  requirementMet: boolean;
};

export function buildGoalCoverageItems(input: {
  members: TeamMember[];
  memberStats?: Record<string, MemberStatsRow>;
  minimumActiveGoals: number;
}): GoalCoverageItem[] {
  const requiredGoals = Math.max(1, Math.floor(input.minimumActiveGoals));
  return input.members
    .filter((member) => member.role !== "owner")
    .map((member) => {
      const stats = input.memberStats?.[member.userId];
      const compliance = stats?.standardsCompliance;
      const activeGoals = Math.max(
        0,
        Math.floor(
          stats?.activeDevGoals ??
            Math.max(0, requiredGoals - (compliance?.missingGoals ?? requiredGoals)),
        ),
      );
      const missingGoals = Math.max(0, requiredGoals - activeGoals);
      return {
        member,
        activeGoals,
        requiredGoals,
        missingGoals,
        percentage: Math.min(100, Math.round((activeGoals / requiredGoals) * 100)),
        requirementMet: missingGoals === 0,
      };
    })
    .sort(
      (a, b) =>
        Number(a.requirementMet) - Number(b.requirementMet) ||
        a.percentage - b.percentage ||
        (a.member.user.name?.trim() || a.member.user.email).localeCompare(
          b.member.user.name?.trim() || b.member.user.email,
        ),
    );
}

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

export function selectSnapshotTasks(
  tasks: Task[],
  detail: SnapshotTaskDetail,
  now = new Date(),
): Task[] {
  const today = localDayKey(now);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return tasks
    .filter((task) => {
      if (detail === "open") return task.status !== "done";
      if (detail === "completedToday") {
        const completedAt = validDate(task.completedAt);
        return task.status === "done" && completedAt != null && localDayKey(completedAt) === today;
      }

      const dueDate = validDate(task.dueDate);
      if (task.status === "done" || !dueDate) return false;
      if (detail === "dueToday") return localDayKey(dueDate) === today;
      if (detail === "actionTasks") {
        return localDayKey(dueDate) === today || dueDate.getTime() < startOfToday;
      }
      return dueDate.getTime() < startOfToday;
    })
    .sort((a, b) => {
      const aDate = validDate(detail === "completedToday" ? a.completedAt : a.dueDate)?.getTime() ?? 0;
      const bDate = validDate(detail === "completedToday" ? b.completedAt : b.dueDate)?.getTime() ?? 0;
      return detail === "completedToday"
        ? bDate - aDate || a.title.localeCompare(b.title)
        : aDate - bDate || a.title.localeCompare(b.title);
    });
}

export function selectTodaysOneOnOnes(
  events: CalendarEvent[],
  now = new Date(),
): CalendarEvent[] {
  const today = localDayKey(now);
  return events
    .filter((event) => {
      if (!event.isOneOnOne) return false;
      const start = validDate(event.startDate);
      const end = validDate(event.endDate) ?? start;
      if (!start || !end) return false;
      return localDayKey(start) <= today && localDayKey(end) >= today;
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

export function oneOnOneMember(
  event: CalendarEvent,
  members: TeamMember[],
): TeamMember | undefined {
  if (event.oneOnOneMemberUserId) {
    return members.find((member) => member.userId === event.oneOnOneMemberUserId);
  }
  const assigneeIds = event.assigneeIds ?? [];
  return members.find((member) => assigneeIds.includes(member.userId));
}

export function oneOnOneStatus(
  event: CalendarEvent,
  now = new Date(),
): "Upcoming" | "In progress" | "Completed" {
  const start = validDate(event.startDate);
  const end = validDate(event.endDate) ?? start;
  if (!start || !end) return "Upcoming";
  if (now.getTime() < start.getTime()) return "Upcoming";
  if (now.getTime() <= end.getTime()) return "In progress";
  return "Completed";
}

export function snapshotAttentionReason(
  stats: MemberStatsRow | undefined,
  standards: Pick<WorkplaceStandards, "checkInRequired" | "goalsRequired">,
): string {
  const reasons: string[] = [];
  const overdueTasks = stats?.overdueTasks ?? 0;
  if (overdueTasks > 0) {
    reasons.push(`${overdueTasks} ${overdueTasks === 1 ? "task" : "tasks"} overdue`);
  }

  const compliance = stats?.standardsCompliance;
  if (standards.checkInRequired && compliance?.checkInStatus === "overdue") {
    reasons.push(stats?.daysSinceLastOneOnOne == null ? "No check-in yet" : "Check-in overdue");
  } else if (standards.checkInRequired && compliance?.checkInStatus === "due_soon") {
    reasons.push("Check-in due soon");
  }

  if (standards.goalsRequired && compliance?.goalsStatus === "missing_goals") {
    const missing = compliance.missingGoals;
    reasons.push(missing > 0 ? `${missing} ${missing === 1 ? "goal" : "goals"} missing` : "Goals missing");
  }
  return reasons.join(" · ");
}
