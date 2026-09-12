import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { authorize, AUTHZ_CROSS_ORG_MESSAGE, type AuthzActor } from "./authorization";
import { loadWorkspaceMembership } from "./authorization/loaders";
import { senecaRoleCapabilities, type SenecaRoleCapabilities } from "./seneca-scope";

export type SenecaToolScopeMode = "current" | "selected" | "all_authorized";

export type SenecaAuthorizedWorkspace = {
  workspaceId: string;
  name: string;
  position: string | null;
  organizationId: string | null;
  capabilities: SenecaRoleCapabilities;
};

export type SenecaToolScopeResult =
  | { ok: true; workspaces: SenecaAuthorizedWorkspace[] }
  | {
      ok: false;
      code: "POLICY_UNDEFINED" | "NOT_FOUND";
      message: string;
    };

function orgKey(organizationId: string | null): string {
  return organizationId ?? "__unaffiliated__";
}

async function loadEntitledWorkspace(
  actor: AuthzActor,
  workspaceId: string,
  position: string | null,
  db: PrismaClient,
): Promise<SenecaAuthorizedWorkspace | null> {
  const gate = await authorize({
    actor,
    action: "seneca.use",
    resource: { type: "workspace", id: workspaceId },
    db,
  });
  if (!gate.allow) return null;
  const membership = await loadWorkspaceMembership(actor.userId, workspaceId, db);
  if (!membership) return null;
  const team = await db.team.findUnique({
    where: { id: workspaceId },
    select: { name: true, organizationId: true },
  });
  if (!team) return null;
  return {
    workspaceId,
    name: team.name,
    position,
    organizationId: team.organizationId ?? membership.organizationId,
    capabilities: senecaRoleCapabilities(membership.role),
  };
}

export function sameOrganizationGroup(
  workspaces: Array<{ organizationId: string | null }>,
): boolean {
  if (workspaces.length === 0) return true;
  const keys = new Set(workspaces.map((row) => orgKey(row.organizationId)));
  return keys.size === 1;
}

export async function resolveSenecaToolScope(input: {
  actor: AuthzActor;
  mode: SenecaToolScopeMode;
  currentWorkspaceId?: string | null;
  selectedWorkspaceIds?: string[];
  db?: PrismaClient;
}): Promise<SenecaToolScopeResult> {
  const db = input.db ?? prisma;
  const user = await db.user.findUnique({
    where: { id: input.actor.userId },
    select: { profileTitle: true },
  });
  const position = user?.profileTitle ?? null;

  if (input.mode === "current") {
    const workspaceId = input.currentWorkspaceId?.trim();
    if (!workspaceId) {
      return { ok: false, code: "NOT_FOUND", message: "Not found" };
    }
    const workspace = await loadEntitledWorkspace(input.actor, workspaceId, position, db);
    if (!workspace) return { ok: false, code: "NOT_FOUND", message: "Not found" };
    return { ok: true, workspaces: [workspace] };
  }

  if (input.mode === "selected") {
    const ids = [...new Set((input.selectedWorkspaceIds ?? []).filter(Boolean))];
    if (ids.length === 0) {
      return { ok: false, code: "NOT_FOUND", message: "Not found" };
    }
    const loaded: SenecaAuthorizedWorkspace[] = [];
    for (const id of ids) {
      const workspace = await loadEntitledWorkspace(input.actor, id, position, db);
      if (!workspace) return { ok: false, code: "NOT_FOUND", message: "Not found" };
      loaded.push(workspace);
    }
    if (!sameOrganizationGroup(loaded)) {
      return { ok: false, code: "POLICY_UNDEFINED", message: AUTHZ_CROSS_ORG_MESSAGE };
    }
    return { ok: true, workspaces: loaded };
  }

  const memberships = await db.teamMember.findMany({
    where: { userId: input.actor.userId },
    select: { teamId: true },
  });
  const loaded: SenecaAuthorizedWorkspace[] = [];
  for (const row of memberships) {
    const workspace = await loadEntitledWorkspace(input.actor, row.teamId, position, db);
    if (workspace) loaded.push(workspace);
  }
  if (!sameOrganizationGroup(loaded)) {
    return { ok: false, code: "POLICY_UNDEFINED", message: AUTHZ_CROSS_ORG_MESSAGE };
  }
  return { ok: true, workspaces: loaded };
}

export function senecaWorkspacePromptCards(
  workspaces: SenecaAuthorizedWorkspace[],
): Array<{
  workspaceId: string;
  name: string;
  position: string | null;
  capabilities: SenecaRoleCapabilities;
}> {
  return workspaces.map((workspace) => ({
    workspaceId: workspace.workspaceId,
    name: workspace.name,
    position: workspace.position,
    capabilities: workspace.capabilities,
  }));
}
