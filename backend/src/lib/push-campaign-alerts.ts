import { Resend } from "resend";
import type { PushCampaign } from "@prisma/client";
import { env } from "../env";
import { prisma } from "../prisma";
import { sendPushToUsers } from "./push";
import { effectiveStaffRole, roleHasAbility } from "./staff-roles";
import { webPublicBaseUrl } from "./web-public-url";

type StaffRow = { id: string; email: string; name: string; accountType: string | null; staffRole: string | null };

/** Staff who may approve, never including the person who submitted. */
export function pickApprovers<T extends StaffRow>(staff: T[], submitterId: string): T[] {
  return staff.filter(
    (person) => person.id !== submitterId && roleHasAbility(effectiveStaffRole(person), "notifications.approve"),
  );
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildApprovalEmail(input: { campaign: Pick<PushCampaign, "id" | "title" | "body">; submitterName: string }) {
  const url = `${webPublicBaseUrl()}/admin/notifications?tab=approval&id=${encodeURIComponent(input.campaign.id)}`;
  const subject = `Approval needed: “${input.campaign.title}”`;
  const text = [
    `${input.submitterName} submitted a push notification for approval.`,
    "",
    input.campaign.title,
    input.campaign.body,
    "",
    `Review it: ${url}`,
    "",
    "A different admin than the creator has to approve it before it sends.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111a2b">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <div style="background:#fff;border:1px solid #ebe8f4;border-radius:16px;padding:28px">
    <p style="margin:0 0 6px;color:#6d5ef8;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Approval needed</p>
    <p style="margin:0 0 20px;font-size:15px;color:#475467">${escapeHtml(input.submitterName)} submitted a push notification for approval.</p>
    <div style="background:#f7f6fb;border-radius:12px;padding:16px;margin-bottom:22px">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700">${escapeHtml(input.campaign.title)}</p>
      <p style="margin:0;font-size:14px;color:#344054;line-height:1.45">${escapeHtml(input.campaign.body)}</p>
    </div>
    <a href="${url}" style="display:inline-block;background:#6d5ef8;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px">Review notification</a>
    <p style="margin:22px 0 0;font-size:12.5px;color:#667085">A different admin than the creator has to approve it before it sends.</p>
  </div>
</div></body></html>`;
  return { subject, text, html, url };
}

/**
 * Tells every other admin who can approve that a notification is waiting:
 * a push to anyone with the app, and an email so admins without a phone hear too.
 */
export async function notifyApproversOfSubmission(campaign: PushCampaign, submitterId: string): Promise<void> {
  const staff = await prisma.user.findMany({
    where: { accountType: "platform_admin" },
    select: { id: true, email: true, name: true, accountType: true, staffRole: true },
  });
  const approvers = pickApprovers(staff, submitterId);
  if (approvers.length === 0) return;
  const submitterName = staff.find((person) => person.id === submitterId)?.name || "An admin";

  await sendPushToUsers(
    approvers.map((person) => person.id),
    "Notification needs approval",
    `${submitterName}: “${campaign.title}”`,
    { type: "admin_alert", entityKind: "notification", entityId: campaign.id },
  ).catch((error) => console.error("[push-campaign-alerts] approval push failed:", error));

  if (!env.RESEND_API_KEY) {
    console.error("[push-campaign-alerts] RESEND_API_KEY is not set; skipping approval emails");
    return;
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const { subject, html, text } = buildApprovalEmail({ campaign, submitterName });
  await Promise.all(
    approvers
      .filter((person) => person.email)
      .map(async (person) => {
        const { error } = await resend.emails.send({ from: env.FROM_EMAIL, to: person.email, subject, html, text });
        if (error) console.error("[push-campaign-alerts] approval email failed:", person.email, JSON.stringify(error));
      }),
  );
}

export type TestSendResult =
  | { ok: true; email: string }
  | { ok: false; status: 400 | 404 | 502; code: string; message: string };

/** Sends one copy to a single account so the writer can see it on a real phone. Not counted in results. */
export async function sendCampaignTest(
  campaign: Pick<PushCampaign, "title" | "body" | "linkKind" | "linkValue">,
  email: string,
): Promise<TestSendResult> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: { id: true, email: true, pushToken: true },
  });
  if (!user) return { ok: false, status: 404, code: "NO_ACCOUNT", message: "No Alenio account uses that email." };
  if (!user.pushToken) {
    return {
      ok: false,
      status: 400,
      code: "NO_DEVICE",
      message: "That account has no phone connected. Sign in to the Alenio app with it and allow notifications, then try again.",
    };
  }
  const sent = await sendPushToUsers([user.id], campaign.title, campaign.body, {
    type: "campaign",
    test: "1",
    linkKind: campaign.linkKind,
    linkValue: campaign.linkValue,
  });
  if (sent === 0) return { ok: false, status: 502, code: "NOT_DELIVERED", message: "The test couldn't be delivered. Try again in a moment." };
  return { ok: true, email: user.email };
}
