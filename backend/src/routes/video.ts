import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
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

export { videoRouter };
