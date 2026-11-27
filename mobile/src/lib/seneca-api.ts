import { api } from "@/lib/api/api";
import type { TeamRole } from "@/lib/types";

export type SenecaPersonalContext = {
  type: "personal";
};

export type SenecaWorkspaceContext = {
  type: "workspace";
  workspaceId: string;
};

export type SenecaContext = SenecaPersonalContext | SenecaWorkspaceContext;

export type SenecaPersonalContextOption = SenecaPersonalContext & {
  name: "Personal";
  available: true;
};

export type SenecaWorkspaceContextOption = SenecaWorkspaceContext & {
  name: string;
  role: TeamRole;
  available: boolean;
};

export type SenecaContextOption =
  | SenecaPersonalContextOption
  | SenecaWorkspaceContextOption;

export type SenecaAskActionId =
  | "view_overdue_tasks"
  | "schedule_check_in"
  | "create_recognition"
  | "create_follow_up_task"
  | "build_checklist"
  | "open_team";

export type SenecaChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type SenecaAttachment = {
  url: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  fileName: string;
  sizeBytes: number;
};

export type SenecaImageAttachment = Omit<SenecaAttachment, "mimeType"> & {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type SenecaPlanOneOnOneProposal = {
  memberUserId: string;
  memberName: string;
  startDate: string;
  durationMinutes: number;
  dateLabel: string;
  timeLabel: string;
};

export type SenecaCancelOneOnOneProposal = {
  eventId: string;
  memberUserId: string;
  memberName: string;
  startDate: string;
  dateLabel: string;
  timeLabel: string;
};

export type SenecaCreateTaskProposal = {
  title: string;
  description: string | null;
  assigneeUserIds: string[];
  assigneeNames: string[];
  isJoint: boolean;
  dueDate: string | null;
  dueDateLabel: string | null;
  priority: "low" | "medium" | "high";
};

export type SenecaResolvedContext =
  | { type: "personal"; name: "Personal" }
  | { type: "workspace"; workspaceId: string; name: string }
  | { type: "workspaces"; name: string };

export type SenecaClarifyOption = SenecaResolvedContext;

export type SenecaAskResponse = {
  conversationId: string;
  available: boolean;
  message: string;
  insights?: { label: string; detail?: string }[];
  suggestedActions?: {
    title: string;
    description: string;
    action: SenecaAskActionId;
  }[];
  planOneOnOne?: SenecaPlanOneOnOneProposal | null;
  cancelOneOnOne?: SenecaCancelOneOnOneProposal | null;
  createTask?: SenecaCreateTaskProposal | null;
  resolvedContext?: SenecaResolvedContext;
  clarify?: {
    prompt: string;
    options: SenecaClarifyOption[];
  };
};

export type SenecaAskRequest = {
  context?: SenecaContext;
  question?: string;
  attachment?: SenecaAttachment;
  messages?: SenecaChatTurn[];
  conversationId?: string;
};

export type SenecaImageSize =
  | "1024x1024"
  | "1536x1024"
  | "1024x1536";

export type SenecaGeneratedImage = {
  generationId: string;
  url: string;
  prompt: string;
  revisedPrompt: string | null;
  width: number;
  height: number;
  mimeType: string;
  quota: {
    limit: number;
    remaining: number;
    windowHours: number;
  };
};

export type SenecaImageResponse = SenecaGeneratedImage & {
  conversationId: string;
};

export type SenecaImageEditRequest = {
  context?: SenecaContext;
  prompt: string;
  attachment: SenecaImageAttachment;
  conversationId?: string;
};

export type SenecaConversationSummary = {
  id: string;
  contextType: SenecaContext["type"] | "unified";
  capabilityMode: string | null;
  teamId: string | null;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type SenecaConversationMessage = {
  id: string;
  order: number;
  role: "user" | "assistant";
  text: string;
  metadata: unknown;
  createdAt: string;
};

export type SenecaConversation = SenecaConversationSummary & {
  messages: SenecaConversationMessage[];
};

export function fetchSenecaContexts() {
  return api.get<SenecaContextOption[]>("/api/seneca/contexts");
}

export function askSeneca({
  context,
  question,
  attachment,
  messages = [],
  conversationId,
}: SenecaAskRequest) {
  return api.post<SenecaAskResponse>("/api/seneca/ask", {
    ...(context ? { context } : {}),
    question,
    attachment,
    messages,
    conversationId,
  });
}

export function generateSenecaImage(input: {
  context?: SenecaContext;
  prompt: string;
  size?: SenecaImageSize;
  conversationId?: string;
}) {
  return api.post<SenecaImageResponse>("/api/seneca/images", input);
}

export function editSenecaImage(input: SenecaImageEditRequest) {
  return api.post<SenecaImageResponse>("/api/seneca/images/edit", input);
}

export function fetchSenecaConversations(context?: SenecaContext) {
  if (!context) {
    return api.get<SenecaConversationSummary[]>("/api/seneca/conversations");
  }
  const query =
    context.type === "personal"
      ? "type=personal"
      : `type=workspace&workspaceId=${encodeURIComponent(context.workspaceId)}`;
  return api.get<SenecaConversationSummary[]>(
    `/api/seneca/conversations?${query}`,
  );
}

export function fetchSenecaConversation(conversationId: string) {
  return api.get<SenecaConversation>(
    `/api/seneca/conversations/${encodeURIComponent(conversationId)}`,
  );
}

export function deleteSenecaConversation(conversationId: string) {
  return api.delete<{ deleted: boolean }>(
    `/api/seneca/conversations/${encodeURIComponent(conversationId)}`,
  );
}

/** Legacy team-scoped request retained for callers not yet using unified contexts. */
export function fetchSenecaAsk(teamId: string, question: string, messages: SenecaChatTurn[] = []) {
  return api.post<Omit<SenecaAskResponse, "conversationId">>(
    `/api/teams/${teamId}/seneca/ask`,
    { question, messages },
  );
}

export type SenecaQuickDevelopmentGoal = {
  skill: string;
  steps: string[];
};

const MAX_QUICK_GOAL_STEPS = 5;

function normalizeQuickDevelopmentGoal(raw: unknown): SenecaQuickDevelopmentGoal | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const skill =
    (typeof o.skill === "string" ? o.skill.trim() : "") ||
    (typeof o.goalTitle === "string" ? o.goalTitle.trim() : "");
  if (!skill) return null;
  const stepSource = Array.isArray(o.steps)
    ? o.steps
    : Array.isArray(o.actionSteps30Day)
      ? o.actionSteps30Day
      : [];
  const steps = stepSource
    .filter((step): step is string => typeof step === "string")
    .map((step) => step.trim())
    .filter(Boolean)
    .slice(0, MAX_QUICK_GOAL_STEPS);
  if (steps.length === 0) return null;
  return { skill, steps };
}

/** Draft a skill + actions for a member's development goal. */
export async function fetchSenecaQuickGoal(
  teamId: string,
  memberUserId: string,
  body: {
    skillOrGoal: string;
    memberName?: string;
    managerName?: string | null;
  },
): Promise<SenecaQuickDevelopmentGoal> {
  // api.post already unwraps `{ data: T }` from the response body.
  const response = await api.post<unknown>(
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberUserId)}/seneca/quick-goal`,
    body,
  );
  const normalized = normalizeQuickDevelopmentGoal(response);
  if (!normalized) {
    throw new Error("Seneca returned an invalid development goal.");
  }
  return normalized;
}
