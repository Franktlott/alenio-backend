import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { ensureTeamGoHubToken, teamHasGoPlan } from "../lib/go-hub";
import {
  findTeamByInviteCode,
  notifyGoLoginApprovers,
} from "../lib/go-login-requests";
import {
  ackWorkplaceAlertForDevice,
  GO_DEVICE_UNLINKED_MESSAGE,
  pollWorkplaceAlertsForDevice,
  recordGoDeviceCheckIn,
} from "../lib/workplace-alerts";
import {
  listKioskModulesForDevice,
  verifyModuleTestCode,
} from "../lib/workspace-modules";

const publicGoLinkRouter = new Hono();

const linkBodySchema = z.object({
  inviteCode: z.string().min(1).max(32),
  deviceId: z.string().min(8).max(128),
  deviceLabel: z.string().max(120).optional(),
});

async function findTeamByWorkspaceCode(code: string) {
  return findTeamByInviteCode(code, { id: true, name: true });
}

publicGoLinkRouter.post("/link", zValidator("json", linkBodySchema), async (c) => {
  try {
    const { inviteCode, deviceId, deviceLabel } = c.req.valid("json");

    const team = await findTeamByWorkspaceCode(inviteCode);
    if (!team) {
      return c.json({ error: { message: "Invalid workspace code", code: "NOT_FOUND" } }, 404);
    }

    const hasPlan = await teamHasGoPlan(team.id);
    if (!hasPlan) {
      return c.json(
        {
          error: {
            message: "Alenio Go requires an Operations plan for this workspace",
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
      const hubToken = await ensureTeamGoHubToken(team.id);
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
      const hubToken = await ensureTeamGoHubToken(request.teamId);
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

// GET /api/public/go/modules — active modules a floor device should show
publicGoLinkRouter.get("/modules", async (c) => {
  try {
    const hubToken = c.req.query("hubToken")?.trim();
    if (!hubToken) {
      return c.json({ error: { message: "hubToken is required", code: "VALIDATION_ERROR" } }, 400);
    }
    const result = await listKioskModulesForDevice(hubToken);
    if (!result.ok) {
      return c.json({ error: { message: "Workspace not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: { modules: result.modules } });
  } catch (err) {
    console.error("[go-link] GET /modules failed:", err);
    return c.json({ error: { message: "Could not load modules", code: "INTERNAL" } }, 500);
  }
});

const verifyTestCodeSchema = z.object({
  hubToken: z.string().min(1).max(256),
  deviceId: z.string().min(8).max(128),
  code: z.string().min(1).max(64),
});

// POST /api/public/go/modules/:moduleKey/verify-test-code
publicGoLinkRouter.post("/modules/:moduleKey/verify-test-code", zValidator("json", verifyTestCodeSchema), async (c) => {
  try {
    const moduleKey = c.req.param("moduleKey");
    const { hubToken, code } = c.req.valid("json");
    const result = await verifyModuleTestCode(hubToken, moduleKey, code);
    if (!result.ok) {
      return c.json({ error: { message: "Invalid Test Access Code", code: "INVALID_TEST_CODE" } }, 403);
    }
    return c.json({ data: { success: true } });
  } catch (err) {
    console.error("[go-link] POST /modules/:moduleKey/verify-test-code failed:", err);
    return c.json({ error: { message: "Could not verify code", code: "INTERNAL" } }, 500);
  }
});

export { publicGoLinkRouter };
