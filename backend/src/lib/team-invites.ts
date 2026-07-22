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
  const teamName = escapeHtml(input.teamName.trim() || "Workspace");
  const inviterName = escapeHtml(input.inviterName.trim() || "A teammate");
  const inviterRole = escapeHtml(formatInviteRole(input.inviterRole));
  const toEmail = escapeHtml(normalizeInviteEmail(input.to));
  const logoUrl = brandAssetUrl("/icon.png");
  const year = new Date().getFullYear();
  const expiryLabel = escapeHtml(formatExpiryDate(input.expiresAt));
  const teamInitials = escapeHtml(initialsFromName(input.teamName));
  const inviterInitials = escapeHtml(initialsFromName(input.inviterName));
  const teamImage = input.teamImage?.trim() ? escapeHtml(input.teamImage.trim()) : "";
  const inviterImage = input.inviterImage?.trim() ? escapeHtml(input.inviterImage.trim()) : "";

  const iosStore = env.IOS_APP_STORE_URL?.trim() ?? "";
  const androidStore = env.ANDROID_PLAY_STORE_URL?.trim() ?? "";
  const storeParts = [
    iosStore ? `<a href="${escapeHtml(iosStore)}" style="color:#4361EE;font-weight:600;text-decoration:none;">App Store</a>` : "",
    androidStore
      ? `<a href="${escapeHtml(androidStore)}" style="color:#4361EE;font-weight:600;text-decoration:none;">Google Play</a>`
      : "",
  ].filter(Boolean);
  const storeBar =
    storeParts.length > 0
      ? `<tr>
          <td style="padding:0 28px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F1F5F9;border-radius:12px;">
              <tr>
                <td style="padding:14px 16px;color:#64748B;font-size:13px;line-height:1.5;">
                  Don't have the app yet? Download for ${storeParts.join(" · ")}.
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      : "";

  const teamAvatarHtml = teamImage
    ? `<img src="${teamImage}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border-radius:12px;object-fit:cover;" />`
    : `<div style="width:48px;height:48px;border-radius:12px;background:#EEF2FF;color:#4361EE;font-size:16px;font-weight:800;line-height:48px;text-align:center;">${teamInitials}</div>`;

  const inviterAvatarHtml = inviterImage
    ? `<img src="${inviterImage}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:20px;object-fit:cover;" />`
    : `<div style="width:40px;height:40px;border-radius:20px;background:#EEF2FF;color:#4361EE;font-size:13px;font-weight:800;line-height:40px;text-align:center;">${inviterInitials}</div>`;

  const features: Array<{ icon: string; title: string; body: string }> = [
    { icon: "💬", title: "Team Chat", body: "Stay in sync" },
    { icon: "✅", title: "Daily Tasks", body: "Get work done" },
    { icon: "📅", title: "Schedule", body: "Never miss a beat" },
    { icon: "⭐", title: "Recognition", body: "Celebrate wins" },
    { icon: "🔔", title: "Team Updates", body: "Know what's next" },
  ];

  const featureCells = features
    .map(
      (f) => `
      <td width="20%" valign="top" style="padding:8px 4px;text-align:center;">
        <div style="font-size:22px;line-height:28px;margin-bottom:6px;">${f.icon}</div>
        <div style="color:#0F172A;font-size:12px;font-weight:700;line-height:1.3;">${f.title}</div>
        <div style="color:#64748B;font-size:11px;line-height:1.35;margin-top:2px;">${f.body}</div>
      </td>`,
    )
    .join("");

  const subject = `${input.inviterName.trim() || "A teammate"} invited you to ${input.teamName.trim() || "a workspace"} on Alenio`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#EEF2F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EEF2F7;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:20px 28px 8px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td align="left" valign="middle">
                  <table role="presentation" cellspacing="0" cellpadding="0">
                    <tr>
                      <td valign="middle" style="padding-right:8px;">
                        <img src="${logoUrl}" width="28" height="28" alt="Alenio" style="display:block;border-radius:8px;" />
                      </td>
                      <td valign="middle" style="color:#0F172A;font-size:18px;font-weight:700;letter-spacing:-0.02em;">alenio</td>
                    </tr>
                  </table>
                </td>
                <td align="right" valign="middle" style="color:#94A3B8;font-size:13px;font-weight:600;">You're invited!</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 28px 8px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td width="58%" valign="top" style="padding-right:16px;">
                  <h1 style="margin:0 0 12px;color:#0F172A;font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;">
                    Join the <span style="color:#4361EE;">${teamName}</span> team
                  </h1>
                  <p style="margin:0 0 10px;color:#475569;font-size:15px;line-height:1.55;">
                    <strong style="color:#0F172A;">${inviterName}</strong> invited you to join the
                    <strong style="color:#0F172A;">${teamName}</strong> workspace in Alenio.
                  </p>
                  <p style="margin:0;color:#64748B;font-size:14px;line-height:1.55;">
                    Stay connected with your team, complete daily tasks, and keep work moving — all in one place.
                  </p>
                </td>
                <td width="42%" valign="top">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;box-shadow:0 8px 24px rgba(15,23,42,0.06);">
                    <tr>
                      <td style="padding:16px 16px 14px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                          <tr>
                            <td width="56" valign="middle">${teamAvatarHtml}</td>
                            <td valign="middle" style="padding-left:10px;">
                              <div style="color:#0F172A;font-size:15px;font-weight:700;line-height:1.3;">${teamName}</div>
                              <div style="color:#94A3B8;font-size:12px;margin-top:2px;">Workspace</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 16px;">
                        <div style="height:1px;background:#F1F5F9;line-height:1px;font-size:1px;">&nbsp;</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:14px 16px 16px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                          <tr>
                            <td width="44" valign="middle">${inviterAvatarHtml}</td>
                            <td valign="middle" style="padding-left:10px;">
                              <div style="color:#64748B;font-size:12px;line-height:1.3;">Invited by</div>
                              <div style="color:#0F172A;font-size:14px;font-weight:700;line-height:1.3;">${inviterName}</div>
                              <div style="color:#94A3B8;font-size:12px;margin-top:1px;">${inviterRole}</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 28px 8px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;border:1px solid #E8EEF5;border-radius:14px;">
              <tr>
                <td style="padding:16px 12px 6px;text-align:center;color:#0F172A;font-size:14px;font-weight:700;">
                  What you'll have access to
                </td>
              </tr>
              <tr>
                <td style="padding:0 8px 12px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>${featureCells}</tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 28px 12px;" align="center">
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="padding:0 6px 8px 0;">
                  <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#4361EE;color:#FFFFFF;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:700;font-size:14px;">
                    Open in Alenio App
                  </a>
                </td>
                <td style="padding:0 0 8px 6px;">
                  <a href="${escapeHtml(webUrl)}" style="display:inline-block;background:#FFFFFF;color:#4361EE;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;font-size:14px;border:1.5px solid #4361EE;">
                    Continue in Browser →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${storeBar}

        <tr>
          <td style="padding:4px 28px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E2E8F0;border-radius:14px;">
              <tr>
                <td width="50%" valign="top" style="padding:16px;border-right:1px solid #F1F5F9;">
                  <div style="color:#0F172A;font-size:13px;font-weight:700;margin-bottom:8px;">🔒 Security &amp; trust</div>
                  <div style="color:#475569;font-size:13px;line-height:1.5;">
                    This invite was sent to
                    <a href="mailto:${toEmail}" style="color:#4361EE;text-decoration:none;font-weight:600;">${toEmail}</a>.
                  </div>
                  <div style="color:#94A3B8;font-size:12px;margin-top:8px;line-height:1.4;">Your connection is secured.</div>
                </td>
                <td width="50%" valign="top" style="padding:16px;">
                  <div style="color:#0F172A;font-size:13px;font-weight:700;margin-bottom:8px;">⏰ Invitation expires</div>
                  <div style="background:#EEF2FF;border-radius:10px;padding:12px 14px;text-align:center;margin-bottom:8px;">
                    <div style="color:#4361EE;font-size:22px;font-weight:800;line-height:1.1;">${INVITE_TTL_DAYS} Days</div>
                    <div style="color:#64748B;font-size:11px;margin-top:4px;">${expiryLabel}</div>
                  </div>
                  <div style="color:#94A3B8;font-size:12px;line-height:1.4;">
                    If you weren't expecting this, you can ignore this email.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:#F8FAFC;border-top:1px solid #E6EBF2;padding:16px 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td align="left" valign="middle">
                  <img src="${logoUrl}" width="20" height="20" alt="Alenio" style="display:inline-block;vertical-align:middle;border-radius:6px;margin-right:6px;" />
                  <span style="color:#0F172A;font-size:13px;font-weight:700;vertical-align:middle;">alenio</span>
                </td>
                <td align="right" valign="middle" style="color:#94A3B8;font-size:12px;">
                  Connect · Execute · Elevate
                </td>
              </tr>
              <tr>
                <td colspan="2" align="center" style="padding-top:10px;color:#94A3B8;font-size:11px;">
                  © ${year} Alenio. All rights reserved.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    "",
    `Join the ${input.teamName.trim() || "workspace"} team`,
    "",
    `${input.inviterName.trim() || "A teammate"} invited you to join ${input.teamName.trim() || "a workspace"} in Alenio.`,
    "",
    `Open in Alenio app: ${appUrl}`,
    `Continue in browser: ${webUrl}`,
    "",
    `This invite was sent to ${normalizeInviteEmail(input.to)}.`,
    `Expires in ${INVITE_TTL_DAYS} days (${formatExpiryDate(input.expiresAt)}).`,
    "",
    "If you weren't expecting this, you can ignore this email.",
    "",
    "Connect · Execute · Elevate",
    `© ${year} Alenio`,
  ].join("\n");

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

export function buildInviteLinks(token: string): { webUrl: string; appUrl: string } {
  const webBase = (env.WEB_PUBLIC_URL ?? env.BACKEND_URL).replace(/\/$/, "");
  const webUrl = `${webBase}/invite/${encodeURIComponent(token)}`;
  const appUrl = `${env.APP_SCHEME}://invite/${encodeURIComponent(token)}`;
  return { webUrl, appUrl };
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
