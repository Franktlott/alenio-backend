import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import type { SenecaContextRef } from "../types";
import { resolveSenecaScope, SENECA_CONVERSATION_HISTORY_LIMIT, type ResolvedSenecaScope } from "./seneca-scope";

export const SENECA_CONVERSATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type SenecaCapabilityMode = "personal" | "member" | "manager";

export type SenecaConversationAccess =
  | {
      ok: true;
      scope: ResolvedSenecaScope;
      capabilityMode: SenecaCapabilityMode;
    }
  | {
      ok: false;
      status: 403 | 404;
      code: "FORBIDDEN" | "NOT_FOUND" | "SENECA_UNAVAILABLE";
      message: string;
    };

export function senecaConversationExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SENECA_CONVERSATION_RETENTION_MS);
}

export function senecaConversationTitle(text: string): string {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > 80 ? `${compact.slice(0, 77).trimEnd()}…` : compact;
}

export function senecaConversationPreview(text: string): string {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > 160 ? `${compact.slice(0, 157).trimEnd()}…` : compact;
}

export function capabilityModeForScope(scope: ResolvedSenecaScope): SenecaCapabilityMode {
  if (scope.type === "personal") return "personal";
  return scope.capabilities.canUseManagerContext ? "manager" : "member";
}

export function contextForConversation(row: {
  contextType: string;
  teamId: string | null;
}): SenecaContextRef | null {
  if (row.contextType === "personal" && row.teamId === null) {
    return { type: "personal" };
  }
  if (row.contextType === "workspace" && row.teamId) {
    return { type: "workspace", workspaceId: row.teamId };
  }
  return null;
}

export async function resolveConversationAccess(
  userId: string,
  row: {
    userId: string;
    contextType: string;
    teamId: string | null;
    capabilityMode: string;
  },
  db: PrismaClient = prisma,
): Promise<SenecaConversationAccess> {
  if (row.userId !== userId) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Conversation not found" };
  }
  const context = contextForConversation(row);
  if (!context) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Conversation not found" };
  }
  const resolution = await resolveSenecaScope(userId, context, db);
  if (!resolution.ok) return resolution;
  const currentMode = capabilityModeForScope(resolution.scope);
  if (row.capabilityMode === "manager" && currentMode !== "manager") {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Manager access is required for this conversation",
    };
  }
  const supported =
    row.capabilityMode === "manager" ||
    (row.capabilityMode === "member" && resolution.scope.type === "workspace") ||
    (row.capabilityMode === "personal" && resolution.scope.type === "personal");
  if (!supported) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Conversation not found" };
  }
  return { ok: true, scope: resolution.scope, capabilityMode: currentMode };
}

type SaveTurnInput = {
  conversationId?: string;
  userId: string;
  context: SenecaContextRef;
  capabilityMode: SenecaCapabilityMode;
  userText: string;
  assistantText: string;
  userMetadata?: Prisma.InputJsonValue;
  assistantMetadata?: Prisma.InputJsonValue;
  generationId?: string | null;
  now?: Date;
};

export async function saveSenecaConversationTurn(
  input: SaveTurnInput,
  db: PrismaClient = prisma,
): Promise<string> {
  const now = input.now ?? new Date();
  const expiresAt = senecaConversationExpiresAt(now);
  const teamId = input.context.type === "workspace" ? input.context.workspaceId : null;
  let conversationId = input.conversationId;

  if (conversationId) {
    const existing = await db.senecaConversation.findFirst({
      where: { id: conversationId, userId: input.userId, expiresAt: { gt: now } },
      select: {
        userId: true,
        teamId: true,
        contextType: true,
        capabilityMode: true,
      },
    });
    if (
      !existing ||
      existing.teamId !== teamId ||
      existing.contextType !== input.context.type ||
      existing.capabilityMode !== input.capabilityMode
    ) {
      throw new SenecaConversationError("Conversation not found", "NOT_FOUND", 404);
    }
  } else {
    const created = await db.senecaConversation.create({
      data: {
        userId: input.userId,
        teamId,
        contextType: input.context.type,
        capabilityMode: input.capabilityMode,
        title: senecaConversationTitle(input.userText),
        preview: senecaConversationPreview(input.assistantText),
        expiresAt,
      },
      select: { id: true },
    });
    conversationId = created.id;
  }

  await db.$transaction(async (tx) => {
    // Updating the parent first serializes concurrent turns for the same chat.
    await tx.senecaConversation.update({
      where: { id: conversationId },
      data: {
        preview: senecaConversationPreview(input.assistantText),
        updatedAt: now,
        expiresAt,
      },
    });
    const latest = await tx.senecaConversationMessage.aggregate({
      where: { conversationId },
      _max: { order: true },
    });
    const firstOrder = (latest._max.order ?? -1) + 1;
    await tx.senecaConversationMessage.createMany({
      data: [
        {
          conversationId: conversationId!,
          order: firstOrder,
          role: "user",
          text: input.userText,
          ...(input.userMetadata !== undefined ? { metadata: input.userMetadata } : {}),
        },
        {
          conversationId: conversationId!,
          order: firstOrder + 1,
          role: "assistant",
          text: input.assistantText,
          ...(input.assistantMetadata !== undefined
            ? { metadata: input.assistantMetadata }
            : {}),
        },
      ],
    });
    if (input.generationId) {
      await tx.senecaGeneration.updateMany({
        where: {
          id: input.generationId,
          userId: input.userId,
          conversationId: null,
        },
        data: { conversationId },
      });
    }
  });
  return conversationId;
}

export class SenecaConversationError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND",
    readonly status: 404,
  ) {
    super(message);
    this.name = "SenecaConversationError";
  }
}

type SenecaConversationContinuationExpected = {
  userId: string;
  context: SenecaContextRef;
  capabilityMode: SenecaCapabilityMode;
};

export async function loadSenecaConversationHistory(
  conversationId: string | undefined,
  expected: SenecaConversationContinuationExpected,
  clientMessages: Array<{ role: "user" | "assistant"; content: string }>,
  db: PrismaClient = prisma,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  if (!conversationId) return clientMessages;
  const teamId =
    expected.context.type === "workspace" ? expected.context.workspaceId : null;
  const row = await db.senecaConversation.findFirst({
    where: {
      id: conversationId,
      userId: expected.userId,
      contextType: expected.context.type,
      teamId,
      capabilityMode: expected.capabilityMode,
      expiresAt: { gt: new Date() },
    },
    select: {
      messages: {
        orderBy: { order: "desc" },
        take: SENECA_CONVERSATION_HISTORY_LIMIT,
        select: { role: true, text: true },
      },
    },
  });
  if (!row) {
    throw new SenecaConversationError("Conversation not found", "NOT_FOUND", 404);
  }
  return row.messages
    .slice()
    .reverse()
    .flatMap((message) =>
      message.role === "user" || message.role === "assistant"
        ? [{ role: message.role, content: message.text }]
        : [],
    );
}

export async function assertSenecaConversationContinuation(
  conversationId: string | undefined,
  expected: SenecaConversationContinuationExpected,
  db: PrismaClient = prisma,
): Promise<void> {
  if (!conversationId) return;
  const teamId =
    expected.context.type === "workspace" ? expected.context.workspaceId : null;
  const row = await db.senecaConversation.findFirst({
    where: {
      id: conversationId,
      userId: expected.userId,
      contextType: expected.context.type,
      teamId,
      capabilityMode: expected.capabilityMode,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!row) {
    throw new SenecaConversationError("Conversation not found", "NOT_FOUND", 404);
  }
}
