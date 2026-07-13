import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth, verifyEmailPassword } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushToUsers } from "../lib/push";
import { logActivity } from "../lib/activity";
import { isPrismaUniqueOnName, isTeamDisplayNameTaken } from "../lib/team-name";
import {
  parseWorkplaceStandards,
  parseWorkplaceStandardsPatch,
  serializeWorkplaceStandards,
} from "../lib/workplace-standards";
import {
  parseGoFrontendSettings,
  parseGoFrontendSettingsPatch,
  serializeGoFrontendSettings,
} from "../lib/go-frontend-settings";
import {
  approveGoLoginRequest,
  canManageGoLoginRequests,
  findTeamByInviteCode,
} from "../lib/go-login-requests";
import {
  canManageWorkplaceAlerts,
  createWorkplaceAlert,
  listLinkedGoDevices,
  revokeLinkedGoDevice,
} from "../lib/workplace-alerts";
import { deleteWorkspaceCompletely } from "../lib/delete-workspace";
import { createWorkspaceForAuthUser } from "../lib/create-workspace";
import {
  canManageTeamRoster,
  cleanupWorkspaceMemberDeparture,
  listFormerWorkspaceMembers,
} from "../lib/workspace-member-departure";
import {
  canManageModules,
  getModuleDefinition,
  getWorkspaceModule,
  goLive,
  listWorkspaceModules,
  setGeneratedTestCode,
  setModuleStatus,
  setSetupProgress,
  switchToTesting,
  updateTestingAccess,
  validateModule,
} from "../lib/workspace-modules";
import {
  canInviteMembers,
  generateInviteToken,
  inviteExpiresAt,
  inviteOrAddMemberByEmail,
  previewInviteByEmail,
  listPendingTeamInvites,
  sendTeamInviteEmail,
  serializeTeamInvite,
} from "../lib/team-invites";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const teamsRouter = new Hono<{ Variables: Variables }>();

// Apply auth guard to all routes
teamsRouter.use("*", authGuard);

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function teamHasOwner(teamId: string): Promise<boolean> {
  const row = await prisma.teamMember.findFirst({ where: { teamId, role: "owner" } });
  return row !== null;
}

/** Owner, team leader, or admin; or any member if the workspace has no owner (recovery after bad data / legacy leave). */
async function canManageJoinRequests(teamId: string, userId: string): Promise<boolean> {
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!membership) return false;
  if (["owner", "team_leader", "admin"].includes(membership.role)) return true;
  if (!(await teamHasOwner(teamId))) return true;
  return false;
}

// GET /api/teams - list teams for current user
teamsRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    include: {
      team: {
        include: {
          _count: { select: { members: true, tasks: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  return c.json({ data: memberships.map((m) => ({ ...m.team, role: m.role })) });
});

// POST /api/teams - create team (users may own multiple workspaces)
teamsRouter.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { name } = body;
  if (!name?.trim()) {
    return c.json({ error: { message: "Team name is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const result = await createWorkspaceForAuthUser({
    authUser: user,
    preferredUserId: user.id,
    name,
  });
  if (!result.ok) {
    return c.json({ error: { message: result.message, code: result.code } }, result.status);
  }

  const { team } = result;
  const { notifyAdminsNewWorkspace } = await import("../lib/admin-push");
  void notifyAdminsNewWorkspace({
    id: team.id,
    name: team.name,
    ownerName: user.name,
  }).catch((err) => console.warn("[teams] admin workspace push failed", err));

  return c.json({ data: { ...team, role: "owner" } }, 201);
});

// POST /api/teams/join - join team by invite code (creates a pending join request)
teamsRouter.post("/join", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { inviteCode } = body;

  if (!inviteCode || typeof inviteCode !== "string" || !inviteCode.trim()) {
    return c.json({ error: { message: "Invite code is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const team = await findTeamByInviteCode(inviteCode, { id: true, name: true, inviteCode: true });
  if (!team) {
    return c.json({ error: { message: "Invalid invite code", code: "NOT_FOUND" } }, 404);
  }

  const existing = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId: team.id } },
  });
  if (existing) {
    return c.json({ error: { message: "Already a member", code: "CONFLICT" } }, 409);
  }

  const memberCount = await prisma.teamMember.count({ where: { teamId: team.id } });
  if (memberCount === 0) {
    const reclaimed = await prisma.$transaction(async (tx) => {
      const n = await tx.teamMember.count({ where: { teamId: team.id } });
      if (n !== 0) {
        throw new Error("CONCURRENT_JOIN");
      }
      await tx.teamMember.create({
        data: { userId: user.id, teamId: team.id, role: "owner" },
      });
      await tx.joinRequest.deleteMany({ where: { teamId: team.id } });
      return tx.team.findUnique({
        where: { id: team.id },
        include: { _count: { select: { members: true, tasks: true } } },
      });
    }).catch((e: unknown) => {
      if (e instanceof Error && e.message === "CONCURRENT_JOIN") return null;
      throw e;
    });

    if (!reclaimed) {
      return c.json(
        { error: { message: "Someone else just joined this workspace. Try again.", code: "CONFLICT" } },
        409,
      );
    }

    await logActivity({
      teamId: team.id,
      userId: user.id,
      type: "member_joined",
      metadata: { userName: user.name },
    });

    return c.json({ data: { ...reclaimed, role: "owner" as const } });
  }

  const existingRequest = await prisma.joinRequest.findUnique({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
  });
  if (existingRequest && existingRequest.status === "pending") {
    return c.json({ error: { message: "Request already pending", code: "CONFLICT" } }, 409);
  }

  let joinRequest;
  if (existingRequest) {
    // Reuse record if previously rejected
    joinRequest = await prisma.joinRequest.update({
      where: { id: existingRequest.id },
      data: { status: "pending" },
    });
  } else {
    joinRequest = await prisma.joinRequest.create({
      data: { teamId: team.id, userId: user.id, status: "pending" },
    });
  }

  // Notify team owners
  const owners = await prisma.teamMember.findMany({
    where: { teamId: team.id, role: { in: ["owner", "team_leader", "admin"] } },
    select: { userId: true },
  });
  const ownerIds = owners.map((o) => o.userId);
  await sendPushToUsers(ownerIds, "Join Request", `${user.name} wants to join ${team.name}`, { teamId: team.id, type: "join_request" }, undefined, team.id);

  return c.json({ data: { status: "pending", teamName: team.name, requestId: joinRequest.id } });
});

// GET /api/teams/:teamId - get team details
teamsRouter.get("/:teamId", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Team not found", code: "NOT_FOUND" } }, 404);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      _count: { select: { tasks: true } },
    },
  });

  const workplaceStandards = parseWorkplaceStandards(team?.workplaceStandards);
  const goFrontendSettings = parseGoFrontendSettings(team?.goFrontendSettings);
  return c.json({ data: { ...team, role: membership.role, workplaceStandards, goFrontendSettings } });
});

// GET /api/teams/:teamId/former-members - archived members with published check-in history
teamsRouter.get("/:teamId/former-members", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Team not found", code: "NOT_FOUND" } }, 404);
  }
  if (!canManageTeamRoster(membership.role)) {
    return c.json({ error: { message: "Only leaders can view former members", code: "FORBIDDEN" } }, 403);
  }

  const data = await listFormerWorkspaceMembers(prisma, teamId);
  return c.json({ data });
});

// PATCH /api/teams/:teamId - update team name
teamsRouter.patch("/:teamId", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const body = await c.req.json();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || !["owner","team_leader"].includes(membership.role)) {
    return c.json({ error: { message: "Only owners and team leaders can edit team info", code: "FORBIDDEN" } }, 403);
  }

  const nameTrim = typeof body.name === "string" ? body.name.trim() : "";
  const hasWorkplaceStandards = body.workplaceStandards !== undefined;
  const hasGoFrontendSettings = body.goFrontendSettings !== undefined;
  if (hasWorkplaceStandards && membership.role !== "owner") {
    return c.json(
      { error: { message: "Only the workspace owner can edit workplace standards", code: "FORBIDDEN" } },
      403,
    );
  }

  let parsedStandards: ReturnType<typeof parseWorkplaceStandardsPatch> | null = null;
  if (hasWorkplaceStandards) {
    parsedStandards = parseWorkplaceStandardsPatch(body.workplaceStandards);
    if (!parsedStandards.ok) {
      return c.json({ error: { message: parsedStandards.message, code: "VALIDATION_ERROR" } }, 400);
    }
    if (parsedStandards.value.requiredCheckInTemplateId) {
      const template = await prisma.oneOnOneTemplate.findFirst({
        where: { id: parsedStandards.value.requiredCheckInTemplateId, teamId },
        select: { id: true },
      });
      if (!template) {
        return c.json({ error: { message: "Check-in template not found in this workspace", code: "NOT_FOUND" } }, 404);
      }
    }
  }

  let parsedGoFrontendSettings: ReturnType<typeof parseGoFrontendSettingsPatch> | null = null;
  if (hasGoFrontendSettings) {
    const existingTeam = await prisma.team.findUnique({
      where: { id: teamId },
      select: { goFrontendSettings: true },
    });
    const currentGoSettings = parseGoFrontendSettings(existingTeam?.goFrontendSettings);
    parsedGoFrontendSettings = parseGoFrontendSettingsPatch(body.goFrontendSettings, currentGoSettings);
    if (!parsedGoFrontendSettings.ok) {
      return c.json({ error: { message: parsedGoFrontendSettings.message, code: "VALIDATION_ERROR" } }, 400);
    }
  }

  if (nameTrim && (await isTeamDisplayNameTaken(nameTrim, teamId))) {
    return c.json(
      { error: { message: "Another workspace already uses this name. Pick a different name.", code: "TEAM_NAME_TAKEN" } },
      409,
    );
  }

  let team;
  try {
    team = await prisma.team.update({
      where: { id: teamId },
      data: {
        ...(nameTrim ? { name: nameTrim } : {}),
        ...(body.image !== undefined ? { image: body.image } : {}),
        ...(parsedStandards?.ok
          ? { workplaceStandards: serializeWorkplaceStandards(parsedStandards.value) }
          : {}),
        ...(parsedGoFrontendSettings?.ok
          ? { goFrontendSettings: serializeGoFrontendSettings(parsedGoFrontendSettings.value) }
          : {}),
      },
    });
  } catch (err) {
    if (isPrismaUniqueOnName(err)) {
      return c.json(
        { error: { message: "Another workspace already uses this name. Pick a different name.", code: "TEAM_NAME_TAKEN" } },
        409,
      );
    }
    throw err;
  }

  const workplaceStandards = parseWorkplaceStandards(team.workplaceStandards);
  const goFrontendSettings = parseGoFrontendSettings(team.goFrontendSettings);
  return c.json({ data: { ...team, workplaceStandards, goFrontendSettings } });
});

// DELETE /api/teams/:teamId/leave - leave team (workspace owner cannot leave)
teamsRouter.delete("/:teamId/leave", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Not a member of this workspace", code: "NOT_FOUND" } }, 404);
  }
  if (membership.role === "owner") {
    return c.json(
      {
        error: {
          message: "Workspace owners cannot leave. Transfer ownership to another member first, or delete the workspace.",
          code: "FORBIDDEN",
        },
      },
      403,
    );
  }

  await cleanupWorkspaceMemberDeparture(prisma, teamId, user.id);

  await prisma.teamMember.deleteMany({
    where: { userId: user.id, teamId },
  });

  await logActivity({
    teamId,
    userId: user.id,
    type: "member_removed",
    metadata: { userName: user.name },
  });

  return c.body(null, 204);
});

// DELETE /api/teams/:teamId - delete workspace (owner only; confirm with password or "DELETE")
teamsRouter.delete("/:teamId", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || membership.role !== "owner") {
    return c.json(
      { error: { message: "Only the workspace owner can delete this workspace", code: "FORBIDDEN" } },
      403,
    );
  }

  let confirmation: { password?: string; confirmPhrase?: string } = {};
  try {
    const raw = await c.req.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      confirmation = raw as { password?: string; confirmPhrase?: string };
    }
  } catch {
    /* no body */
  }

  const password = typeof confirmation.password === "string" ? confirmation.password.trim() : "";
  const phrase = typeof confirmation.confirmPhrase === "string" ? confirmation.confirmPhrase.trim() : "";

  if (password) {
    const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!fullUser?.email) {
      return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
    }
    try {
      const verified = await verifyEmailPassword(fullUser.email, password);
      if (!verified) throw new Error("Sign-in failed");
    } catch {
      return c.json({ error: { message: "Incorrect password", code: "INVALID_PASSWORD" } }, 401);
    }
  } else if (phrase === "DELETE") {
    /* confirmed */
  } else {
    return c.json(
      {
        error: {
          message: 'Confirm deletion with your account password or type DELETE in the confirmation field',
          code: "VALIDATION_ERROR",
        },
      },
      400,
    );
  }

  try {
    await deleteWorkspaceCompletely(teamId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[teams] delete workspace failed team=${teamId} user=${user.id}:`, err);
    return c.json(
      {
        error: {
          message: "Could not delete this workspace. Please try again or contact support.",
          code: "WORKSPACE_DELETE_FAILED",
          detail: msg.slice(0, 300),
        },
      },
      500,
    );
  }

  return c.json({ data: { ok: true, deletedTeamId: teamId } });
});

// GET /api/teams/:teamId/join-requests - list pending join requests
teamsRouter.get("/:teamId/join-requests", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  if (!(await canManageJoinRequests(teamId, user.id))) {
    return c.json({ error: { message: "You cannot view join requests for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const requests = await prisma.joinRequest.findMany({
    where: { teamId, status: "pending" },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return c.json({ data: requests });
});

// POST /api/teams/:teamId/join-requests/:requestId/approve - approve a join request
teamsRouter.post("/:teamId/join-requests/:requestId/approve", async (c) => {
  const user = c.get("user")!;
  const { teamId, requestId } = c.req.param();

  if (!(await canManageJoinRequests(teamId, user.id))) {
    return c.json({ error: { message: "You cannot approve join requests for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const joinRequest = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    include: {
      team: { select: { name: true } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!joinRequest || joinRequest.teamId !== teamId) {
    return c.json({ error: { message: "Join request not found", code: "NOT_FOUND" } }, 404);
  }

  if (joinRequest.status === "approved") {
    return c.json({ data: { success: true, alreadyApproved: true } });
  }
  if (joinRequest.status !== "pending") {
    return c.json(
      { error: { message: "This join request is no longer pending", code: "CONFLICT" } },
      409,
    );
  }

  const existingMember = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: joinRequest.userId, teamId } },
  });
  if (existingMember) {
    await prisma.joinRequest.update({
      where: { id: requestId },
      data: { status: "approved" },
    });
    return c.json({ data: { success: true, alreadyMember: true } });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const hasOwner = await tx.teamMember.findFirst({ where: { teamId, role: "owner" } });
      let newMemberRole = "member";
      if (!hasOwner) {
        const tl = await tx.teamMember.findFirst({
          where: { teamId, role: "team_leader" },
          orderBy: { joinedAt: "asc" },
        });
        if (tl) {
          await tx.teamMember.update({
            where: { userId_teamId: { userId: tl.userId, teamId } },
            data: { role: "owner" },
          });
        } else {
          newMemberRole = "owner";
        }
      }
      await tx.teamMember.create({
        data: { userId: joinRequest.userId, teamId, role: newMemberRole },
      });
      await tx.joinRequest.update({
        where: { id: requestId },
        data: { status: "approved" },
      });
    });
  } catch (err) {
    // Unique membership race: treat as success after marking approved.
    const racedMember = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: joinRequest.userId, teamId } },
    });
    if (!racedMember) throw err;
    await prisma.joinRequest.update({
      where: { id: requestId },
      data: { status: "approved" },
    });
    return c.json({ data: { success: true, alreadyMember: true } });
  }

  // Notify the requesting user
  await sendPushToUsers(
    [joinRequest.userId],
    "Request Approved!",
    `You've been approved to join ${joinRequest.team.name}`,
    { teamId, type: "join_approved" },
    undefined,
    teamId
  );

  const { notifyAdminsMemberJoined } = await import("../lib/admin-push");
  void notifyAdminsMemberJoined({
    userId: joinRequest.userId,
    userName: joinRequest.user.name,
    teamId,
    teamName: joinRequest.team.name,
  }).catch((err) => console.warn("[teams] admin member-joined push failed", err));

  // Log activity for member joining
  const joinedUser = await prisma.user.findUnique({
    where: { id: joinRequest.userId },
    select: { name: true },
  });
  await logActivity({
    teamId,
    userId: joinRequest.userId,
    type: "member_joined",
    metadata: { userName: joinedUser?.name ?? "" },
  });

  return c.json({ data: { success: true } });
});

// POST /api/teams/:teamId/join-requests/:requestId/reject - reject a join request
teamsRouter.post("/:teamId/join-requests/:requestId/reject", async (c) => {
  const user = c.get("user")!;
  const { teamId, requestId } = c.req.param();

  if (!(await canManageJoinRequests(teamId, user.id))) {
    return c.json({ error: { message: "You cannot reject join requests for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const joinRequest = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    include: { team: { select: { name: true } } },
  });
  if (!joinRequest || joinRequest.teamId !== teamId) {
    return c.json({ error: { message: "Join request not found", code: "NOT_FOUND" } }, 404);
  }

  if (joinRequest.status === "rejected") {
    return c.json({ data: { success: true, alreadyRejected: true } });
  }
  if (joinRequest.status !== "pending") {
    return c.json(
      { error: { message: "This join request is no longer pending", code: "CONFLICT" } },
      409,
    );
  }

  await prisma.joinRequest.update({
    where: { id: requestId },
    data: { status: "rejected" },
  });

  // Notify the requesting user
  await sendPushToUsers(
    [joinRequest.userId],
    "Request Update",
    `Your request to join ${joinRequest.team.name} was not approved`,
    { teamId, type: "join_rejected" },
    undefined,
    teamId
  );

  return c.json({ data: { success: true } });
});

// GET /api/teams/:teamId/go-login-requests - pending Alenio Go device link requests
teamsRouter.get("/:teamId/go-login-requests", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  if (!(await canManageGoLoginRequests(teamId, user.id))) {
    return c.json({ error: { message: "You cannot view Alenio Go login requests for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const requests = await prisma.goLoginRequest.findMany({
    where: { teamId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  return c.json({ data: requests });
});

// POST /api/teams/:teamId/go-login-requests/:requestId/approve
teamsRouter.post("/:teamId/go-login-requests/:requestId/approve", async (c) => {
  const user = c.get("user")!;
  const { teamId, requestId } = c.req.param();

  if (!(await canManageGoLoginRequests(teamId, user.id))) {
    return c.json({ error: { message: "You cannot approve Alenio Go login requests for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const result = await approveGoLoginRequest(teamId, requestId, user.id);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") {
      return c.json({ error: { message: "Login request not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ error: { message: "Request is no longer pending", code: "CONFLICT" } }, 409);
  }

  return c.json({ data: { success: true, hubToken: result.hubToken } });
});

// POST /api/teams/:teamId/go-login-requests/:requestId/reject
teamsRouter.post("/:teamId/go-login-requests/:requestId/reject", async (c) => {
  const user = c.get("user")!;
  const { teamId, requestId } = c.req.param();

  if (!(await canManageGoLoginRequests(teamId, user.id))) {
    return c.json({ error: { message: "You cannot reject Alenio Go login requests for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const request = await prisma.goLoginRequest.findUnique({ where: { id: requestId } });
  if (!request || request.teamId !== teamId) {
    return c.json({ error: { message: "Login request not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.goLoginRequest.update({
    where: { id: requestId },
    data: { status: "rejected" },
  });

  return c.json({ data: { success: true } });
});

const inviteEmailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

// GET /api/teams/:teamId/invites
teamsRouter.get("/:teamId/invites", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  if (!(await canInviteMembers(teamId, user.id))) {
    return c.json({ error: { message: "You cannot view invites for this workspace", code: "FORBIDDEN" } }, 403);
  }

  const data = await listPendingTeamInvites(teamId);
  return c.json({ data });
});

// POST /api/teams/:teamId/invites
teamsRouter.post("/:teamId/invites", zValidator("json", inviteEmailSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
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

// POST /api/teams/:teamId/invites/preview
teamsRouter.post("/:teamId/invites/preview", zValidator("json", inviteEmailSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const { email } = c.req.valid("json");

  if (!(await canInviteMembers(teamId, user.id))) {
    return c.json({ error: { message: "You cannot invite members to this workspace", code: "FORBIDDEN" } }, 403);
  }

  try {
    const data = await previewInviteByEmail(teamId, email);
    return c.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "VALIDATION") {
      return c.json({ error: { message: "Enter a valid email address", code: "VALIDATION_ERROR" } }, 400);
    }
    throw err;
  }
});

// DELETE /api/teams/:teamId/invites/:inviteId
teamsRouter.delete("/:teamId/invites/:inviteId", async (c) => {
  const user = c.get("user")!;
  const { teamId, inviteId } = c.req.param();

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
teamsRouter.post("/:teamId/invites/:inviteId/resend", async (c) => {
  const user = c.get("user")!;
  const { teamId, inviteId } = c.req.param();

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

// DELETE /api/teams/:teamId/members/:memberId - remove a member (owner only)
teamsRouter.delete("/:teamId/members/:memberId", async (c) => {
  const user = c.get("user")!;
  const { teamId, memberId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || !["owner","team_leader"].includes(membership.role)) {
    return c.json({ error: { message: "Only owners and team leaders can remove members", code: "FORBIDDEN" } }, 403);
  }

  if (memberId === user.id) {
    return c.json({ error: { message: "You cannot remove yourself", code: "BAD_REQUEST" } }, 400);
  }

  const targetMembership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: memberId, teamId } },
    include: { user: { select: { name: true } } },
  });
  if (!targetMembership) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }
  if (["owner", "team_leader"].includes(targetMembership.role)) {
    return c.json({ error: { message: "Cannot remove an owner or team leader", code: "FORBIDDEN" } }, 403);
  }

  await cleanupWorkspaceMemberDeparture(prisma, teamId, memberId);

  await prisma.teamMember.delete({
    where: { userId_teamId: { userId: memberId, teamId } },
  });

  await logActivity({
    teamId,
    userId: memberId,
    type: "member_removed",
    metadata: { userName: targetMembership.user.name ?? "" },
  });

  return c.body(null, 204);
});

// PATCH /api/teams/:teamId/members/:userId/role - change member role
teamsRouter.patch("/:teamId/members/:userId/role", async (c) => {
  const user = c.get("user")!;
  const { teamId, userId } = c.req.param();
  const { role } = await c.req.json<{ role: string }>();

  // Only allow valid non-owner roles to be assigned
  if (!["member", "team_leader"].includes(role)) {
    return c.json({ error: { message: "Invalid role" } }, 400);
  }

  // Caller must be owner
  const caller = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!caller || caller.role !== "owner") {
    return c.json({ error: { message: "Only owners can change roles" } }, 403);
  }

  // Target must exist and not be an owner
  const target = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!target) return c.json({ error: { message: "Member not found" } }, 404);
  if (target.role === "owner") {
    return c.json({ error: { message: "Cannot change owner role" } }, 403);
  }

  const updated = await prisma.teamMember.update({
    where: { userId_teamId: { userId, teamId } },
    data: { role },
  });

  return c.json({ data: updated });
});

// Transfer team ownership to another member
teamsRouter.post("/:teamId/transfer-ownership", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const { userId: newOwnerId } = await c.req.json<{ userId: string }>();

  // Caller must be current owner
  const caller = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!caller || caller.role !== "owner") {
    return c.json({ error: { message: "Only the owner can transfer ownership" } }, 403);
  }

  // Target must be an existing member and not already the owner
  const target = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: newOwnerId, teamId } },
  });
  if (!target) return c.json({ error: { message: "Member not found" } }, 404);
  if (target.role === "owner") {
    return c.json({ error: { message: "Member is already the owner" } }, 400);
  }

  // Atomically promote new owner and demote current owner
  await prisma.$transaction([
    prisma.teamMember.update({
      where: { userId_teamId: { userId: newOwnerId, teamId } },
      data: { role: "owner" },
    }),
    prisma.teamMember.update({
      where: { userId_teamId: { userId: user.id, teamId } },
      data: { role: "member" },
    }),
  ]);

  return c.json({ data: { success: true } });
});

const workplaceAlertBodySchema = z.object({
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(500),
  targetType: z.enum(["device", "all_devices", "all_users"]),
  targetDeviceId: z.string().trim().min(8).max(128).optional(),
  playSound: z.boolean().optional(),
});

// GET /api/teams/:teamId/go-devices — approved Alenio Go devices
teamsRouter.get("/:teamId/go-devices", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  if (!(await canManageWorkplaceAlerts(teamId, user.id))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const devices = await listLinkedGoDevices(teamId);
  return c.json({
    data: devices.map((d) => ({
      id: d.id,
      deviceId: d.deviceId,
      deviceLabel: d.deviceLabel,
      updatedAt: d.updatedAt.toISOString(),
      source: d.source,
    })),
  });
});

// DELETE /api/teams/:teamId/go-devices/:deviceId — revoke a linked Alenio Go device
teamsRouter.delete("/:teamId/go-devices/:deviceId", async (c) => {
  const user = c.get("user")!;
  const { teamId, deviceId } = c.req.param();

  if (!(await canManageWorkplaceAlerts(teamId, user.id))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const result = await revokeLinkedGoDevice(teamId, deviceId);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") {
      return c.json({ error: { message: "Device not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ error: { message: "Invalid device", code: "VALIDATION" } }, 400);
  }

  return c.json({ data: { success: true } });
});

// POST /api/teams/:teamId/workplace-alerts — push alert to devices or workspace users
teamsRouter.post("/:teamId/workplace-alerts", zValidator("json", workplaceAlertBodySchema), async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const body = c.req.valid("json");

  if (!(await canManageWorkplaceAlerts(teamId, user.id))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const result = await createWorkplaceAlert(teamId, user.id, {
    title: body.title ?? "Workplace alert",
    body: body.body,
    targetType: body.targetType,
    targetDeviceId: body.targetDeviceId,
    playSound: body.playSound,
  });

  if (!result.ok) {
    if (result.code === "DEVICE_NOT_FOUND") {
      return c.json({ error: { message: "Device not found or not approved", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ error: { message: "Invalid alert", code: "VALIDATION_ERROR" } }, 400);
  }

  return c.json({ data: result.alert });
});

// ── Workspace modules (lifecycle + operating mode) ──────────────────────────
// All routes are scoped by workspace (teamId) and require owner/team_leader.

const moduleStatusSchema = z.object({ status: z.enum(["inactive", "active"]) });
const operatingModeSchema = z.object({ operatingMode: z.enum(["testing", "live"]) });
const setupProgressSchema = z.object({ setupProgressPercent: z.number().min(0).max(100) });
const testingAccessSchema = z.object({
  requireTestCode: z.boolean().optional(),
  testAccessCode: z.string().trim().max(64).nullable().optional(),
  testCodeExpiresAt: z.string().datetime().nullable().optional(),
  allowedTestingWorkplaceIds: z.array(z.string()).optional(),
  allowedTestingUserIds: z.array(z.string()).optional(),
  allowedTestingRoles: z.array(z.string()).optional(),
});

async function guardModuleManage(teamId: string, userId: string, moduleKey?: string) {
  if (moduleKey && !getModuleDefinition(moduleKey)) {
    return { ok: false as const, status: 404 as const, message: "Unknown module", code: "NOT_FOUND" };
  }
  if (!(await canManageModules(teamId, userId))) {
    return { ok: false as const, status: 403 as const, message: "Forbidden", code: "FORBIDDEN" };
  }
  return { ok: true as const };
}

// GET /api/teams/:teamId/modules
teamsRouter.get("/:teamId/modules", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const guard = await guardModuleManage(teamId, user.id);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const modules = await listWorkspaceModules(teamId);
  return c.json({ data: { modules } });
});

// GET /api/teams/:teamId/modules/:moduleKey
teamsRouter.get("/:teamId/modules/:moduleKey", async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const module = await getWorkspaceModule(teamId, moduleKey);
  if (!module) return c.json({ error: { message: "Unknown module", code: "NOT_FOUND" } }, 404);
  return c.json({ data: { module } });
});

// PATCH /api/teams/:teamId/modules/:moduleKey/status
teamsRouter.patch("/:teamId/modules/:moduleKey/status", zValidator("json", moduleStatusSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const { status } = c.req.valid("json");
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const module = await setModuleStatus(teamId, moduleKey, status, user.id);
  return c.json({ data: { module } });
});

// PATCH /api/teams/:teamId/modules/:moduleKey/operating-mode
// Routes to go-live (with validation) or switch-to-testing.
teamsRouter.patch("/:teamId/modules/:moduleKey/operating-mode", zValidator("json", operatingModeSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const { operatingMode } = c.req.valid("json");
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);

  const result = operatingMode === "live"
    ? await goLive(teamId, moduleKey, user.id)
    : await switchToTesting(teamId, moduleKey, user.id);

  if (!result.ok) {
    if (result.code === "MODULE_INACTIVE") {
      return c.json({ error: { message: "Module must be active to set an operating mode", code: "MODULE_INACTIVE" } }, 400);
    }
    return c.json({ error: { message: "Module failed validation for Go Live", code: "VALIDATION_FAILED" }, validation: result.validation }, 400);
  }
  return c.json({ data: { module: result.module } });
});

// PATCH /api/teams/:teamId/modules/:moduleKey/setup-progress
teamsRouter.patch("/:teamId/modules/:moduleKey/setup-progress", zValidator("json", setupProgressSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const { setupProgressPercent } = c.req.valid("json");
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const module = await setSetupProgress(teamId, moduleKey, setupProgressPercent);
  return c.json({ data: { module } });
});

// PATCH /api/teams/:teamId/modules/:moduleKey/testing-access
teamsRouter.patch("/:teamId/modules/:moduleKey/testing-access", zValidator("json", testingAccessSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const patch = c.req.valid("json");
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const module = await updateTestingAccess(teamId, moduleKey, patch);
  return c.json({ data: { module } });
});

// POST /api/teams/:teamId/modules/:moduleKey/generate-test-code
teamsRouter.post("/:teamId/modules/:moduleKey/generate-test-code", async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const module = await setGeneratedTestCode(teamId, moduleKey);
  return c.json({ data: { module } });
});

// POST /api/teams/:teamId/modules/:moduleKey/validate
teamsRouter.post("/:teamId/modules/:moduleKey/validate", async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const validation = await validateModule(teamId, moduleKey);
  return c.json({ data: { validation } });
});

// POST /api/teams/:teamId/modules/:moduleKey/go-live
teamsRouter.post("/:teamId/modules/:moduleKey/go-live", async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const result = await goLive(teamId, moduleKey, user.id);
  if (!result.ok) {
    if (result.code === "MODULE_INACTIVE") {
      return c.json({ error: { message: "Module must be active to go live", code: "MODULE_INACTIVE" } }, 400);
    }
    return c.json({ error: { message: "Module failed validation for Go Live", code: "VALIDATION_FAILED" }, validation: result.validation }, 400);
  }
  return c.json({ data: { module: result.module } });
});

// POST /api/teams/:teamId/modules/:moduleKey/switch-to-testing
teamsRouter.post("/:teamId/modules/:moduleKey/switch-to-testing", async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const result = await switchToTesting(teamId, moduleKey, user.id);
  if (!result.ok) {
    return c.json({ error: { message: "Module must be active to switch to testing", code: "MODULE_INACTIVE" } }, 400);
  }
  return c.json({ data: { module: result.module } });
});

// GET /api/teams/:teamId/modules/:moduleKey/test-sessions — admin Testing Sessions view
teamsRouter.get("/:teamId/modules/:moduleKey/test-sessions", async (c) => {
  const user = c.get("user")!;
  const { teamId, moduleKey } = c.req.param();
  const guard = await guardModuleManage(teamId, user.id, moduleKey);
  if (!guard.ok) return c.json({ error: { message: guard.message, code: guard.code } }, guard.status);
  const sessions = await prisma.moduleTestSession.findMany({
    where: { teamId, moduleKey },
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  return c.json({
    data: {
      sessions: sessions.map((s) => ({
        id: s.id,
        moduleKey: s.moduleKey,
        testerName: s.testerName,
        workplaceName: s.workplaceName,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        durationSeconds: s.durationSeconds,
        completedSteps: s.completedSteps,
        failedSteps: s.failedSteps,
        notes: s.notes,
      })),
    },
  });
});

export { teamsRouter };
