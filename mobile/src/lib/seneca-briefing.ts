import type { SenecaPromptId, WorkspaceSnapshot } from "./seneca-assistant";

export type BriefingTone = "risk" | "opportunity" | "follow_up" | "win";

export type BriefingCardAction = {
  id: string;
  label: string;
};

export type BriefingInsightCard = {
  id: string;
  category: string;
  tone: BriefingTone;
  title: string;
  detail: string;
  actions: BriefingCardAction[];
  memberUserId?: string;
};

export type TeamPulseMetric = {
  id: string;
  label: string;
  value: number;
  status: "strong" | "good" | "watch" | "risk";
};

export type SenecaQuickAction = {
  id: "checklist" | "task" | "check_in" | "recognize";
  label: string;
};

export const SENECA_ASK_EXAMPLES = [
  "What should I focus on today?",
  "Who needs recognition?",
  "Prepare my next 1:1",
  "Where are we falling behind?",
] as const;

export const SENECA_COMPACT_QUICK_ACTIONS: SenecaQuickAction[] = [
  { id: "checklist", label: "Create checklist" },
  { id: "task", label: "Create task" },
  { id: "check_in", label: "Schedule check-in" },
  { id: "recognize", label: "Recognize a win" },
];

export function getSenecaGreeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function pulseStatus(value: number): TeamPulseMetric["status"] {
  if (value >= 85) return "strong";
  if (value >= 70) return "good";
  if (value >= 50) return "watch";
  return "risk";
}

export function buildLeadershipBriefing(snapshot: WorkspaceSnapshot): BriefingInsightCard[] {
  if (!snapshot.fromLiveData) return [];

  const cards: BriefingInsightCard[] = [];

  if (snapshot.overdueTasks > 0) {
    const examples = snapshot.overdueTaskPreviews
      .slice(0, 2)
      .map((task) =>
        [task.title, task.assigneeLabel, task.dueLabel ? `due ${task.dueLabel}` : null]
          .filter(Boolean)
          .join(" · "),
      )
      .join(" — ");

    cards.push({
      id: "live-overdue",
      category: "Follow-Up Risk",
      tone: "follow_up",
      title: `${snapshot.overdueTasks} overdue task${snapshot.overdueTasks !== 1 ? "s" : ""} need follow-up`,
      detail: examples || "Past-due work is assigned across the team.",
      actions: [
        { id: "view_tasks", label: "View tasks" },
        { id: "send_reminder", label: "Send reminder" },
      ],
    });
  }

  const nearingInactive = snapshot.developmentGoalAlerts.nearingInactive[0];
  if (nearingInactive) {
    const daysLeft = nearingInactive.daysUntilInactive ?? 0;
    cards.push({
      id: `live-dev-goal-reminder-${nearingInactive.goalId}`,
      category: "Development Opportunity",
      tone: "follow_up",
      title: `${nearingInactive.memberName}'s goal goes inactive in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
      detail: `"${nearingInactive.skill}" has had no updates in ${nearingInactive.daysSinceActivity} days. Add a progress note or update steps to keep it active.`,
      memberUserId: nearingInactive.memberUserId,
      actions: [
        { id: "create_dev_note", label: "Review development plan" },
        { id: "prepare_1on1", label: "Prepare 1:1" },
      ],
    });
  }

  const staleInactiveGoal = snapshot.developmentGoalAlerts.inactive[0];
  if (staleInactiveGoal) {
    cards.push({
      id: `live-dev-goal-inactive-${staleInactiveGoal.goalId}`,
      category: "Needs Attention",
      tone: "risk",
      title: `${staleInactiveGoal.memberName}'s goal is inactive`,
      detail: `"${staleInactiveGoal.skill}" had no activity for ${staleInactiveGoal.daysSinceActivity} days and is now inactive. Check in or add a progress update to reactivate.`,
      memberUserId: staleInactiveGoal.memberUserId,
      actions: [{ id: "create_dev_note", label: "Review development plan" }],
    });
  }

  const checkIn = snapshot.memberNeedingCheckIn;
  if (checkIn) {
    const member = snapshot.memberRows.find((row) => row.userId === checkIn.userId);
    const detailParts: string[] = [];
    if (member && member.completedTasksThisMonth > 0) {
      detailParts.push(
        `${member.completedTasksThisMonth} task${member.completedTasksThisMonth !== 1 ? "s" : ""} completed this month`,
      );
    }
    detailParts.push(`no documented check-in in ${checkIn.days} days`);

    cards.push({
      id: `live-checkin-${checkIn.userId}`,
      category: "Development Opportunity",
      tone: "opportunity",
      title: `${checkIn.name} may be due for a check-in`,
      detail: `${detailParts.join(", but ")}.`,
      memberUserId: checkIn.userId,
      actions: [
        { id: "prepare_1on1", label: "Prepare 1:1" },
        { id: "create_dev_note", label: "Create development note" },
      ],
    });
  }

  const worstOverdueMember = [...snapshot.memberRows]
    .filter((row) => row.overdueTasks > 0)
    .sort((a, b) => b.overdueTasks - a.overdueTasks)[0];

  if (worstOverdueMember && worstOverdueMember.overdueTasks >= 2) {
    cards.push({
      id: `live-member-overdue-${worstOverdueMember.userId}`,
      category: "Needs Attention",
      tone: "risk",
      title: `${worstOverdueMember.name} has ${worstOverdueMember.overdueTasks} overdue tasks`,
      detail: "May need a quick touchpoint on priorities or blockers.",
      memberUserId: worstOverdueMember.userId,
      actions: [
        { id: "view_tasks", label: "View tasks" },
        { id: "coach_owner", label: "Coach owner" },
      ],
    });
  } else if (snapshot.membersWithoutRecentCheckIn > 1) {
    cards.push({
      id: "live-stale-checkins",
      category: "Needs Attention",
      tone: "risk",
      title: `${snapshot.membersWithoutRecentCheckIn} teammates without a recent check-in`,
      detail: "Consider scheduling 1:1s to stay connected with the floor.",
      actions: [{ id: "prepare_1on1", label: "Schedule check-ins" }],
    });
  }

  const topPerformer = [...snapshot.memberRows].sort((a, b) => {
    if (b.completedTasksThisMonth !== a.completedTasksThisMonth) {
      return b.completedTasksThisMonth - a.completedTasksThisMonth;
    }
    return b.streak - a.streak;
  })[0];

  if (topPerformer && (topPerformer.completedTasksThisMonth > 0 || topPerformer.streak >= 3)) {
    const detailParts: string[] = [];
    if (topPerformer.completedTasksThisMonth > 0) {
      detailParts.push(
        `Completed ${topPerformer.completedTasksThisMonth} task${topPerformer.completedTasksThisMonth !== 1 ? "s" : ""} this month`,
      );
    }
    if (topPerformer.streak >= 3) {
      detailParts.push(`${topPerformer.streak}-day completion streak`);
    }

    cards.push({
      id: `live-win-${topPerformer.userId}`,
      category: "Recognition Moment",
      tone: "win",
      title: `${topPerformer.name} is showing strong consistency`,
      detail: `${detailParts.join(" · ")}.`,
      memberUserId: topPerformer.userId,
      actions: [
        { id: "create_shoutout", label: "Create shout-out" },
        { id: "add_recognition_note", label: "Add recognition note" },
      ],
    });
  } else if (snapshot.recentWin) {
    cards.push({
      id: "live-recent-win",
      category: "Recognition Moment",
      tone: "win",
      title: `Recent win from ${snapshot.recentWin.name}`,
      detail: snapshot.recentWin.message,
      actions: [{ id: "create_shoutout", label: "Create shout-out" }],
    });
  }

  if (snapshot.activeDevGoals > 0 && !cards.some((card) => card.category === "Development Opportunity")) {
    cards.push({
      id: "live-dev-goals",
      category: "Development Opportunity",
      tone: "opportunity",
      title: `${snapshot.activeDevGoals} active development goal${snapshot.activeDevGoals !== 1 ? "s" : ""} in progress`,
      detail: "Review progress and offer support in your next check-ins.",
      actions: [
        { id: "create_dev_note", label: "Review development plans" },
        { id: "prepare_1on1", label: "Prepare 1:1" },
      ],
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: "live-all-clear",
      category: "Team Status",
      tone: "win",
      title: `${snapshot.teamName} looks clear`,
      detail:
        "No overdue tasks or urgent coaching gaps right now. Consider a recognition post or proactive check-in.",
      actions: [
        { id: "create_shoutout", label: "Recognize a win" },
        { id: "prepare_1on1", label: "Schedule check-in" },
      ],
    });
  }

  return cards.slice(0, 4);
}

export function buildTeamPulse(snapshot: WorkspaceSnapshot): TeamPulseMetric[] {
  if (!snapshot.fromLiveData || snapshot.memberRows.length === 0) return [];

  const members = snapshot.memberRows;
  const totalActive = members.reduce((sum, row) => sum + row.activeTasks, 0);
  const totalCompleted = members.reduce((sum, row) => sum + row.completedTasksThisMonth, 0);
  const executionDenom = totalActive + totalCompleted;
  const execution = executionDenom > 0 ? Math.round((totalCompleted / executionDenom) * 100) : 100;

  const withRecentCheckIn = members.filter(
    (row) => row.daysSinceLastOneOnOne != null && row.daysSinceLastOneOnOne < 21,
  ).length;
  const communication =
    members.length > 0 ? Math.round((withRecentCheckIn / members.length) * 100) : 0;

  const devScores = members.map((row) =>
    row.devEngagementPct > 0 ? row.devEngagementPct : row.activeDevGoals > 0 ? 75 : 40,
  );
  const development = Math.round(devScores.reduce((sum, score) => sum + score, 0) / devScores.length);

  return [
    { id: "execution", label: "Execution", value: execution, status: pulseStatus(execution) },
    { id: "communication", label: "Communication", value: communication, status: pulseStatus(communication) },
    { id: "development", label: "Development", value: development, status: pulseStatus(development) },
  ];
}

export function matchStructuredPrompt(text: string): SenecaPromptId | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;

  for (const example of SENECA_ASK_EXAMPLES) {
    if (q === example.toLowerCase()) {
      return resolveAskToPromptId(example);
    }
  }

  return null;
}

export function resolveAskToPromptId(text: string): SenecaPromptId | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  if (q.includes("focus") || q.includes("attention") || q.includes("falling behind") || q.includes("behind")) {
    return "attention";
  }
  if (q.includes("recognition") || q.includes("recognize") || q.includes("who needs")) {
    return "recognize";
  }
  if (q.includes("1:1") || q.includes("check-in") || q.includes("check in") || q.includes("prepare")) {
    return "prep-1on1";
  }
  if (q.includes("checklist")) return "checklist";
  if (q.includes("task") || q.includes("notes")) return "notes-to-tasks";
  return null;
}
