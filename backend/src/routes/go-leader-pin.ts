import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { authGuard } from "../middleware/auth-guard";
import { canManageGoLoginRequests } from "../lib/go-login-requests";
import { getGoLeaderPinStatus, setGoLeaderPin, verifyOwnGoLeaderPin } from "../lib/go-leader-pin";

const goLeaderPinRouter = new Hono();

goLeaderPinRouter.use("*", authGuard);

const goLeaderPinBodySchema = z.object({
  pin: z.string().trim().regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits."),
});

// GET /api/teams/:teamId/members/me/go-pin
goLeaderPinRouter.get("/go-pin", async (c) => {
  try {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId")?.trim();
    if (!teamId) {
      return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
    }

    if (!(await canManageGoLoginRequests(teamId, user.id))) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const status = await getGoLeaderPinStatus(prisma, teamId, user.id);
    if (!status.ok) {
      return c.json({ error: { message: "Team membership not found", code: "NOT_FOUND" } }, 404);
    }

    return c.json({ data: { hasPin: status.hasPin } });
  } catch (err) {
    console.error("[go-leader-pin] GET /go-pin failed:", err);
    return c.json({ error: { message: "Could not load PIN status", code: "INTERNAL" } }, 500);
  }
});

// PUT /api/teams/:teamId/members/me/go-pin
goLeaderPinRouter.put("/go-pin", zValidator("json", goLeaderPinBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId")?.trim();
    if (!teamId) {
      return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
    }
    const { pin } = c.req.valid("json");

    if (!(await canManageGoLoginRequests(teamId, user.id))) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const result = await setGoLeaderPin(prisma, teamId, user.id, pin);
    if (!result.ok) {
      if (result.code === "NOT_MEMBER") {
        return c.json({ error: { message: "Team membership not found", code: "NOT_FOUND" } }, 404);
      }
      return c.json({ error: { message: "PIN must be 4 to 8 digits.", code: "VALIDATION_ERROR" } }, 400);
    }

    return c.json({ data: { hasPin: true } });
  } catch (err) {
    console.error("[go-leader-pin] PUT /go-pin failed:", err);
    return c.json({ error: { message: "Could not save PIN", code: "INTERNAL" } }, 500);
  }
});

// POST /api/teams/:teamId/members/me/go-pin/verify
goLeaderPinRouter.post("/go-pin/verify", zValidator("json", goLeaderPinBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId")?.trim();
    if (!teamId) {
      return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
    }
    const { pin } = c.req.valid("json");

    if (!(await canManageGoLoginRequests(teamId, user.id))) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const result = await verifyOwnGoLeaderPin(prisma, teamId, user.id, pin);
    if (!result.ok) {
      if (result.code === "NOT_MEMBER") {
        return c.json({ error: { message: "Team membership not found", code: "NOT_FOUND" } }, 404);
      }
      if (result.code === "NO_PIN") {
        return c.json({ error: { message: "Create your Alenio Go PIN first.", code: "NO_PIN" } }, 400);
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
    console.error("[go-leader-pin] POST /go-pin/verify failed:", err);
    return c.json({ error: { message: "Could not verify PIN", code: "INTERNAL" } }, 500);
  }
});

export { goLeaderPinRouter };
