import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "../auth";
import { isHttpsUrl, slugifyDiscoverTitle } from "../lib/discover-document";
import {
  ensureHomeWorkspaceSettings,
  loadResolvedHomeWorkspace,
  MAX_HOME_WORKSPACE_CARDS,
} from "../lib/home-workspace-schedule";
import { toHomeWorkspaceCardJson } from "../lib/home-workspace-serialize";
import {
  adminGuard,
  auditStaffChanges,
  requireAbilityByMethod,
} from "../middleware/admin-guard";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const COLOR = z.string().trim().min(1).max(80);

const optionalImage = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .refine(
    (value) =>
      value == null ||
      value === "" ||
      isHttpsUrl(value) ||
      value.startsWith("/insight/") ||
      value.startsWith("http://localhost") ||
      value.startsWith("http://127.0.0.1"),
    "Image must be https:// or an /insight/ path",
  );

const cardBody = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(80).optional(),
  body: z.string().trim().min(1).max(500),
  actionLabel: z.string().trim().min(1).max(80),
  accessibilityLabel: z.string().trim().max(160).optional(),
  imageUrl: optionalImage,
  imageAlt: z.string().trim().max(200).nullable().optional(),
  surfaceColor: COLOR.optional(),
  fadeColors: z.tuple([COLOR, COLOR, COLOR]).optional(),
  borderColor: COLOR.optional(),
  titleColor: COLOR.optional(),
  bodyColor: COLOR.optional(),
  buttonColors: z.tuple([COLOR, COLOR]).optional(),
  destinationType: z.enum(["create", "join"]),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

const reorderBody = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(MAX_HOME_WORKSPACE_CARDS),
});

const scheduleBody = z.object({
  mode: z.enum(["automatic", "manual"]),
  cadence: z.enum(["daily", "weekly"]).optional(),
  pinnedCardId: z.string().trim().min(1).nullable().optional(),
});

function bad(
  c: { json: (body: unknown, status?: number) => Response },
  message: string,
  status = 400,
) {
  return c.json({ error: { message } }, status);
}

function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Check the workspace card fields and try again.";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

function describeChange(method: string, path: string) {
  const id = path.split("/").filter(Boolean).pop() ?? null;
  if (path.endsWith("/reorder")) {
    return { action: "home_workspace.reorder", summary: "Reordered Alenio Workspace cards" };
  }
  if (path.endsWith("/schedule")) {
    return { action: "home_workspace.schedule", summary: "Updated Alenio Workspace card schedule" };
  }
  if (method === "DELETE") {
    return {
      action: "home_workspace.delete",
      summary: "Deleted an Alenio Workspace card",
      targetId: id,
    };
  }
  if (method === "POST") {
    return { action: "home_workspace.create", summary: "Created an Alenio Workspace card" };
  }
  return {
    action: "home_workspace.edit",
    summary: "Saved an Alenio Workspace card",
    targetId: id,
  };
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugifyDiscoverTitle(base).slice(0, 72) || "workspace-card";
  let candidate = root;
  let n = 2;
  while (true) {
    const clash = await prisma.homeWorkspaceCard.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${root}-${n}`;
    n += 1;
  }
}

export const adminHomeWorkspaceRouter = new Hono<{ Variables: Variables }>();

adminHomeWorkspaceRouter.use("*", adminGuard);
adminHomeWorkspaceRouter.use("*", requireAbilityByMethod("content.view", "content.edit"));
adminHomeWorkspaceRouter.use(
  "*",
  auditStaffChanges("home_workspace", describeChange),
);

adminHomeWorkspaceRouter.get("/", async (c) => {
  const resolved = await loadResolvedHomeWorkspace();
  return c.json({ data: resolved });
});

adminHomeWorkspaceRouter.patch("/schedule", async (c) => {
  const parsed = scheduleBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, "Check the schedule fields and try again.");
  const input = parsed.data;
  if (input.mode === "manual") {
    const pinnedId = input.pinnedCardId?.trim() || null;
    if (pinnedId) {
      const card = await prisma.homeWorkspaceCard.findUnique({
        where: { id: pinnedId },
      });
      if (!card || !card.isActive) {
        return bad(c, "Pin an active Alenio Workspace card.");
      }
    }
  }
  const user = c.get("user");
  await ensureHomeWorkspaceSettings();
  await prisma.homeWorkspaceSettings.update({
    where: { id: "default" },
    data: {
      mode: input.mode,
      cadence: input.cadence === "daily" ? "daily" : "weekly",
      pinnedCardId:
        input.mode === "manual" ? input.pinnedCardId?.trim() || null : null,
      updatedById: user?.id ?? null,
    },
  });
  return c.json({ data: await loadResolvedHomeWorkspace() });
});

adminHomeWorkspaceRouter.post("/reorder", async (c) => {
  const parsed = reorderBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, "Send the card ids in order.");
  const ids = parsed.data.ids;
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.homeWorkspaceCard.update({
        where: { id },
        data: { displayOrder: index },
      }),
    ),
  );
  return c.json({ data: await loadResolvedHomeWorkspace() });
});

adminHomeWorkspaceRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const card = await prisma.homeWorkspaceCard.findUnique({ where: { id } });
  if (!card) return bad(c, "Card not found.", 404);
  return c.json({ data: toHomeWorkspaceCardJson(card) });
});

adminHomeWorkspaceRouter.post("/", async (c) => {
  const parsed = cardBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, zodMessage(parsed.error));
  const input = parsed.data;
  const count = await prisma.homeWorkspaceCard.count();
  if (count >= MAX_HOME_WORKSPACE_CARDS) {
    return bad(
      c,
      `Alenio Workspace cards are limited to ${MAX_HOME_WORKSPACE_CARDS}. Archive or delete one first.`,
    );
  }
  const user = c.get("user");
  const maxOrder = await prisma.homeWorkspaceCard.aggregate({
    _max: { displayOrder: true },
  });
  const card = await prisma.homeWorkspaceCard.create({
    data: {
      slug: await uniqueSlug(input.slug || input.title),
      title: input.title,
      body: input.body,
      actionLabel: input.actionLabel,
      accessibilityLabel: input.accessibilityLabel?.trim() || input.actionLabel,
      imageUrl: input.imageUrl?.trim() || null,
      imageAlt: input.imageAlt?.trim() || null,
      surfaceColor: input.surfaceColor ?? "#1A0B3A",
      fadeColors: (input.fadeColors ?? [
        "rgba(20,9,56,0.96)",
        "rgba(26,11,69,0.86)",
        "rgba(42,15,99,0.05)",
      ]) as unknown as Prisma.InputJsonValue,
      borderColor: input.borderColor ?? "#2A0F63",
      titleColor: input.titleColor ?? "#FFFFFF",
      bodyColor: input.bodyColor ?? "rgba(255,255,255,0.72)",
      buttonColors: (input.buttonColors ?? ["#5B32D6", "#7C4DFF"]) as unknown as Prisma.InputJsonValue,
      destinationType: input.destinationType,
      displayOrder: input.displayOrder ?? (maxOrder._max.displayOrder ?? -1) + 1,
      isActive: input.isActive ?? true,
      updatedById: user?.id ?? null,
    },
  });
  return c.json({ data: toHomeWorkspaceCardJson(card) }, 201);
});

adminHomeWorkspaceRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await prisma.homeWorkspaceCard.findUnique({ where: { id } });
  if (!existing) return bad(c, "Card not found.", 404);
  const parsed = cardBody.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, zodMessage(parsed.error));
  const input = parsed.data;
  const user = c.get("user");
  const card = await prisma.homeWorkspaceCard.update({
    where: { id },
    data: {
      ...(input.title != null ? { title: input.title } : {}),
      ...(input.slug != null
        ? { slug: await uniqueSlug(input.slug, id) }
        : {}),
      ...(input.body != null ? { body: input.body } : {}),
      ...(input.actionLabel != null ? { actionLabel: input.actionLabel } : {}),
      ...(input.accessibilityLabel != null
        ? { accessibilityLabel: input.accessibilityLabel }
        : {}),
      ...(input.imageUrl !== undefined
        ? { imageUrl: input.imageUrl?.trim() || null }
        : {}),
      ...(input.imageAlt !== undefined
        ? { imageAlt: input.imageAlt?.trim() || null }
        : {}),
      ...(input.surfaceColor != null ? { surfaceColor: input.surfaceColor } : {}),
      ...(input.fadeColors != null
        ? {
            fadeColors: input.fadeColors as unknown as Prisma.InputJsonValue,
          }
        : {}),
      ...(input.borderColor != null ? { borderColor: input.borderColor } : {}),
      ...(input.titleColor != null ? { titleColor: input.titleColor } : {}),
      ...(input.bodyColor != null ? { bodyColor: input.bodyColor } : {}),
      ...(input.buttonColors != null
        ? {
            buttonColors: input.buttonColors as unknown as Prisma.InputJsonValue,
          }
        : {}),
      ...(input.destinationType != null
        ? { destinationType: input.destinationType }
        : {}),
      ...(input.displayOrder != null ? { displayOrder: input.displayOrder } : {}),
      ...(input.isActive != null ? { isActive: input.isActive } : {}),
      updatedById: user?.id ?? null,
    },
  });
  return c.json({ data: toHomeWorkspaceCardJson(card) });
});

adminHomeWorkspaceRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await prisma.homeWorkspaceCard.findUnique({ where: { id } });
  if (!existing) return bad(c, "Card not found.", 404);
  await prisma.homeWorkspaceCard.delete({ where: { id } });
  const settings = await ensureHomeWorkspaceSettings();
  if (settings.pinnedCardId === id) {
    const next = await prisma.homeWorkspaceCard.findFirst({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    await prisma.homeWorkspaceSettings.update({
      where: { id: "default" },
      data: { pinnedCardId: next?.id ?? null },
    });
  }
  return c.json({ data: { ok: true } });
});
