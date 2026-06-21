import {
  fetchCoreTeamTasks,
  fetchTeamMemberStats,
  fetchWebTeam,
  type ApiTask,
  type TeamMemberStatsMap,
  type WebTeamMemberRow,
} from "./api";

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
  | "build_checklist";

export type SenecaPrompt = {
  id: SenecaPromptId;
  label: string;
  hint: string;
};

export type SenecaActionCard = {
  id: SenecaActionId;
  title: string;
  description: string;
};

export type SenecaAssistantResponse = {
  message: string;
  actions: SenecaActionCard[];
};

export type WorkspaceSnapshot = {
  teamName: string;
  overdueTasks: number;
  missedChecklists: number;
  memberNeedingCheckIn: { name: string; days: number } | null;
  activeDevGoals: number;
  membersWithoutRecentCheckIn: number;
  fromLiveData: boolean;
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

const MOCK_SNAPSHOT: WorkspaceSnapshot = {
  teamName: "Your workspace",
  overdueTasks: 3,
  missedChecklists: 1,
  memberNeedingCheckIn: { name: "Vera", days: 42 },
  activeDevGoals: 2,
  membersWithoutRecentCheckIn: 1,
  fromLiveData: false,
};

function countOverdueTasks(tasks: ApiTask[]): number {
  const now = Date.now();
  return tasks.filter((t) => {
    if (t.status === "done") return false;
    if (!t.dueDate) return false;
    return new Date(t.dueDate).getTime() < now;
  }).length;
}

function findMemberNeedingCheckIn(
  members: WebTeamMemberRow[],
  stats: TeamMemberStatsMap,
  managerUserId: string | undefined,
): { name: string; days: number } | null {
  let worst: { name: string; days: number } | null = null;
  for (const member of members) {
    if (member.userId === managerUserId) continue;
    const row = stats[member.userId];
    const days = row?.daysSinceLastOneOnOne;
    if (days == null || days < 14) continue;
    const name = member.user?.name ?? member.user?.email ?? "A team member";
    if (!worst || days > worst.days) {
      worst = { name, days };
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
): Promise<WorkspaceSnapshot> {
  try {
    const [team, tasks, stats] = await Promise.all([
      fetchWebTeam(teamId),
      fetchCoreTeamTasks(teamId).catch(() => [] as ApiTask[]),
      fetchTeamMemberStats(teamId).catch(() => ({} as TeamMemberStatsMap)),
    ]);

    const memberNeedingCheckIn = findMemberNeedingCheckIn(team.members, stats, managerUserId);

    return {
      teamName: team.name,
      overdueTasks: countOverdueTasks(tasks),
      missedChecklists: 0,
      memberNeedingCheckIn,
      activeDevGoals: sumActiveDevGoals(stats),
      membersWithoutRecentCheckIn: countStaleCheckIns(stats, managerUserId),
      fromLiveData: true,
    };
  } catch {
    return { ...MOCK_SNAPSHOT, teamName: MOCK_SNAPSHOT.teamName };
  }
}

function action(
  id: SenecaActionId,
  title: string,
  description: string,
): SenecaActionCard {
  return { id, title, description };
}

export function buildSenecaResponse(
  promptId: SenecaPromptId,
  snapshot: WorkspaceSnapshot,
): SenecaAssistantResponse {
  const team = snapshot.teamName;

  switch (promptId) {
    case "attention": {
      const segments: string[] = [];
      const overdue = snapshot.overdueTasks;
      const missed = snapshot.fromLiveData ? snapshot.missedChecklists : snapshot.missedChecklists || 1;

      if (overdue > 0) {
        segments.push(`${overdue} overdue task${overdue !== 1 ? "s" : ""}`);
      }
      if (missed > 0) {
        segments.push(`${missed} missed checklist${missed !== 1 ? "s" : ""}`);
      }
      if (snapshot.memberNeedingCheckIn) {
        segments.push(
          `${snapshot.memberNeedingCheckIn.name} hasn’t had a check-in in ${snapshot.memberNeedingCheckIn.days} days`,
        );
      }

      let summary: string;
      if (segments.length === 0) {
        summary = `You’re in good shape in ${team}. No urgent manager fires — consider a proactive check-in or recognition post.`;
      } else if (segments.length === 1) {
        summary = `You have ${segments[0]}.`;
      } else {
        const last = segments.pop()!;
        summary = `You have ${segments.join(", ")}, and ${last}.`;
      }

      return {
        message: summary,
        actions: [
          action("create_follow_up_task", "Create follow-up task", "Assign ownership with a due date"),
          action("schedule_check_in", "Schedule check-in", "Open a member profile and start a 1:1"),
          action("create_recognition", "Create recognition post", "Celebrate progress on the activity feed"),
          action("build_checklist", "Build checklist", "Standardize a recurring frontline routine"),
        ],
      };
    }

    case "checklist":
      return {
        message: `Let’s build a checklist for ${team}. Start with the opening routine, shift handoff, or closing steps your team repeats every day. Seneca can help you turn tribal knowledge into a frontline habit.`,
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
        actions: [
          action("schedule_check_in", "Start check-in prep", "Open Team and choose a member"),
          action("create_follow_up_task", "Capture follow-up task", "Log action items before the conversation"),
        ],
      };

    case "notes-to-tasks":
      return {
        message: `Paste rough notes from a huddle or 1:1 and I’ll help you turn them into owned follow-ups. For now, create tasks with clear titles, assignees, and due dates so nothing slips after the conversation.`,
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
        actions: [
          action("create_recognition", "Create recognition post", "Post to the team activity feed"),
          action("schedule_check_in", "Mention in 1:1", "Reinforce the win in your next check-in"),
        ],
      };

    default:
      return {
        message: "How can I help you lead the floor today?",
        actions: [],
      };
  }
}

export function senecaActionPath(actionId: SenecaActionId, teamId: string): string {
  switch (actionId) {
    case "create_follow_up_task":
      return `/tasks/new?teamId=${encodeURIComponent(teamId)}`;
    case "schedule_check_in":
      return `/team?teamId=${encodeURIComponent(teamId)}`;
    case "create_recognition":
      return `/chat?teamId=${encodeURIComponent(teamId)}`;
    case "build_checklist":
      return `/go?teamId=${encodeURIComponent(teamId)}`;
    default:
      return "/";
  }
}
