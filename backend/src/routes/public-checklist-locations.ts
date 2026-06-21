import { Hono } from "hono";
import { prisma } from "../prisma";
import {
  buildSubmissionStats,
  checkPublicSubmissionRateLimit,
  findActiveLocationByToken,
  normalizeSignerName,
  validateSignedResponses,
  type ChecklistResponseItem,
} from "../lib/checklist-locations";

const publicChecklistLocationsRouter = new Hono();

publicChecklistLocationsRouter.get("/:token", async (c) => {
  const token = c.req.param("token")?.trim();
  if (!token) return c.json({ error: { message: "Not found" } }, 404);

  const location = await findActiveLocationByToken(token);
  if (!location) return c.json({ error: { message: "Checklist not found or inactive" } }, 404);

  return c.json({
    data: {
      location: { name: location.name },
      team: {
        name: location.team.name,
        image: location.team.image,
      },
      items: location.items.map((i) => ({ id: i.id, title: i.title, sortOrder: i.sortOrder })),
    },
  });
});

publicChecklistLocationsRouter.post("/:token/submissions", async (c) => {
  const token = c.req.param("token")?.trim();
  if (!token) return c.json({ error: { message: "Not found" } }, 404);

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
  if (!checkPublicSubmissionRateLimit(`${ip}:${token}`)) {
    return c.json({ error: { message: "Too many submissions. Please wait a moment." } }, 429);
  }

  const location = await findActiveLocationByToken(token);
  if (!location) return c.json({ error: { message: "Checklist not found or inactive" } }, 404);
  if (location.items.length === 0) {
    return c.json({ error: { message: "This checklist has no items yet." } }, 400);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    submitterName?: unknown;
    responses?: unknown;
  };

  const rawResponses = Array.isArray(body.responses) ? body.responses : [];
  const responses: ChecklistResponseItem[] = rawResponses
    .filter((r): r is { itemId: unknown; checked: unknown; signerName?: unknown } => !!r && typeof r === "object")
    .map((r) => ({
      itemId: String(r.itemId),
      checked: !!r.checked,
      signerName: normalizeSignerName(r.signerName),
    }));

  const validationError = validateSignedResponses(location.items, responses);
  if (validationError) {
    return c.json({ error: { message: validationError } }, 400);
  }

  const stats = buildSubmissionStats(location.items, responses);
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
      locationId: location.id,
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

export { publicChecklistLocationsRouter };
