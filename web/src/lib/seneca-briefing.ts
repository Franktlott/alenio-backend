import type { SenecaPromptId } from "./seneca-assistant";

/** Visual tone for briefing cards — maps to status colors in the drawer. */
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

/** Time-of-day greeting for the opening briefing line. */
export function getSenecaGreeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Mock leadership briefing — structured for later replacement with live workspace signals.
 * TODO: derive from checklist analytics, check-in stats, task activity, and recognition data.
 */
export function getMockLeadershipBriefing(): BriefingInsightCard[] {
  return [
    {
      id: "checklist-late",
      category: "Needs Attention",
      tone: "risk",
      title: "Beverage closing checklist is trending late",
      detail: "Completed after target time 4 of the last 5 days.",
      actions: [
        { id: "review_checklist", label: "Review checklist" },
        { id: "coach_owner", label: "Coach owner" },
      ],
    },
    {
      id: "vera-checkin",
      category: "Development Opportunity",
      tone: "opportunity",
      title: "Vera may be due for a check-in",
      detail: "96% task completion this month, but no documented check-in in 38 days.",
      actions: [
        { id: "prepare_1on1", label: "Prepare 1:1" },
        { id: "create_dev_note", label: "Create development note" },
      ],
    },
    {
      id: "overdue-silent",
      category: "Follow-Up Risk",
      tone: "follow_up",
      title: "2 overdue tasks have no updates",
      detail: "You assigned 7 tasks this week. 2 are overdue with no comment or progress update.",
      actions: [
        { id: "view_tasks", label: "View tasks" },
        { id: "send_reminder", label: "Send reminder" },
      ],
    },
    {
      id: "michelle-consistency",
      category: "Recognition Moment",
      tone: "win",
      title: "Michelle is showing strong consistency",
      detail: "Completed every opening checklist this month.",
      actions: [
        { id: "create_shoutout", label: "Create shout-out" },
        { id: "add_recognition_note", label: "Add recognition note" },
      ],
    },
  ];
}

/** Mock team pulse metrics — replace with computed workspace health scores. */
export function getMockTeamPulse(): TeamPulseMetric[] {
  return [
    { id: "execution", label: "Execution", value: 94, status: "strong" },
    { id: "communication", label: "Communication", value: 76, status: "watch" },
    { id: "development", label: "Development", value: 82, status: "good" },
  ];
}

export function briefingActionPath(actionId: string, teamId: string): string {
  const ws = encodeURIComponent(teamId);
  switch (actionId) {
    case "review_checklist":
      return `/go?teamId=${ws}`;
    case "coach_owner":
    case "prepare_1on1":
    case "create_dev_note":
      return `/team?teamId=${ws}`;
    case "view_tasks":
      return `/dashboard?teamId=${ws}&overdue=1`;
    case "send_reminder":
    case "create_shoutout":
    case "add_recognition_note":
      return `/chat?teamId=${ws}`;
    default:
      return `/dashboard?teamId=${ws}`;
  }
}

export function quickActionPath(actionId: SenecaQuickAction["id"], teamId: string): string {
  const ws = encodeURIComponent(teamId);
  switch (actionId) {
    case "checklist":
      return `/go?teamId=${ws}`;
    case "task":
      return `/tasks/new?teamId=${ws}`;
    case "check_in":
      return `/team?teamId=${ws}`;
    case "recognize":
      return `/chat?teamId=${ws}`;
  }
}

/** Only route to structured workspace scans for known coaching prompts — not free-form questions. */
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

/** Map example coaching prompts to structured handlers. */
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
