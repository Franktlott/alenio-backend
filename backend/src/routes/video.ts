import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Resend } from "resend";
import { env } from "../env";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const videoRouter = new Hono<{ Variables: Variables }>();

function sanitizeRoomName(id: string): string {
  return `room-${id}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40);
}

async function computeExp(roomId: string): Promise<number> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: roomId },
    select: { endDate: true },
  });

  if (event?.endDate) {
    return Math.floor(event.endDate.getTime() / 1000) + 3600;
  }

  return Math.floor(Date.now() / 1000) + 86400;
}

videoRouter.post(
  "/room",
  zValidator("json", z.object({ roomId: z.string(), userName: z.string().optional() })),
  async (c) => {
    const { roomId, userName } = c.req.valid("json");
    const apiKey = env.DAILY_API_KEY;

    if (!apiKey) {
      return c.json({ error: { message: "Daily API key not configured", code: "NO_API_KEY" } }, 500);
    }

    const roomName = sanitizeRoomName(roomId);
    const exp = await computeExp(roomId);

    // Get or create room
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    let roomUrl: string;

    if (getRes.ok) {
      const room = await getRes.json() as { url: string };
      roomUrl = room.url;

      // Update existing room with expiration
      await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: { exp },
        }),
      });
    } else {
      const createRes = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: roomName,
          privacy: "public",
          properties: {
            enable_knocking: false,
            enable_screenshare: true,
            enable_chat: true,
            exp,
          },
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        return c.json({ error: { message: `Failed to create room: ${err}`, code: "CREATE_FAILED" } }, 500);
      }

      const room = await createRes.json() as { url: string };
      roomUrl = room.url;
    }

    // Create a meeting token so the user's name is pre-filled
    const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: userName ?? "Guest",
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    if (!tokenRes.ok) {
      // Fall back to no-token URL if token creation fails
      return c.json({ data: { url: roomUrl, token: null } });
    }

    const tokenData = await tokenRes.json() as { token: string };
    return c.json({ data: { url: roomUrl, token: tokenData.token } });
  }
);

// GET /api/video/upcoming — returns video meetings starting within 60 min (for banner)
videoRouter.get("/upcoming", authGuard, async (c) => {
  const user = c.get("user")!;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000); // 60 min from now
  const windowStart = new Date(now.getTime() - 30 * 60 * 1000); // allow 30 min past start

  // Get all teams the user is in
  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    include: { team: { select: { id: true, name: true } } },
  });

  if (memberships.length === 0) return c.json({ data: [] });

  const teamIds = memberships.map(m => m.teamId);

  // Get upcoming video meetings across all teams
  const events = await prisma.calendarEvent.findMany({
    where: {
      teamId: { in: teamIds },
      isVideoMeeting: true,
      startDate: { gte: windowStart, lte: windowEnd },
    },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
    orderBy: { startDate: "asc" },
  });

  const result = events.map(event => {
    const membership = memberships.find(m => m.teamId === event.teamId);
    return {
      event,
      teamName: membership?.team.name ?? "",
      userRole: membership?.role ?? "member",
    };
  });

  return c.json({ data: result });
});

videoRouter.post(
  "/invite",
  authGuard,
  zValidator(
    "json",
    z.object({
      to: z.string().email(),
      roomUrl: z.string().url(),
      roomName: z.string(),
      senderName: z.string(),
    })
  ),
  async (c) => {
    if (!env.RESEND_API_KEY) {
      return c.json(
        { error: { message: "Email not configured", code: "NO_EMAIL_CONFIG" } },
        503
      );
    }

    const { to, roomUrl, roomName, senderName } = c.req.valid("json");
    const logoUrl = `${env.BACKEND_URL}/static/alenio-logo-white.png`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Blue top bar with logo + tagline -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:linear-gradient(135deg,#4361EE,#7C3AED);padding:32px 40px;text-align:center;">
              <img src="${logoUrl}" alt="Alenio" style="height:48px;width:auto;display:block;margin:0 auto 10px;" />
              <p style="margin:0 0 20px;font-size:13px;font-weight:600;letter-spacing:0.3px;">
                <span style="color:#A5B4FC;">Connect.</span>
                <span style="color:#C4B5FD;"> Execute.</span>
                <span style="color:#FCA5A5;"> Celebrate.</span>
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3;">You're invited to a video call</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:15px;">${senderName} is waiting for you</p>
            </td></tr>
          </table>
          <!-- Body -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:36px 40px;">
              <!-- Meeting info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px;margin-bottom:28px;">
                <tr><td style="padding:20px 24px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;">Meeting</p>
                  <p style="margin:0;font-size:17px;font-weight:700;color:#0F172A;">${roomName}</p>
                </td></tr>
              </table>
              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center">
                  <a href="${roomUrl}" style="display:inline-block;background:#4361EE;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 48px;border-radius:14px;letter-spacing:-0.2px;">Join Video Call</a>
                </td></tr>
              </table>
              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td style="border-top:1px solid #E2E8F0;"></td>
                </tr>
              </table>
              <!-- Expiry notice -->
              <p style="margin:0 0 20px;font-size:13px;color:#94A3B8;text-align:center;">⏱ This link expires in 24 hours.</p>
              <!-- Link fallback -->
              <p style="margin:0 0 6px;font-size:13px;color:#64748B;">Or copy this link into your browser:</p>
              <p style="margin:0;font-size:13px;color:#4361EE;word-break:break-all;">${roomUrl}</p>
            </td></tr>
          </table>
          <!-- Footer -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #F1F5F9;">
              <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">Sent via <strong>Alenio</strong> · Team collaboration made simple</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      const resend = new Resend(env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: env.FROM_EMAIL,
        to,
        subject: `${senderName} invited you to a video call`,
        html,
      });

      if (result.error) {
        return c.json(
          { error: { message: result.error.message, code: "EMAIL_SEND_FAILED" } },
          500
        );
      }

      return c.json({ data: { sent: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send email";
      return c.json({ error: { message, code: "EMAIL_SEND_FAILED" } }, 500);
    }
  }
);

export { videoRouter };
