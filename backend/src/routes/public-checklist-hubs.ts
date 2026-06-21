import { Hono } from "hono";
import { prisma } from "../prisma";
import {
  buildSubmissionStats,
  checkPublicSubmissionRateLimit,
  findActiveChecklistInHub,
  findTeamByChecklistHubToken,
  normalizeSignerName,
  teamHasChecklistPlan,
  validateSignedResponses,
  type ChecklistResponseItem,
} from "../lib/checklist-locations";

const publicChecklistHubsRouter = new Hono();

publicChecklistHubsRouter.get("/:hubToken", async (c) => {
  const hubToken = c.req.param("hubToken")?.trim();
  if (!hubToken) return c.json({ error: { message: "Not found" } }, 404);

  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return c.json({ error: { message: "Checklist page not found" } }, 404);

  const hasPlan = await teamHasChecklistPlan(team.id);
  if (!hasPlan) return c.json({ error: { message: "Checklists are not available for this workspace" } }, 403);

  return c.json({
    data: {
      team: { name: team.name, image: team.image },
      checklists: team.checklistLocations.map((cl) => ({
        id: cl.id,
        name: cl.name,
        cardColor: cl.cardColor ?? null,
        taskCount: cl.items.length,
        categories: [...new Set(cl.items.map((i) => i.category).filter(Boolean))],
      })),
    },
  });
});

publicChecklistHubsRouter.get("/:hubToken/checklists/:checklistId", async (c) => {
  const hubToken = c.req.param("hubToken")?.trim();
  const checklistId = c.req.param("checklistId")?.trim();
  if (!hubToken || !checklistId) return c.json({ error: { message: "Not found" } }, 404);

  const row = await findActiveChecklistInHub(hubToken, checklistId);
  if (!row) return c.json({ error: { message: "Checklist not found or inactive" } }, 404);

  const hasPlan = await teamHasChecklistPlan(row.team.id);
  if (!hasPlan) return c.json({ error: { message: "Checklists are not available for this workspace" } }, 403);

  return c.json({
    data: {
      checklist: { id: row.location.id, name: row.location.name },
      team: { name: row.team.name, image: row.team.image },
      items: row.location.items.map((i) => ({
        id: i.id,
        title: i.title,
        note: i.note ?? null,
        category: i.category,
        sortOrder: i.sortOrder,
      })),
    },
  });
});

publicChecklistHubsRouter.post("/:hubToken/checklists/:checklistId/submissions", async (c) => {
  const hubToken = c.req.param("hubToken")?.trim();
  const checklistId = c.req.param("checklistId")?.trim();
  if (!hubToken || !checklistId) return c.json({ error: { message: "Not found" } }, 404);

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
  if (!checkPublicSubmissionRateLimit(`${ip}:${hubToken}:${checklistId}`)) {
    return c.json({ error: { message: "Too many submissions. Please wait a moment." } }, 429);
  }

  const row = await findActiveChecklistInHub(hubToken, checklistId);
  if (!row) return c.json({ error: { message: "Checklist not found or inactive" } }, 404);
  if (row.location.items.length === 0) {
    return c.json({ error: { message: "This checklist has no tasks yet." } }, 400);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    submitterName?: unknown;
    responses?: unknown;
  };

  const rawResponses = Array.isArray(body.responses) ? body.responses : [];
  const responses: ChecklistResponseItem[] = rawResponses
    .filter(
      (r): r is { itemId: unknown; checked: unknown; signerName?: unknown; signedAt?: unknown } =>
        !!r && typeof r === "object",
    )
    .map((r) => ({
      itemId: String(r.itemId),
      checked: !!r.checked,
      signerName: normalizeSignerName(r.signerName),
      signedAt: typeof r.signedAt === "string" && r.signedAt.trim() ? r.signedAt.trim() : null,
    }));

  const validationError = validateSignedResponses(row.location.items, responses);
  if (validationError) {
    return c.json({ error: { message: validationError } }, 400);
  }

  const stats = buildSubmissionStats(row.location.items, responses);
  const legacyName =
    typeof body.submitterName === "string" && body.submitterName.trim() ? body.submitterName.trim().slice(0, 120) : null;
  const submitterName =
    stats.submitterNames.length === 0
      ? legacyName
      : stats.submitterNames.length === 1
        ? stats.submitterNames[0]
        : stats.submitterNames.join(", ");

  const submission = await prisma.checklistLocationSubmission.create({
    data: {
      locationId: row.location.id,
      submitterName,
      responses: stats.normalized,
      checkedCount: stats.checkedCount,
      totalCount: stats.totalCount,
      isComplete: stats.isComplete,
    },
    select: { id: true, submittedAt: true, isComplete: true },
  });

  return c.json({ data: submission }, 201);
});

export { publicChecklistHubsRouter };
