import type {
  SenecaCancelOneOnOneProposal,
  SenecaAttachment,
  SenecaConversationSummary,
  SenecaConversationMessage,
  SenecaCreateTaskProposal,
  SenecaGeneratedImage,
  SenecaPlanOneOnOneProposal,
  SenecaClarifyOption,
  SenecaResolvedContext,
} from "@/lib/seneca-api";

export type SenecaPresentedMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  planProposal?: SenecaPlanOneOnOneProposal | null;
  cancelProposal?: SenecaCancelOneOnOneProposal | null;
  createTaskProposal?: SenecaCreateTaskProposal | null;
  generatedImage?: SenecaGeneratedImage | null;
  attachment?: SenecaAttachment | null;
  resolvedContext?: SenecaResolvedContext | null;
  clarifyOptions?: SenecaClarifyOption[] | null;
  turnCapabilityMode?: "personal" | "member" | "manager" | null;
};

export function recentSenecaConversations(
  conversations: SenecaConversationSummary[],
  limit = 3,
): SenecaConversationSummary[] {
  return [...conversations]
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, Math.max(0, limit));
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPlanProposal(value: unknown): value is SenecaPlanOneOnOneProposal {
  if (!isRecord(value)) return false;
  return (
    typeof value.memberUserId === "string" &&
    typeof value.memberName === "string" &&
    typeof value.startDate === "string" &&
    typeof value.durationMinutes === "number" &&
    typeof value.dateLabel === "string" &&
    typeof value.timeLabel === "string"
  );
}

function isCancelProposal(
  value: unknown,
): value is SenecaCancelOneOnOneProposal {
  if (!isRecord(value)) return false;
  return (
    typeof value.eventId === "string" &&
    typeof value.memberUserId === "string" &&
    typeof value.memberName === "string" &&
    typeof value.startDate === "string" &&
    typeof value.dateLabel === "string" &&
    typeof value.timeLabel === "string"
  );
}

function isTaskProposal(value: unknown): value is SenecaCreateTaskProposal {
  if (!isRecord(value)) return false;
  return (
    typeof value.title === "string" &&
    (typeof value.description === "string" || value.description === null) &&
    isStringArray(value.assigneeUserIds) &&
    isStringArray(value.assigneeNames) &&
    typeof value.isJoint === "boolean" &&
    (typeof value.dueDate === "string" || value.dueDate === null) &&
    (typeof value.dueDateLabel === "string" || value.dueDateLabel === null) &&
    (value.priority === "low" ||
      value.priority === "medium" ||
      value.priority === "high")
  );
}

function isGeneratedImage(value: unknown): value is SenecaGeneratedImage {
  if (!isRecord(value)) return false;
  return (
    typeof value.generationId === "string" &&
    typeof value.url === "string" &&
    value.url.length > 0 &&
    typeof value.prompt === "string" &&
    (typeof value.revisedPrompt === "string" ||
      value.revisedPrompt === null) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    typeof value.mimeType === "string"
  );
}

function isAttachment(value: unknown): value is SenecaAttachment {
  if (!isRecord(value)) return false;
  return (
    typeof value.url === "string" &&
    value.url.length > 0 &&
    (value.mimeType === "image/jpeg" ||
      value.mimeType === "image/png" ||
      value.mimeType === "image/webp" ||
      value.mimeType === "application/pdf") &&
    typeof value.fileName === "string" &&
    value.fileName.length > 0 &&
    typeof value.sizeBytes === "number" &&
    Number.isFinite(value.sizeBytes) &&
    value.sizeBytes >= 0
  );
}

function isResolvedContext(value: unknown): value is SenecaResolvedContext {
  if (!isRecord(value)) return false;
  if (value.type === "personal" && value.name === "Personal") return true;
  if (
    value.type === "workspaces" &&
    typeof value.name === "string" &&
    value.name.length > 0
  ) {
    return true;
  }
  return (
    value.type === "workspace" &&
    typeof value.workspaceId === "string" &&
    value.workspaceId.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0
  );
}

function isClarifyOptions(value: unknown): value is SenecaClarifyOption[] {
  return Array.isArray(value) && value.every(isResolvedContext);
}

export function mapSenecaConversationMessages(
  messages: SenecaConversationMessage[],
): SenecaPresentedMessage[] {
  return [...messages]
    .sort((left, right) => left.order - right.order)
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.text === "string",
    )
    .map((message) => {
      const presented: SenecaPresentedMessage = {
        id: message.id,
        role: message.role,
        text: message.text,
      };
      if (!isRecord(message.metadata)) return presented;

      if (isResolvedContext(message.metadata.resolvedContext)) {
        presented.resolvedContext = message.metadata.resolvedContext;
      }
      if (
        message.metadata.turnCapabilityMode === "personal" ||
        message.metadata.turnCapabilityMode === "member" ||
        message.metadata.turnCapabilityMode === "manager"
      ) {
        presented.turnCapabilityMode = message.metadata.turnCapabilityMode;
      }

      if (
        message.role === "user" &&
        message.metadata.kind === "attachment" &&
        isAttachment(message.metadata.attachment)
      ) {
        presented.attachment = message.metadata.attachment;
      }

      if (message.role === "assistant" && message.metadata.kind === "clarify") {
        if (isClarifyOptions(message.metadata.options)) {
          presented.clarifyOptions = message.metadata.options;
        }
      }

      if (
        message.role === "assistant" &&
        message.metadata.kind === "ask"
      ) {
        if (isPlanProposal(message.metadata.planOneOnOne)) {
          presented.planProposal = message.metadata.planOneOnOne;
        }
        if (isCancelProposal(message.metadata.cancelOneOnOne)) {
          presented.cancelProposal = message.metadata.cancelOneOnOne;
        }
        if (isTaskProposal(message.metadata.createTask)) {
          presented.createTaskProposal = message.metadata.createTask;
        }
      }

      if (
        message.role === "assistant" &&
        message.metadata.kind === "image" &&
        isGeneratedImage(message.metadata)
      ) {
        presented.generatedImage = message.metadata;
      }
      return presented;
    });
}

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatSenecaUpdatedAt(
  value: string,
  now = new Date(),
): string {
  const date = validDate(value);
  if (!date) return "Recently";

  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  if (elapsedMinutes < 24 * 60) {
    return `${Math.floor(elapsedMinutes / 60)}h ago`;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** "Yesterday"-style label for resuming a conversation from Home. */
export function formatSenecaConversationWhen(
  value: string,
  now = new Date(),
): string {
  const date = validDate(value);
  if (!date) return "Recently";

  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (dayDiff <= 0) return `${Math.floor(elapsedMinutes / 60)}h ago`;
  if (dayDiff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatSenecaExpiry(value: string): string {
  const date = validDate(value);
  if (!date) return "Retained for a limited time";
  return `Available until ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}
