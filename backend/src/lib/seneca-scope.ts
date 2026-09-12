import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { SenecaContextOption, SenecaContextRef } from "../types";
import { prisma } from "../prisma";
import { getWorkspaceAccess, type WorkspaceAccessState } from "./workspace-access";
import {
  canAccessWorkspaceManagerInsights,
  canManageCheckIns,
  canManageWorkspaceTasks,
} from "./workspace-role-policy";
import {
  SENECA_ATTACHMENT_REVIEW_PROMPT,
  senecaAttachmentSchema,
} from "./seneca-attachments";

export const SENECA_CONVERSATION_HISTORY_LIMIT = 40;

export const senecaChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4000),
  })
  .strict();

export const senecaContextRefSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("personal") }).strict(),
  z.object({
    type: z.literal("workspace"),
    workspaceId: z.string().trim().min(1),
  }).strict(),
]);

export const senecaAskBodySchema = z
  .object({
    context: senecaContextRefSchema.optional(),
    question: z.string().trim().max(1000).optional(),
    attachment: senecaAttachmentSchema.optional(),
    messages: z.array(senecaChatMessageSchema).max(40).optional().default([]),
    conversationId: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.question && !value.attachment) {
      ctx.addIssue({
        code: "custom",
        path: ["question"],
        message: "Ask Seneca a question or attach a file",
      });
    }
  });

export type SenecaValidatedAsk = z.infer<typeof senecaAskBodySchema>;

export function resolveSenecaQuestion(input: SenecaValidatedAsk): string {
  return input.question || SENECA_ATTACHMENT_REVIEW_PROMPT;
}

export type SenecaRoleCapabilities = {
  canUseWorkspaceSeneca: boolean;
  canUseManagerContext: boolean;
  canReceiveManagerProposals: boolean;
};

export type ResolvedSenecaScope =
  | { type: "personal"; userId: string }
  | {
      type: "workspace";
      userId: string;
      workspaceId: string;
      role: string;
      access: WorkspaceAccessState;
      capabilities: SenecaRoleCapabilities;
    };

export type SenecaScopeResolution =
  | { ok: true; scope: ResolvedSenecaScope }
  | {
      ok: false;
      status: 403;
      code: "FORBIDDEN" | "SENECA_UNAVAILABLE";
      message: string;
    };

export function senecaRoleCapabilities(role: string): SenecaRoleCapabilities {
  return {
    canUseWorkspaceSeneca: true,
    canUseManagerContext: canAccessWorkspaceManagerInsights(role),
    canReceiveManagerProposals:
      canManageCheckIns(role) && canManageWorkspaceTasks(role),
  };
}

export function workspaceHasSenecaEntitlement(access: {
  hasTeamFeatures: boolean;
}): boolean {
  return access.hasTeamFeatures;
}

export async function resolveSenecaScope(
  userId: string,
  context: SenecaContextRef,
  db: PrismaClient = prisma,
): Promise<SenecaScopeResolution> {
  if (context.type === "personal") {
    return { ok: true, scope: { type: "personal", userId } };
  }

  const [membership, access] = await Promise.all([
    db.teamMember.findUnique({
      where: {
        userId_teamId: { userId, teamId: context.workspaceId },
      },
      select: { role: true },
    }),
    getWorkspaceAccess(context.workspaceId, new Date(), db),
  ]);
  if (!membership) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Workspace membership required",
    };
  }
  if (!workspaceHasSenecaEntitlement(access)) {
    return {
      ok: false,
      status: 403,
      code: "SENECA_UNAVAILABLE",
      message: "Seneca is not available for this workspace",
    };
  }

  return {
    ok: true,
    scope: {
      type: "workspace",
      userId,
      workspaceId: context.workspaceId,
      role: membership.role,
      access,
      capabilities: senecaRoleCapabilities(membership.role),
    },
  };
}

export function validateSenecaContextRef(value: unknown): SenecaContextRef | null {
  const parsed = senecaContextRefSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function listSenecaContextOptions(
  userId: string,
  db: PrismaClient = prisma,
): Promise<SenecaContextOption[]> {
  const memberships = await db.teamMember.findMany({
    where: { userId },
    select: {
      role: true,
      teamId: true,
      team: { select: { name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  const access = await Promise.all(
    memberships.map((membership) =>
      getWorkspaceAccess(membership.teamId, new Date(), db),
    ),
  );
  return [
    { type: "personal", name: "Personal", available: true },
    ...memberships.map((membership, index) => ({
      type: "workspace" as const,
      workspaceId: membership.teamId,
      name: membership.team.name,
      role: membership.role,
      available: workspaceHasSenecaEntitlement(
        access[index] ?? { hasTeamFeatures: false },
      ),
    })),
  ];
}

export function formatSenecaConversation(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  question: string,
  userLabel = "User",
): string {
  const prior = messages.slice(-SENECA_CONVERSATION_HISTORY_LIMIT);
  const lines = prior.map((message) =>
    message.role === "user" ? `${userLabel}: ${message.content}` : `Seneca: ${message.content}`,
  );
  lines.push(`${userLabel}: ${question}`);
  return prior.length === 0
    ? `${userLabel} question: "${question}"`
    : `This is a continuing conversation. Use earlier turns for names, decisions, and context. Answer the latest ${userLabel.toLowerCase()} message without ignoring what came before.\n\nConversation:\n${lines.join("\n")}`;
}
