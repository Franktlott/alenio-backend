import { env } from "../env";

export type VideoInviteEmailInput = {
  inviteUrl: string;
  roomName: string;
  senderName: string;
  expiresAt: Date;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExpiry(expiresAt: Date): string {
  return expiresAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildVideoInviteEmail(input: VideoInviteEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const roomNameRaw = input.roomName.trim() || "Video meeting";
  const senderNameRaw = input.senderName.trim() || "An Alenio member";
  const roomName = escapeHtml(roomNameRaw);
  const senderName = escapeHtml(senderNameRaw);
  const inviteUrl = escapeHtml(input.inviteUrl);
  const expiry = escapeHtml(formatExpiry(input.expiresAt));
  const logoUrl = `${env.BACKEND_URL.replace(/\/$/, "")}/static/alenio-logo-white.png`;
  const calendarUrl = escapeHtml(
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      roomNameRaw,
    )}&details=${encodeURIComponent(`Join the Alenio meeting: ${input.inviteUrl}`)}`,
  );
  const subject = `${senderNameRaw} invited you to an Alenio meeting`;
  const year = new Date().getFullYear();

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
              <img src="${escapeHtml(logoUrl)}" width="112" alt="Alenio" style="display:block;width:112px;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <div style="color:#4361EE;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">Video meeting</div>
              <h1 style="margin:0 0 10px;color:#0F172A;font-size:22px;line-height:1.25;letter-spacing:-0.02em;font-weight:700;">You’re invited to join</h1>
              <p style="margin:0;color:#475569;font-size:15px;line-height:1.55;">${senderName} invited you to meet on Alenio.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px;">
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="48" valign="middle">
                      <div style="width:40px;height:40px;border-radius:12px;background:#EEF2FF;color:#4361EE;font-size:19px;line-height:40px;text-align:center;">&#127909;</div>
                    </td>
                    <td valign="middle" style="padding-left:10px;">
                      <div style="color:#64748B;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px;">Meeting</div>
                      <div style="color:#0F172A;font-size:16px;font-weight:700;line-height:1.3;">${roomName}</div>
                    </td>
                  </tr>
                </table>
                <div style="height:1px;background:#E2E8F0;margin:14px 0;"></div>
                <div style="color:#64748B;font-size:12px;line-height:1.5;">Hosted by <strong style="color:#0F172A;">${senderName}</strong></div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px;">
              <a href="${inviteUrl}" style="display:block;background:#4361EE;color:#FFFFFF;text-decoration:none;padding:14px 18px;border-radius:10px;font-weight:700;font-size:15px;text-align:center;margin-bottom:10px;">Join meeting</a>
              <a href="${calendarUrl}" style="display:block;background:#EEF2FF;color:#4361EE;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:600;font-size:14px;text-align:center;">Add to Google Calendar</a>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px 24px;">
              <div style="background:#F8FAFC;border-left:3px solid #A5B4FC;border-radius:8px;padding:11px 12px;color:#64748B;font-size:12px;line-height:1.5;">
                This private meeting link expires ${expiry}. Please don’t forward it unless the host expects additional guests.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E6EBF2;padding:16px 28px;">
              <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.45;">Sent by Alenio · © ${year} Alenio Insights, LLC</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "You’re invited to join an Alenio meeting",
    "",
    `${senderNameRaw} invited you to meet on Alenio.`,
    `Meeting: ${roomNameRaw}`,
    `Join: ${input.inviteUrl}`,
    `Link expires: ${formatExpiry(input.expiresAt)}`,
  ].join("\n");

  return { subject, html, text };
}
