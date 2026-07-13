import { env } from "../env";
import { webPublicBaseUrl } from "./web-public-url";

export type AuthOtpEmailType = "email-verification" | "forget-password" | "sign-in" | string;

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

type OtpCopy = {
  subject: string;
  eyebrow: string;
  title: string;
  intro: string;
  steps: string[];
};

function copyForType(type: AuthOtpEmailType): OtpCopy {
  if (type === "forget-password") {
    return {
      subject: "Reset your Alenio password",
      eyebrow: "Account recovery",
      title: "Your password reset code",
      intro:
        "We received a request to reset the password for your Alenio account. Enter this code on the reset screen to continue.",
      steps: [
        "Return to the Alenio password reset page",
        "Enter the code below exactly as shown",
        "Choose a new password and sign in",
      ],
    };
  }
  if (type === "email-verification") {
    return {
      subject: "Verify your Alenio email",
      eyebrow: "Email verification",
      title: "Confirm your email address",
      intro: "Use this code to verify your Alenio account and finish setting up access.",
      steps: ["Open the verification screen", "Enter the code below", "Continue into Alenio"],
    };
  }
  return {
    subject: "Your Alenio sign-in code",
    eyebrow: "Secure sign-in",
    title: "Your one-time sign-in code",
    intro: "Use this code to finish signing in to Alenio.",
    steps: ["Return to the sign-in screen", "Enter the code below", "Continue to your workspace"],
  };
}

/** Enterprise HTML email for Better Auth OTP flows (verify, reset, sign-in). */
export function buildAuthOtpEmail(input: {
  type: AuthOtpEmailType;
  otp: string;
  toEmail?: string;
}): { subject: string; html: string; text: string } {
  const copy = copyForType(input.type);
  const otp = escapeHtml(input.otp.trim());
  const email = input.toEmail?.trim() ? escapeHtml(input.toEmail.trim().toLowerCase()) : null;
  const logoUrl = brandAssetUrl("/icon.png");
  const year = new Date().getFullYear();
  const fromLabel = env.FROM_EMAIL?.includes("<")
    ? "Alenio"
    : "Alenio";

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
              ${email ? `<p style="margin:12px 0 0;color:#64748B;font-size:13px;">Sent to <strong style="color:#0F172A;">${email}</strong></p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px;">
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px 16px;text-align:center;">
                <div style="color:#64748B;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;">One-time code</div>
                <div style="font-size:34px;font-weight:700;letter-spacing:0.28em;color:#0F172A;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${otp}</div>
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
            <td style="padding:12px 28px 24px;">
              <p style="margin:0;color:#64748B;font-size:13px;line-height:1.5;">
                This code expires shortly. If you did not request it, you can ignore this email — your account stays secure.
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
    copy.title,
    "",
    copy.intro,
    email ? `Sent to: ${input.toEmail!.trim().toLowerCase()}` : null,
    "",
    `Code: ${input.otp.trim()}`,
    "",
    "Next steps:",
    ...copy.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "This code expires shortly. If you did not request it, ignore this email.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject: copy.subject, html, text };
}
