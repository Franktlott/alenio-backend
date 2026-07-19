import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { findTeamByGoHubToken } from "../lib/go-hub";
import {
  assertGoDeviceLinked,
  GO_DEVICE_UNLINKED_MESSAGE,
} from "../lib/workplace-alerts";
import * as walkRunService from "../lib/walks/walk-run-service";
import * as scheduleService from "../lib/walks/schedule-service";
import { prismaRouteError } from "../lib/prisma-errors";
import {
  isFirebaseStorageConfigured,
  uploadFileToFirebaseStorage,
} from "../lib/firebase-storage";

const publicGoWalksRouter = new Hono();
const MAX_WALK_PHOTO_BYTES = 12 * 1024 * 1024;

async function resolveHubTeam(hubToken: string | undefined, deviceId: string | undefined) {
  const token = hubToken?.trim();
  if (!token) return { error: "MISSING_HUB" as const };
  const team = await findTeamByGoHubToken(token);
  if (!team) return { error: "NOT_FOUND" as const };
  if (deviceId?.trim()) {
    const linked = await assertGoDeviceLinked(team.id, deviceId.trim());
    if (!linked.ok) {
      return { error: "DEVICE_UNLINKED" as const };
    }
  }
  return { team };
}

const hubQuerySchema = z.object({
  hubToken: z.string().min(1),
  deviceId: z.string().min(8).max(128).optional(),
});

const startRunSchema = z.object({
  hubToken: z.string().min(1),
  deviceId: z.string().min(8).max(128),
  startedByName: z.string().max(120).optional().nullable(),
  isTest: z.boolean().optional(),
});

const submitSchema = z.object({
  hubToken: z.string().min(1),
  deviceId: z.string().min(8).max(128),
  response: z.unknown(),
  notes: z.string().max(4000).optional().nullable(),
  photoUrls: z.array(z.string().url()).max(20).optional().nullable(),
  completedBy: z.string().max(120).optional().nullable(),
});

const completeSchema = z.object({
  hubToken: z.string().min(1),
  deviceId: z.string().min(8).max(128),
});

// POST /api/public/go/walks/upload — kiosk photo (hub token + linked device)
publicGoWalksRouter.post("/upload", async (c) => {
  if (!isFirebaseStorageConfigured()) {
    return c.json(
      {
        error: {
          message: "File storage is not configured yet.",
          code: "STORAGE_NOT_CONFIGURED",
        },
      },
      503,
    );
  }

  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch {
    return c.json({ error: { message: "Invalid upload", code: "VALIDATION_ERROR" } }, 400);
  }

  const hubToken = body.hubToken != null ? String(body.hubToken).trim() : "";
  const deviceId = body.deviceId != null ? String(body.deviceId).trim() : "";
  if (!hubToken || !deviceId) {
    return c.json(
      { error: { message: "hubToken and deviceId are required", code: "VALIDATION_ERROR" } },
      400,
    );
  }

  const resolved = await resolveHubTeam(hubToken, deviceId);
  if ("error" in resolved) {
    if (resolved.error === "DEVICE_UNLINKED") {
      return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
    }
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }

  const file = body.file;
  if (!(file instanceof File) || file.size === 0) {
    return c.json({ error: { message: "No file provided", code: "VALIDATION_ERROR" } }, 400);
  }
  if (file.size > MAX_WALK_PHOTO_BYTES) {
    return c.json(
      { error: { message: "Photo is too large. Choose a smaller image.", code: "PAYLOAD_TOO_LARGE" } },
      413,
    );
  }
  if (file.type && !file.type.startsWith("image/")) {
    return c.json(
      { error: { message: "Upload an image file", code: "VALIDATION_ERROR" } },
      400,
    );
  }

  try {
    const uploaded = await uploadFileToFirebaseStorage({
      userId: `go-device-${deviceId}`,
      file,
      slot: "go_walk_photo",
      teamId: resolved.team.id,
    });
    return c.json({ data: uploaded }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return c.json({ error: { message, code: "UPLOAD_ERROR" } }, 500);
  }
});

// GET /api/public/go/walks?hubToken=&deviceId=
publicGoWalksRouter.get("/", zValidator("query", hubQuerySchema), async (c) => {
  const { hubToken, deviceId } = c.req.valid("query");
  const resolved = await resolveHubTeam(hubToken, deviceId);
  if ("error" in resolved) {
    if (resolved.error === "DEVICE_UNLINKED") {
      return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
    }
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }
  try {
    const [templates, occurrences] = await Promise.all([
      walkRunService.listPublishedWalkTemplates(resolved.team.id),
      scheduleService.listAvailableOccurrences(resolved.team.id),
    ]);
    return c.json({ data: templates, occurrences });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to list walks");
  }
});

// POST /api/public/go/walks/occurrences/:occurrenceId/runs
publicGoWalksRouter.post(
  "/occurrences/:occurrenceId/runs",
  zValidator(
    "json",
    z.object({
      hubToken: z.string().min(1),
      deviceId: z.string().min(8).max(128),
      startedByName: z.string().max(120).optional().nullable(),
      isTest: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const occurrenceId = c.req.param("occurrenceId")!;
    const body = c.req.valid("json");
    const resolved = await resolveHubTeam(body.hubToken, body.deviceId);
    if ("error" in resolved) {
      if (resolved.error === "DEVICE_UNLINKED") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    try {
      const occ = await scheduleService.listOccurrences(resolved.team.id);
      const match = occ.find((o) => o.id === occurrenceId);
      if (!match) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      const result = await walkRunService.startWalkRun({
        teamId: resolved.team.id,
        templateId: match.templateId,
        occurrenceId,
        startedByName: body.startedByName ?? "Floor associate",
        deviceId: body.deviceId,
        isTest: body.isTest ?? false,
      });
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 400;
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          status,
        );
      }
      return c.json({ data: result.run }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "Failed to start occurrence");
    }
  },
);

// POST /api/public/go/walks/:templateId/runs
publicGoWalksRouter.post(
  "/:templateId/runs",
  zValidator("json", startRunSchema),
  async (c) => {
    const templateId = c.req.param("templateId")!;
    const body = c.req.valid("json");
    const resolved = await resolveHubTeam(body.hubToken, body.deviceId);
    if ("error" in resolved) {
      if (resolved.error === "DEVICE_UNLINKED") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    try {
      const result = await walkRunService.startWalkRun({
        teamId: resolved.team.id,
        templateId,
        startedByName: body.startedByName ?? "Floor associate",
        deviceId: body.deviceId,
        isTest: body.isTest ?? false,
      });
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 400;
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          status,
        );
      }
      return c.json({ data: result.run }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "Failed to start walk");
    }
  },
);

// GET /api/public/go/walks/runs/:runId?hubToken=&deviceId=
publicGoWalksRouter.get("/runs/:runId", zValidator("query", hubQuerySchema), async (c) => {
  const runId = c.req.param("runId")!;
  const { hubToken, deviceId } = c.req.valid("query");
  const resolved = await resolveHubTeam(hubToken, deviceId);
  if ("error" in resolved) {
    if (resolved.error === "DEVICE_UNLINKED") {
      return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
    }
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }
  try {
    const data = await walkRunService.getWalkRun(resolved.team.id, runId);
    if (!data) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to load walk run");
  }
});

// PATCH /api/public/go/walks/runs/:runId/items/:itemId
publicGoWalksRouter.patch(
  "/runs/:runId/items/:itemId",
  zValidator("json", submitSchema),
  async (c) => {
    const runId = c.req.param("runId")!;
    const itemId = c.req.param("itemId")!;
    const body = c.req.valid("json");
    const resolved = await resolveHubTeam(body.hubToken, body.deviceId);
    if ("error" in resolved) {
      if (resolved.error === "DEVICE_UNLINKED") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    try {
      const result = await walkRunService.submitWalkItemResponse({
        teamId: resolved.team.id,
        runId,
        itemId,
        response: body.response,
        notes: body.notes,
        photoUrls: body.photoUrls,
        completedBy: body.completedBy ?? "Floor associate",
        // Failure procedures run in Alenio Temps — Go saves pass/fail only.
        skipFailureProcedure: true,
      });
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" || result.error === "ITEM_NOT_FOUND" ? 404 : 400;
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          status,
        );
      }
      return c.json({ data: result.run });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to submit response");
    }
  },
);

// POST /api/public/go/walks/runs/:runId/items/:itemId/corrective-actions/:actionId/complete
publicGoWalksRouter.post(
  "/runs/:runId/items/:itemId/corrective-actions/:actionId/complete",
  zValidator(
    "json",
    z.object({
      hubToken: z.string().min(1),
      deviceId: z.string().min(8).max(128),
      response: z.unknown().optional(),
      completedBy: z.string().max(120).optional().nullable(),
    }),
  ),
  async (c) => {
    const runId = c.req.param("runId")!;
    const itemId = c.req.param("itemId")!;
    const actionId = c.req.param("actionId")!;
    const body = c.req.valid("json");
    const resolved = await resolveHubTeam(body.hubToken, body.deviceId);
    if ("error" in resolved) {
      if (resolved.error === "DEVICE_UNLINKED") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    try {
      const result = await walkRunService.completeCorrectiveAction({
        teamId: resolved.team.id,
        runId,
        itemId,
        correctiveActionId: actionId,
        response: body.response,
        completedBy: body.completedBy ?? "Floor associate",
      });
      if ("error" in result) {
        return c.json(
          {
            error: {
              message: ("message" in result && result.message) || result.error,
              code: result.error,
            },
          },
          result.error === "NOT_FOUND" ||
            result.error === "ITEM_NOT_FOUND" ||
            result.error === "ACTION_NOT_FOUND"
            ? 404
            : 400,
        );
      }
      return c.json({ data: result.run });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to complete corrective action");
    }
  },
);

// POST /api/public/go/walks/runs/:runId/items/:itemId/reset
publicGoWalksRouter.post(
  "/runs/:runId/items/:itemId/reset",
  zValidator(
    "json",
    z.object({
      hubToken: z.string().min(1),
      deviceId: z.string().min(8).max(128),
    }),
  ),
  async (c) => {
    const runId = c.req.param("runId")!;
    const itemId = c.req.param("itemId")!;
    const body = c.req.valid("json");
    const resolved = await resolveHubTeam(body.hubToken, body.deviceId);
    if ("error" in resolved) {
      if (resolved.error === "DEVICE_UNLINKED") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    try {
      const result = await walkRunService.resetWalkItemResponse({
        teamId: resolved.team.id,
        runId,
        itemId,
      });
      if ("error" in result) {
        return c.json(
          {
            error: {
              message: ("message" in result && result.message) || result.error,
              code: result.error,
            },
          },
          result.error === "NOT_FOUND" || result.error === "ITEM_NOT_FOUND" ? 404 : 400,
        );
      }
      return c.json({ data: result.run });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to reset walk item");
    }
  },
);

// POST /api/public/go/walks/runs/:runId/complete
publicGoWalksRouter.post(
  "/runs/:runId/complete",
  zValidator("json", completeSchema),
  async (c) => {
    const runId = c.req.param("runId")!;
    const body = c.req.valid("json");
    const resolved = await resolveHubTeam(body.hubToken, body.deviceId);
    if ("error" in resolved) {
      if (resolved.error === "DEVICE_UNLINKED") {
        return c.json({ error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: "DEVICE_UNLINKED" } }, 403);
      }
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    try {
      const result = await walkRunService.completeWalkRun(resolved.team.id, runId);
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 400;
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          status,
        );
      }
      return c.json({ data: result.run });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to complete walk");
    }
  },
);

export { publicGoWalksRouter };
