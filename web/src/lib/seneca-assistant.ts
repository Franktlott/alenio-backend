import {
  fetchCoreTeamTasks,
  fetchTeamActivity,
  fetchTeamMemberStats,
  fetchWebTeam,
  fetchWebTeamTasks,
  type ApiActivityItem,
  type ApiTask,
  type DevelopmentGoalAlerts,
  type TeamMemberStatsMap,
  type WebTeamMemberRow,
} from "./api";
import { EMPTY_DEVELOPMENT_GOAL_ALERTS } from "./development-goal-activity";
import { isTaskOverdue } from "./task-display";

export type SenecaPromptId =
  | "attention"
  | "checklist"
  | "prep-1on1"
  | "notes-to-tasks"
  | "recognize";

export type SenecaActionId =
  | "create_follow_up_task"
  | "schedule_check_in"
  | "create_recognition"
  | "build_checklist"
  | "view_overdue_tasks"
  | "open_task"
  | "open_team";

export type SenecaPrompt = {
  id: SenecaPromptId;
  label: string;
  hint: string;
};

export type SenecaActionCard = {
  id: SenecaActionId;
  title: string;
  description: string;
  taskId?: string;
};

export type SenecaInsightItem = {
  id: string;
  label: string;
  detail?: string;
  taskId?: string;
};

export type SenecaAssistantResponse = {
  message: string;
  insights: SenecaInsightItem[];
  actions: SenecaActionCard[];
};

export type OverdueTaskPreview = {
  id: string;
  title: string;
  assigneeLabel: string;
  dueLabel: string;
};

export type WorkspaceMemberBrief = {
  userId: string;
  name: string;
  activeTasks: number;
  overdueTasks: number;
  completedTasksThisMonth: number;
  daysSinceLastOneOnOne: number | null;
  activeDevGoals: number;
  devEngagementPct: number;
  streak: number;
};

export type WorkspaceRecentWin = {
  name: string;
  message: string;
};

export type WorkspaceSnapshot = {
  teamName: string;
  overdueTasks: number;
  overdueTaskPreviews: OverdueTaskPreview[];
  missedChecklists: number;
  memberNeedingCheckIn: { name: string; days: number; userId: string } | null;
  activeDevGoals: number;
  membersWithoutRecentCheckIn: number;
  memberRows: WorkspaceMemberBrief[];
  recentWin: WorkspaceRecentWin | null;
  developmentGoalAlerts: DevelopmentGoalAlerts;
  fromLiveData: boolean;
  loadError?: string | null;
};
export const SENECA_QUICK_PROMPTS: SenecaPrompt[] = [
  {
    id: "attention",
    label: "What needs my attention?",
    hint: "Overdue work, missed routines, and coaching gaps",
  },
  {
    id: "checklist",
    label: "Create a checklist",
    hint: "Turn a recurring process into a frontline checklist",
  },
  {
    id: "prep-1on1",
    label: "Prep a 1:1",
    hint: "Talking points before your next check-in",
  },
  {
    id: "notes-to-tasks",
    label: "Turn notes into tasks",
    hint: "Follow-ups from meetings and conversations",
  },
  {
    id: "recognize",
    label: "Recognize a team win",
    hint: "Celebrate progress on the activity feed",
  },
];

function mergeTeamTasks(webTasks: ApiTask[], coreTasks: ApiTask[]): ApiTask[] {
  const byId = new Map<string, ApiTask>();
  for (const task of webTasks) byId.set(task.id, task);
  for (const task of coreTasks) {
    const prev = byId.get(task.id);
    if (!prev) {
      byId.set(task.id, task);
      continue;
    }
    byId.set(task.id, {
      ...prev,
      ...task,
      creatorId: task.creatorId ?? prev.creatorId ?? task.creator?.id ?? prev.creator?.id,
      assignments: task.assignments?.length ? task.assignments : prev.assignments,
      subtasks: task.subtasks?.length ? task.subtasks : prev.subtasks,
      attachmentUrl: task.attachmentUrl ?? prev.attachmentUrl,
      creator: task.creator ?? prev.creator,
    });
  }
  return [...byId.values()];
}

function emptySnapshot(teamName: string, loadError?: string | null): WorkspaceSnapshot {
  return {
    teamName,
    overdueTasks: 0,
    overdueTaskPreviews: [],
    missedChecklists: 0,
    memberNeedingCheckIn: null,
    activeDevGoals: 0,
    membersWithoutRecentCheckIn: 0,
    memberRows: [],
    recentWin: null,
    developmentGoalAlerts: EMPTY_DEVELOPMENT_GOAL_ALERTS,
    fromLiveData: false,
    loadError: loadError ?? null,
  };
}

function buildMemberRows(
  members: WebTeamMemberRow[],
  stats: TeamMemberStatsMap,
  managerUserId: string | undefined,
): WorkspaceMemberBrief[] {
  return members
    .filter((member) => member.userId !== managerUserId)
    .map((member) => {
      const row = stats[member.userId];
      return {
        userId: member.userId,
        name: member.user?.name ?? member.user?.email ?? "Team member",
        activeTasks: row?.activeTasks ?? 0,
        overdueTasks: row?.overdueTasks ?? 0,
        completedTasksThisMonth: row?.completedTasks ?? 0,
        daysSinceLastOneOnOne: row?.daysSinceLastOneOnOne ?? null,
        activeDevGoals: row?.activeDevGoals ?? 0,
        devEngagementPct: row?.devEngagementPct ?? 0,
        streak: row?.streak ?? 0,
      };
    });
}

function extractRecentWin(activities: ApiActivityItem[]): WorkspaceRecentWin | null {
  for (const item of activities) {
    if (item.type === "celebration") {
      const name = item.metadata?.targetName ?? item.user?.name ?? "A teammate";
      const message =
        typeof item.metadata?.message === "string" && item.metadata.message.trim()
          ? item.metadata.message.trim()
          : "Recognized on the activity feed.";
      return { name, message };
    }
    if (item.type === "task_completed") {
      const name = item.user?.name ?? item.metadata?.assigneeName ?? "A teammate";
      const taskTitle = item.metadata?.taskTitle;
      return {
        name,
        message: taskTitle ? `Completed "${taskTitle}".` : "Completed a task recently.",
      };
    }
  }
  return null;
}

function taskAssigneeLabel(task: ApiTask): string {
  const names = task.assignments
    .map((a) => a.user.name ?? a.user.email)
    .filter((name): name is string => Boolean(name?.trim()));
  if (names.length === 0) return "Unassigned";
  if (names.length === 1) return names[0]!;
  return `${names[0]} +${names.length - 1}`;
}

function formatShortDue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildOverduePreviews(tasks: ApiTask[]): OverdueTaskPreview[] {
  const now = new Date();
  return tasks
    .filter((t) => isTaskOverdue(t, now))
    .sort((a, b) => {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return aDue - bDue;
    })
    .slice(0, 5)
    .map((task) => ({
      id: task.id,
      title: task.title,
      assigneeLabel: taskAssigneeLabel(task),
      dueLabel: formatShortDue(task.dueDate),
    }));
}

function countOverdueTasks(tasks: ApiTask[]): number {
  const now = new Date();
  return tasks.filter((t) => isTaskOverdue(t, now)).length;
}

function findMemberNeedingCheckIn(
  members: WebTeamMemberRow[],
  stats: TeamMemberStatsMap,
  managerUserId: string | undefined,
): { name: string; days: number; userId: string } | null {
  let worst: { name: string; days: number; userId: string } | null = null;
  for (const member of members) {
    if (member.userId === managerUserId) continue;
    const row = stats[member.userId];
    const days = row?.daysSinceLastOneOnOne;
    if (days == null || days < 14) continue;
    const name = member.user?.name ?? member.user?.email ?? "A team member";
    if (!worst || days > worst.days) {
      worst = { name, days, userId: member.userId };
    }
  }
  return worst;
}

function sumActiveDevGoals(stats: TeamMemberStatsMap): number {
  return Object.values(stats).reduce((sum, row) => sum + (row.activeDevGoals ?? 0), 0);
}

function countStaleCheckIns(stats: TeamMemberStatsMap, managerUserId: string | undefined): number {
  return Object.entries(stats).filter(([userId, row]) => {
    if (userId === managerUserId) return false;
    const days = row.daysSinceLastOneOnOne;
    return days == null || days >= 21;
  }).length;
}

export async function loadWorkspaceSnapshot(
  teamId: string,
  managerUserId?: string,
  fallbackTeamName = "Workspace",
): Promise<WorkspaceSnapshot> {
  try {
    const [team, webTasks, coreTasks, memberStatsResponse, activities] = await Promise.all([
      fetchWebTeam(teamId),
      fetchWebTeamTasks(teamId).catch(() => [] as ApiTask[]),
      fetchCoreTeamTasks(teamId).catch(() => [] as ApiTask[]),
      fetchTeamMemberStats(teamId).catch(() => ({
        stats: {} as TeamMemberStatsMap,
        developmentGoalAlerts: EMPTY_DEVELOPMENT_GOAL_ALERTS,
      })),
      fetchTeamActivity(teamId).catch(() => [] as ApiActivityItem[]),
    ]);

    const stats = memberStatsResponse.stats;

    const tasks = mergeTeamTasks(
      Array.isArray(webTasks) ? webTasks : [],
      Array.isArray(coreTasks) ? coreTasks : [],
    );
    const memberRows = buildMemberRows(team.members, stats, managerUserId);
    const memberNeedingCheckIn = findMemberNeedingCheckIn(team.members, stats, managerUserId);

    return {
      teamName: team.name,
      overdueTasks: countOverdueTasks(tasks),
      overdueTaskPreviews: buildOverduePreviews(tasks),
      missedChecklists: 0,
      memberNeedingCheckIn,
      activeDevGoals: sumActiveDevGoals(stats),
      membersWithoutRecentCheckIn: countStaleCheckIns(stats, managerUserId),
      memberRows,
      recentWin: extractRecentWin(Array.isArray(activities) ? activities : []),
      developmentGoalAlerts: memberStatsResponse.developmentGoalAlerts,
      fromLiveData: true,
      loadError: null,
    };
  } catch (error) {
    return emptySnapshot(
      fallbackTeamName,
      error instanceof Error ? error.message : "Could not load workspace data",
    );
  }
}

function action(
  id: SenecaActionId,
  title: string,
  description: string,
  taskId?: string,
): SenecaActionCard {
  return { id, title, description, taskId };
}

export function buildSenecaResponse(
  promptId: SenecaPromptId,
  snapshot: WorkspaceSnapshot,
): SenecaAssistantResponse {
  const team = snapshot.teamName;

  if (!snapshot.fromLiveData) {
    return {
      message: snapshot.loadError
        ? "I couldn't load your workspace data right now. Close Seneca, wait a moment, and try again."
        : "Workspace data isn't ready yet. Give it a moment and try again.",
      insights: [],
      actions: [],
    };
  }

  switch (promptId) {
    case "attention": {
      const insights: SenecaInsightItem[] = [];
      const actions: SenecaActionCard[] = [];
      const overdue = snapshot.overdueTasks;
      const missed = snapshot.missedChecklists;
      const checkInGap = snapshot.memberNeedingCheckIn;
      let issueCount = 0;

      if (overdue > 0) {
        issueCount += 1;
        insights.push({
          id: "overdue-summary",
          label: `${overdue} overdue task${overdue !== 1 ? "s" : ""} across the team`,
        });
        for (const task of snapshot.overdueTaskPreviews.slice(0, 3)) {
          insights.push({
            id: `overdue-${task.id}`,
            label: task.title,
            detail: [task.assigneeLabel, task.dueLabel ? `due ${task.dueLabel}` : null]
              .filter(Boolean)
              .join(" · "),
            taskId: task.id,
          });
        }
        if (overdue > snapshot.overdueTaskPreviews.length) {
          const extra = overdue - snapshot.overdueTaskPreviews.length;
          insights.push({
            id: "overdue-more",
            label: `+${extra} more overdue task${extra !== 1 ? "s" : ""}`,
          });
        }
        actions.push(
          action("view_overdue_tasks", "View overdue tasks", "Open Workspace filtered to past-due work"),
        );
      }

      if (missed > 0) {
        issueCount += 1;
        insights.push({
          id: "missed-checklists",
          label: `${missed} missed checklist${missed !== 1 ? "s" : ""} on the floor`,
        });
        actions.push(action("build_checklist", "Review checklists", "Open Alenio Go and follow up on routines"));
      }

      if (checkInGap) {
        issueCount += 1;
        insights.push({
          id: "checkin-gap",
          label: `${checkInGap.name} — ${checkInGap.days} days since last check-in`,
        });
        actions.push(
          action(
            "schedule_check_in",
            `Prep check-in with ${checkInGap.name}`,
            "Open Team and start 1:1 prep",
          ),
        );
      }

      for (const goal of snapshot.developmentGoalAlerts.nearingInactive.slice(0, 2)) {
        issueCount += 1;
        const daysLeft = goal.daysUntilInactive ?? 0;
        insights.push({
          id: `dev-goal-reminder-${goal.goalId}`,
          label: `${goal.memberName} — "${goal.skill}" goes inactive in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
          detail: `No updates in ${goal.daysSinceActivity} days`,
        });
      }

      for (const goal of snapshot.developmentGoalAlerts.inactive.slice(0, 2)) {
        issueCount += 1;
        insights.push({
          id: `dev-goal-inactive-${goal.goalId}`,
          label: `${goal.memberName} — "${goal.skill}" is inactive`,
          detail: `No activity for ${goal.daysSinceActivity} days`,
        });
      }

      if (
        snapshot.developmentGoalAlerts.nearingInactive.length > 0 ||
        snapshot.developmentGoalAlerts.inactive.length > 0
      ) {
        actions.push(
          action("open_team", "Review development plans", "Check progress notes and reactivate stale goals"),
        );
      }

      if (snapshot.activeDevGoals > 0) {
        insights.push({
          id: "dev-goals",
          label: `${snapshot.activeDevGoals} active development goal${snapshot.activeDevGoals !== 1 ? "s" : ""} in progress`,
        });
      }

      if (snapshot.membersWithoutRecentCheckIn > 1) {
        insights.push({
          id: "stale-checkins",
          label: `${snapshot.membersWithoutRecentCheckIn} teammates without a check-in in the last 3 weeks`,
        });
      }

      let message: string;
      if (issueCount === 0) {
        message = `${team} looks clear — no urgent coaching gaps right now. Consider a recognition post or proactive check-in.`;
      } else if (overdue > 0 && issueCount === 1 && !checkInGap && missed === 0) {
        message = `Your team has ${overdue} overdue task${overdue !== 1 ? "s" : ""} that may need a nudge.`;
      } else {
        message = `Here's what stands out in ${team}:`;
      }

      const genericActions: SenecaActionCard[] = [
        action("create_follow_up_task", "Create follow-up task", "Assign ownership with a due date"),
        action("create_recognition", "Create recognition post", "Celebrate progress on the activity feed"),
      ];

      const seen = new Set(actions.map((a) => a.id));
      for (const item of genericActions) {
        if (actions.length >= 4) break;
        if (seen.has(item.id)) continue;
        actions.push(item);
        seen.add(item.id);
      }

      return { message, insights, actions };
    }

    case "checklist":
      return {
        message: `Let's build a checklist for ${team}. Start with the opening routine, shift handoff, or closing steps your team repeats every day. Seneca can help you turn tribal knowledge into a frontline habit.`,
        insights: [],
        actions: [
          action("build_checklist", "Build checklist", "Create a new checklist in Alenio Go"),
          action("create_follow_up_task", "Assign rollout task", "Task someone to pilot the checklist"),
        ],
      };

    case "prep-1on1":
      return {
        message: snapshot.memberNeedingCheckIn
          ? `Prep focus: ${snapshot.memberNeedingCheckIn.name} — ${snapshot.memberNeedingCheckIn.days} days since your last check-in. Review open tasks, development goals, and recent wins before you meet.`
          : `Pick a teammate and Seneca will surface open tasks, development goals, and recent activity before your next 1:1.`,
        insights: snapshot.memberNeedingCheckIn
          ? [
              {
                id: "prep-member",
                label: `${snapshot.memberNeedingCheckIn.name} is due for a check-in`,
                detail: `${snapshot.memberNeedingCheckIn.days} days since your last 1:1`,
              },
            ]
          : [],
        actions: [
          action("schedule_check_in", "Start check-in prep", "Open Team and choose a member"),
          action("create_follow_up_task", "Capture follow-up task", "Log action items before the conversation"),
        ],
      };

    case "notes-to-tasks":
      return {
        message: `Paste rough notes from a huddle or 1:1 and I'll help you turn them into owned follow-ups. For now, create tasks with clear titles, assignees, and due dates so nothing slips after the conversation.`,
        insights: [],
        actions: [
          action("create_follow_up_task", "Create follow-up task", "Add tasks from your latest notes"),
          action("schedule_check_in", "Review in next 1:1", "Attach follow-ups to an upcoming check-in"),
        ],
      };

    case "recognize":
      return {
        message: snapshot.activeDevGoals > 0
          ? `${team} has ${snapshot.activeDevGoals} active development goal${snapshot.activeDevGoals !== 1 ? "s" : ""} in progress. A public recognition post reinforces behavior you want repeated — especially after checklist streaks or task wins.`
          : `Recognition keeps momentum visible. Call out a specific win, name the person, and tie it to a value or goal your team is chasing.`,
        insights: [],
        actions: [
          action("create_recognition", "Create recognition post", "Post to the team activity feed"),
          action("schedule_check_in", "Mention in 1:1", "Reinforce the win in your next check-in"),
        ],
      };

    default:
      return {
        message: "How can I help you lead the floor today?",
        insights: [],
        actions: [],
      };
  }
}

export function senecaActionPath(actionId: SenecaActionId, teamId: string, taskId?: string): string {
  switch (actionId) {
    case "create_follow_up_task":
      return `/tasks/new?teamId=${encodeURIComponent(teamId)}`;
    case "schedule_check_in":
      return `/team?teamId=${encodeURIComponent(teamId)}`;
    case "create_recognition":
      return `/chat?teamId=${encodeURIComponent(teamId)}`;
    case "build_checklist":
      return `/aleniogo`;
    case "view_overdue_tasks":
      return `/dashboard?teamId=${encodeURIComponent(teamId)}&overdue=1`;
    case "open_task":
      return taskId
        ? `/tasks/${encodeURIComponent(taskId)}?teamId=${encodeURIComponent(teamId)}`
        : `/dashboard?teamId=${encodeURIComponent(teamId)}&overdue=1`;
    case "open_team":
      return `/team?teamId=${encodeURIComponent(teamId)}`;
    default:
      return "/";
  }
}
