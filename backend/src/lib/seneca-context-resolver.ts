import type { SenecaContextRef } from "../types";

export type SenecaResolverWorkspace = {
  workspaceId: string;
  name: string;
  available: boolean;
};

export type SenecaClarifyOption =
  | { type: "personal"; name: "Personal" }
  | { type: "workspace"; workspaceId: string; name: string };

export type SenecaResolvedAskContext =
  | {
      kind: "resolved";
      context: SenecaContextRef;
      name: string;
    }
  | {
      kind: "clarify";
      prompt: string;
      options: SenecaClarifyOption[];
    };

const WORK_LANGUAGE =
  /\b(tasks?|to-?dos?|overdue|check-?ins?|the team|my team|our team|workspace|roster|one-?on-?ones?|1:1s?|goals?|assignments?|calendar|who's behind|who is behind)\b/i;

const PERSONAL_SWITCH =
  /\b(personal|for me personally|my personal|outside (of )?work|my sleep|my mood|my life|switch to personal|use personal)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function workspaceNameMentioned(question: string, name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?:$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(question);
}

export function entitledWorkspaces(
  workspaces: SenecaResolverWorkspace[],
): SenecaResolverWorkspace[] {
  return workspaces.filter((workspace) => workspace.available);
}

export function namedEntitledWorkspaces(
  question: string,
  workspaces: SenecaResolverWorkspace[],
): SenecaResolverWorkspace[] {
  return entitledWorkspaces(workspaces).filter((workspace) =>
    workspaceNameMentioned(question, workspace.name),
  );
}

function personalResult(): SenecaResolvedAskContext {
  return {
    kind: "resolved",
    context: { type: "personal" },
    name: "Personal",
  };
}

function workspaceResult(workspace: SenecaResolverWorkspace): SenecaResolvedAskContext {
  return {
    kind: "resolved",
    context: { type: "workspace", workspaceId: workspace.workspaceId },
    name: workspace.name,
  };
}

function clarifyWorkspaces(
  workspaces: SenecaResolverWorkspace[],
  prompt: string,
): SenecaResolvedAskContext {
  return {
    kind: "clarify",
    prompt,
    options: workspaces.map((workspace) => ({
      type: "workspace" as const,
      workspaceId: workspace.workspaceId,
      name: workspace.name,
    })),
  };
}

export function contextFromHint(
  hint: SenecaContextRef | null | undefined,
  workspaces: SenecaResolverWorkspace[],
): SenecaContextRef | null {
  if (!hint) return null;
  if (hint.type === "personal") return hint;
  const workspace = entitledWorkspaces(workspaces).find(
    (item) => item.workspaceId === hint.workspaceId,
  );
  return workspace
    ? { type: "workspace", workspaceId: workspace.workspaceId }
    : null;
}

function nameForContext(
  context: SenecaContextRef,
  workspaces: SenecaResolverWorkspace[],
): string {
  if (context.type === "personal") return "Personal";
  return (
    workspaces.find((workspace) => workspace.workspaceId === context.workspaceId)
      ?.name ?? "Workspace"
  );
}

export function resolveSenecaAskContext(input: {
  question: string;
  workspaces: SenecaResolverWorkspace[];
  hint?: SenecaContextRef | null;
  lastContext?: SenecaContextRef | null;
}): SenecaResolvedAskContext {
  const available = entitledWorkspaces(input.workspaces);
  const named = namedEntitledWorkspaces(input.question, available);

  if (named.length === 1) {
    return workspaceResult(named[0]!);
  }
  if (named.length > 1) {
    return clarifyWorkspaces(
      named,
      "Which workspace should I use for this?",
    );
  }

  if (PERSONAL_SWITCH.test(input.question)) {
    return personalResult();
  }

  if (input.lastContext) {
    if (input.lastContext.type === "personal") return personalResult();
    const lastWorkspaceId = input.lastContext.workspaceId;
    const lastWorkspace = available.find(
      (workspace) => workspace.workspaceId === lastWorkspaceId,
    );
    if (lastWorkspace) return workspaceResult(lastWorkspace);
  }

  const hinted = contextFromHint(input.hint, input.workspaces);
  if (hinted) {
    return {
      kind: "resolved",
      context: hinted,
      name: nameForContext(hinted, input.workspaces),
    };
  }

  if (WORK_LANGUAGE.test(input.question)) {
    if (available.length === 1) return workspaceResult(available[0]!);
    if (available.length > 1) {
      return clarifyWorkspaces(
        available,
        "Which workspace should I use for this?",
      );
    }
  }

  return personalResult();
}
