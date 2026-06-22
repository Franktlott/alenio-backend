/** Policy constants — keep in sync with backend/src/lib/development-goal-activity.ts */
export const DEVELOPMENT_GOAL_INACTIVITY_DAYS = 30;
export const DEVELOPMENT_GOAL_INACTIVITY_REMINDER_DAYS_BEFORE = 5;
export const DEVELOPMENT_GOAL_INACTIVITY_REMINDER_AFTER_DAYS =
  DEVELOPMENT_GOAL_INACTIVITY_DAYS - DEVELOPMENT_GOAL_INACTIVITY_REMINDER_DAYS_BEFORE;

export type DevelopmentGoalLifecycleStatus = "active" | "inactive" | "closed";

export const DEVELOPMENT_GOAL_ACTIVITY_KEY = {
  inactivityDays: DEVELOPMENT_GOAL_INACTIVITY_DAYS,
  reminderDaysBefore: DEVELOPMENT_GOAL_INACTIVITY_REMINDER_DAYS_BEFORE,
  title: "Development goal activity",
  summary: `Goals become inactive after ${DEVELOPMENT_GOAL_INACTIVITY_DAYS} days with no progress updates or changes.`,
  reminderSummary: `Seneca reminds you ${DEVELOPMENT_GOAL_INACTIVITY_REMINDER_DAYS_BEFORE} days before a goal goes inactive.`,
  activityCountsAs: [
    "Adding or editing progress notes",
    "Updating the skill or action steps",
    "Reopening an inactive goal",
  ],
} as const;

export type DevelopmentGoalActivityFields = {
  status?: DevelopmentGoalLifecycleStatus;
  lastActivityAt?: string | null;
  createdAt: string;
  notes?: Array<{ createdAt: string }>;
  daysSinceActivity?: number;
  daysUntilInactive?: number | null;
  nearingInactive?: boolean;
};

export function normalizeDevelopmentGoalStatus(
  raw: string | null | undefined,
): DevelopmentGoalLifecycleStatus {
  if (raw === "closed") return "closed";
  if (raw === "inactive") return "inactive";
  return "active";
}

function daysSinceCalendarDate(iso: string, now = new Date()): number {
  const then = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  return Math.max(
    0,
    Math.floor((startOfToday.getTime() - startOfThen.getTime()) / 86_400_000),
  );
}

export function resolveGoalLastActivityAt(goal: DevelopmentGoalActivityFields): string {
  if (goal.lastActivityAt) return goal.lastActivityAt;
  if (goal.notes && goal.notes.length > 0) {
    return goal.notes.reduce(
      (latest, note) => (new Date(note.createdAt) > new Date(latest) ? note.createdAt : latest),
      goal.notes[0]!.createdAt,
    );
  }
  return goal.createdAt;
}

export function goalDaysSinceActivity(goal: DevelopmentGoalActivityFields, now = new Date()): number {
  if (typeof goal.daysSinceActivity === "number") return goal.daysSinceActivity;
  return daysSinceCalendarDate(resolveGoalLastActivityAt(goal), now);
}

export function goalDaysUntilInactive(goal: DevelopmentGoalActivityFields, now = new Date()): number | null {
  if (goal.daysUntilInactive != null) return goal.daysUntilInactive;
  if (normalizeDevelopmentGoalStatus(goal.status) !== "active") return null;
  const daysSince = goalDaysSinceActivity(goal, now);
  return Math.max(0, DEVELOPMENT_GOAL_INACTIVITY_DAYS - daysSince);
}

export function isGoalNearingInactive(goal: DevelopmentGoalActivityFields, now = new Date()): boolean {
  if (goal.nearingInactive != null) return goal.nearingInactive;
  if (normalizeDevelopmentGoalStatus(goal.status) !== "active") return false;
  const daysSince = goalDaysSinceActivity(goal, now);
  return (
    daysSince >= DEVELOPMENT_GOAL_INACTIVITY_REMINDER_AFTER_DAYS &&
    daysSince < DEVELOPMENT_GOAL_INACTIVITY_DAYS
  );
}

export function goalStatusLabel(status: DevelopmentGoalLifecycleStatus | undefined): string {
  if (status === "closed") return "Closed";
  if (status === "inactive") return "Inactive";
  return "Active";
}

export type DevelopmentGoalActivityAlert = {
  goalId: string;
  memberUserId: string;
  memberName: string;
  skill: string;
  daysSinceActivity: number;
  daysUntilInactive: number | null;
};

export type DevelopmentGoalAlerts = {
  nearingInactive: DevelopmentGoalActivityAlert[];
  inactive: DevelopmentGoalActivityAlert[];
};

export const EMPTY_DEVELOPMENT_GOAL_ALERTS: DevelopmentGoalAlerts = {
  nearingInactive: [],
  inactive: [],
};
