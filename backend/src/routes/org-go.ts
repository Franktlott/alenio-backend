import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import {
  getOrgGoOverview,
  listOrgGoModules,
  requireEnterpriseOrgAdmin,
  setOrgModuleAssignment,
  upsertOrgGoModule,
} from "../lib/org-go/modules";
import {
  createOrgLibraryItem,
  getOrgLibraryItem,
  listOrgLibraryItems,
  updateOrgLibraryItem,
} from "../lib/org-go/library";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const orgGoRouter = new Hono<{ Variables: Variables }>();

orgGoRouter.get("/:organizationId/go/overview", authGuard, async (c) => {
  const user = c.get("user")!;
  const { organizationId } = c.req.param();
  if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const data = await getOrgGoOverview(organizationId);
  return c.json({ data });
});

orgGoRouter.get("/:organizationId/go/modules", authGuard, async (c) => {
  const user = c.get("user")!;
  const { organizationId } = c.req.param();
  if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const modules = await listOrgGoModules(organizationId);
  return c.json({ data: { modules } });
});

orgGoRouter.post(
  "/:organizationId/go/modules",
  authGuard,
  zValidator(
    "json",
    z.object({
      moduleKey: z.string().trim().min(2).max(64),
      moduleName: z.string().trim().min(2).max(120).optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
      defaults: z.record(z.unknown()).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { organizationId } = c.req.param();
    if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const body = c.req.valid("json");
    const result = await upsertOrgGoModule({
      organizationId,
      moduleKey: body.moduleKey,
      moduleName: body.moduleName,
      status: body.status,
      defaults: body.defaults,
    });
    if (!result.ok) {
      return c.json({ error: { message: "Unknown module key", code: result.code } }, 400);
    }
    return c.json({ data: result.module }, 201);
  },
);

orgGoRouter.patch(
  "/:organizationId/go/modules/:moduleId",
  authGuard,
  zValidator(
    "json",
    z.object({
      moduleName: z.string().trim().min(2).max(120).optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
      defaults: z.record(z.unknown()).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { organizationId, moduleId } = c.req.param();
    if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const existing = await prisma.organizationModule.findFirst({
      where: { id: moduleId, organizationId },
    });
    if (!existing) {
      return c.json({ error: { message: "Module not found", code: "NOT_FOUND" } }, 404);
    }
    const body = c.req.valid("json");
    const result = await upsertOrgGoModule({
      organizationId,
      moduleKey: existing.moduleKey,
      moduleName: body.moduleName ?? existing.moduleName,
      status: body.status,
      defaults: body.defaults,
    });
    if (!result.ok) {
      return c.json({ error: { message: "Could not update module", code: result.code } }, 400);
    }
    return c.json({ data: result.module });
  },
);

orgGoRouter.put(
  "/:organizationId/go/modules/:moduleId/assignment",
  authGuard,
  zValidator(
    "json",
    z.object({
      scope: z.enum(["organization", "workspaces"]),
      teamIds: z.array(z.string()).optional(),
      permissions: z
        .object({
          allowScheduleEdits: z.boolean().optional(),
          allowEquipmentAdditions: z.boolean().optional(),
          allowLocalNotes: z.boolean().optional(),
          allowLocalNotifications: z.boolean().optional(),
          allowTemplateEdits: z.boolean().optional(),
        })
        .optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { organizationId, moduleId } = c.req.param();
    if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const body = c.req.valid("json");
    const result = await setOrgModuleAssignment({
      organizationId,
      organizationModuleId: moduleId,
      scope: body.scope,
      teamIds: body.teamIds,
      permissions: body.permissions,
    });
    if (!result.ok) {
      return c.json({ error: { message: "Module not found", code: result.code } }, 404);
    }
    return c.json({ data: result.module });
  },
);

orgGoRouter.get("/:organizationId/go/library", authGuard, async (c) => {
  const user = c.get("user")!;
  const { organizationId } = c.req.param();
  if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const q = c.req.query("q") ?? undefined;
  const type = c.req.query("type") ?? undefined;
  const category = c.req.query("category") ?? undefined;
  const status = (c.req.query("status") as "ACTIVE" | "ARCHIVED" | "ALL" | undefined) ?? "ACTIVE";
  const items = await listOrgLibraryItems(organizationId, { q, type, category, status });
  return c.json({ data: { items } });
});

orgGoRouter.get("/:organizationId/go/library/:itemId", authGuard, async (c) => {
  const user = c.get("user")!;
  const { organizationId, itemId } = c.req.param();
  if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const item = await getOrgLibraryItem(organizationId, itemId);
  if (!item) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: { item } });
});

orgGoRouter.post(
  "/:organizationId/go/library",
  authGuard,
  zValidator(
    "json",
    z.object({
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(2000).nullable().optional(),
      category: z.string().trim().max(120).optional(),
      type: z.string().trim().min(2).max(64),
      instructions: z.string().trim().max(4000).nullable().optional(),
      requiredDefault: z.boolean().optional(),
      config: z.unknown().optional(),
      deviceMethods: z.unknown().optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { organizationId } = c.req.param();
    if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const body = c.req.valid("json");
    const result = await createOrgLibraryItem({
      organizationId,
      userId: user.id,
      name: body.name,
      description: body.description,
      category: body.category,
      type: body.type,
      instructions: body.instructions,
      requiredDefault: body.requiredDefault,
      config: body.config,
      deviceMethods: body.deviceMethods,
    });
    if ("error" in result) {
      return c.json({ error: { message: result.message ?? result.error, code: result.error } }, 400);
    }
    return c.json({ data: { item: result.item } }, 201);
  },
);

orgGoRouter.patch(
  "/:organizationId/go/library/:itemId",
  authGuard,
  zValidator(
    "json",
    z.object({
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      category: z.string().trim().max(120).optional(),
      instructions: z.string().trim().max(4000).nullable().optional(),
      requiredDefault: z.boolean().optional(),
      config: z.unknown().optional(),
      deviceMethods: z.unknown().optional(),
      status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { organizationId, itemId } = c.req.param();
    if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const body = c.req.valid("json");
    const result = await updateOrgLibraryItem(organizationId, itemId, user.id, body);
    if ("error" in result) {
      const status = result.error === "NOT_FOUND" ? 404 : 400;
      return c.json({ error: { message: result.message ?? result.error, code: result.error } }, status);
    }
    return c.json({ data: { item: result.item } });
  },
);

orgGoRouter.get("/:organizationId/members", authGuard, async (c) => {
  const user = c.get("user")!;
  const { organizationId } = c.req.param();
  if (!(await requireEnterpriseOrgAdmin(user.id, organizationId))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const [orgMemberships, workspaceMemberships] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamMember.findMany({
      where: { team: { organizationId } },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ team: { name: "asc" } }, { createdAt: "asc" }],
    }),
  ]);

  const members = [
    ...orgMemberships.map((m) => ({
      id: `org:${m.id}`,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
      scope: "organization" as const,
      workspaceId: null as string | null,
      workspaceName: null as string | null,
    })),
    ...workspaceMemberships.map((m) => ({
      id: `team:${m.id}`,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
      scope: "workspace" as const,
      workspaceId: m.team.id,
      workspaceName: m.team.name,
    })),
  ];

  return c.json({ data: { members } });
});

/** Workspace assigned modules live on teams router — see teams.ts */
