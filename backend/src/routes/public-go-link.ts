import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { teamHasChecklistPlan, ensureTeamChecklistHubToken } from "../lib/checklist-locations";
import {
  normalizeWorkspaceCode,
  notifyGoLoginApprovers,
} from "../lib/go-login-requests";
import {
  ackWorkplaceAlertForDevice,
  GO_DEVICE_UNLINKED_MESSAGE,
  pollWorkplaceAlertsForDevice,
  recordGoDeviceCheckIn,
} from "../lib/workplace-alerts";
import {
  completePublicBriefing,
  getPublicBriefing,
  getPublicBriefingDocument,
  listPublicBriefings,
} from "../lib/briefings";
import {
  completePublicWalk,
  getPublicWalkCompletion,
  getPublicWalkTemplate,
  listPublicWalkCompletions,
  listPublicWalkTemplates,
} from "../lib/walks";
import {
  completePublicTempCheck,
  getPublicTempCheckCompletion,
  getPublicTempCheckTemplate,
  listPublicTempCheckCompletions,
  listPublicTempCheckTemplates,
} from "../lib/temp-checks";
import { verifyGoLeaderPin } from "../lib/go-leader-pin";

const publicGoLinkRouter = new Hono();

const linkBodySchema = z.object({
  inviteCode: z.string().min(1).max(32),
  deviceId: z.string().min(8).max(128),
  deviceLabel: z.string().max(120).optional(),
});

async function findTeamByWorkspaceCode(code: string) {
  const normalized = normalizeWorkspaceCode(code);
  const exact = await prisma.team.findUnique({
    where: { inviteCode: normalized },
    select: { id: true, name: true },
  });
  if (exact) return exact;
  return prisma.team.findFirst({
    where: { inviteCode: { equals: code.trim(), mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

publicGoLinkRouter.post("/link", zValidator("json", linkBodySchema), async (c) => {
  try {
    const { inviteCode, deviceId, deviceLabel } = c.req.valid("json");

    const team = await findTeamByWorkspaceCode(inviteCode);
    if (!team) {
      return c.json({ error: { message: "Invalid workspace code", code: "NOT_FOUND" } }, 404);
    }

    const hasPlan = await teamHasChecklistPlan(team.id);
    if (!hasPlan) {
      return c.json(
        {
          error: {
            message: "Alenio Go requires a Team plan for this workspace",
            code: "PLAN_REQUIRED",
          },
        },
        403,
      );
    }

    const label = deviceLabel?.trim() || "A device";
    const existing = await prisma.goLoginRequest.findUnique({
      where: { teamId_deviceId: { teamId: team.id, deviceId } },
    });

    if (existing?.status === "approved") {
      const hubToken = await ensureTeamChecklistHubToken(team.id);
      return c.json({
        data: {
          status: "approved" as const,
          requestId: existing.id,
          teamName: team.name,
          hubToken,
        },
      });
    }

    if (existing?.status === "pending") {
      return c.json({
        data: {
          status: "pending" as const,
          requestId: existing.id,
          teamName: team.name,
        },
      });
    }

    let request;
    if (existing) {
      request = await prisma.goLoginRequest.update({
        where: { id: existing.id },
        data: { status: "pending", deviceLabel: label, approvedByUserId: null },
      });
    } else {
      request = await prisma.goLoginRequest.create({
        data: { teamId: team.id, deviceId, deviceLabel: label, status: "pending" },
      });
    }

    try {
      await notifyGoLoginApprovers(team.id, team.name, label, request.id);
    } catch (notifyErr) {
      console.error("[go-link] notify approvers failed (request still pending):", notifyErr);
    }

    return c.json({
      data: {
        status: "pending" as const,
        requestId: request.id,
        teamName: team.name,
      },
    });
  } catch (err) {
    console.error("[go-link] POST /link failed:", err);
    return c.json({ error: { message: "Could not submit link request", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/status", async (c) => {
  try {
    const deviceId = c.req.query("deviceId")?.trim();
    const requestId = c.req.query("requestId")?.trim();
    if (!deviceId || !requestId) {
      return c.json({ error: { message: "deviceId and requestId are required", code: "VALIDATION_ERROR" } }, 400);
    }

    const request = await prisma.goLoginRequest.findUnique({
      where: { id: requestId },
      include: { team: { select: { name: true } } },
    });
    if (!request || request.deviceId !== deviceId) {
      return c.json({ error: { message: "Link request not found", code: "NOT_FOUND" } }, 404);
    }

    if (request.status === "approved") {
      const hubToken = await ensureTeamChecklistHubToken(request.teamId);
      return c.json({
        data: {
          status: "approved" as const,
          teamName: request.team.name,
          hubToken,
        },
      });
    }

    return c.json({
      data: {
        status: request.status as "pending" | "rejected",
        teamName: request.team.name,
      },
    });
  } catch (err) {
    console.error("[go-link] GET /status failed:", err);
    return c.json({ error: { message: "Could not load link status", code: "INTERNAL" } }, 500);
  }
});

const checkInBodySchema = z.object({
  hubToken: z.string().min(1).max(256),
  deviceId: z.string().min(8).max(128),
  deviceLabel: z.string().max(120).optional(),
});

publicGoLinkRouter.post("/check-in", zValidator("json", checkInBodySchema), async (c) => {
  try {
    const { hubToken, deviceId, deviceLabel } = c.req.valid("json");
    const result = await recordGoDeviceCheckIn(hubToken, deviceId, deviceLabel);
    if (!result.ok) {
      return c.json({ error: { message: "Workspace not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({
      data: {
        success: true,
        approved: result.approved,
        linkStatus: result.linkStatus,
      },
    });
  } catch (err) {
    console.error("[go-link] POST /check-in failed:", err);
    return c.json({ error: { message: "Could not register device", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/alerts", async (c) => {
  try {
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!hubToken || !deviceId) {
      return c.json({ error: { message: "hubToken and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }

    const result = await pollWorkplaceAlertsForDevice(hubToken, deviceId);
    if (!result.ok) {
      if (result.code === "DEVICE_UNLINKED") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      if (result.code === "FORBIDDEN") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }

    return c.json({ data: { alerts: result.alerts } });
  } catch (err) {
    console.error("[go-link] GET /alerts failed:", err);
    return c.json({ error: { message: "Could not load alerts", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.post("/alerts/:alertId/ack", async (c) => {
  try {
    const alertId = c.req.param("alertId")?.trim();
    const body = await c.req.json().catch(() => null) as { hubToken?: string; deviceId?: string } | null;
    const hubToken = body?.hubToken?.trim();
    const deviceId = body?.deviceId?.trim();
    if (!alertId || !hubToken || !deviceId) {
      return c.json({ error: { message: "alertId, hubToken, and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }

    const result = await ackWorkplaceAlertForDevice(alertId, hubToken, deviceId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN" || result.code === "DEVICE_UNLINKED") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      return c.json({ error: { message: "Alert not found", code: "NOT_FOUND" } }, 404);
    }

    return c.json({ data: { success: true } });
  } catch (err) {
    console.error("[go-link] POST /alerts/:id/ack failed:", err);
    return c.json({ error: { message: "Could not acknowledge alert", code: "INTERNAL" } }, 500);
  }
});

const publicBriefingCompleteSchema = z.object({
  hubToken: z.string().min(1).max(256),
  deviceId: z.string().min(8).max(128),
  initials: z.string().trim().max(8).optional(),
  signatureData: z.string().max(500_000).optional().nullable(),
  reviewerName: z.string().trim().max(120).optional().nullable(),
});

publicGoLinkRouter.get("/briefings", async (c) => {
  try {
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!hubToken || !deviceId) {
      return c.json({ error: { message: "hubToken and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await listPublicBriefings(hubToken, deviceId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN" || result.code === "DEVICE_UNLINKED") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { briefings: result.briefings } });
  } catch (err) {
    console.error("[go-link] GET /briefings failed:", err);
    return c.json({ error: { message: "Could not load briefings", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/briefings/:briefingId", async (c) => {
  try {
    const briefingId = c.req.param("briefingId")?.trim();
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!briefingId || !hubToken || !deviceId) {
      return c.json({ error: { message: "briefingId, hubToken, and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await getPublicBriefing(hubToken, deviceId, briefingId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN" || result.code === "DEVICE_UNLINKED") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { briefing: result.briefing } });
  } catch (err) {
    console.error("[go-link] GET /briefings/:id failed:", err);
    return c.json({ error: { message: "Could not load briefing", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/briefings/:briefingId/document", async (c) => {
  try {
    const briefingId = c.req.param("briefingId")?.trim();
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!briefingId || !hubToken || !deviceId) {
      return c.json({ error: { message: "briefingId, hubToken, and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await getPublicBriefingDocument(hubToken, deviceId, briefingId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN" || result.code === "DEVICE_UNLINKED") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      if (result.code === "NOT_FOUND" || result.code === "DOCUMENT_UNAVAILABLE") {
        return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
      }
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${result.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    console.error("[go-link] GET /briefings/:id/document failed:", err);
    return c.json({ error: { message: "Could not load document", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.post("/briefings/:briefingId/complete", zValidator("json", publicBriefingCompleteSchema), async (c) => {
  try {
    const briefingId = c.req.param("briefingId")?.trim();
    const { hubToken, deviceId, initials, signatureData, reviewerName } = c.req.valid("json");
    const result = await completePublicBriefing(hubToken, deviceId, briefingId, {
      initials,
      signatureData,
      reviewerName,
    });
    if (!result.ok) {
      if (result.code === "FORBIDDEN" || result.code === "DEVICE_UNLINKED") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      if (result.code === "ALREADY_COMPLETED") {
        return c.json({ error: { message: "This name and initials were already recorded", code: "ALREADY_COMPLETED" } }, 409);
      }
      if (result.code === "NAME_REQUIRED") {
        return c.json({ error: { message: "Name is required", code: "VALIDATION_ERROR" } }, 400);
      }
      return c.json({ error: { message: "Initials or signature required", code: "VALIDATION_ERROR" } }, 400);
    }
    return c.json({ data: { success: true, completedAt: result.completion.completedAt.toISOString() } });
  } catch (err) {
    console.error("[go-link] POST /briefings/:id/complete failed:", err);
    return c.json({ error: { message: "Could not complete briefing", code: "INTERNAL" } }, 500);
  }
});

const publicWalkCompleteSchema = z
  .object({
    hubToken: z.string().min(1).max(256),
    deviceId: z.string().min(8).max(128),
    managerName: z.string().trim().min(1).max(120).optional(),
    leaderUserId: z.string().min(1).max(128).optional(),
    responses: z
      .array(
        z.object({
          itemId: z.string().min(1),
          label: z.string().max(280),
          status: z.enum(["pass", "needs_attention", "na"]),
          notes: z.string().max(500).nullable().optional(),
          photoUrl: z.string().url().max(2048).nullable().optional(),
        }),
      )
      .min(1)
      .max(80),
    finalNotes: z.string().max(2000).nullable().optional(),
  })
  .refine((body) => Boolean(body.managerName?.trim() || body.leaderUserId?.trim()), {
    message: "managerName or leaderUserId is required",
  });

const publicTempCheckCompleteSchema = z.object({
  hubToken: z.string().min(1).max(256),
  deviceId: z.string().min(8).max(128),
  leaderUserId: z.string().min(1).max(128),
  readings: z
    .array(
      z.object({
        itemId: z.string().min(1),
        readingF: z.number(),
        correctiveAction: z.string().max(200).nullable().optional(),
        correctiveSteps: z.array(z.string().max(200)).max(12).nullable().optional(),
        branchChecklists: z
          .array(
            z.object({
              actionLabel: z.string().max(200),
              completedItems: z.array(z.string().max(200)).max(20),
            }),
          )
          .max(12)
          .nullable()
          .optional(),
        notes: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(40),
  timeZone: z.string().min(1).max(64).optional(),
});

const publicVerifyPinSchema = z.object({
  hubToken: z.string().min(1).max(256),
  deviceId: z.string().min(8).max(128),
  pin: z.string().regex(/^\d{4,8}$/),
});

publicGoLinkRouter.post("/verify-pin", zValidator("json", publicVerifyPinSchema), async (c) => {
  try {
    const { hubToken, deviceId, pin } = c.req.valid("json");
    const result = await verifyGoLeaderPin(prisma, hubToken, deviceId, pin);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      if (result.code === "NOT_FOUND") {
        return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      }
      return c.json({ error: { message: "Invalid PIN", code: "INVALID_PIN" } }, 401);
    }
    return c.json({
      data: {
        leader: {
          userId: result.leader.userId,
          name: result.leader.name,
          role: result.leader.role,
        },
      },
    });
  } catch (err) {
    console.error("[go-link] POST /verify-pin failed:", err);
    return c.json({ error: { message: "Could not verify PIN", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/walks", async (c) => {
  try {
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!hubToken || !deviceId) {
      return c.json({ error: { message: "hubToken and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await listPublicWalkTemplates(hubToken, deviceId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { templates: result.templates } });
  } catch (err) {
    console.error("[go-link] GET /walks failed:", err);
    return c.json({ error: { message: "Could not load walks", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/walks/completions", async (c) => {
  try {
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!hubToken || !deviceId) {
      return c.json({ error: { message: "hubToken and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await listPublicWalkCompletions(hubToken, deviceId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { completions: result.completions } });
  } catch (err) {
    console.error("[go-link] GET /walks/completions failed:", err);
    return c.json({ error: { message: "Could not load walk history", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/walks/completions/:completionId", async (c) => {
  try {
    const completionId = c.req.param("completionId")?.trim();
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!completionId || !hubToken || !deviceId) {
      return c.json({ error: { message: "completionId, hubToken, and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await getPublicWalkCompletion(hubToken, deviceId, completionId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { completion: result.completion } });
  } catch (err) {
    console.error("[go-link] GET /walks/completions/:id failed:", err);
    return c.json({ error: { message: "Could not load walk record", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/walks/:walkId", async (c) => {
  try {
    const walkId = c.req.param("walkId")?.trim();
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!walkId || !hubToken || !deviceId) {
      return c.json({ error: { message: "walkId, hubToken, and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await getPublicWalkTemplate(hubToken, deviceId, walkId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { template: result.template } });
  } catch (err) {
    console.error("[go-link] GET /walks/:id failed:", err);
    return c.json({ error: { message: "Could not load walk", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.post("/walks/:walkId/complete", zValidator("json", publicWalkCompleteSchema), async (c) => {
  try {
    const walkId = c.req.param("walkId")?.trim();
    const { hubToken, deviceId, managerName, leaderUserId, responses, finalNotes } = c.req.valid("json");
    const result = await completePublicWalk(
      hubToken,
      deviceId,
      walkId,
      { managerName, leaderUserId },
      { responses, finalNotes },
    );
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      return c.json({ error: { message: "Invalid walk completion", code: "VALIDATION_ERROR" } }, 400);
    }
    return c.json({ data: result.completion }, 201);
  } catch (err) {
    console.error("[go-link] POST /walks/:id/complete failed:", err);
    return c.json({ error: { message: "Could not complete walk", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/temp-checks", async (c) => {
  try {
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!hubToken || !deviceId) {
      return c.json({ error: { message: "hubToken and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const timeZone = c.req.query("timeZone")?.trim() || undefined;
    const result = await listPublicTempCheckTemplates(hubToken, deviceId, timeZone);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { templates: result.templates } });
  } catch (err) {
    console.error("[go-link] GET /temp-checks failed:", err);
    return c.json({ error: { message: "Could not load temp checks", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/temp-checks/completions", async (c) => {
  try {
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!hubToken || !deviceId) {
      return c.json({ error: { message: "hubToken and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await listPublicTempCheckCompletions(hubToken, deviceId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { completions: result.completions } });
  } catch (err) {
    console.error("[go-link] GET /temp-checks/completions failed:", err);
    return c.json({ error: { message: "Could not load temp check history", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/temp-checks/completions/:completionId", async (c) => {
  try {
    const completionId = c.req.param("completionId")?.trim();
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!completionId || !hubToken || !deviceId) {
      return c.json({ error: { message: "completionId, hubToken, and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await getPublicTempCheckCompletion(hubToken, deviceId, completionId);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { completion: result.completion } });
  } catch (err) {
    console.error("[go-link] GET /temp-checks/completions/:id failed:", err);
    return c.json({ error: { message: "Could not load temp check record", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.get("/temp-checks/:templateId", async (c) => {
  try {
    const templateId = c.req.param("templateId")?.trim();
    const hubToken = c.req.query("hubToken")?.trim();
    const deviceId = c.req.query("deviceId")?.trim();
    if (!templateId || !hubToken || !deviceId) {
      return c.json({ error: { message: "templateId, hubToken, and deviceId are required", code: "VALIDATION_ERROR" } }, 400);
    }
    const timeZone = c.req.query("timeZone")?.trim() || undefined;
    const result = await getPublicTempCheckTemplate(hubToken, deviceId, templateId, timeZone);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { template: result.template } });
  } catch (err) {
    console.error("[go-link] GET /temp-checks/:id failed:", err);
    return c.json({ error: { message: "Could not load temp check", code: "INTERNAL" } }, 500);
  }
});

publicGoLinkRouter.post("/temp-checks/:templateId/complete", zValidator("json", publicTempCheckCompleteSchema), async (c) => {
  try {
    const templateId = c.req.param("templateId")?.trim();
    const { hubToken, deviceId, leaderUserId, readings, timeZone } = c.req.valid("json");
    const result = await completePublicTempCheck(hubToken, deviceId, templateId, { leaderUserId }, { readings, timeZone });
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      if (result.code === "OUTSIDE_WINDOW") {
        return c.json({ error: { message: "This temp check is outside its scheduled window.", code: "OUTSIDE_WINDOW" } }, 400);
      }
      return c.json({ error: { message: "Invalid temp check completion", code: "VALIDATION_ERROR" } }, 400);
    }
    return c.json({ data: result.completion }, 201);
  } catch (err) {
    console.error("[go-link] POST /temp-checks/:id/complete failed:", err);
    return c.json({ error: { message: "Could not complete temp check", code: "INTERNAL" } }, 500);
  }
});

export { publicGoLinkRouter };
