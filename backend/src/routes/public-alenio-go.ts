import { Hono } from "hono";
import { prisma } from "../prisma";
import {
  buildSubmissionStats,
  checkPublicSubmissionRateLimit,
  normalizeSignerName,
  validateSignedResponses,
  type ChecklistResponseItem,
} from "../lib/checklist-locations";
import {
  deriveChecklistStatus,
  findActiveGoLocationByCode,
  findValidGoSession,
  generateGoSessionToken,
  getRecentGoDisplayNames,
  goSessionExpiry,
  normalizeGoCode,
  startOfTodayLocal,
} from "../lib/alenio-go";

const publicAlenioGoRouter = new Hono();

publicAlenioGoRouter.get("/codes/:code", async (c) => {
  const code = c.req.param("code")?.trim();
  if (!code) return c.json({ error: { message: "Go Code required" } }, 400);

  const location = await findActiveGoLocationByCode(code);
  if (!location) {
    return c.json(
      { error: { message: "We couldn't find that Go Code. Check the code or ask your manager.", code: "NOT_FOUND" } },
      404,
    );
  }

  const quickUsers = await getRecentGoDisplayNames(location.id);

  return c.json({
    data: {
      location: {
        id: location.id,
        name: location.name,
        area: location.area,
        guestEnabled: location.guestEnabled,
      },
      workspace: { name: location.team.name, image: location.team.image },
      quickUsers,
    },
  });
});

publicAlenioGoRouter.post("/sessions", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    goCode?: unknown;
    displayName?: unknown;
    deviceLabel?: unknown;
  };

  const goCode = typeof body.goCode === "string" ? normalizeGoCode(body.goCode) : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
  const deviceLabel =
    typeof body.deviceLabel === "string" ? body.deviceLabel.trim().slice(0, 120) : null;

  if (!goCode) return c.json({ error: { message: "Go Code required" } }, 400);
  if (!displayName) return c.json({ error: { message: "Enter your name or initials." } }, 400);

  const location = await findActiveGoLocationByCode(goCode);
  if (!location) {
    return c.json(
      { error: { message: "We couldn't find that Go Code. Check the code or ask your manager.", code: "NOT_FOUND" } },
      404,
    );
  }

  if (displayName.toLowerCase() === "guest" && !location.guestEnabled) {
    return c.json({ error: { message: "Guest access is disabled for this location." } }, 403);
  }

  const token = generateGoSessionToken();
  const expiresAt = goSessionExpiry();

  const session = await prisma.goSession.create({
    data: {
      token,
      teamId: location.teamId,
      goLocationId: location.id,
      displayName,
      deviceLabel,
      expiresAt,
    },
    select: { token: true, expiresAt: true, displayName: true },
  });

  return c.json(
    {
      data: {
        sessionToken: session.token,
        expiresAt: session.expiresAt.toISOString(),
        displayName: session.displayName,
        location: { id: location.id, name: location.name },
        workspace: { name: location.team.name },
      },
    },
    201,
  );
});

publicAlenioGoRouter.get("/sessions/:token", async (c) => {
  const token = c.req.param("token")?.trim();
  if (!token) return c.json({ error: { message: "Session not found" } }, 404);

  const session = await findValidGoSession(token);
  if (!session) return c.json({ error: { message: "Your Alenio Go session expired. Enter your Go Code again.", code: "EXPIRED" } }, 401);

  const todayStart = startOfTodayLocal();
  const assignments = session.goLocation.assignments.filter((a) => a.checklist.isActive);

  type Card = {
    assignmentId: string;
    checklistId: string;
    name: string;
    area: string | null;
    shift: string | null;
    dueTime: string | null;
    taskCount: number;
    cardColor: string | null;
    status: ReturnType<typeof deriveChecklistStatus>;
    progressPct: number;
    lastCompletedAt: string | null;
    lastCompletedBy: string | null;
  };

  const cards: Card[] = assignments.map((a) => {
    const cl = a.checklist;
    const status = deriveChecklistStatus(a, cl, todayStart);
    const latest = cl.submissions[0];
    const progressPct =
      latest && latest.totalCount > 0 ? Math.round((latest.checkedCount / latest.totalCount) * 100) : 0;

    return {
      assignmentId: a.id,
      checklistId: cl.id,
      name: cl.name,
      area: a.shift ?? session.goLocation.area ?? null,
      shift: a.shift,
      dueTime: a.dueTime,
      taskCount: cl.items.length,
      cardColor: cl.cardColor,
      status,
      progressPct: status === "complete" ? 100 : progressPct,
      lastCompletedAt: latest?.isComplete ? latest.submittedAt.toISOString() : null,
      lastCompletedBy: latest?.submitterName ?? null,
    };
  });

  const dueNow = cards.filter((x) => x.status === "overdue" || (x.dueTime && x.status !== "complete"));
  const today = cards.filter((x) => x.status !== "complete" || x.lastCompletedAt);
  const recentlyCompleted = cards
    .filter((x) => x.status === "complete" && x.lastCompletedAt)
    .sort((a, b) => (b.lastCompletedAt ?? "").localeCompare(a.lastCompletedAt ?? ""));

  return c.json({
    data: {
      session: {
        displayName: session.displayName,
        expiresAt: session.expiresAt.toISOString(),
      },
      location: {
        id: session.goLocation.id,
        name: session.goLocation.name,
        area: session.goLocation.area,
      },
      workspace: { name: session.goLocation.team.name, image: session.goLocation.team.image },
      sections: {
        dueNow,
        today: today.filter((x) => x.status !== "complete"),
        recentlyCompleted: recentlyCompleted.slice(0, 12),
      },
      allChecklists: cards,
    },
  });
});

publicAlenioGoRouter.get("/sessions/:token/checklists/:checklistId", async (c) => {
  const token = c.req.param("token")?.trim();
  const checklistId = c.req.param("checklistId")?.trim();
  if (!token || !checklistId) return c.json({ error: { message: "Not found" } }, 404);

  const session = await findValidGoSession(token);
  if (!session) return c.json({ error: { message: "Session expired", code: "EXPIRED" } }, 401);

  const assignment = session.goLocation.assignments.find(
    (a) => a.checklistLocationId === checklistId && a.checklist.isActive,
  );
  if (!assignment) return c.json({ error: { message: "Checklist not available at this location" } }, 404);

  const cl = assignment.checklist;
  return c.json({
    data: {
      checklist: { id: cl.id, name: cl.name, description: cl.description ?? null },
      location: { name: session.goLocation.name },
      workspace: { name: session.goLocation.team.name, image: session.goLocation.team.image },
      displayName: session.displayName,
      items: cl.items.map((i) => ({
        id: i.id,
        title: i.title,
        note: i.note ?? null,
        category: i.category,
        sortOrder: i.sortOrder,
      })),
    },
  });
});

publicAlenioGoRouter.post("/sessions/:token/checklists/:checklistId/submissions", async (c) => {
  const token = c.req.param("token")?.trim();
  const checklistId = c.req.param("checklistId")?.trim();
  if (!token || !checklistId) return c.json({ error: { message: "Not found" } }, 404);

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
  if (!checkPublicSubmissionRateLimit(`${ip}:go:${token}:${checklistId}`)) {
    return c.json({ error: { message: "Too many submissions. Please wait a moment." } }, 429);
  }

  const session = await findValidGoSession(token);
  if (!session) return c.json({ error: { message: "Session expired", code: "EXPIRED" } }, 401);

  const assignment = session.goLocation.assignments.find(
    (a) => a.checklistLocationId === checklistId && a.checklist.isActive,
  );
  if (!assignment) return c.json({ error: { message: "Checklist not available at this location" } }, 404);

  const cl = assignment.checklist;
  if (cl.items.length === 0) return c.json({ error: { message: "This checklist has no tasks yet." } }, 400);

  const body = (await c.req.json().catch(() => ({}))) as { responses?: unknown };
  const rawResponses = Array.isArray(body.responses) ? body.responses : [];
  const responses: ChecklistResponseItem[] = rawResponses
    .filter(
      (r): r is { itemId: unknown; checked: unknown; signerName?: unknown; signedAt?: unknown } =>
        !!r && typeof r === "object",
    )
    .map((r) => ({
      itemId: String(r.itemId),
      checked: !!r.checked,
      signerName: normalizeSignerName(r.signerName) ?? session.displayName,
      signedAt: typeof r.signedAt === "string" && r.signedAt.trim() ? r.signedAt.trim() : null,
    }));

  const validationError = validateSignedResponses(cl.items, responses);
  if (validationError) return c.json({ error: { message: validationError } }, 400);

  const stats = buildSubmissionStats(cl.items, responses);
  const submitterName =
    stats.submitterNames.length === 0
      ? session.displayName
      : stats.submitterNames.length === 1
        ? stats.submitterNames[0]
        : stats.submitterNames.join(", ");

  const submission = await prisma.checklistLocationSubmission.create({
    data: {
      locationId: cl.id,
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

export { publicAlenioGoRouter };
