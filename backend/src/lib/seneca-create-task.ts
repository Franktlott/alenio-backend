import type { SenecaWorkspaceContext } from "./seneca-workspace-context";
import {
  conversationSourceText,
  extractDateFromQuestion,
  extractMemberFromQuestion,
  resolveMemberByName,
} from "./seneca-plan-one-on-one";
import { resolveTimeZone } from "./timezone";

export type SenecaCreateTaskDraft = {
  title?: string | null;
  description?: string | null;
  assigneeName?: string | null;
  assigneeNames?: string[] | null;
  dueDate?: string | null;
  priority?: string | null;
  isJoint?: boolean | null;
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

const PRIORITIES = new Set(["low", "medium", "high"]);

export function isCreateTaskQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    (/\b(create|add|make|assign|give|set up|setup)\b/.test(q) &&
      /\b(task|todo|follow[- ]?up|action item)\b/.test(q)) ||
    /\btask\s+for\b/.test(q) ||
    /\bassign\b.*\b(task|todo)\b/.test(q)
  );
}

export function isTaskAssignmentStatement(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /^[a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+)?\s+(?:needs? to|should|must|has to|have to)\b/.test(q) ||
    /\b(needs? to|should|must|has to|have to)\s+(complete|finish|update|prepare|review|submit|send|fix|handle|do)\b/.test(
      q,
    )
  );
}

export function conversationHasCreateTaskTopic(
  messages: Array<{ role: string; content: string }>,
  question: string,
): boolean {
  if (isCreateTaskQuestion(question) || isTaskAssignmentStatement(question)) return true;

  const history = [...messages.map((message) => message.content), question];
  const blob = history.join(" ").toLowerCase();
  const taskContext =
    /\b(task|todo|follow[- ]?up|action item|create a task|assigned a task|assign a task|task details)\b/.test(
      blob,
    ) ||
    messages.some(
      (message) =>
        message.role === "assistant" && /\b(create a task|task for|details of the task)\b/i.test(message.content),
    );

  if (!taskContext) return false;

  const latest = question.toLowerCase();
  if (
    /\b(confirm|yes|yep|yeah|sounds good|that works|looks good|go ahead|please do|create it|do it|make it)\b/.test(
      latest,
    )
  ) {
    return true;
  }

  if (isCreateTaskQuestion(latest) || isTaskAssignmentStatement(latest)) return true;

  if (/\b(needs? to|should|must|has to|have to)\b/.test(latest)) return true;
  if (/\b(complete|finish|update|prepare|review|submit|send|fix|handle)\b/.test(latest)) return true;
  if (
    /\b(by|before|due)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat|tomorrow|tonight|next week|\d)/.test(
      latest,
    )
  ) {
    return true;
  }

  return false;
}

export { conversationSourceText };

function normalizePriority(raw?: string | null): "low" | "medium" | "high" {
  const p = (raw ?? "").toLowerCase().trim();
  return PRIORITIES.has(p) ? (p as "low" | "medium" | "high") : "medium";
}

function isGenericAssigneePhrase(name: string): boolean {
  const n = name.toLowerCase().trim();
  return /\b(team member|a member|someone|them|him|her|associate|employee|staff)\b/.test(n);
}

function splitAssigneeNames(raw: string): string[] {
  return raw
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((part) => part.trim().replace(/[.,!?]+$/, ""))
    .filter(Boolean);
}

function extractAssigneeNamesFromSource(source: string): string[] {
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean).reverse();

  for (const line of lines) {
    const forTo = line.match(/\bfor\s+(.+?)\s+to\s+/i);
    if (forTo?.[1]) {
      const names = splitAssigneeNames(forTo[1]).filter((name) => !isGenericAssigneePhrase(name));
      if (names.length > 0) return names;
    }

    const leadMatch = line.match(
      /^([a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+)?)\s+(?:needs? to|should|must|has to|have to)\b/i,
    );
    if (leadMatch?.[1] && !isGenericAssigneePhrase(leadMatch[1])) return [leadMatch[1]];

    const forMatch = line.match(/\b(?:with|for)\s+(.+?)(?:\s+to\s+|\s+by\s+|\?|\.|$)/i);
    if (forMatch?.[1]) {
      const names = splitAssigneeNames(forMatch[1]).filter((name) => !isGenericAssigneePhrase(name));
      if (names.length > 0) return names;
    }
  }

  const fromFor = extractMemberFromQuestion(source);
  if (fromFor && !isGenericAssigneePhrase(fromFor)) return splitAssigneeNames(fromFor);

  return [];
}

function resolveAssigneeNames(
  draft: SenecaCreateTaskDraft,
  source: string,
): string[] {
  const fromDraft = (draft.assigneeNames ?? [])
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name));
  if (fromDraft.length > 0) return fromDraft;

  const single = draft.assigneeName?.trim();
  if (single) return splitAssigneeNames(single);

  return extractAssigneeNamesFromSource(source);
}

function normalizeTaskTitle(raw: string): string {
  const cleaned = raw.trim().replace(/[.!?]+$/, "");
  if (!cleaned) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function extractTitleFromSource(source: string): string | null {
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean).reverse();

  for (const line of lines) {
    const forToTitle = line.match(/\bto\s+(.+?)(?:\s+by\s+|\s+before\s+|\s+this\s+|\s+on\s+|\?|\.|$)/i);
    if (forToTitle?.[1] && /\bfor\s+.+\s+to\s+/i.test(line)) {
      return normalizeTaskTitle(forToTitle[1]);
    }

    const needsTo = line.match(
      /\bneeds?\s+to\s+(.+?)(?:\s+by\s+|\s+before\s+|\s+this\s+|\s+on\s+|\?|\.|$)/i,
    );
    if (needsTo?.[1]) return normalizeTaskTitle(needsTo[1]);

    const shouldDo = line.match(
      /\bshould\s+(.+?)(?:\s+by\s+|\s+before\s+|\s+this\s+|\s+on\s+|\?|\.|$)/i,
    );
    if (shouldDo?.[1]) return normalizeTaskTitle(shouldDo[1]);
  }

  const needMatch = source.match(
    /\bneed\s+(?:him|her|them)\s+to\s+(.+?)(?:\s+by\s+|\s+before\s+|\s+this\s+|\s+on\s+|\?|\.|$)/i,
  );
  if (needMatch?.[1]) return normalizeTaskTitle(needMatch[1]);

  const needPerson = source.match(/\bneed\s+[a-z]+\s+to\s+(.+?)(?:\s+by\s+|\s+before\s+|\?|\.|$)/i);
  if (needPerson?.[1]) return normalizeTaskTitle(needPerson[1]);

  return null;
}

function formatDueDateLabel(dueDate: string, timeZone: string): string {
  const parts = dueDate.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: resolveTimeZone(timeZone),
  });
}

export function finalizeCreateTaskProposal(
  draft: SenecaCreateTaskDraft,
  question: string,
  ctx: SenecaWorkspaceContext,
  managerTimeZone: string,
  sourceText?: string,
): SenecaCreateTaskProposal | null {
  const source = sourceText ?? question;
  const assigneeQueries = resolveAssigneeNames(draft, source);
  const members = assigneeQueries
    .map((query) => resolveMemberByName(query, ctx.members))
    .filter((member): member is NonNullable<typeof member> => member !== null);
  if (members.length === 0 || members.length !== assigneeQueries.length) return null;

  const title = draft.title?.trim() || extractTitleFromSource(source);
  if (!title) return null;

  const dueDateRaw =
    (draft.dueDate?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate.trim())
      ? draft.dueDate.trim()
      : null) || extractDateFromQuestion(source, new Date(), managerTimeZone);

  const priority = normalizePriority(draft.priority);
  const isJoint = draft.isJoint === true || members.length > 1;

  return {
    title,
    description: draft.description?.trim() || null,
    assigneeUserIds: members.map((member) => member.userId),
    assigneeNames: members.map((member) => member.name),
    isJoint,
    dueDate: dueDateRaw,
    dueDateLabel: dueDateRaw ? formatDueDateLabel(dueDateRaw, managerTimeZone) : null,
    priority,
  };
}

export function buildCreateTaskConfirmationMessage(proposal: SenecaCreateTaskProposal): string {
  const duePart = proposal.dueDateLabel ? ` by ${proposal.dueDateLabel}` : "";
  const assigneeLabel = proposal.assigneeNames.join(" and ");
  const taskKind = proposal.isJoint ? "joint task" : "task";
  return `I'll create a ${taskKind} for ${assigneeLabel}: "${proposal.title}"${duePart}. Review the details below — confirm to assign it, or edit first.`;
}
