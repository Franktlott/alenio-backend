import { webPublicBaseUrl } from "./web-public-url";

export type OwnershipTransferEmailKind =
  | "started"
  | "accepted"
  | "accepted_new_owner"
  | "accepted_previous_owner"
  | "declined"
  | "canceled_by_owner"
  | "canceled_recipient_left"
  | "expired";

export type OwnershipTransferEmailInput = {
  kind: OwnershipTransferEmailKind;
  toEmail: string;
  teamName: string;
  teamImage?: string | null;
  fromName: string;
  toName: string;
  expiresAt?: Date | string | null;
  billingPath?: string | null;
};

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
    });
  } catch {
    return expiresAt.toISOString();
  }
}

function parseExpiresAt(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

type Copy = {
  subject: string;
  eyebrow: string;
  title: string;
  intro: string;
  steps: string[];
  footerNote: string;
  primaryCtaLabel: string;
  detailRows: { label: string; value: string }[];
};

function copyFor(input: OwnershipTransferEmailInput): Copy {
  const teamName = input.teamName.trim() || "Workspace";
  const fromName = input.fromName.trim() || "The owner";
  const toName = input.toName.trim() || "the new owner";
  const expires = parseExpiresAt(input.expiresAt);
  const expiryLabel = expires ? formatExpiryDate(expires) : "within 7 days";
  const replaceBilling = input.billingPath === "REPLACE_PAYMENT_METHOD";

  switch (input.kind) {
    case "started":
      return {
        subject: `${fromName} wants to transfer ownership of ${teamName}`,
        eyebrow: "Ownership transfer",
        title: `Become owner of ${teamName}`,
        intro: `${fromName} invited you to take ownership of ${teamName}. Administrative control and billing responsibility move to you when you accept.`,
        steps: [
          "Open Alenio on web or mobile",
          "Open Notifications (bell) to review the request",
          replaceBilling
            ? "Accept, then add a different card than the previous owner’s to finish"
            : "Accept or decline before the request expires",
        ],
        footerNote: `This request expires ${expiryLabel}. If you did not expect this, you can decline or ignore it.`,
        primaryCtaLabel: "Review in Alenio",
        detailRows: [
          { label: "Workspace", value: teamName },
          { label: "From", value: fromName },
          { label: "Expires", value: expiryLabel },
          {
            label: "Billing",
            value: replaceBilling
              ? "You’ll add a different payment method"
              : "Existing payment method stays on the workspace",
          },
        ],
      };
    case "accepted":
      // Legacy shared copy — prefer role-specific kinds below.
      return {
        subject: `Ownership transferred — ${teamName}`,
        eyebrow: "Ownership transferred",
        title: `${toName} is now the owner`,
        intro: `Ownership of ${teamName} has transferred. Administrative control and billing responsibility now belong to ${toName}. The workspace plan is unchanged.`,
        steps: [
          "Open the workspace in Alenio",
          "Confirm roles and team access look right",
          "Review billing contact details if you manage the plan",
        ],
        footerNote: "You’re receiving this because you were part of this ownership transfer.",
        primaryCtaLabel: "Open Team",
        detailRows: [
          { label: "Workspace", value: teamName },
          { label: "Previous owner", value: fromName },
          { label: "New owner", value: toName },
        ],
      };
    case "accepted_new_owner":
      return {
        subject: `You’re the new owner of ${teamName}`,
        eyebrow: "Congratulations",
        title: `You’re the new owner`,
        intro: `${teamName} is yours to lead. ${fromName} transferred ownership to you — you now have full administrative control, and billing for this workspace is on you.`,
        steps: [
          "Open Team to review members and roles",
          "Confirm billing looks right on your account",
          "Lead the workspace with confidence — your team is ready",
        ],
        footerNote: "You’re receiving this because you just became the workspace owner.",
        primaryCtaLabel: "Open your workspace",
        detailRows: [
          { label: "Workspace", value: teamName },
          { label: "Transferred from", value: fromName },
          { label: "Your role", value: "Owner" },
        ],
      };
    case "accepted_previous_owner":
      return {
        subject: `Transfer complete — ${toName} now owns ${teamName}`,
        eyebrow: "Transfer complete",
        title: `Ownership has moved to ${toName}`,
        intro: `You’re all set. Ownership of ${teamName} has transferred to ${toName}. They’re now responsible for administration and billing. Your access follows the role chosen when you started the transfer.`,
        steps: [
          "Open Team if you want to confirm your updated role",
          "No further action is needed unless you still manage this workspace",
        ],
        footerNote: "You’re receiving this because you requested this ownership transfer.",
        primaryCtaLabel: "Open Team",
        detailRows: [
          { label: "Workspace", value: teamName },
          { label: "New owner", value: toName },
          { label: "Previous owner", value: fromName },
        ],
      };
    case "declined":
      return {
        subject: `Ownership transfer declined — ${teamName}`,
        eyebrow: "Transfer declined",
        title: "Ownership transfer was declined",
        intro: `${toName} declined the request to become owner of ${teamName}. You remain the workspace owner.`,
        steps: [
          "Open Team in Alenio if you want to transfer to someone else",
          "Choose another active member when you’re ready",
        ],
        footerNote: "No ownership or billing changes were made.",
        primaryCtaLabel: "Open Team",
        detailRows: [
          { label: "Workspace", value: teamName },
          { label: "Declined by", value: toName },
        ],
      };
    case "canceled_by_owner":
      return {
        subject: `Ownership transfer canceled — ${teamName}`,
        eyebrow: "Transfer canceled",
        title: "Ownership transfer was canceled",
        intro: `${fromName} canceled the request to transfer ownership of ${teamName}. No ownership or billing changes were made.`,
        steps: ["Open Alenio anytime if a new transfer is offered later"],
        footerNote: "You’re receiving this because you were the intended new owner.",
        primaryCtaLabel: "Open Alenio",
        detailRows: [
          { label: "Workspace", value: teamName },
          { label: "Canceled by", value: fromName },
        ],
      };
    case "canceled_recipient_left":
      return {
        subject: `Ownership transfer canceled — ${teamName}`,
        eyebrow: "Transfer canceled",
        title: "Ownership transfer was canceled",
        intro: `The ownership transfer for ${teamName} was canceled because ${toName} left the workspace before accepting.`,
        steps: [
          "Open Team in Alenio",
          "Choose another active member if you still want to transfer ownership",
        ],
        footerNote: "No ownership or billing changes were made.",
        primaryCtaLabel: "Open Team",
        detailRows: [
          { label: "Workspace", value: teamName },
          { label: "Intended owner", value: toName },
        ],
      };
    case "expired":
      return {
        subject: `Ownership transfer expired — ${teamName}`,
        eyebrow: "Transfer expired",
        title: "Ownership transfer expired",
        intro: `The request to transfer ownership of ${teamName} expired after 7 days without being completed. No ownership or billing changes were made.`,
        steps: [
          "Owners can start a new transfer from Team → member settings",
          "Recipients will get a new notification if another request is sent",
        ],
        footerNote: "You’re receiving this because you were part of this ownership transfer.",
        primaryCtaLabel: "Open Team",
        detailRows: [
          { label: "Workspace", value: teamName },
          { label: "From", value: fromName },
          { label: "To", value: toName },
        ],
      };
  }
}

/** Branded HTML email matching Alenio invite / OTP templates. */
export function buildOwnershipTransferEmail(input: OwnershipTransferEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const copy = copyFor(input);
  const teamNameRaw = input.teamName.trim() || "Workspace";
  const fromNameRaw = input.fromName.trim() || "The owner";
  const toEmail = escapeHtml(input.toEmail.trim().toLowerCase());
  const logoUrl = brandAssetUrl("/icon.png");
  const year = new Date().getFullYear();
  const teamUrl = `${webPublicBaseUrl().replace(/\/$/, "")}/team`;
  const teamImage = input.teamImage?.trim() ? escapeHtml(input.teamImage.trim()) : "";
  const teamInitials = escapeHtml(initialsFromName(teamNameRaw));
  const fromInitials = escapeHtml(initialsFromName(fromNameRaw));

  const teamAvatarHtml = teamImage
    ? `<img src="${teamImage}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:10px;object-fit:cover;" />`
    : `<div style="width:44px;height:44px;border-radius:10px;background:#EEF2FF;color:#4361EE;font-size:14px;font-weight:800;line-height:44px;text-align:center;">${teamInitials}</div>`;

  const fromAvatarHtml = `<div style="width:36px;height:36px;border-radius:18px;background:#EEF2FF;color:#4361EE;font-size:12px;font-weight:800;line-height:36px;text-align:center;">${fromInitials}</div>`;

  const stepsHtml = copy.steps
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

  const detailRowsHtml = copy.detailRows
    .map(
      (row, i) => `
        <div style="${i > 0 ? "margin-top:6px;" : ""}"><strong style="color:#0F172A;">${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}</div>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(copy.subject)}</title>
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
              <div style="color:#4361EE;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">${escapeHtml(copy.eyebrow)}</div>
              <h1 style="margin:0 0 10px;color:#0F172A;font-size:22px;line-height:1.25;letter-spacing:-0.02em;font-weight:700;">${escapeHtml(copy.title)}</h1>
              <p style="margin:0;color:#475569;font-size:15px;line-height:1.55;">${escapeHtml(copy.intro)}</p>
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
                      <div style="color:#0F172A;font-size:16px;font-weight:700;line-height:1.3;">${escapeHtml(teamNameRaw)}</div>
                    </td>
                  </tr>
                </table>
                <div style="height:1px;background:#E2E8F0;margin:14px 0;"></div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="44" valign="middle">${fromAvatarHtml}</td>
                    <td valign="middle" style="padding-left:12px;">
                      <div style="color:#64748B;font-size:12px;line-height:1.3;">Current / previous owner</div>
                      <div style="color:#0F172A;font-size:14px;font-weight:700;line-height:1.3;">${escapeHtml(fromNameRaw)}</div>
                    </td>
                  </tr>
                </table>
                <div style="height:1px;background:#E2E8F0;margin:14px 0;"></div>
                <div style="color:#475569;font-size:14px;line-height:1.5;">${detailRowsHtml}</div>
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
              <a href="${escapeHtml(teamUrl)}" style="display:block;background:#4361EE;color:#FFFFFF;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:600;font-size:15px;text-align:center;">
                ${escapeHtml(copy.primaryCtaLabel)}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 24px;">
              <p style="margin:0;color:#64748B;font-size:13px;line-height:1.5;">${escapeHtml(copy.footerNote)}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E6EBF2;padding:16px 28px;">
              <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.45;">
                Sent by Alenio · © ${year} Alenio Insights, LLC
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
    copy.title,
    "",
    copy.intro,
    `Sent to: ${input.toEmail.trim().toLowerCase()}`,
    "",
    ...copy.detailRows.map((r) => `${r.label}: ${r.value}`),
    "",
    "Next steps:",
    ...copy.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `${copy.primaryCtaLabel}: ${teamUrl}`,
    "",
    copy.footerNote,
  ].join("\n");

  return { subject: copy.subject, html, text };
}
