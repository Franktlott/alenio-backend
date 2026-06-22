/** Policy constants — keep in sync with web/mobile development-goal-activity.ts */
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

const MS_PER_DAY = 86_400_000;

export function normalizeDevelopmentGoalStatus(
  raw: string | null | undefined,
): DevelopmentGoalLifecycleStatus {
  if (raw === "closed") return "closed";
  if (raw === "inactive") return "inactive";
  return "active";
}

export function daysSinceCalendarDate(then: Date, now = new Date()): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  return Math.max(0, Math.floor((startOfToday.getTime() - startOfThen.getTime()) / MS_PER_DAY));
}

export function resolveLastActivityAt(goal: {
  lastActivityAt?: Date | null;
  createdAt: Date;
  notes?: Array<{ createdAt: Date }>;
}): Date {
  if (goal.lastActivityAt) return goal.lastActivityAt;
  if (goal.notes && goal.notes.length > 0) {
    return goal.notes.reduce(
      (latest, note) => (note.createdAt > latest ? note.createdAt : latest),
      goal.notes[0]!.createdAt,
    );
  }
  return goal.createdAt;
}

export function daysSinceGoalActivity(
  goal: {
    lastActivityAt?: Date | null;
    createdAt: Date;
    notes?: Array<{ createdAt: Date }>;
  },
  now = new Date(),
): number {
  return daysSinceCalendarDate(resolveLastActivityAt(goal), now);
}

export function daysUntilGoalInactive(
  goal: {
    status?: string | null;
    lastActivityAt?: Date | null;
    createdAt: Date;
    notes?: Array<{ createdAt: Date }>;
  },
  now = new Date(),
): number | null {
  if (normalizeDevelopmentGoalStatus(goal.status) !== "active") return null;
  const daysSince = daysSinceGoalActivity(goal, now);
  return Math.max(0, DEVELOPMENT_GOAL_INACTIVITY_DAYS - daysSince);
}

export function isDevelopmentGoalNearingInactive(
  goal: {
    status?: string | null;
    lastActivityAt?: Date | null;
    createdAt: Date;
    notes?: Array<{ createdAt: Date }>;
  },
  now = new Date(),
): boolean {
  if (normalizeDevelopmentGoalStatus(goal.status) !== "active") return false;
  const daysSince = daysSinceGoalActivity(goal, now);
  return (
    daysSince >= DEVELOPMENT_GOAL_INACTIVITY_REMINDER_AFTER_DAYS &&
    daysSince < DEVELOPMENT_GOAL_INACTIVITY_DAYS
  );
}

export function shouldMarkDevelopmentGoalInactive(
  goal: {
    status?: string | null;
    lastActivityAt?: Date | null;
    createdAt: Date;
    notes?: Array<{ createdAt: Date }>;
  },
  now = new Date(),
): boolean {
  if (normalizeDevelopmentGoalStatus(goal.status) !== "active") return false;
  return daysSinceGoalActivity(goal, now) >= DEVELOPMENT_GOAL_INACTIVITY_DAYS;
}

export type DevelopmentGoalActivityAlert = {
  goalId: string;
  memberUserId: string;
  skill: string;
  daysSinceActivity: number;
  daysUntilInactive: number | null;
};

export function buildDevelopmentGoalActivityAlerts<
  T extends {
    id: string;
    memberUserId: string;
    skill: string;
    status?: string | null;
    lastActivityAt?: Date | null;
    createdAt: Date;
    notes?: Array<{ createdAt: Date }>;
  },
>(goals: T[], now = new Date()): {
  nearingInactive: DevelopmentGoalActivityAlert[];
  inactive: DevelopmentGoalActivityAlert[];
} {
  const nearingInactive: DevelopmentGoalActivityAlert[] = [];
  const inactive: DevelopmentGoalActivityAlert[] = [];

  for (const goal of goals) {
    const status = normalizeDevelopmentGoalStatus(goal.status);
    const daysSinceActivity = daysSinceGoalActivity(goal, now);

    if (status === "inactive") {
      inactive.push({
        goalId: goal.id,
        memberUserId: goal.memberUserId,
        skill: goal.skill,
        daysSinceActivity,
        daysUntilInactive: null,
      });
      continue;
    }

    if (status !== "active") continue;

    if (isDevelopmentGoalNearingInactive(goal, now)) {
      nearingInactive.push({
        goalId: goal.id,
        memberUserId: goal.memberUserId,
        skill: goal.skill,
        daysSinceActivity,
        daysUntilInactive: daysUntilGoalInactive(goal, now),
      });
    }
  }

  nearingInactive.sort((a, b) => (b.daysSinceActivity ?? 0) - (a.daysSinceActivity ?? 0));
  inactive.sort((a, b) => (b.daysSinceActivity ?? 0) - (a.daysSinceActivity ?? 0));

  return { nearingInactive, inactive };
}

export async function reconcileInactiveDevelopmentGoals<
  T extends {
    id: string;
    status?: string | null;
    lastActivityAt?: Date | null;
    createdAt: Date;
    notes?: Array<{ createdAt: Date }>;
  },
>(
  goals: T[],
  updateMany: (ids: string[]) => Promise<void>,
  now = new Date(),
): Promise<Set<string>> {
  const toInactive = goals.filter((g) => shouldMarkDevelopmentGoalInactive(g, now)).map((g) => g.id);
  if (toInactive.length === 0) return new Set();
  await updateMany(toInactive);
  return new Set(toInactive);
}
