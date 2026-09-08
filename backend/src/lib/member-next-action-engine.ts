import type { MemberNextAction, MemberNextActionId } from "../types";
import {
  addCalendarDaysInTimeZone,
  calendarDayFromInstant,
  resolveTimeZone,
} from "./timezone";

export const MEMBER_NEXT_ACTION_GOAL_REVIEW_DAYS = 21;
export const MEMBER_NEXT_ACTION_TASK_DUE_SOON_DAYS = 3;

export type MemberNextActionFacts = {
  teamId: string;
  memberUserId: string;
  timeZone?: string | null;
  checkInActionsAvailable: boolean;
  developmentGoalActionsAvailable: boolean;
  canScheduleCheckIn: boolean;
  completedCheckIns: Array<{ id: string; completedAt: Date }>;
  nextRequiredCheckInAt: Date | null;
  futureCheckInEventIds: string[];
  activeDevelopmentGoals: Array<{
    id: string;
    createdAt: Date;
    lastActivityAt: Date | null;
  }>;
  activeAssignedTasks: Array<{ id: string; dueAt: Date | null }>;
};

type ActionCopy = Pick<MemberNextAction, "priority" | "title" | "copy" | "ctaLabel">;

export const MEMBER_NEXT_ACTION_COPY: Readonly<Record<MemberNextActionId, ActionCopy>> = {
  first_check_in: {
    priority: 1,
    title: "Start first check-in",
    copy: "This member hasn't completed their first development check-in yet.",
    ctaLabel: "Start Check-In",
  },
  overdue_check_in: {
    priority: 2,
    title: "Complete overdue check-in",
    copy: "This member's scheduled check-in is overdue.",
    ctaLabel: "Start Check-In",
  },
  schedule_next_check_in: {
    priority: 3,
    title: "Schedule next check-in",
    copy: "Keep development on track by scheduling the next conversation.",
    ctaLabel: "Schedule Check-In",
  },
  no_active_development_goals: {
    priority: 4,
    title: "Create a development goal",
    copy: "Set a clear area of focus to support this member's growth.",
    ctaLabel: "Create Goal",
  },
  development_goal_review_due: {
    priority: 5,
    title: "Review development goals",
    copy: "One or more development goals are ready for a progress review.",
    ctaLabel: "Review Goals",
  },
  overdue_tasks: {
    priority: 6,
    title: "Review overdue tasks",
    copy: "This member has overdue work that needs attention.",
    ctaLabel: "View Tasks",
  },
  tasks_due_soon: {
    priority: 7,
    title: "Review upcoming tasks",
    copy: "This member has work due soon.",
    ctaLabel: "View Tasks",
  },
  everything_up_to_date: {
    priority: 8,
    title: "Everything is on track",
    copy: "No immediate actions are needed for this team member.",
    ctaLabel: "View Activity",
  },
};

function calendarDaysBetween(then: Date, now: Date, timeZone: string): number {
  const thenDay = calendarDayFromInstant(then, timeZone);
  const nowDay = calendarDayFromInstant(now, timeZone);
  if (!thenDay || !nowDay) return 0;
  const [thenYear, thenMonth, thenDate] = thenDay.split("-").map(Number);
  const [nowYear, nowMonth, nowDate] = nowDay.split("-").map(Number);
  return Math.max(
    0,
    Math.floor(
      (Date.UTC(nowYear!, nowMonth! - 1, nowDate!) -
        Date.UTC(thenYear!, thenMonth! - 1, thenDate!)) /
        86_400_000,
    ),
  );
}

function routeFor(
  id: MemberNextActionId,
  facts: MemberNextActionFacts,
): MemberNextAction["cta"] {
  const memberParams = { teamId: facts.teamId, memberUserId: facts.memberUserId };
  if (id === "first_check_in" || id === "overdue_check_in") {
    return { route: "/(app)/execute", params: { ...memberParams, mode: "check-in" } };
  }
  if (id === "schedule_next_check_in") {
    if (!facts.canScheduleCheckIn) return null;
    return { route: "/plan-one-on-one", params: memberParams };
  }
  if (id === "no_active_development_goals") {
    return {
      route: "/(app)/execute",
      params: {
        teamId: facts.teamId,
        memberUserId: facts.memberUserId,
        mode: "goals",
        developmentSection: "goals",
        createGoal: "true",
      },
    };
  }
  if (id === "development_goal_review_due") {
    return {
      route: "/(app)/execute",
      params: {
        teamId: facts.teamId,
        memberUserId: facts.memberUserId,
        mode: "goals",
        developmentSection: "goals",
      },
    };
  }
  if (id === "overdue_tasks" || id === "tasks_due_soon") {
    return {
      route: "/team-priority",
      params: {
        ...memberParams,
        filter: id === "overdue_tasks" ? "overdue" : "due-soon",
      },
    };
  }
  return { route: "/(app)/chat", params: memberParams };
}

function buildAction(
  id: MemberNextActionId,
  facts: MemberNextActionFacts,
  affectedEntityIds: string[],
  now: Date,
): MemberNextAction {
  return {
    id,
    ...MEMBER_NEXT_ACTION_COPY[id],
    affectedEntityIds,
    generatedAt: now.toISOString(),
    cta: routeFor(id, facts),
  };
}

/** Deterministic, ordered first-match evaluator. Recognition is intentionally absent. */
export function evaluateMemberNextAction(
  facts: MemberNextActionFacts,
  now = new Date(),
): MemberNextAction {
  const timeZone = resolveTimeZone(facts.timeZone);
  const completed = [...facts.completedCheckIns].sort(
    (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
  );

  if (
    facts.checkInActionsAvailable &&
    completed.length === 0 &&
    facts.futureCheckInEventIds.length === 0
  ) {
    return buildAction("first_check_in", facts, [], now);
  }

  if (
    facts.checkInActionsAvailable &&
    completed.length > 0 &&
    facts.nextRequiredCheckInAt &&
    facts.nextRequiredCheckInAt.getTime() < now.getTime() &&
    facts.futureCheckInEventIds.length === 0
  ) {
    return buildAction("overdue_check_in", facts, [completed[0]!.id], now);
  }

  if (
    facts.checkInActionsAvailable &&
    completed.length > 0 &&
    facts.futureCheckInEventIds.length === 0
  ) {
    return buildAction("schedule_next_check_in", facts, [completed[0]!.id], now);
  }

  if (
    facts.developmentGoalActionsAvailable &&
    facts.activeDevelopmentGoals.length === 0
  ) {
    return buildAction("no_active_development_goals", facts, [], now);
  }

  const reviewDueGoalIds = facts.developmentGoalActionsAvailable
    ? facts.activeDevelopmentGoals
        .filter(
          (goal) =>
            calendarDaysBetween(
              goal.lastActivityAt ?? goal.createdAt,
              now,
              timeZone,
            ) >= MEMBER_NEXT_ACTION_GOAL_REVIEW_DAYS,
        )
        .map((goal) => goal.id)
    : [];
  if (reviewDueGoalIds.length > 0) {
    return buildAction("development_goal_review_due", facts, reviewDueGoalIds, now);
  }

  const overdueTaskIds = facts.activeAssignedTasks
    .filter((task) => task.dueAt && task.dueAt.getTime() < now.getTime())
    .map((task) => task.id);
  if (overdueTaskIds.length > 0) {
    return buildAction("overdue_tasks", facts, overdueTaskIds, now);
  }

  const dueSoonEnd = addCalendarDaysInTimeZone(
    now,
    MEMBER_NEXT_ACTION_TASK_DUE_SOON_DAYS,
    timeZone,
  );
  const dueSoonTaskIds = facts.activeAssignedTasks
    .filter(
      (task) =>
        task.dueAt &&
        task.dueAt.getTime() >= now.getTime() &&
        task.dueAt.getTime() <= dueSoonEnd.getTime(),
    )
    .map((task) => task.id);
  if (dueSoonTaskIds.length > 0) {
    return buildAction("tasks_due_soon", facts, dueSoonTaskIds, now);
  }

  return buildAction("everything_up_to_date", facts, [], now);
}
