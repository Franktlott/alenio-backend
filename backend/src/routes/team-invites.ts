import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import {
  canInviteMembers,
  inviteOrAddMemberByEmail,
  listPendingTeamInvites,
  redeemInviteByToken,
  sendTeamInviteEmail,
  serializeTeamInvite,
  inviteExpiresAt,
  generateInviteToken,
} from "../lib/team-invites";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const teamInvitesRouter = new Hono<{ Variables: Variables }>();
teamInvitesRouter.use("*", authGuard);

const inviteEmailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

// GET /api/teams/:teamId/invites
teamInvitesRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  if (!(await canInviteMembers(teamId, user.id))) {
    return c.json({ error: { message: "You cannot view invites for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const data = await listPendingTeamInvites(teamId);
  return c.json({ data });
});

// POST /api/teams/:teamId/invites — add existing user or email invite
teamInvitesRouter.post("/", zValidator("json", inviteEmailSchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { email } = c.req.valid("json");

  if (!(await canInviteMembers(teamId, user.id))) {
    return c.json({ error: { message: "You cannot invite members to this workspace", code: "FORBIDDEN" } }, 403);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) {
    return c.json({ error: { message: "Workspace not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    const result = await inviteOrAddMemberByEmail({
      teamId,
      email,
      invitedById: user.id,
      inviterName: user.name ?? user.email ?? "A team leader",
      teamName: team.name,
    });

    if (result.kind === "added") {
      return c.json({
        data: {
          added: true,
          user: result.user,
          role: result.role,
        },
      });
    }

    return c.json({
      data: {
        added: false,
        invite: result.invite,
        emailSent: result.emailSent,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "ALREADY_MEMBER") {
      return c.json({ error: { message: "This person is already in the workspace", code: "CONFLICT" } }, 409);
    }
    if (msg === "VALIDATION") {
      return c.json({ error: { message: "Enter a valid email address", code: "VALIDATION_ERROR" } }, 400);
    }
    throw err;
  }
});

// DELETE /api/teams/:teamId/invites/:inviteId
teamInvitesRouter.delete("/:inviteId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const inviteId = c.req.param("inviteId") as string;

  if (!(await canInviteMembers(teamId, user.id))) {
    return c.json({ error: { message: "You cannot manage invites for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const invite = await prisma.teamInvite.findFirst({
    where: { id: inviteId, teamId, status: "pending" },
  });
  if (!invite) {
    return c.json({ error: { message: "Invite not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.teamInvite.update({
    where: { id: inviteId },
    data: { status: "cancelled" },
  });

  return c.json({ data: { cancelled: true } });
});

// POST /api/teams/:teamId/invites/:inviteId/resend
teamInvitesRouter.post("/:inviteId/resend", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const inviteId = c.req.param("inviteId") as string;

  if (!(await canInviteMembers(teamId, user.id))) {
    return c.json({ error: { message: "You cannot manage invites for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const invite = await prisma.teamInvite.findFirst({
    where: { id: inviteId, teamId, status: "pending" },
    include: { team: { select: { name: true } } },
  });
  if (!invite) {
    return c.json({ error: { message: "Invite not found", code: "NOT_FOUND" } }, 404);
  }

  const token = generateInviteToken();
  const updated = await prisma.teamInvite.update({
    where: { id: inviteId },
    data: { token, expiresAt: inviteExpiresAt(), invitedById: user.id },
    include: {
      invitedBy: { select: { id: true, name: true, email: true, image: true } },
      acceptedUser: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  const inviter = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, email: true },
  });

  const emailResult = await sendTeamInviteEmail({
    to: invite.email,
    teamName: invite.team.name,
    inviterName: inviter?.name ?? inviter?.email ?? "A team leader",
    token,
  });

  if (!emailResult.sent) {
    return c.json(
      { error: { message: emailResult.error ?? "Failed to send invite email", code: "EMAIL_SEND_FAILED" } },
      500,
    );
  }

  return c.json({ data: serializeTeamInvite(updated) });
});

const teamInvitesPublicRouter = new Hono<{ Variables: Variables }>();

// POST /api/team-invites/redeem — accept invite after sign-in (before /:token)
teamInvitesPublicRouter.post("/redeem", authGuard, zValidator("json", z.object({ token: z.string().min(1) })), async (c) => {
  const user = c.get("user")!;
  const { token } = c.req.valid("json");

  const result = await redeemInviteByToken(token, user.id, user.email ?? "");
  if (!result) {
    return c.json(
      {
        error: {
          message: "Invite not found, expired, or email does not match your account",
          code: "INVALID_INVITE",
        },
      },
      400,
    );
  }

  return c.json({ data: result });
});

// GET /api/team-invites/:token — preview invite (no auth)
teamInvitesPublicRouter.get("/:token", async (c) => {
  const token = c.req.param("token") as string;
  const invite = await prisma.teamInvite.findUnique({
    where: { token },
    include: {
      team: { select: { id: true, name: true, image: true } },
      invitedBy: { select: { name: true } },
    },
  });

  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    return c.json({ error: { message: "Invite not found or expired", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      teamId: invite.teamId,
      teamName: invite.team.name,
      teamImage: invite.team.image,
      inviterName: invite.invitedBy.name,
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
});

export { teamInvitesRouter, teamInvitesPublicRouter };
