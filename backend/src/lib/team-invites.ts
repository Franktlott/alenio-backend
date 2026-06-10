import { randomBytes } from "crypto";
import { Resend } from "resend";
import { prisma } from "../prisma";
import { env } from "../env";
import { logActivity } from "./activity";
import { sendPushToUsers } from "./push";

const INVITE_TTL_DAYS = 7;

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function inviteExpiresAt(from = new Date()): Date {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + INVITE_TTL_DAYS);
  return expires;
}

export async function canInviteMembers(teamId: string, userId: string): Promise<boolean> {
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!membership) return false;
  return membership.role === "owner" || membership.role === "team_leader";
}

async function teamHasOwner(teamId: string): Promise<boolean> {
  const row = await prisma.teamMember.findFirst({ where: { teamId, role: "owner" } });
  return row !== null;
}

export async function addUserToTeam(teamId: string, userId: string): Promise<{ role: string }> {
  const existing = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (existing) {
    return { role: existing.role };
  }

  let newMemberRole = "member";
  await prisma.$transaction(async (tx) => {
    const hasOwner = await tx.teamMember.findFirst({ where: { teamId, role: "owner" } });
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
      data: { userId, teamId, role: newMemberRole },
    });

    await tx.joinRequest.updateMany({
      where: { teamId, userId, status: "pending" },
      data: { status: "approved" },
    });
  });

  const joinedUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true },
  });

  await logActivity({
    teamId,
    userId,
    type: "member_joined",
    metadata: { userName: joinedUser?.name ?? "" },
  });

  if (team) {
    await sendPushToUsers(
      [userId],
      "Added to workspace",
      `You've been added to ${team.name}`,
      { teamId, type: "join_approved" },
      undefined,
      teamId,
    );
  }

  return { role: newMemberRole };
}

export function buildInviteLinks(token: string): { webUrl: string; appUrl: string } {
  const webBase = (env.WEB_PUBLIC_URL ?? env.BACKEND_URL).replace(/\/$/, "");
  const webUrl = `${webBase}/invite/${encodeURIComponent(token)}`;
  const appUrl = `${env.APP_SCHEME}://invite/${encodeURIComponent(token)}`;
  return { webUrl, appUrl };
}

export async function sendTeamInviteEmail(input: {
  to: string;
  teamName: string;
  inviterName: string;
  token: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!env.RESEND_API_KEY) {
    console.error("[team-invites] RESEND_API_KEY is not set");
    return { sent: false, error: "Email service not configured" };
  }

  const { webUrl, appUrl } = buildInviteLinks(input.token);
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.FROM_EMAIL,
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.teamName} on Alenio`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #4361EE; margin-bottom: 8px;">You're invited to ${input.teamName}</h2>
        <p style="color: #475569; line-height: 1.6;">
          <strong>${input.inviterName}</strong> added you to their workspace on Alenio.
          Open the link below to sign in or create your account — you'll join automatically.
        </p>
        <p style="margin: 24px 0;">
          <a href="${webUrl}" style="display: inline-block; background: #4361EE; color: white; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 600;">
            Join ${input.teamName}
          </a>
        </p>
        <p style="color: #94A3B8; font-size: 13px; line-height: 1.5;">
          On mobile, you can also open: <a href="${appUrl}">${appUrl}</a><br />
          This invite expires in ${INVITE_TTL_DAYS} days.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[team-invites] Resend error:", JSON.stringify(error));
    return { sent: false, error: error.message ?? "Failed to send email" };
  }

  return { sent: true };
}

export function serializeTeamInvite(invite: {
  id: string;
  teamId: string;
  email: string;
  invitedById: string;
  token: string;
  status: string;
  acceptedUserId: string | null;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  invitedBy?: { id: string; name: string; email: string; image: string | null };
  acceptedUser?: { id: string; name: string; email: string; image: string | null } | null;
}) {
  return {
    id: invite.id,
    teamId: invite.teamId,
    email: invite.email,
    invitedById: invite.invitedById,
    status: invite.status,
    acceptedUserId: invite.acceptedUserId,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null,
    invitedBy: invite.invitedBy,
    acceptedUser: invite.acceptedUser,
  };
}

const inviteInclude = {
  invitedBy: { select: { id: true, name: true, email: true, image: true } },
  acceptedUser: { select: { id: true, name: true, email: true, image: true } },
} as const;

export async function redeemInviteForUser(
  inviteId: string,
  userId: string,
  userEmail: string,
): Promise<{ teamId: string; teamName: string } | null> {
  const invite = await prisma.teamInvite.findUnique({
    where: { id: inviteId },
    include: { team: { select: { name: true } } },
  });
  if (!invite || invite.status !== "pending") return null;
  if (invite.expiresAt < new Date()) {
    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { status: "cancelled" },
    });
    return null;
  }
  if (normalizeInviteEmail(userEmail) !== invite.email) return null;

  await addUserToTeam(invite.teamId, userId);
  await prisma.teamInvite.update({
    where: { id: invite.id },
    data: {
      status: "accepted",
      acceptedAt: new Date(),
      acceptedUserId: userId,
    },
  });

  return { teamId: invite.teamId, teamName: invite.team.name };
}

export async function redeemInviteByToken(
  token: string,
  userId: string,
  userEmail: string,
): Promise<{ teamId: string; teamName: string } | null> {
  const invite = await prisma.teamInvite.findUnique({ where: { token } });
  if (!invite) return null;
  return redeemInviteForUser(invite.id, userId, userEmail);
}

export async function redeemPendingInvitesForUser(
  userId: string,
  email: string,
): Promise<Array<{ teamId: string; teamName: string }>> {
  const normalized = normalizeInviteEmail(email);
  if (!normalized || normalized.includes("@users.internal.invalid")) return [];

  const invites = await prisma.teamInvite.findMany({
    where: {
      email: normalized,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    include: { team: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const joined: Array<{ teamId: string; teamName: string }> = [];
  for (const invite of invites) {
    const result = await redeemInviteForUser(invite.id, userId, normalized);
    if (result) joined.push(result);
  }
  return joined;
}

export async function previewInviteByEmail(teamId: string, email: string) {
  const normalized = normalizeInviteEmail(email);
  if (!normalized || !normalized.includes("@")) {
    throw new Error("VALIDATION");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalized },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      teamMembers: {
        select: {
          role: true,
          team: { select: { id: true, name: true, image: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  const pendingInvite = await prisma.teamInvite.findFirst({
    where: { teamId, email: normalized, status: "pending", expiresAt: { gt: new Date() } },
    select: { id: true },
  });

  if (!existingUser) {
    return {
      email: normalized,
      found: false,
      alreadyMember: false,
      pendingInvite: Boolean(pendingInvite),
    };
  }

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: existingUser.id, teamId } },
  });

  return {
    email: normalized,
    found: true,
    alreadyMember: Boolean(membership),
    pendingInvite: Boolean(pendingInvite),
    user: {
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      image: existingUser.image,
    },
    workspaces: existingUser.teamMembers.map((row) => ({
      id: row.team.id,
      name: row.team.name,
      image: row.team.image,
      role: row.role,
      isCurrentTeam: row.team.id === teamId,
    })),
  };
}

export async function inviteOrAddMemberByEmail(input: {
  teamId: string;
  email: string;
  invitedById: string;
  inviterName: string;
  teamName: string;
}): Promise<
  | { kind: "added"; user: { id: string; name: string; email: string; image: string | null }; role: string }
  | { kind: "invited"; invite: ReturnType<typeof serializeTeamInvite>; emailSent: boolean }
> {
  const normalized = normalizeInviteEmail(input.email);
  if (!normalized || !normalized.includes("@")) {
    throw new Error("VALIDATION");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, name: true, email: true, image: true },
  });

  if (existingUser) {
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: existingUser.id, teamId: input.teamId } },
    });
    if (membership) {
      throw new Error("ALREADY_MEMBER");
    }

    const { role } = await addUserToTeam(input.teamId, existingUser.id);
    await prisma.teamInvite.updateMany({
      where: { teamId: input.teamId, email: normalized, status: "pending" },
      data: { status: "cancelled" },
    });

    return { kind: "added", user: existingUser, role };
  }

  const existingPending = await prisma.teamInvite.findFirst({
    where: { teamId: input.teamId, email: normalized, status: "pending", expiresAt: { gt: new Date() } },
    include: inviteInclude,
  });

  let invite;
  if (existingPending) {
    const token = generateInviteToken();
    invite = await prisma.teamInvite.update({
      where: { id: existingPending.id },
      data: { token, expiresAt: inviteExpiresAt(), invitedById: input.invitedById },
      include: inviteInclude,
    });
  } else {
    invite = await prisma.teamInvite.create({
      data: {
        teamId: input.teamId,
        email: normalized,
        invitedById: input.invitedById,
        token: generateInviteToken(),
        expiresAt: inviteExpiresAt(),
      },
      include: inviteInclude,
    });
  }

  const emailResult = await sendTeamInviteEmail({
    to: normalized,
    teamName: input.teamName,
    inviterName: input.inviterName,
    token: invite.token,
  });

  return {
    kind: "invited",
    invite: serializeTeamInvite(invite),
    emailSent: emailResult.sent,
  };
}

export async function listPendingTeamInvites(teamId: string) {
  const invites = await prisma.teamInvite.findMany({
    where: {
      teamId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    include: inviteInclude,
    orderBy: { createdAt: "asc" },
  });
  return invites.map(serializeTeamInvite);
}
