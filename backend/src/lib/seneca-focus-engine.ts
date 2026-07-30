import { createHash } from "node:crypto";
import type {
  SenecaFocusActionId,
  SenecaFocusCategory,
  SenecaFocusImpact,
  SenecaFocusSourceMetrics,
} from "../types";

export type FocusMemberFact = {
  id: string;
  name: string;
  checkInRisk: "no_check_in_yet" | "overdue" | "due_soon" | "on_track" | "not_required";
  goalsStatus: "on_track" | "missing_goals" | "not_required";
  openManagerAssignedTasks: number;
};

export type FocusTaskFact = {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  assigneeIds: string[];
  overdue: boolean;
  upcoming: boolean;
  createdByManager: boolean;
};

export type FocusGoalFact = {
  id: string;
  memberId: string;
  skill: string;
  stale: boolean;
};

export type SenecaFocusFacts = {
  teamId: string;
  memberCount: number;
  members: FocusMemberFact[];
  tasks: FocusTaskFact[];
  goals: FocusGoalFact[];
  recognizedMemberIdsLast14Days: string[];
  recentlyCompletedMemberIds: string[];
  health: {
    currentPct: number | null;
    checkInPct: number | null;
    goalsPct: number | null;
    tasksPct: number | null;
    recentPcts: number[];
    openTaskAssignments: number;
    overdueTaskAssignments: number;
  };
};

export type FocusScoreParts = {
  urgency: number;
  impact: number;
  affected: number;
  ease: number;
  unlock: number;
  supportedPattern: number;
};

export type SenecaFocusCandidate = {
  id: string;
  category: SenecaFocusCategory;
  impact: SenecaFocusImpact;
  title: string;
  reason: string;
  affectedMemberIds: string[];
  affectedEntityIds: string[];
  estimatedMinutes: number;
  action: SenecaFocusActionId;
  measurable: boolean;
  scoreParts: FocusScoreParts;
  score: number;
  confidence: number;
  projectedHealthPct: number | null;
};

const WEIGHTS: Record<keyof FocusScoreParts, number> = {
  urgency: 35,
  impact: 30,
  affected: 15,
  ease: 10,
  unlock: 5,
  supportedPattern: 5,
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function canAccessSenecaFocus(role: string | null | undefined): boolean {
  return role === "owner" || role === "team_leader" || role === "admin";
}

export function isFocusRefreshCoolingDown(
  refreshAvailableAt: Date | null | undefined,
  now: Date,
): boolean {
  return !!refreshAvailableAt && refreshAvailableAt > now;
}

export function scoreFocusCandidate(parts: FocusScoreParts): number {
  return Number(
    (
      Object.entries(WEIGHTS).reduce(
        (sum, [key, weight]) => sum + clamp(parts[key as keyof FocusScoreParts]) * weight,
        0,
      ) / 100
    ).toFixed(2),
  );
}

function healthProjection(
  facts: SenecaFocusFacts,
  category: SenecaFocusCategory,
  resolvedCount: number,
): number | null {
  const components = [facts.health.checkInPct, facts.health.goalsPct, facts.health.tasksPct];
  if (components.every((value) => value === null)) return null;
  const next = [...components];
  const checkInPct = next[0];
  const goalsPct = next[1];
  if (category === "check_ins" && checkInPct != null && facts.memberCount > 0) {
    next[0] = clamp(checkInPct + (resolvedCount / facts.memberCount) * 100);
  } else if (category === "goals" && goalsPct != null && facts.memberCount > 0) {
    next[1] = clamp(goalsPct + (resolvedCount / facts.memberCount) * 100);
  } else if (
    category === "tasks" &&
    next[2] !== null &&
    facts.health.openTaskAssignments > 0
  ) {
    const remainingOverdue = Math.max(0, facts.health.overdueTaskAssignments - resolvedCount);
    next[2] = clamp(
      ((facts.health.openTaskAssignments - remainingOverdue) /
        facts.health.openTaskAssignments) *
        100,
    );
  } else {
    return null;
  }
  const available = next.filter((value): value is number => value !== null);
  return available.length
    ? Math.round(available.reduce((sum, value) => sum + value, 0) / available.length)
    : null;
}

function candidate(
  facts: SenecaFocusFacts,
  input: Omit<SenecaFocusCandidate, "score" | "projectedHealthPct">,
): SenecaFocusCandidate {
  return {
    ...input,
    score: scoreFocusCandidate(input.scoreParts),
    projectedHealthPct: healthProjection(
      facts,
      input.category,
      Math.max(input.affectedMemberIds.length, input.affectedEntityIds.length),
    ),
  };
}

export function buildFocusCandidates(facts: SenecaFocusFacts): SenecaFocusCandidate[] {
  const candidates: SenecaFocusCandidate[] = [];
  const overdueCheckIns = facts.members.filter(
    (member) => member.checkInRisk === "overdue" || member.checkInRisk === "no_check_in_yet",
  );
  const dueSoonCheckIns = facts.members.filter((member) => member.checkInRisk === "due_soon");
  if (overdueCheckIns.length || dueSoonCheckIns.length) {
    const affected = overdueCheckIns.length ? overdueCheckIns : dueSoonCheckIns;
    candidates.push(
      candidate(facts, {
        id: overdueCheckIns.length ? "check_ins:overdue" : "check_ins:due_soon",
        category: "check_ins",
        impact: overdueCheckIns.length ? "high" : "medium",
        title: overdueCheckIns.length ? "Close the check-in gap" : "Protect upcoming check-ins",
        reason: `${affected.length} team member${affected.length === 1 ? "" : "s"} need a standards-based check-in.`,
        affectedMemberIds: affected.map((member) => member.id).sort(),
        affectedEntityIds: [],
        estimatedMinutes: Math.max(10, affected.length * 15),
        action: "view_check_ins",
        measurable: true,
        confidence: 0.98,
        scoreParts: {
          urgency: overdueCheckIns.length ? 95 : 62,
          impact: 85,
          affected: clamp((affected.length / Math.max(1, facts.memberCount)) * 100),
          ease: 62,
          unlock: 70,
          supportedPattern: affected.length > 1 ? 75 : 35,
        },
      }),
    );
  }

  const highOverdue = facts.tasks.filter((task) => task.overdue && task.priority === "high");
  const overdue = facts.tasks.filter((task) => task.overdue);
  const taskFocus = highOverdue.length ? highOverdue : overdue;
  if (taskFocus.length) {
    const memberIds = [...new Set(taskFocus.flatMap((task) => task.assigneeIds))].sort();
    candidates.push(
      candidate(facts, {
        id: highOverdue.length ? "tasks:high_overdue" : "tasks:overdue",
        category: "tasks",
        impact: highOverdue.length ? "high" : "medium",
        title: highOverdue.length ? "Unblock critical overdue work" : "Clear overdue work",
        reason: `${taskFocus.length} overdue task${taskFocus.length === 1 ? "" : "s"} require follow-through.`,
        affectedMemberIds: memberIds,
        affectedEntityIds: taskFocus.map((task) => task.id).sort(),
        estimatedMinutes: Math.max(10, Math.min(45, taskFocus.length * 5)),
        action: "view_overdue_tasks",
        measurable: true,
        confidence: 1,
        scoreParts: {
          urgency: highOverdue.length ? 100 : 88,
          impact: highOverdue.length ? 100 : 78,
          affected: clamp((memberIds.length / Math.max(1, facts.memberCount)) * 100),
          ease: 72,
          unlock: highOverdue.length ? 90 : 65,
          supportedPattern: taskFocus.length > 1 ? 80 : 35,
        },
      }),
    );
  } else {
    const upcoming = facts.tasks.filter((task) => task.upcoming);
    if (upcoming.length) {
      const memberIds = [...new Set(upcoming.flatMap((task) => task.assigneeIds))].sort();
      candidates.push(
        candidate(facts, {
          id: "tasks:upcoming",
          category: "tasks",
          impact: "medium",
          title: "Protect upcoming deadlines",
          reason: `${upcoming.length} task${upcoming.length === 1 ? "" : "s"} are due in the next seven days.`,
          affectedMemberIds: memberIds,
          affectedEntityIds: upcoming.map((task) => task.id).sort(),
          estimatedMinutes: 10,
          action: "view_overdue_tasks",
          measurable: true,
          confidence: 1,
          scoreParts: {
            urgency: 55,
            impact: 65,
            affected: clamp((memberIds.length / Math.max(1, facts.memberCount)) * 100),
            ease: 82,
            unlock: 60,
            supportedPattern: upcoming.length > 1 ? 60 : 25,
          },
        }),
      );
    }
  }

  const missingGoals = facts.members.filter((member) => member.goalsStatus === "missing_goals");
  const staleGoals = facts.goals.filter((goal) => goal.stale);
  if (missingGoals.length || staleGoals.length) {
    const memberIds = [
      ...new Set([...missingGoals.map((member) => member.id), ...staleGoals.map((goal) => goal.memberId)]),
    ].sort();
    candidates.push(
      candidate(facts, {
        id: missingGoals.length ? "goals:missing" : "goals:stale",
        category: "goals",
        impact: "medium",
        title: missingGoals.length ? "Restore development coverage" : "Move a goal forward",
        reason: missingGoals.length
          ? `${missingGoals.length} team member${missingGoals.length === 1 ? "" : "s"} do not meet the active-goal standard.`
          : `${staleGoals.length} active goal${staleGoals.length === 1 ? "" : "s"} need a progress update.`,
        affectedMemberIds: memberIds,
        affectedEntityIds: staleGoals.map((goal) => goal.id).sort(),
        estimatedMinutes: Math.max(10, memberIds.length * 10),
        action: "view_goals",
        measurable: true,
        confidence: 0.96,
        scoreParts: {
          urgency: staleGoals.length ? 68 : 58,
          impact: 72,
          affected: clamp((memberIds.length / Math.max(1, facts.memberCount)) * 100),
          ease: 66,
          unlock: 55,
          supportedPattern: memberIds.length > 1 ? 65 : 30,
        },
      }),
    );
  }

  const overloaded = facts.members.filter((member) => member.openManagerAssignedTasks >= 4);
  if (overloaded.length) {
    candidates.push(
      candidate(facts, {
        id: "workload:manager_assigned",
        category: "workload",
        impact: "medium",
        title: "Review assigned workload",
        reason: `${overloaded.length} team member${overloaded.length === 1 ? "" : "s"} have at least four open tasks assigned by you.`,
        affectedMemberIds: overloaded.map((member) => member.id).sort(),
        affectedEntityIds: facts.tasks
          .filter((task) => task.createdByManager && task.assigneeIds.some((id) => overloaded.some((m) => m.id === id)))
          .map((task) => task.id)
          .sort(),
        estimatedMinutes: 10,
        action: "view_workload",
        measurable: true,
        confidence: 1,
        scoreParts: {
          urgency: 60,
          impact: 70,
          affected: clamp((overloaded.length / Math.max(1, facts.memberCount)) * 100),
          ease: 78,
          unlock: 82,
          supportedPattern: 45,
        },
      }),
    );
  }

  const healthDeclining =
    facts.health.recentPcts.length >= 3 &&
    facts.health.recentPcts[0]! > facts.health.recentPcts.at(-1)!;
  if (healthDeclining) {
    candidates.push(
      candidate(facts, {
        id: "health:declining",
        category: "health",
        impact: "medium",
        title: "Review the health trend",
        reason: "At least three daily snapshots show a supported downward health trend.",
        affectedMemberIds: [],
        affectedEntityIds: [],
        estimatedMinutes: 10,
        action: "open_team",
        measurable: false,
        confidence: 0.9,
        scoreParts: {
          urgency: 66,
          impact: 75,
          affected: 100,
          ease: 75,
          unlock: 58,
          supportedPattern: 100,
        },
      }),
    );
  }

  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function buildFallbackCandidate(facts: SenecaFocusFacts): SenecaFocusCandidate {
  const lowData = facts.memberCount === 0 || facts.health.currentPct === null;
  const recognitionOpportunities = facts.members.filter(
    (member) =>
      facts.recentlyCompletedMemberIds.includes(member.id) &&
      !facts.recognizedMemberIdsLast14Days.includes(member.id),
  );
  const hasRecognitionOpportunity = !lowData && recognitionOpportunities.length > 0;
  return candidate(facts, {
    id: lowData
      ? "low_data:setup"
      : hasRecognitionOpportunity
        ? "momentum:recognition"
        : "momentum:on_track",
    category: lowData ? "low_data" : "momentum",
    impact: lowData ? "low" : "positive",
    title: lowData
      ? "Build a clearer team signal"
      : hasRecognitionOpportunity
        ? "Reinforce what is working"
        : "Keep today on track",
    reason: lowData
      ? "There is not enough structured activity yet to identify a supported operational risk."
      : hasRecognitionOpportunity
        ? "Recent task completion supports a recognition opportunity for team members who have not been recognized in the last 14 days."
        : "No measurable risk or evidence-backed recognition opportunity needs immediate attention.",
    affectedMemberIds: recognitionOpportunities.slice(0, 3).map((member) => member.id).sort(),
    affectedEntityIds: [],
    estimatedMinutes: 5,
    action: hasRecognitionOpportunity ? "create_recognition" : "open_team",
    measurable: false,
    confidence: lowData ? 0.65 : 0.9,
    scoreParts: {
      urgency: lowData ? 25 : 35,
      impact: lowData ? 40 : 60,
      affected: recognitionOpportunities.length ? 60 : 30,
      ease: 95,
      unlock: lowData ? 60 : 45,
      supportedPattern: 0,
    },
  });
}

export function selectFocusCandidate(
  facts: SenecaFocusFacts,
  excludedIds: string[] = [],
): { selected: SenecaFocusCandidate; candidates: SenecaFocusCandidate[] } {
  const candidates = buildFocusCandidates(facts);
  const selected =
    candidates.find((item) => !excludedIds.includes(item.id)) ?? buildFallbackCandidate(facts);
  return { selected, candidates };
}

export function sourceMetricsFromFacts(facts: SenecaFocusFacts): SenecaFocusSourceMetrics {
  const overdue = facts.tasks.filter((task) => task.overdue);
  return {
    memberCount: facts.memberCount,
    overdueCheckInMemberIds: facts.members
      .filter((member) => member.checkInRisk === "overdue" || member.checkInRisk === "no_check_in_yet")
      .map((member) => member.id)
      .sort(),
    dueSoonCheckInMemberIds: facts.members
      .filter((member) => member.checkInRisk === "due_soon")
      .map((member) => member.id)
      .sort(),
    membersWithoutGoalsIds: facts.members
      .filter((member) => member.goalsStatus === "missing_goals")
      .map((member) => member.id)
      .sort(),
    staleGoalIds: facts.goals.filter((goal) => goal.stale).map((goal) => goal.id).sort(),
    overdueTaskIds: overdue.map((task) => task.id).sort(),
    upcomingTaskIds: facts.tasks.filter((task) => task.upcoming).map((task) => task.id).sort(),
    highPriorityOverdueTaskIds: overdue
      .filter((task) => task.priority === "high")
      .map((task) => task.id)
      .sort(),
    managerAssignedOpenTaskIds: facts.tasks
      .filter((task) => task.createdByManager)
      .map((task) => task.id)
      .sort(),
    managerAssignedMemberIds: facts.members
      .filter((member) => member.openManagerAssignedTasks > 0)
      .map((member) => member.id)
      .sort(),
    recognizedMemberIdsLast14Days: [...facts.recognizedMemberIdsLast14Days].sort(),
    recentlyCompletedMemberIds: [...facts.recentlyCompletedMemberIds].sort(),
    health: {
      currentPct: facts.health.currentPct,
      checkInPct: facts.health.checkInPct,
      goalsPct: facts.health.goalsPct,
      tasksPct: facts.health.tasksPct,
      recentBuckets: facts.health.recentPcts.map((value) => Math.floor(value / 5) * 5),
      projectedPct: null,
    },
  };
}

export function buildMaterialFingerprint(facts: SenecaFocusFacts): string {
  const metrics = sourceMetricsFromFacts(facts);
  const material = {
    ...metrics,
    health: { ...metrics.health, projectedPct: undefined },
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export function isCandidateResolved(
  candidate: SenecaFocusCandidate,
  currentFacts: SenecaFocusFacts,
): boolean {
  const current = buildFocusCandidates(currentFacts).find((item) => item.id === candidate.id);
  if (!candidate.measurable) return false;
  if (!current) return true;
  return candidate.affectedEntityIds.length
    ? candidate.affectedEntityIds.every((id) => !current.affectedEntityIds.includes(id))
    : candidate.affectedMemberIds.every((id) => !current.affectedMemberIds.includes(id));
}
