import { ApiError, apiDeleteJson, apiGetJson, apiPostJson } from "./api";

/** Same unified Seneca endpoints the phone uses (`/api/seneca/*`). */

export type SenecaResolvedContext =
  | { type: "personal"; name: "Personal" }
  | { type: "workspace"; workspaceId: string; name: string }
  | { type: "workspaces"; name: string };

export type SenecaChatTurn = { role: "user" | "assistant"; content: string };

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

export type SenecaAskResponse = {
  conversationId: string;
  available: boolean;
  message: string;
  planOneOnOne?: SenecaPlanOneOnOneProposal | null;
  cancelOneOnOne?: SenecaCancelOneOnOneProposal | null;
  createTask?: SenecaCreateTaskProposal | null;
  resolvedContext?: SenecaResolvedContext;
  clarify?: { prompt: string; options: SenecaResolvedContext[] };
};

export type SenecaConversationSummary = {
  id: string;
  contextType: string;
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

export type SenecaConversation = SenecaConversationSummary & { messages: SenecaConversationMessage[] };

/** One message as the web chat shows it. */
export type SenecaChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  resolvedContext?: SenecaResolvedContext | null;
  clarifyOptions?: SenecaResolvedContext[] | null;
  planProposal?: SenecaPlanOneOnOneProposal | null;
  cancelProposal?: SenecaCancelOneOnOneProposal | null;
  createTaskProposal?: SenecaCreateTaskProposal | null;
};

export function askSeneca(body: { question: string; messages: SenecaChatTurn[]; conversationId?: string }) {
  return apiPostJson<{ data: SenecaAskResponse }>("/api/seneca/ask", body).then((r) => r.data);
}

export function fetchSenecaConversations() {
  return apiGetJson<{ data: SenecaConversationSummary[] }>("/api/seneca/conversations").then((r) => r.data);
}

export function fetchSenecaConversation(id: string) {
  return apiGetJson<{ data: SenecaConversation }>(`/api/seneca/conversations/${encodeURIComponent(id)}`).then(
    (r) => r.data,
  );
}

export function deleteSenecaConversation(id: string) {
  return apiDeleteJson<{ data: { deleted: boolean } }>(`/api/seneca/conversations/${encodeURIComponent(id)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResolvedContext(value: unknown): value is SenecaResolvedContext {
  if (!isRecord(value) || typeof value.name !== "string") return false;
  if (value.type === "personal" || value.type === "workspaces") return true;
  return value.type === "workspace" && typeof value.workspaceId === "string";
}

/** Saved turns carry clarify options and proposals in `metadata`. */
export function presentSenecaMessages(messages: SenecaConversationMessage[]): SenecaChatMessage[] {
  return [...(messages ?? [])]
    .sort((a, b) => a.order - b.order)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
    .map((m) => {
      const out: SenecaChatMessage = { id: m.id, role: m.role, text: m.text };
      const meta = m.metadata;
      if (!isRecord(meta)) return out;
      if (isResolvedContext(meta.resolvedContext)) out.resolvedContext = meta.resolvedContext;
      if (m.role === "assistant" && meta.kind === "clarify" && Array.isArray(meta.options)) {
        out.clarifyOptions = meta.options.filter(isResolvedContext);
      }
      if (m.role === "assistant" && meta.kind === "ask") {
        if (isRecord(meta.planOneOnOne)) out.planProposal = meta.planOneOnOne as SenecaPlanOneOnOneProposal;
        if (isRecord(meta.cancelOneOnOne)) out.cancelProposal = meta.cancelOneOnOne as SenecaCancelOneOnOneProposal;
        if (isRecord(meta.createTask)) out.createTaskProposal = meta.createTask as SenecaCreateTaskProposal;
      }
      return out;
    });
}

export function senecaErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Seneca is getting a lot of questions right now. Try again in a moment.";
    if (error.status >= 500) return "Seneca couldn't answer just now. Please try again.";
    if (error.message) return error.message;
  }
  return error instanceof Error && error.message ? error.message : "Seneca couldn't answer just now. Please try again.";
}

/** "Just now", "2h ago", "Yesterday", "Tue", "Oct 3". */
export function senecaWhenLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (date.getTime() >= startOfToday - 864e5) return "Yesterday";
  if (date.getTime() >= startOfToday - 6 * 864e5) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
