import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Resend } from "resend";
import { env } from "../env";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushToUsers } from "../lib/push";

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

    // Fire-and-forget: notify team members that a video call has started
    void (async () => {
      const event = await prisma.calendarEvent.findUnique({
        where: { id: roomId },
        select: { teamId: true, createdById: true },
      });
      if (!event) return;

      const members = await prisma.teamMember.findMany({
        where: { teamId: event.teamId, userId: { not: event.createdById } },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      if (memberIds.length > 0) {
        await sendPushToUsers(
          memberIds,
          userName ?? "Someone",
          "📹 Started a video call — join now!",
          { teamId: event.teamId, type: "video_call" },
          "notifMeetings"
        );
      }
    })();

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
    const logoUrl = `${env.BACKEND_URL}/static/alenio-logo.png`;
    const lotttechLogoUrl = `${env.BACKEND_URL}/static/lotttech-logo.png`;
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(roomName)}&details=${encodeURIComponent("Join via: " + roomUrl)}`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EEF2FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#EEF2FF" style="background:#EEF2FF;padding:32px 16px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;">

        <!-- Outer white card -->
        <tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 32px rgba(67,97,238,0.12);">

          <!-- Logo + tagline -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:40px 40px 24px;">
              <img src="${logoUrl}" alt="Alenio" width="220" style="height:auto;display:block;margin:0 auto 14px;border:0;" />
              <p style="margin:0;font-size:15px;font-weight:700;letter-spacing:0.3px;line-height:1.5;">
                <span style="color:#4361EE;">Connect.</span>
                <span style="color:#7C3AED;"> Execute.</span>
                <span style="color:#EC4899;"> Celebrate.</span>
              </p>
            </td></tr>
          </table>

          <!-- Dark meeting card -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:0 20px 8px;">

              <!-- Card inner table with dark bg -->
              <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#2D4FD6" style="background:#2D4FD6;border-radius:18px;">
                <tr><td style="padding:24px 24px 8px;">

                  <!-- MEETING label row with lines -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                    <tr>
                      <td width="30" style="border-top:1px solid rgba(255,255,255,0.3);font-size:0;">&nbsp;</td>
                      <td style="padding:0 10px;white-space:nowrap;font-size:10px;font-weight:700;color:#A5B4FC;text-transform:uppercase;letter-spacing:1.5px;text-align:center;">MEETING</td>
                      <td style="border-top:1px solid rgba(255,255,255,0.3);font-size:0;">&nbsp;</td>
                    </tr>
                  </table>

                  <!-- Room name -->
                  <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#ffffff;line-height:1.25;">${roomName}</p>
                  <!-- Hosted by -->
                  <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.65);">Hosted by <strong style="color:#ffffff;font-weight:700;">${senderName}</strong></p>

                  <!-- Join Video Call button -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                    <tr><td align="center" bgcolor="#5B7FFF" style="background:#5B7FFF;border-radius:13px;">
                      <a href="${roomUrl}" style="display:block;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:15px 0;text-align:center;border-radius:13px;">Join Video Call</a>
                    </td></tr>
                  </table>

                </td></tr>

                <!-- Add to Calendar row (white bg, inside dark card at bottom) -->
                <tr><td style="padding:0 16px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr><td align="center" bgcolor="#ffffff" style="background:#ffffff;border-radius:10px;">
                      <a href="${gcalUrl}" style="display:block;color:#1E293B;font-size:13px;font-weight:600;text-decoration:none;padding:11px 0;text-align:center;border-radius:10px;">
                        📅 Add to Calendar &nbsp; 📆
                      </a>
                    </td></tr>
                  </table>
                </td></tr>

              </table>
            </td></tr>
          </table>

          <!-- Expiry notice -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:20px 28px 8px;">
              <p style="margin:0;font-size:13px;color:#64748B;">🕐 Link expires in 24 hours for security</p>
            </td></tr>
          </table>

          <!-- Lott logo -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:16px 28px 20px;border-top:1px solid #F1F5F9;margin-top:12px;">
              <img src="${lotttechLogoUrl}" alt="Lott Technology Group" height="60" style="height:60px;width:auto;display:inline-block;border:0;" />
            </td></tr>
          </table>

          <!-- E2E encrypted -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0 28px 24px;">
              <p style="margin:0;font-size:12px;color:#94A3B8;">🔒 End-to-end encrypted</p>
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
