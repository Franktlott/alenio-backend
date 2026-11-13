import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "../auth";
import { isHttpsUrl, slugifyDiscoverTitle } from "../lib/discover-document";
import { ensureHomeInsightSettings, loadResolvedHomeInsights } from "../lib/home-insight-schedule";
import { toHomeInsightCardJson } from "../lib/home-insight-serialize";
import { discoverArticleIsLive } from "../lib/discover-visibility";
import { adminGuard, auditStaffChanges, requireAbilityByMethod } from "../middleware/admin-guard";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

/** Theme tokens may be hex, rgb/rgba, or other CSS color strings from the editor. */
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
  destinationType: z.enum(["recognition", "seneca", "discover"]),
  senecaPrompt: z.string().max(2000).optional(),
  discoverArticleId: z.string().trim().max(80).nullable().optional(),
  discoverSlug: z.string().trim().max(96).nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

const reorderBody = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(200),
});

const scheduleBody = z.object({
  mode: z.enum(["automatic", "manual"]),
  cadence: z.enum(["daily", "weekly"]).optional(),
  pinnedCardId: z.string().trim().min(1).nullable().optional(),
  epochAt: z.string().trim().min(1).optional(),
});

function bad(c: { json: (body: unknown, status?: number) => Response }, message: string, status = 400) {
  return c.json({ error: { message } }, status);
}

function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Check the insight fields and try again.";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

function describeHomeInsightChange(method: string, path: string) {
  const id = path.split("/").filter(Boolean).pop() ?? null;
  if (path.endsWith("/reorder")) return { action: "home_insight.reorder", summary: "Reordered Home Insight cards" };
  if (path.endsWith("/schedule")) return { action: "home_insight.schedule", summary: "Updated Home Insight schedule" };
  if (method === "DELETE") return { action: "home_insight.delete", summary: "Deleted a Home Insight card", targetId: id };
  if (method === "POST") return { action: "home_insight.create", summary: "Created a Home Insight card" };
  return { action: "home_insight.edit", summary: "Saved a Home Insight card", targetId: id };
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugifyDiscoverTitle(base).slice(0, 72) || "insight";
  let candidate = root;
  let n = 2;
  while (true) {
    const clash = await prisma.homeInsightCard.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${root}-${n}`;
    n += 1;
  }
}

async function resolveDiscover(
  destinationType: string,
  articleId: string | null | undefined,
  slug: string | null | undefined,
): Promise<{ ok: true; articleId: string | null; slug: string | null } | { ok: false; message: string }> {
  if (destinationType !== "discover") {
    return { ok: true, articleId: null, slug: null };
  }
  const id = articleId?.trim() || null;
  const wantSlug = slug?.trim() || null;
  if (!id && !wantSlug) return { ok: false, message: "Pick a Discover article for this card." };
  const article = id
    ? await prisma.discoverArticle.findUnique({ where: { id } })
    : await prisma.discoverArticle.findUnique({ where: { slug: wantSlug! } });
  if (!article) return { ok: false, message: "Discover article not found." };
  if (!discoverArticleIsLive(article, new Date()) && article.status !== "published") {
    // Allow linking published-but-scheduled-soon; still require a real article row.
  }
  return { ok: true, articleId: article.id, slug: article.slug };
}

export const adminHomeInsightsRouter = new Hono<{ Variables: Variables }>();

adminHomeInsightsRouter.use("*", adminGuard);
adminHomeInsightsRouter.use("*", requireAbilityByMethod("content.view", "content.edit"));
adminHomeInsightsRouter.use("*", auditStaffChanges("home_insight", describeHomeInsightChange));

adminHomeInsightsRouter.get("/", async (c) => {
  const resolved = await loadResolvedHomeInsights();
  return c.json({ data: resolved });
});

adminHomeInsightsRouter.get("/schedule", async (c) => {
  const resolved = await loadResolvedHomeInsights();
  return c.json({ data: resolved });
});

adminHomeInsightsRouter.patch("/schedule", async (c) => {
  const parsed = scheduleBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, "Check the schedule fields and try again.");
  const input = parsed.data;
  if (input.mode === "automatic" && !input.cadence) {
    return bad(c, "Pick daily or weekly rotation.");
  }
  if (input.mode === "manual") {
    const pinnedId = input.pinnedCardId?.trim() || null;
    if (!pinnedId) return bad(c, "Pick which card should stay live.");
    const pinned = await prisma.homeInsightCard.findFirst({
      where: { id: pinnedId, isActive: true },
      select: { id: true },
    });
    if (!pinned) return bad(c, "That card isn’t active. Activate it or pick another.");
  }

  const user = c.get("user");
  await ensureHomeInsightSettings();
  await prisma.homeInsightSettings.update({
    where: { id: "default" },
    data: {
      mode: input.mode,
      ...(input.cadence !== undefined ? { cadence: input.cadence } : {}),
      pinnedCardId: input.mode === "manual" ? input.pinnedCardId!.trim() : null,
      ...(input.epochAt ? { epochAt: new Date(input.epochAt) } : {}),
      updatedById: user?.id ?? null,
    },
  });
  const resolved = await loadResolvedHomeInsights();
  return c.json({ data: resolved });
});

adminHomeInsightsRouter.post("/reorder", async (c) => {
  const parsed = reorderBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, "Send an ordered list of card ids.");
  const ids = parsed.data.ids;
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.homeInsightCard.updateMany({
        where: { id },
        data: { displayOrder: index },
      }),
    ),
  );
  return c.json({ data: await loadResolvedHomeInsights() });
});

adminHomeInsightsRouter.get("/:id", async (c) => {
  const row = await prisma.homeInsightCard.findUnique({ where: { id: c.req.param("id") } });
  if (!row) return bad(c, "Insight card not found", 404);
  return c.json({ data: toHomeInsightCardJson(row) });
});

adminHomeInsightsRouter.post("/", async (c) => {
  const parsed = cardBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, zodMessage(parsed.error));
  const input = parsed.data;
  if (input.destinationType === "seneca" && !(input.senecaPrompt?.trim())) {
    return bad(c, "Add a Seneca prompt for this card.");
  }
  const discover = await resolveDiscover(input.destinationType, input.discoverArticleId, input.discoverSlug);
  if (!discover.ok) return bad(c, discover.message);

  try {
    const maxOrder = await prisma.homeInsightCard.aggregate({ _max: { displayOrder: true } });
    const slug = await uniqueSlug(input.slug?.trim() || input.title);
    const user = c.get("user");
    const created = await prisma.homeInsightCard.create({
      data: {
        slug,
        title: input.title,
        body: input.body,
        actionLabel: input.actionLabel,
        accessibilityLabel: input.accessibilityLabel?.trim() || input.actionLabel,
        imageUrl: input.imageUrl?.trim() || null,
        imageAlt: input.imageAlt?.trim() || null,
        surfaceColor: input.surfaceColor ?? "#F7F1FF",
        fadeColors: (input.fadeColors ?? [
          "#F7F1FF",
          "rgba(247,241,255,0.94)",
          "rgba(247,241,255,0)",
        ]) as unknown as Prisma.InputJsonValue,
        borderColor: input.borderColor ?? "#E6D8FF",
        titleColor: input.titleColor ?? "#17172B",
        bodyColor: input.bodyColor ?? "#69677B",
        buttonColors: (input.buttonColors ?? ["#5B32D6", "#7C4DFF"]) as unknown as Prisma.InputJsonValue,
        destinationType: input.destinationType,
        senecaPrompt: input.destinationType === "seneca" ? input.senecaPrompt!.trim() : "",
        discoverArticleId: discover.articleId,
        discoverSlug: discover.slug,
        displayOrder: input.displayOrder ?? (maxOrder._max.displayOrder ?? -1) + 1,
        isActive: input.isActive ?? true,
        updatedById: user?.id ?? null,
      },
    });
    return c.json({ data: toHomeInsightCardJson(created) }, 201);
  } catch (error) {
    console.error("[home-insights] create failed", error);
    return bad(c, "Couldn’t save this insight card. Try again.", 500);
  }
});

adminHomeInsightsRouter.patch("/:id", async (c) => {
  const existing = await prisma.homeInsightCard.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return bad(c, "Insight card not found", 404);
  const parsed = cardBody.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, zodMessage(parsed.error));
  const input = parsed.data;
  const destinationType = input.destinationType ?? existing.destinationType;
  const senecaPrompt =
    input.senecaPrompt !== undefined ? input.senecaPrompt.trim() : existing.senecaPrompt;
  if (destinationType === "seneca" && !senecaPrompt) {
    return bad(c, "Add a Seneca prompt for this card.");
  }
  const discover = await resolveDiscover(
    destinationType,
    input.discoverArticleId !== undefined ? input.discoverArticleId : existing.discoverArticleId,
    input.discoverSlug !== undefined ? input.discoverSlug : existing.discoverSlug,
  );
  if (!discover.ok) return bad(c, discover.message);

  let slug = existing.slug;
  if (input.slug?.trim()) slug = await uniqueSlug(input.slug.trim(), existing.id);

  const user = c.get("user");
  try {
    const updated = await prisma.homeInsightCard.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        slug,
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.actionLabel !== undefined ? { actionLabel: input.actionLabel } : {}),
        ...(input.accessibilityLabel !== undefined
          ? { accessibilityLabel: input.accessibilityLabel.trim() || existing.actionLabel }
          : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl?.trim() || null } : {}),
        ...(input.imageAlt !== undefined ? { imageAlt: input.imageAlt?.trim() || null } : {}),
        ...(input.surfaceColor !== undefined ? { surfaceColor: input.surfaceColor } : {}),
        ...(input.fadeColors !== undefined
          ? { fadeColors: input.fadeColors as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.borderColor !== undefined ? { borderColor: input.borderColor } : {}),
        ...(input.titleColor !== undefined ? { titleColor: input.titleColor } : {}),
        ...(input.bodyColor !== undefined ? { bodyColor: input.bodyColor } : {}),
        ...(input.buttonColors !== undefined
          ? { buttonColors: input.buttonColors as unknown as Prisma.InputJsonValue }
          : {}),
        destinationType,
        senecaPrompt: destinationType === "seneca" ? senecaPrompt : "",
        discoverArticleId: discover.articleId,
        discoverSlug: discover.slug,
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedById: user?.id ?? null,
      },
    });
    return c.json({ data: toHomeInsightCardJson(updated) });
  } catch (error) {
    console.error("[home-insights] update failed", error);
    return bad(c, "Couldn’t save this insight card. Try again.", 500);
  }
});

adminHomeInsightsRouter.delete("/:id", async (c) => {
  const existing = await prisma.homeInsightCard.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return bad(c, "Insight card not found", 404);
  await prisma.homeInsightCard.delete({ where: { id: existing.id } });
  return c.json({ data: { deleted: true } });
});
