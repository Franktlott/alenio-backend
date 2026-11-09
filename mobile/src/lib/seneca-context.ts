import type {
  SenecaContext,
  SenecaContextOption,
  SenecaWorkspaceContextOption,
} from "./seneca-api";

export const PERSONAL_SENECA_CONTEXT: SenecaContext = { type: "personal" };

export function resolveSenecaContext(
  saved: SenecaContext | null | undefined,
  options: SenecaContextOption[],
): SenecaContext {
  if (saved?.type !== "workspace") return PERSONAL_SENECA_CONTEXT;

  const workspace = options.find(
    (option): option is SenecaWorkspaceContextOption =>
      option.type === "workspace" && option.workspaceId === saved.workspaceId,
  );
  return workspace?.available
    ? { type: "workspace", workspaceId: workspace.workspaceId }
    : PERSONAL_SENECA_CONTEXT;
}

export type SenecaActionId =
  | "development_goal"
  | "coaching_conversation"
  | "recognition"
  | "leadership"
  | "activity"
  | "attention"
  | "goals"
  | "check_in";

export type SenecaAction = {
  id: SenecaActionId;
  title: string;
  description: string;
  prompt: string;
};

const PERSONAL_ACTIONS: SenecaAction[] = [
  {
    id: "development_goal",
    title: "Create a development goal",
    description: "Turn an ambition into a practical plan",
    prompt: "Help me create a development goal with clear next steps.",
  },
  {
    id: "coaching_conversation",
    title: "Prepare for a coaching conversation",
    description: "Build a thoughtful conversation plan",
    prompt: "Help me prepare for a coaching conversation.",
  },
  {
    id: "recognition",
    title: "Help me give recognition",
    description: "Write meaningful, specific recognition",
    prompt: "Help me give thoughtful and specific recognition.",
  },
  {
    id: "leadership",
    title: "Improve my leadership skills",
    description: "Get practical leadership guidance",
    prompt: "Help me improve my leadership skills.",
  },
];

const MANAGER_ACTIONS: SenecaAction[] = [
  {
    id: "activity",
    title: "Summarize today's activity",
    description: "See the most important workspace updates",
    prompt: "Summarize today's activity in this workspace.",
  },
  {
    id: "attention",
    title: "What needs attention?",
    description: "Find risks and priorities",
    prompt: "What needs attention in this workspace?",
  },
  {
    id: "goals",
    title: "Review team goals",
    description: "Review progress and potential blockers",
    prompt: "Review the team's goals and highlight what needs support.",
  },
  {
    id: "check_in",
    title: "Who needs a check-in?",
    description: "Identify useful coaching conversations",
    prompt: "Who needs a check-in, and what should I discuss with them?",
  },
];

const MEMBER_ACTIONS: SenecaAction[] = [
  {
    id: "activity",
    title: "Summarize my work",
    description: "Review your recent progress",
    prompt: "Summarize my recent work in this workspace.",
  },
  {
    id: "attention",
    title: "What needs my attention?",
    description: "Find your next priorities",
    prompt: "What needs my attention in this workspace?",
  },
  {
    id: "goals",
    title: "Review my goals",
    description: "Check your progress and next steps",
    prompt: "Review my goals and help me choose my next step.",
  },
  {
    id: "check_in",
    title: "Prepare for my next check-in",
    description: "Organize updates and talking points",
    prompt: "Help me prepare for my next check-in.",
  },
];

export function getSenecaActions(
  option: SenecaContextOption | undefined,
): SenecaAction[] {
  if (!option || option.type === "personal") return PERSONAL_ACTIONS;
  return option.role === "owner" || option.role === "team_leader"
    ? MANAGER_ACTIONS
    : MEMBER_ACTIONS;
}

export function getSenecaSuggestedPrompts(
  option: SenecaContextOption | undefined,
): string[] {
  return getSenecaActions(option).map((action) => action.title);
}
