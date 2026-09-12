import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import type { SenecaContextRef } from "../types";
import { resolveSenecaScope, SENECA_CONVERSATION_HISTORY_LIMIT, type ResolvedSenecaScope } from "./seneca-scope";

export const SENECA_CONVERSATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type SenecaTurnCapabilityMode = "personal" | "member" | "manager";
export type SenecaCapabilityMode = SenecaTurnCapabilityMode | "unified";

export const SENECA_UNIFIED_CONTEXT_TYPE = "unified";
export const SENECA_UNIFIED_CAPABILITY_MODE = "unified" as const;

export function isUnifiedConversation(row: {
  contextType: string;
  teamId: string | null;
  capabilityMode: string;
}): boolean {
  return (
    row.contextType === SENECA_UNIFIED_CONTEXT_TYPE &&
    row.teamId === null &&
    row.capabilityMode === SENECA_UNIFIED_CAPABILITY_MODE
  );
}

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

export function capabilityModeForScope(scope: ResolvedSenecaScope): SenecaTurnCapabilityMode {
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

export type SenecaAskLastContext = SenecaContextRef | { type: "workspaces" };

export function contextFromTurnMetadata(metadata: unknown): SenecaAskLastContext | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const resolved = (metadata as { resolvedContext?: unknown }).resolvedContext;
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    return null;
  }
  const record = resolved as { type?: unknown; workspaceId?: unknown };
  if (record.type === "personal") return { type: "personal" };
  if (record.type === "workspaces") return { type: "workspaces" };
  if (record.type === "workspace" && typeof record.workspaceId === "string" && record.workspaceId.trim()) {
    return { type: "workspace", workspaceId: record.workspaceId };
  }
  return null;
}

export function citedWorkspaceIdsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    const context = contextFromTurnMetadata(metadata);
    return context?.type === "workspace" ? [context.workspaceId] : [];
  }
  const record = metadata as { citedWorkspaceIds?: unknown };
  if (Array.isArray(record.citedWorkspaceIds)) {
    const ids = record.citedWorkspaceIds.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );
    if (ids.length > 0) return [...new Set(ids)];
  }
  const context = contextFromTurnMetadata(metadata);
  return context?.type === "workspace" ? [context.workspaceId] : [];
}

export function turnCapabilityModeFromMetadata(
  metadata: unknown,
): SenecaTurnCapabilityMode | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const mode = (metadata as { turnCapabilityMode?: unknown }).turnCapabilityMode;
  if (mode === "personal" || mode === "member" || mode === "manager") return mode;
  return null;
}

export async function historyTurnStillAuthorized(
  userId: string,
  metadata: unknown,
  db: PrismaClient,
): Promise<boolean> {
  const workspaceIds = citedWorkspaceIdsFromMetadata(metadata);
  const mode = turnCapabilityModeFromMetadata(metadata);
  if (workspaceIds.length === 0) {
    if (mode === "manager") return false;
    return true;
  }
  for (const workspaceId of workspaceIds) {
    const resolution = await resolveSenecaScope(
      userId,
      { type: "workspace", workspaceId },
      db,
    );
    if (!resolution.ok || resolution.scope.type !== "workspace") return false;
    if (mode === "manager" && !resolution.scope.capabilities.canUseManagerContext) {
      return false;
    }
  }
  return true;
}

export function lastResolvedContextFromMessages(
  messages: Array<{ metadata: unknown }>,
): SenecaAskLastContext | null {
  for (const message of messages) {
    const context = contextFromTurnMetadata(message.metadata);
    if (context) return context;
  }
  return null;
}

export function withResolvedScopeMetadata(
  metadata: Prisma.InputJsonValue | undefined,
  context: SenecaAskLastContext,
  capabilityMode: SenecaTurnCapabilityMode,
  extra?: { name?: string; citedWorkspaceIds?: string[] },
): Prisma.InputJsonValue {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const resolvedContext =
    context.type === "personal"
      ? { type: "personal" as const, name: "Personal" as const }
      : context.type === "workspaces"
        ? { type: "workspaces" as const, name: extra?.name ?? "your workspaces" }
        : { type: "workspace" as const, workspaceId: context.workspaceId, name: extra?.name ?? "Workspace" };
  const citedWorkspaceIds =
    extra?.citedWorkspaceIds ??
    (context.type === "workspace" ? [context.workspaceId] : []);
  return JSON.parse(
    JSON.stringify({
      ...base,
      resolvedContext,
      turnCapabilityMode: capabilityMode,
      citedWorkspaceIds,
    }),
  ) as Prisma.InputJsonValue;
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
  if (isUnifiedConversation(row)) {
    return {
      ok: true,
      scope: { type: "personal", userId },
      capabilityMode: SENECA_UNIFIED_CAPABILITY_MODE,
    };
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
  const turnTeamId = input.context.type === "workspace" ? input.context.workspaceId : null;
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
    if (!existing) {
      throw new SenecaConversationError("Conversation not found", "NOT_FOUND", 404);
    }
    const unified = isUnifiedConversation(existing);
    if (
      !unified &&
      (existing.teamId !== turnTeamId ||
        existing.contextType !== input.context.type ||
        existing.capabilityMode !== input.capabilityMode)
    ) {
      throw new SenecaConversationError("Conversation not found", "NOT_FOUND", 404);
    }
  } else {
    const created = await db.senecaConversation.create({
      data: {
        userId: input.userId,
        teamId: null,
        contextType: SENECA_UNIFIED_CONTEXT_TYPE,
        capabilityMode: SENECA_UNIFIED_CAPABILITY_MODE,
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
  context?: SenecaContextRef;
  capabilityMode?: SenecaCapabilityMode;
  unified?: boolean;
};

function continuationWhere(
  conversationId: string,
  expected: SenecaConversationContinuationExpected,
) {
  if (expected.unified) {
    return {
      id: conversationId,
      userId: expected.userId,
      expiresAt: { gt: new Date() },
    };
  }
  const teamId =
    expected.context?.type === "workspace" ? expected.context.workspaceId : null;
  return {
    id: conversationId,
    userId: expected.userId,
    contextType: expected.context?.type,
    teamId,
    capabilityMode: expected.capabilityMode,
    expiresAt: { gt: new Date() },
  };
}

export async function loadSenecaConversationHistory(
  conversationId: string | undefined,
  expected: SenecaConversationContinuationExpected,
  clientMessages: Array<{ role: "user" | "assistant"; content: string }>,
  db: PrismaClient = prisma,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  if (!conversationId) return clientMessages;
  const row = await db.senecaConversation.findFirst({
    where: continuationWhere(conversationId, expected),
    select: {
      messages: {
        orderBy: { order: "desc" },
        take: SENECA_CONVERSATION_HISTORY_LIMIT,
        select: { role: true, text: true, metadata: true },
      },
    },
  });
  if (!row) {
    throw new SenecaConversationError("Conversation not found", "NOT_FOUND", 404);
  }
  const chronological = row.messages.slice().reverse();
  const allowed: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of chronological) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const ok = await historyTurnStillAuthorized(expected.userId, message.metadata, db);
    if (!ok) continue;
    allowed.push({ role: message.role, content: message.text });
  }
  return allowed;
}

export async function loadSenecaConversationForAsk(
  conversationId: string | undefined,
  userId: string,
  db: PrismaClient = prisma,
): Promise<{
  id: string;
  contextType: string;
  teamId: string | null;
  capabilityMode: string;
  unified: boolean;
  lastContext: SenecaAskLastContext | null;
} | null> {
  if (!conversationId) return null;
  const row = await db.senecaConversation.findFirst({
    where: {
      id: conversationId,
      userId,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      contextType: true,
      teamId: true,
      capabilityMode: true,
      messages: {
        orderBy: { order: "desc" },
        take: SENECA_CONVERSATION_HISTORY_LIMIT,
        select: { metadata: true },
      },
    },
  });
  if (!row) {
    throw new SenecaConversationError("Conversation not found", "NOT_FOUND", 404);
  }
  const unified = isUnifiedConversation(row);
  const lastContext = unified
    ? lastResolvedContextFromMessages(row.messages)
    : contextForConversation(row);
  return {
    id: row.id,
    contextType: row.contextType,
    teamId: row.teamId,
    capabilityMode: row.capabilityMode,
    unified,
    lastContext,
  };
}

export async function assertSenecaConversationContinuation(
  conversationId: string | undefined,
  expected: SenecaConversationContinuationExpected,
  db: PrismaClient = prisma,
): Promise<void> {
  if (!conversationId) return;
  const row = await db.senecaConversation.findFirst({
    where: continuationWhere(conversationId, expected),
    select: { id: true },
  });
  if (!row) {
    throw new SenecaConversationError("Conversation not found", "NOT_FOUND", 404);
  }
}
