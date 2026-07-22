import { randomBytes } from "node:crypto";
import { Resend } from "resend";
import { env } from "../env";
import { prisma } from "../prisma";
import { createEnterpriseAccount } from "./admin-platform";
import { detachEnterpriseOrgAdminsFromOrgWorkspaces } from "./enterprise-org-access";
import { webPublicBaseUrl } from "./web-public-url";

const INVITE_TTL_DAYS = 14;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function newInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export function buildEnterpriseSignupLinks(token: string): { webUrl: string } {
  const webBase = webPublicBaseUrl().replace(/\/$/, "");
  return { webUrl: `${webBase}/enterprise-invite/${encodeURIComponent(token)}` };
}

export function buildEnterpriseSignupEmail(input: {
  customerName: string;
  ownerEmail: string;
  suggestedName?: string | null;
  workspaceName?: string | null;
  token: string;
}): { subject: string; html: string; text: string } {
  const customerName = escapeHtml(input.customerName.trim());
  const ownerEmail = escapeHtml(normalizeEmail(input.ownerEmail));
  const suggestedName = escapeHtml((input.suggestedName?.trim() || "there").slice(0, 120));
  const workspaceName = input.workspaceName?.trim() ? escapeHtml(input.workspaceName.trim()) : null;
  const { webUrl } = buildEnterpriseSignupLinks(input.token);
  const year = new Date().getFullYear();

  const subject = `Create your Alenio Enterprise account — ${input.customerName.trim()}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#E8ECF2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#E8ECF2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D5DDE8;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#0B1220 0%,#152238 55%,#1E293B 100%);padding:22px 28px;">
            <div style="color:#FFFFFF;font-size:16px;font-weight:700;">Alenio Enterprise</div>
            <div style="color:#94A3B8;font-size:12px;margin-top:4px;">Create your username and password</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <div style="color:#4361EE;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">Account setup</div>
            <h1 style="margin:0 0 10px;color:#0F172A;font-size:22px;line-height:1.25;">Welcome, ${suggestedName}</h1>
            <p style="margin:0 0 14px;color:#475569;font-size:15px;line-height:1.55;">
              <strong style="color:#0F172A;">${customerName}</strong> is ready on Alenio Enterprise.
              Create your account with a display name and password to get started.
            </p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;margin:0 0 18px;">
              <tr><td style="padding:14px 16px;color:#475569;font-size:14px;line-height:1.5;">
                <div><strong style="color:#0F172A;">Customer:</strong> ${customerName}</div>
                <div style="margin-top:6px;"><strong style="color:#0F172A;">Sign-in email:</strong> ${ownerEmail}</div>
                ${workspaceName ? `<div style="margin-top:6px;"><strong style="color:#0F172A;">First workspace:</strong> ${workspaceName}</div>` : ""}
              </td></tr>
            </table>
            <p style="margin:0 0 18px;">
              <a href="${webUrl}" style="display:inline-block;background:#4361EE;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">Create your account</a>
            </p>
            <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.45;">
              This link expires in ${INVITE_TTL_DAYS} days. If you already have an Alenio account with this email, sign in instead.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F8FAFC;border-top:1px solid #E6EBF2;padding:16px 28px;">
            <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.45;">
              Questions? Contact info@alenio.com · © ${year} Alenio Insights, LLC
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Create your Alenio Enterprise account — ${input.customerName.trim()}`,
    "",
    `${input.suggestedName?.trim() || "Hello"},`,
    "",
    `${input.customerName.trim()} is ready on Alenio Enterprise.`,
    "Create your account (display name + password):",
    webUrl,
    "",
    `Sign-in email: ${normalizeEmail(input.ownerEmail)}`,
    input.workspaceName ? `First workspace: ${input.workspaceName}` : "",
    "",
    `This link expires in ${INVITE_TTL_DAYS} days.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export async function sendEnterpriseSignupEmail(input: {
  customerName: string;
  ownerEmail: string;
  suggestedName?: string | null;
  workspaceName?: string | null;
  token: string;
}): Promise<{ sent: boolean; error?: string }> {
  const to = normalizeEmail(input.ownerEmail);
  if (!to) return { sent: false, error: "Missing owner email" };
  if (!env.RESEND_API_KEY) {
    console.warn("[enterprise-signup] RESEND_API_KEY missing; signup email not sent to", to);
    return { sent: false, error: "Email service not configured" };
  }

  const mail = buildEnterpriseSignupEmail({ ...input, ownerEmail: to });
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.FROM_EMAIL,
    to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  if (error) {
    console.error("[enterprise-signup] Resend error:", JSON.stringify(error));
    return { sent: false, error: error.message ?? "Failed to send signup email" };
  }

  console.log("[enterprise-signup] sent to", to, "customer=", input.customerName);
  return { sent: true };
}

export async function createOrganizationSignupInvite(input: {
  organizationId: string;
  email: string;
  suggestedName?: string | null;
  pendingWorkspaceName?: string | null;
  pendingPlan?: string | null;
}) {
  const email = normalizeEmail(input.email);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const token = newInviteToken();

  // Cancel any prior pending invites for this org+email.
  await prisma.organizationSignupInvite.updateMany({
    where: { organizationId: input.organizationId, email, status: "pending" },
    data: { status: "cancelled" },
  });

  const invite = await prisma.organizationSignupInvite.create({
    data: {
      organizationId: input.organizationId,
      email,
      suggestedName: input.suggestedName?.trim().slice(0, 200) || null,
      token,
      pendingWorkspaceName: input.pendingWorkspaceName?.trim().slice(0, 200) || null,
      pendingPlan: input.pendingPlan?.trim().toLowerCase() || null,
      expiresAt,
    },
  });

  return invite;
}

export async function getOrganizationSignupInvitePreview(token: string) {
  const invite = await prisma.organizationSignupInvite.findUnique({
    where: { token },
    include: {
      organization: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
  if (!invite) return null;
  if (invite.status !== "pending") return { ok: false as const, code: "NOT_PENDING" as const, invite };
  if (invite.expiresAt < new Date()) {
    await prisma.organizationSignupInvite.update({
      where: { id: invite.id },
      data: { status: "cancelled" },
    });
    return { ok: false as const, code: "EXPIRED" as const, invite };
  }
  return {
    ok: true as const,
    preview: {
      email: invite.email,
      suggestedName: invite.suggestedName,
      customerName: invite.organization.name,
      customerSlug: invite.organization.slug,
      workspaceName: invite.pendingWorkspaceName,
      expiresAt: invite.expiresAt.toISOString(),
      token: invite.token,
    },
  };
}

export async function redeemOrganizationSignupInvite(input: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<
  | { ok: true; organizationId: string; organizationName: string; teamId: string | null }
  | { ok: false; code: "NOT_FOUND" | "EXPIRED" | "NOT_PENDING" | "EMAIL_MISMATCH" | "WORKSPACE_FAILED" }
> {
  const invite = await prisma.organizationSignupInvite.findUnique({
    where: { token: input.token },
    include: { organization: { select: { id: true, name: true, defaultTeamId: true } } },
  });
  if (!invite) return { ok: false, code: "NOT_FOUND" };
  if (invite.status !== "pending") return { ok: false, code: "NOT_PENDING" };
  if (invite.expiresAt < new Date()) {
    await prisma.organizationSignupInvite.update({
      where: { id: invite.id },
      data: { status: "cancelled" },
    });
    return { ok: false, code: "EXPIRED" };
  }
  if (normalizeEmail(input.userEmail) !== invite.email) {
    return { ok: false, code: "EMAIL_MISMATCH" };
  }

  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: invite.organizationId,
        userId: input.userId,
      },
    },
    create: {
      organizationId: invite.organizationId,
      userId: input.userId,
      role: "org_owner",
    },
    update: { role: "org_owner" },
  });

  if (invite.pendingWorkspaceName?.trim()) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true, email: true },
    });
    const workspace = await createEnterpriseAccount({
      teamName: invite.pendingWorkspaceName.trim(),
      ownerEmail: invite.email,
      ownerName: user?.name || invite.suggestedName || invite.email.split("@")[0] || "Owner",
      plan: invite.pendingPlan ?? "operations",
      // Org owner stays org-only; workspace is created empty for store staff later.
      addOwnerAsTeamMember: false,
    });
    if (!workspace.ok) {
      // Membership already created; leave invite pending so they can retry after fixing name collision.
      if (workspace.code === "TEAM_NAME_TAKEN") {
        return { ok: false, code: "WORKSPACE_FAILED" };
      }
      return { ok: false, code: "WORKSPACE_FAILED" };
    }
    await prisma.team.update({
      where: { id: workspace.team.id },
      data: { organizationId: invite.organizationId },
    });
    if (!invite.organization.defaultTeamId) {
      await prisma.organization.update({
        where: { id: invite.organizationId },
        data: { defaultTeamId: workspace.team.id },
      });
    }
  }

  await detachEnterpriseOrgAdminsFromOrgWorkspaces(invite.organizationId);

  await prisma.organizationSignupInvite.update({
    where: { id: invite.id },
    data: {
      status: "accepted",
      acceptedAt: new Date(),
      acceptedUserId: input.userId,
      pendingWorkspaceName: null,
      pendingPlan: null,
    },
  });

  return {
    ok: true,
    organizationId: invite.organizationId,
    organizationName: invite.organization.name,
    // Never hand the org owner into a workspace — they manage at org level.
    teamId: null,
  };
}

export async function redeemPendingOrganizationSignupInvitesForUser(userId: string, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.includes("@users.internal.invalid")) return [];

  const pending = await prisma.organizationSignupInvite.findMany({
    where: { email: normalized, status: "pending", expiresAt: { gt: new Date() } },
    select: { token: true },
    take: 10,
  });

  const redeemed: Array<{ organizationId: string; organizationName: string; teamId: string | null }> = [];
  for (const row of pending) {
    const result = await redeemOrganizationSignupInvite({
      token: row.token,
      userId,
      userEmail: normalized,
    });
    if (result.ok) redeemed.push(result);
  }
  return redeemed;
}
