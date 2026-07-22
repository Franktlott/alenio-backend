import { prisma } from "../../prisma";
import { MODULE_DEFINITIONS } from "../workspace-modules";

const ORG_GO_ADMIN_ROLES = new Set(["org_owner", "org_admin"]);

export type OrgModulePermissionFlags = {
  allowScheduleEdits: boolean;
  allowEquipmentAdditions: boolean;
  allowLocalNotes: boolean;
  allowLocalNotifications: boolean;
  allowTemplateEdits: boolean;
};

const DEFAULT_PERMISSIONS: OrgModulePermissionFlags = {
  allowScheduleEdits: true,
  allowEquipmentAdditions: true,
  allowLocalNotes: true,
  allowLocalNotifications: true,
  allowTemplateEdits: false,
};

export async function requireEnterpriseOrgAdmin(userId: string, organizationId: string) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  if (!membership || !ORG_GO_ADMIN_ROLES.has(membership.role)) return null;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, accountType: true, status: true, workspaceLimit: true },
  });
  if (!org || org.accountType !== "enterprise" || org.status !== "active") return null;
  return { membership, org };
}

function serializeModule(
  mod: {
    id: string;
    organizationId: string;
    moduleKey: string;
    moduleName: string;
    status: string;
    defaultsJson: unknown;
    createdAt: Date;
    updatedAt: Date;
    assignments?: Array<{
      id: string;
      scope: string;
      allowScheduleEdits: boolean;
      allowEquipmentAdditions: boolean;
      allowLocalNotes: boolean;
      allowLocalNotifications: boolean;
      allowTemplateEdits: boolean;
      teams: Array<{ teamId: string; team: { id: string; name: string } }>;
    }>;
  },
) {
  const assignment = mod.assignments?.[0] ?? null;
  return {
    id: mod.id,
    organizationId: mod.organizationId,
    moduleKey: mod.moduleKey,
    moduleName: mod.moduleName,
    status: mod.status,
    defaults: (mod.defaultsJson as Record<string, unknown>) ?? {},
    createdAt: mod.createdAt.toISOString(),
    updatedAt: mod.updatedAt.toISOString(),
    assignment: assignment
      ? {
          id: assignment.id,
          scope: assignment.scope as "organization" | "workspaces",
          teamIds: assignment.teams.map((t) => t.teamId),
          teams: assignment.teams.map((t) => ({ id: t.team.id, name: t.team.name })),
          permissions: {
            allowScheduleEdits: assignment.allowScheduleEdits,
            allowEquipmentAdditions: assignment.allowEquipmentAdditions,
            allowLocalNotes: assignment.allowLocalNotes,
            allowLocalNotifications: assignment.allowLocalNotifications,
            allowTemplateEdits: assignment.allowTemplateEdits,
          } satisfies OrgModulePermissionFlags,
        }
      : null,
  };
}

const moduleInclude = {
  assignments: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: {
      teams: { include: { team: { select: { id: true, name: true } } } },
    },
  },
};

export async function getOrgGoOverview(organizationId: string) {
  const [workspaceCount, modules, libraryCount] = await Promise.all([
    prisma.team.count({ where: { organizationId } }),
    prisma.organizationModule.findMany({
      where: { organizationId },
      include: moduleInclude,
      orderBy: { moduleName: "asc" },
    }),
    prisma.walkLibraryItem.count({
      where: { organizationId, status: "ACTIVE" },
    }),
  ]);

  const published = modules.filter((m) => m.status === "published");
  let assignedWorkspaceIds = new Set<string>();
  for (const mod of published) {
    const a = mod.assignments[0];
    if (!a) continue;
    if (a.scope === "organization") {
      const teams = await prisma.team.findMany({
        where: { organizationId },
        select: { id: true },
      });
      teams.forEach((t) => assignedWorkspaceIds.add(t.id));
    } else {
      a.teams.forEach((t) => assignedWorkspaceIds.add(t.teamId));
    }
  }

  return {
    workspaceCount,
    libraryItemCount: libraryCount,
    moduleCount: modules.length,
    publishedModuleCount: published.length,
    workspacesWithAssignments: assignedWorkspaceIds.size,
    modules: modules.map(serializeModule),
  };
}

export async function listOrgGoModules(organizationId: string) {
  const rows = await prisma.organizationModule.findMany({
    where: { organizationId },
    include: moduleInclude,
    orderBy: { moduleName: "asc" },
  });
  return rows.map(serializeModule);
}

export async function upsertOrgGoModule(input: {
  organizationId: string;
  moduleKey: string;
  moduleName?: string;
  status?: "draft" | "published" | "archived";
  defaults?: Record<string, unknown>;
}) {
  const def = MODULE_DEFINITIONS.find((m) => m.moduleKey === input.moduleKey);
  if (!def && input.moduleKey !== "temp-checks") {
    return { ok: false as const, code: "UNKNOWN_MODULE" as const };
  }
  const moduleName = input.moduleName?.trim() || def?.moduleName || "Temperature Checks";
  const status = input.status ?? "draft";

  const row = await prisma.organizationModule.upsert({
    where: {
      organizationId_moduleKey: {
        organizationId: input.organizationId,
        moduleKey: input.moduleKey,
      },
    },
    create: {
      organizationId: input.organizationId,
      moduleKey: input.moduleKey,
      moduleName,
      status,
      defaultsJson: input.defaults ?? {},
    },
    update: {
      moduleName,
      ...(input.status ? { status: input.status } : {}),
      ...(input.defaults ? { defaultsJson: input.defaults } : {}),
    },
    include: moduleInclude,
  });
  return { ok: true as const, module: serializeModule(row) };
}

export async function setOrgModuleAssignment(input: {
  organizationId: string;
  organizationModuleId: string;
  scope: "organization" | "workspaces";
  teamIds?: string[];
  permissions?: Partial<OrgModulePermissionFlags>;
}) {
  const mod = await prisma.organizationModule.findFirst({
    where: { id: input.organizationModuleId, organizationId: input.organizationId },
  });
  if (!mod) return { ok: false as const, code: "NOT_FOUND" as const };

  const perms = { ...DEFAULT_PERMISSIONS, ...input.permissions };
  let teamIds = input.teamIds ?? [];

  if (input.scope === "workspaces") {
    const valid = await prisma.team.findMany({
      where: { organizationId: input.organizationId, id: { in: teamIds } },
      select: { id: true },
    });
    teamIds = valid.map((t) => t.id);
  } else {
    teamIds = [];
  }

  const existing = await prisma.organizationModuleAssignment.findFirst({
    where: { organizationModuleId: mod.id },
    orderBy: { createdAt: "desc" },
  });

  const assignment = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.organizationModuleAssignmentTeam.deleteMany({ where: { assignmentId: existing.id } });
      const updated = await tx.organizationModuleAssignment.update({
        where: { id: existing.id },
        data: {
          scope: input.scope,
          allowScheduleEdits: perms.allowScheduleEdits,
          allowEquipmentAdditions: perms.allowEquipmentAdditions,
          allowLocalNotes: perms.allowLocalNotes,
          allowLocalNotifications: perms.allowLocalNotifications,
          allowTemplateEdits: perms.allowTemplateEdits,
          teams:
            input.scope === "workspaces"
              ? { create: teamIds.map((teamId) => ({ teamId })) }
              : undefined,
        },
        include: {
          teams: { include: { team: { select: { id: true, name: true } } } },
        },
      });
      return updated;
    }
    return tx.organizationModuleAssignment.create({
      data: {
        organizationModuleId: mod.id,
        scope: input.scope,
        allowScheduleEdits: perms.allowScheduleEdits,
        allowEquipmentAdditions: perms.allowEquipmentAdditions,
        allowLocalNotes: perms.allowLocalNotes,
        allowLocalNotifications: perms.allowLocalNotifications,
        allowTemplateEdits: perms.allowTemplateEdits,
        teams:
          input.scope === "workspaces"
            ? { create: teamIds.map((teamId) => ({ teamId })) }
            : undefined,
      },
      include: {
        teams: { include: { team: { select: { id: true, name: true } } } },
      },
    });
  });

  await syncWorkspaceModulesFromAssignment({
    organizationId: input.organizationId,
    organizationModule: mod,
    assignment,
  });

  const refreshed = await prisma.organizationModule.findUnique({
    where: { id: mod.id },
    include: moduleInclude,
  });
  return { ok: true as const, module: serializeModule(refreshed!) };
}

async function syncWorkspaceModulesFromAssignment(input: {
  organizationId: string;
  organizationModule: { id: string; moduleKey: string; moduleName: string };
  assignment: {
    scope: string;
    teams: Array<{ teamId: string }>;
  };
}) {
  let targetTeamIds: string[] = [];
  if (input.assignment.scope === "organization") {
    const teams = await prisma.team.findMany({
      where: { organizationId: input.organizationId },
      select: { id: true },
    });
    targetTeamIds = teams.map((t) => t.id);
  } else {
    targetTeamIds = input.assignment.teams.map((t) => t.teamId);
  }

  for (const teamId of targetTeamIds) {
    await prisma.workspaceModule.upsert({
      where: {
        teamId_moduleKey: { teamId, moduleKey: input.organizationModule.moduleKey },
      },
      create: {
        teamId,
        companyId: teamId,
        moduleKey: input.organizationModule.moduleKey,
        moduleName: input.organizationModule.moduleName,
        status: "inactive",
        organizationModuleId: input.organizationModule.id,
      },
      update: {
        moduleName: input.organizationModule.moduleName,
        organizationModuleId: input.organizationModule.id,
      },
    });
  }
}

/** Resolve assignment permissions for a workspace + module key (enterprise). */
export async function getWorkspaceModuleAssignmentPermissions(
  teamId: string,
  moduleKey: string,
): Promise<(OrgModulePermissionFlags & { organizationModuleId: string; assigned: true }) | { assigned: false }> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      organizationId: true,
      organization: { select: { accountType: true } },
    },
  });
  if (!team?.organizationId || team.organization?.accountType !== "enterprise") {
    return { assigned: false };
  }

  const orgMod = await prisma.organizationModule.findUnique({
    where: {
      organizationId_moduleKey: {
        organizationId: team.organizationId,
        moduleKey,
      },
    },
    include: {
      assignments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { teams: true },
      },
    },
  });
  if (!orgMod || orgMod.status === "archived") return { assigned: false };
  const a = orgMod.assignments[0];
  if (!a) return { assigned: false };

  const inScope =
    a.scope === "organization" || a.teams.some((t) => t.teamId === teamId);
  if (!inScope) return { assigned: false };

  return {
    assigned: true,
    organizationModuleId: orgMod.id,
    allowScheduleEdits: a.allowScheduleEdits,
    allowEquipmentAdditions: a.allowEquipmentAdditions,
    allowLocalNotes: a.allowLocalNotes,
    allowLocalNotifications: a.allowLocalNotifications,
    allowTemplateEdits: a.allowTemplateEdits,
  };
}

export async function listAssignedModulesForWorkspace(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      organizationId: true,
      organization: { select: { accountType: true } },
    },
  });
  if (!team?.organizationId || team.organization?.accountType !== "enterprise") {
    return { enterprise: false as const, modules: [] as ReturnType<typeof serializeModule>[] };
  }

  const orgMods = await prisma.organizationModule.findMany({
    where: {
      organizationId: team.organizationId,
      status: { in: ["draft", "published"] },
    },
    include: moduleInclude,
  });

  const modules = [];
  for (const mod of orgMods) {
    const a = mod.assignments[0];
    if (!a) continue;
    const inScope =
      a.scope === "organization" || a.teams.some((t) => t.teamId === teamId);
    if (!inScope) continue;
    modules.push({
      ...serializeModule(mod),
      workspacePermissions: {
        allowScheduleEdits: a.allowScheduleEdits,
        allowEquipmentAdditions: a.allowEquipmentAdditions,
        allowLocalNotes: a.allowLocalNotes,
        allowLocalNotifications: a.allowLocalNotifications,
        allowTemplateEdits: a.allowTemplateEdits,
      },
    });
  }

  return { enterprise: true as const, modules };
}
