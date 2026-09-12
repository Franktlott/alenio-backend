import type { PrismaClient } from "@prisma/client";
import type { SenecaContextOption, SenecaContextRef } from "../types";
import { prisma } from "../prisma";
import {
  resolveSenecaAskContext,
  type SenecaClarifyOption,
  type SenecaResolverWorkspace,
} from "./seneca-context-resolver";
import {
  capabilityModeForScope,
  contextForConversation,
  loadSenecaConversationForAsk,
  SenecaConversationError,
  type SenecaTurnCapabilityMode,
} from "./seneca-conversations";
import {
  listSenecaContextOptions,
  resolveSenecaScope,
  type ResolvedSenecaScope,
  type SenecaScopeResolution,
} from "./seneca-scope";

export type SenecaRequestScopeResult =
  | {
      ok: true;
      kind: "resolved";
      context: SenecaContextRef;
      name: string;
      scope: ResolvedSenecaScope;
      capabilityMode: SenecaTurnCapabilityMode;
      unified: boolean;
      options: SenecaContextOption[];
    }
  | {
      ok: true;
      kind: "all_authorized";
      name: string;
      unified: true;
      options: SenecaContextOption[];
    }
  | {
      ok: true;
      kind: "clarify";
      prompt: string;
      clarifyOptions: SenecaClarifyOption[];
      unified: true;
      options: SenecaContextOption[];
    }
  | Extract<SenecaScopeResolution, { ok: false }>;

function workspaceMeta(options: SenecaContextOption[]): SenecaResolverWorkspace[] {
  return options.flatMap((option) =>
    option.type === "workspace"
      ? [
          {
            workspaceId: option.workspaceId,
            name: option.name,
            available: option.available,
          },
        ]
      : [],
  );
}

function displayName(
  context: SenecaContextRef,
  options: SenecaContextOption[],
): string {
  if (context.type === "personal") return "Personal";
  return (
    options.find(
      (option) =>
        option.type === "workspace" && option.workspaceId === context.workspaceId,
    )?.name ?? "Workspace"
  );
}

export async function resolveSenecaRequestScope(input: {
  userId: string;
  question: string;
  conversationId?: string;
  hint?: SenecaContextRef;
  preferLastOnClarify?: boolean;
  db?: PrismaClient;
}): Promise<SenecaRequestScopeResult> {
  const db = input.db ?? prisma;
  const options = await listSenecaContextOptions(input.userId, db);
  const conversation = await loadSenecaConversationForAsk(
    input.conversationId,
    input.userId,
    db,
  );

  if (conversation && !conversation.unified) {
    const frozen = contextForConversation(conversation);
    if (!frozen) {
      throw new SenecaConversationError("Conversation not found", "NOT_FOUND", 404);
    }
    const resolution = await resolveSenecaScope(input.userId, frozen, db);
    if (!resolution.ok) return resolution;
    return {
      ok: true,
      kind: "resolved",
      context: frozen,
      name: displayName(frozen, options),
      scope: resolution.scope,
      capabilityMode: capabilityModeForScope(resolution.scope),
      unified: false,
      options,
    };
  }

  const routed = resolveSenecaAskContext({
    question: input.question,
    workspaces: workspaceMeta(options),
    hint: input.hint,
    lastContext: conversation?.lastContext ?? null,
  });

  if (routed.kind === "all_authorized") {
    return {
      ok: true,
      kind: "all_authorized",
      name: routed.name,
      unified: true,
      options,
    };
  }

  if (routed.kind === "clarify") {
    if (input.preferLastOnClarify && conversation?.lastContext) {
      const last = conversation.lastContext;
      if (last.type === "workspaces") {
        return {
          ok: true,
          kind: "all_authorized",
          name: "your workspaces",
          unified: true,
          options,
        };
      }
      const resolution = await resolveSenecaScope(input.userId, last, db);
      if (resolution.ok) {
        return {
          ok: true,
          kind: "resolved",
          context: last,
          name: displayName(last, options),
          scope: resolution.scope,
          capabilityMode: capabilityModeForScope(resolution.scope),
          unified: true,
          options,
        };
      }
    }
    return {
      ok: true,
      kind: "clarify",
      prompt: routed.prompt,
      clarifyOptions: routed.options,
      unified: true,
      options,
    };
  }

  const resolution = await resolveSenecaScope(input.userId, routed.context, db);
  if (!resolution.ok) return resolution;

  return {
    ok: true,
    kind: "resolved",
    context: routed.context,
    name: routed.name,
    scope: resolution.scope,
    capabilityMode: capabilityModeForScope(resolution.scope),
    unified: true,
    options,
  };
}

export function resolvedContextPayload(
  context: SenecaContextRef | { type: "workspaces" },
  name: string,
):
  | { type: "personal"; name: "Personal" }
  | { type: "workspace"; workspaceId: string; name: string }
  | { type: "workspaces"; name: string } {
  if (context.type === "personal") {
    return { type: "personal", name: "Personal" };
  }
  if (context.type === "workspaces") {
    return { type: "workspaces", name };
  }
  return { type: "workspace", workspaceId: context.workspaceId, name };
}
