import { Resend } from "resend";
import { env } from "../env";
import { webPublicBaseUrl } from "./web-public-url";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildEnterpriseWelcomeEmail(input: {
  customerName: string;
  ownerName?: string | null;
  ownerEmail: string;
  domain?: string | null;
  workspaceName?: string | null;
}): { subject: string; html: string; text: string } {
  const customerName = escapeHtml(input.customerName.trim());
  const ownerName = escapeHtml((input.ownerName?.trim() || "there").slice(0, 120));
  const ownerEmail = escapeHtml(input.ownerEmail.trim().toLowerCase());
  const domain = input.domain?.trim() ? escapeHtml(input.domain.trim().toLowerCase()) : null;
  const workspaceName = input.workspaceName?.trim() ? escapeHtml(input.workspaceName.trim()) : null;
  const loginUrl = `${webPublicBaseUrl().replace(/\/$/, "")}/login`;
  const settingsUrl = `${webPublicBaseUrl().replace(/\/$/, "")}/settings/sso/okta`;
  const year = new Date().getFullYear();

  const subject = `Welcome to Alenio Enterprise — ${input.customerName.trim()}`;

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
            <div style="color:#94A3B8;font-size:12px;margin-top:4px;">Company account · not a self-serve subscription</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <div style="color:#4361EE;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">Enterprise welcome</div>
            <h1 style="margin:0 0 10px;color:#0F172A;font-size:22px;line-height:1.25;">Welcome, ${ownerName}</h1>
            <p style="margin:0 0 14px;color:#475569;font-size:15px;line-height:1.55;">
              <strong style="color:#0F172A;">${customerName}</strong> is set up as an
              <strong>Alenio Enterprise customer</strong> — a company account for multiple workspaces,
              SSO, and directory sync. This is separate from self-serve Pro / Operations plans.
            </p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;margin:0 0 18px;">
              <tr><td style="padding:14px 16px;color:#475569;font-size:14px;line-height:1.5;">
                <div><strong style="color:#0F172A;">Customer:</strong> ${customerName}</div>
                ${domain ? `<div style="margin-top:6px;"><strong style="color:#0F172A;">Domain:</strong> ${domain}</div>` : ""}
                ${workspaceName ? `<div style="margin-top:6px;"><strong style="color:#0F172A;">First workspace:</strong> ${workspaceName}</div>` : ""}
                <div style="margin-top:6px;"><strong style="color:#0F172A;">Owner:</strong> ${ownerEmail}</div>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;color:#0F172A;font-size:13px;font-weight:700;">Next steps</p>
            <ol style="margin:0 0 18px;padding-left:18px;color:#475569;font-size:14px;line-height:1.55;">
              <li>Sign in at Alenio</li>
              <li>Open Settings → Okta SSO &amp; SCIM to connect your identity provider</li>
              <li>Add more workspaces under your enterprise customer as needed</li>
            </ol>
            <p style="margin:0 0 10px;">
              <a href="${loginUrl}" style="display:inline-block;background:#4361EE;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">Sign in to Alenio</a>
            </p>
            <p style="margin:0;">
              <a href="${settingsUrl}" style="color:#4361EE;font-size:13px;">Configure Okta SSO &amp; SCIM</a>
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
    `Welcome to Alenio Enterprise — ${input.customerName.trim()}`,
    "",
    `${input.ownerName?.trim() || "Hello"},`,
    "",
    `${input.customerName.trim()} is an Alenio Enterprise customer (company account for multiple workspaces, SSO, and SCIM).`,
    "This is separate from self-serve Pro / Operations subscriptions.",
    "",
    input.domain ? `Domain: ${input.domain}` : "",
    input.workspaceName ? `First workspace: ${input.workspaceName}` : "",
    `Sign in: ${loginUrl}`,
    `SSO settings: ${settingsUrl}`,
    "",
    "Questions? info@alenio.com",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export async function sendEnterpriseWelcomeEmail(input: {
  customerName: string;
  ownerName?: string | null;
  ownerEmail: string;
  domain?: string | null;
  workspaceName?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const to = input.ownerEmail.trim().toLowerCase();
  if (!to) return { sent: false, error: "Missing owner email" };
  if (!env.RESEND_API_KEY) {
    console.warn("[enterprise-welcome] RESEND_API_KEY missing; welcome email not sent to", to);
    return { sent: false, error: "Email service not configured" };
  }

  const mail = buildEnterpriseWelcomeEmail({ ...input, ownerEmail: to });
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.FROM_EMAIL,
    to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  if (error) {
    console.error("[enterprise-welcome] Resend error:", JSON.stringify(error));
    return { sent: false, error: error.message ?? "Failed to send welcome email" };
  }

  console.log("[enterprise-welcome] sent to", to, "customer=", input.customerName);
  return { sent: true };
}
