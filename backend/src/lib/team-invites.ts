import { randomBytes } from "crypto";
import { Resend } from "resend";
import { prisma } from "../prisma";
import { env } from "../env";
import { logActivity } from "./activity";
import { sendPushToUsers } from "./push";
import { webPublicBaseUrl } from "./web-public-url";

const INVITE_TTL_DAYS = 7;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brandAssetUrl(path: string): string {
  const base = webPublicBaseUrl().replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatInviteRole(role: string | null | undefined): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader" || role === "admin") return "Team Leader";
  return "Member";
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function formatExpiryDate(expiresAt: Date): string {
  try {
    return expiresAt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return expiresAt.toISOString();
  }
}

export type TeamInviteEmailInput = {
  to: string;
  teamName: string;
  teamImage?: string | null;
  inviterName: string;
  inviterImage?: string | null;
  inviterRole?: string | null;
  token: string;
  expiresAt: Date;
};

export function buildTeamInviteEmail(input: TeamInviteEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { webUrl, appUrl } = buildInviteLinks(input.token);
  const teamNameRaw = input.teamName.trim() || "Workspace";
  const inviterNameRaw = input.inviterName.trim() || "A teammate";
  const teamName = escapeHtml(teamNameRaw);
  const inviterName = escapeHtml(inviterNameRaw);
  const inviterRole = escapeHtml(formatInviteRole(input.inviterRole));
  const toEmail = escapeHtml(normalizeInviteEmail(input.to));
  const logoUrl = brandAssetUrl("/icon.png");
  const year = new Date().getFullYear();
  const expiryLabel = escapeHtml(formatExpiryDate(input.expiresAt));
  const teamInitials = escapeHtml(initialsFromName(teamNameRaw));
  const inviterInitials = escapeHtml(initialsFromName(inviterNameRaw));
  const teamImage = input.teamImage?.trim() ? escapeHtml(input.teamImage.trim()) : "";
  const inviterImage = input.inviterImage?.trim() ? escapeHtml(input.inviterImage.trim()) : "";
  const fromLabel = "Alenio";

  const teamAvatarHtml = teamImage
    ? `<img src="${teamImage}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:10px;object-fit:cover;" />`
    : `<div style="width:44px;height:44px;border-radius:10px;background:#EEF2FF;color:#4361EE;font-size:14px;font-weight:800;line-height:44px;text-align:center;">${teamInitials}</div>`;

  const inviterAvatarHtml = inviterImage
    ? `<img src="${inviterImage}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border-radius:18px;object-fit:cover;" />`
    : `<div style="width:36px;height:36px;border-radius:18px;background:#EEF2FF;color:#4361EE;font-size:12px;font-weight:800;line-height:36px;text-align:center;">${inviterInitials}</div>`;

  const iosStore = env.IOS_APP_STORE_URL?.trim() ?? "";
  const androidStore = env.ANDROID_PLAY_STORE_URL?.trim() ?? "";
  const storeLineParts = [
    iosStore ? `iOS: ${iosStore}` : "",
    androidStore ? `Android: ${androidStore}` : "",
  ].filter(Boolean);
  const storeHtml =
    iosStore || androidStore
      ? `<p style="margin:12px 0 0;color:#64748B;font-size:13px;line-height:1.5;">
          Don't have the app yet?
          ${iosStore ? `<a href="${escapeHtml(iosStore)}" style="color:#4361EE;font-weight:600;text-decoration:none;">Download for iOS</a>` : ""}
          ${iosStore && androidStore ? " · " : ""}
          ${androidStore ? `<a href="${escapeHtml(androidStore)}" style="color:#4361EE;font-weight:600;text-decoration:none;">Download for Android</a>` : ""}
        </p>`
      : "";

  const steps = [
    "Open the invite on your phone or computer",
    "Sign in or create your Alenio account with this email",
    `Join ${teamNameRaw} and start collaborating`,
  ];
  const stepsHtml = steps
    .map(
      (step, i) => `
        <tr>
          <td style="padding:0 0 10px;vertical-align:top;width:28px;">
            <div style="width:22px;height:22px;border-radius:999px;background:#EEF2FF;color:#4361EE;font-size:12px;font-weight:700;line-height:22px;text-align:center;">${i + 1}</div>
          </td>
          <td style="padding:0 0 10px;color:#475569;font-size:14px;line-height:1.45;">${escapeHtml(step)}</td>
        </tr>`,
    )
    .join("");

  const subject = `${inviterNameRaw} invited you to ${teamNameRaw} on Alenio`;
  const title = `Join ${teamNameRaw}`;
  const intro = `${inviterNameRaw} invited you to join the ${teamNameRaw} workspace in Alenio. Open the invite below to get started.`;
  const footerNote = `This invite expires in ${INVITE_TTL_DAYS} days (${formatExpiryDate(input.expiresAt)}). If you did not expect this invitation, you can ignore this email.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#E8ECF2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#E8ECF2;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D5DDE8;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0B1220 0%,#152238 55%,#1E293B 100%);padding:22px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${logoUrl}" width="36" height="36" alt="Alenio" style="display:block;border-radius:8px;" />
                  </td>
                  <td style="vertical-align:middle;padding-left:12px;">
                    <div style="color:#FFFFFF;font-size:16px;font-weight:700;letter-spacing:-0.02em;">Alenio</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <div style="color:#4361EE;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">You're invited</div>
              <h1 style="margin:0 0 10px;color:#0F172A;font-size:22px;line-height:1.25;letter-spacing:-0.02em;font-weight:700;">${escapeHtml(title)}</h1>
              <p style="margin:0;color:#475569;font-size:15px;line-height:1.55;">${escapeHtml(intro)}</p>
              <p style="margin:12px 0 0;color:#64748B;font-size:13px;">Sent to <strong style="color:#0F172A;">${toEmail}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px;">
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="52" valign="middle">${teamAvatarHtml}</td>
                    <td valign="middle" style="padding-left:12px;">
                      <div style="color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px;">Workspace</div>
                      <div style="color:#0F172A;font-size:16px;font-weight:700;line-height:1.3;">${teamName}</div>
                    </td>
                  </tr>
                </table>
                <div style="height:1px;background:#E2E8F0;margin:14px 0;"></div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="44" valign="middle">${inviterAvatarHtml}</td>
                    <td valign="middle" style="padding-left:12px;">
                      <div style="color:#64748B;font-size:12px;line-height:1.3;">Invited by</div>
                      <div style="color:#0F172A;font-size:14px;font-weight:700;line-height:1.3;">${inviterName}</div>
                      <div style="color:#94A3B8;font-size:12px;margin-top:2px;">${inviterRole}</div>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px;">
              <div style="color:#0F172A;font-size:13px;font-weight:700;margin-bottom:10px;">Next steps</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${stepsHtml}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;">
              <a href="${escapeHtml(appUrl)}" style="display:block;background:#4361EE;color:#FFFFFF;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:600;font-size:15px;text-align:center;margin-bottom:10px;">
                Open in Alenio app
              </a>
              <a href="${escapeHtml(webUrl)}" style="display:block;background:#EEF2FF;color:#4361EE;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:600;font-size:15px;text-align:center;">
                Continue on web
              </a>
              ${storeHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 24px;">
              <p style="margin:0;color:#64748B;font-size:13px;line-height:1.5;">
                ${escapeHtml(footerNote)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E6EBF2;padding:16px 28px;">
              <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.45;">
                Sent by ${escapeHtml(fromLabel)} · © ${year} Alenio Insights, LLC
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    title,
    "",
    intro,
    `Sent to: ${normalizeInviteEmail(input.to)}`,
    "",
    `Workspace: ${teamNameRaw}`,
    `Invited by: ${inviterNameRaw} (${formatInviteRole(input.inviterRole)})`,
    "",
    "Next steps:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `Open in Alenio app: ${appUrl}`,
    `Continue on web: ${webUrl}`,
    ...storeLineParts,
    "",
    footerNote,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

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

export function buildInviteLinks(token: string): {
  webUrl: string;
  /** HTTPS bridge for email clients (Gmail blocks custom schemes). */
  appUrl: string;
  /** Native app scheme deep link. */
  appDeepLink: string;
} {
  const webBase = (env.WEB_PUBLIC_URL ?? env.BACKEND_URL).replace(/\/$/, "");
  const backendBase = env.BACKEND_URL.replace(/\/$/, "");
  const encoded = encodeURIComponent(token);
  const webUrl = `${webBase}/invite/${encoded}`;
  const appDeepLink = `${env.APP_SCHEME}://invite/${encoded}`;
  // Email buttons must use HTTPS — same pattern as /reset-password → alenio://…
  const appUrl = `${backendBase}/open-invite?token=${encoded}`;
  return { webUrl, appUrl, appDeepLink };
}

export async function sendTeamInviteEmail(input: TeamInviteEmailInput): Promise<{ sent: boolean; error?: string }> {
  if (!env.RESEND_API_KEY) {
    console.error("[team-invites] RESEND_API_KEY is not set");
    return { sent: false, error: "Email service not configured" };
  }

  const { subject, html, text } = buildTeamInviteEmail(input);
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.FROM_EMAIL,
    to: input.to,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("[team-invites] Resend error:", JSON.stringify(error));
    return { sent: false, error: error.message ?? "Failed to send email" };
  }

  return { sent: true };
}

/** Load team + inviter fields needed for the invite email template. */
export async function loadTeamInviteEmailContext(input: {
  teamId: string;
  invitedById: string;
  teamName?: string;
  inviterName?: string;
}): Promise<{
  teamName: string;
  teamImage: string | null;
  inviterName: string;
  inviterImage: string | null;
  inviterRole: string | null;
}> {
  const [team, inviter, membership] = await Promise.all([
    prisma.team.findUnique({
      where: { id: input.teamId },
      select: { name: true, image: true },
    }),
    prisma.user.findUnique({
      where: { id: input.invitedById },
      select: { name: true, email: true, image: true },
    }),
    prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: input.invitedById, teamId: input.teamId } },
      select: { role: true },
    }),
  ]);

  return {
    teamName: input.teamName?.trim() || team?.name || "Workspace",
    teamImage: team?.image ?? null,
    inviterName: input.inviterName?.trim() || inviter?.name || inviter?.email || "A team leader",
    inviterImage: inviter?.image ?? null,
    inviterRole: membership?.role ?? null,
  };
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

  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const { notifyAdminsMemberJoined } = await import("./admin-push");
  void notifyAdminsMemberJoined({
    userId,
    userName: member?.name ?? userEmail,
    teamId: invite.teamId,
    teamName: invite.team.name,
  }).catch((err) => console.warn("[team-invites] admin member-joined push failed", err));

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

  const emailContext = await loadTeamInviteEmailContext({
    teamId: input.teamId,
    invitedById: input.invitedById,
    teamName: input.teamName,
    inviterName: input.inviterName,
  });

  const emailResult = await sendTeamInviteEmail({
    to: normalized,
    teamName: emailContext.teamName,
    teamImage: emailContext.teamImage,
    inviterName: emailContext.inviterName,
    inviterImage: emailContext.inviterImage,
    inviterRole: emailContext.inviterRole,
    token: invite.token,
    expiresAt: invite.expiresAt,
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
