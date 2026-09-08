import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Resend } from "resend";
import { env } from "../env";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushToUsers } from "../lib/push";
import {
  parseVideoMeetingParticipantIds,
  resolveVideoCheckInContext,
  VideoRoomAccessError,
} from "../lib/video-check-in-context";
import {
  buildDailyParticipantEjectBody,
  isUserVideoRoomHost,
} from "../lib/video-host-access";
import { buildVideoInviteEmail } from "../lib/video-invite-email";
import type {
  EndVideoMeetingResponse,
  VideoCheckInContextResponse,
} from "../types";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const videoRouter = new Hono<{ Variables: Variables }>();
videoRouter.use("*", authGuard);

function sanitizeRoomName(id: string): string {
  return `room-${id}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40);
}

function isAllowedDailyRoomUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "daily.co" || host.endsWith(".daily.co");
  } catch {
    return false;
  }
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

/** Authorize room access by roomId shape used by mobile/web clients. */
async function assertUserCanAccessVideoRoom(
  userId: string,
  roomId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404; message: string }> {
  try {
    await resolveVideoCheckInContext(prisma, userId, roomId);
    return { ok: true };
  } catch (error) {
    if (error instanceof VideoRoomAccessError) {
      return {
        ok: false,
        status: error.status,
        message: error.message,
      };
    }
    throw error;
  }
}

async function ensurePrivateDailyRoom(
  apiKey: string,
  roomName: string,
  exp: number,
): Promise<{ url: string } | { error: string }> {
  const getRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (getRes.ok) {
    const room = (await getRes.json()) as { url: string };
    await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        privacy: "private",
        properties: {
          exp,
          enable_knocking: false,
          enable_prejoin_ui: false,
          enable_screenshare: true,
          enable_chat: true,
          meeting_join_hook: "",
        },
      }),
    });
    return { url: room.url };
  }

  const createRes = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: roomName,
      privacy: "private",
      properties: {
        enable_knocking: false,
        enable_prejoin_ui: false,
        enable_screenshare: true,
        enable_chat: true,
        meeting_join_hook: "",
        exp,
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    return { error: `Failed to create room: ${err}` };
  }

  const room = (await createRes.json()) as { url: string };
  return { url: room.url };
}

async function mintMeetingToken(
  apiKey: string,
  roomName: string,
  opts: {
    userName: string;
    userId?: string;
    exp: number;
    isOwner?: boolean;
  },
): Promise<string | null> {
  const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: opts.userName,
        ...(opts.userId ? { user_id: opts.userId } : {}),
        ...(opts.isOwner ? { is_owner: true } : {}),
        exp: opts.exp,
        enable_screenshare: true,
        start_video_off: true,
        start_audio_off: true,
      },
    }),
  });

  if (!tokenRes.ok) return null;
  const tokenData = (await tokenRes.json()) as { token: string };
  return tokenData.token ?? null;
}

videoRouter.post(
  "/room",
  zValidator("json", z.object({ roomId: z.string().min(1), userName: z.string().optional() })),
  async (c) => {
    const user = c.get("user")!;
    const { roomId, userName } = c.req.valid("json");
    const apiKey = env.DAILY_API_KEY;

    if (!apiKey) {
      return c.json({ error: { message: "Daily API key not configured", code: "NO_API_KEY" } }, 500);
    }

    const access = await assertUserCanAccessVideoRoom(user.id, roomId);
    if (!access.ok) {
      return c.json({ error: { message: access.message, code: "FORBIDDEN" } }, access.status);
    }

    const roomName = sanitizeRoomName(roomId);
    const exp = await computeExp(roomId);
    const roomResult = await ensurePrivateDailyRoom(apiKey, roomName, exp);
    if ("error" in roomResult) {
      return c.json({ error: { message: roomResult.error, code: "CREATE_FAILED" } }, 500);
    }

    const displayName = userName?.trim() || user.name || "Guest";
    const isHost = await isUserVideoRoomHost(prisma, user.id, roomId);
    const token = await mintMeetingToken(apiKey, roomName, {
      userName: displayName,
      userId: user.id,
      exp,
      isOwner: isHost,
    });
    if (!token) {
      return c.json(
        { error: { message: "Failed to create meeting token", code: "TOKEN_FAILED" } },
        500,
      );
    }

    // Notify team only for calendar meetings the caller is allowed to join.
    void (async () => {
      const event = await prisma.calendarEvent.findUnique({
        where: { id: roomId },
        select: { teamId: true },
      });
      if (!event) return;

      const members = await prisma.teamMember.findMany({
        where: {
          teamId: event.teamId,
          userId: { not: user.id },
        },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      if (memberIds.length > 0) {
        await sendPushToUsers(
          memberIds,
          displayName,
          "📹 Started a video call — join now!",
          { teamId: event.teamId, type: "video_call" },
          "notifMeetings",
          event.teamId,
        );
      }
    })();

    return c.json({ data: { url: roomResult.url, token, isHost } });
  },
);

// GET /api/video/upcoming — returns video meetings starting within 60 min (for banner)
videoRouter.get("/upcoming", async (c) => {
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

  const teamIds = memberships.map((m) => m.teamId);

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

  const result = events
    .map((event) => {
      const membership = memberships.find((m) => m.teamId === event.teamId);
      return {
        event,
        teamName: membership?.team.name ?? "",
        userRole: membership?.role ?? "member",
      };
    })
    .filter((item) => {
      const assigneeIds = parseVideoMeetingParticipantIds(item.event.reminderMinutes);
      return assigneeIds.length === 0 || assigneeIds.includes(user.id);
    });

  return c.json({ data: result });
});

// GET /api/video/room/:roomId/check-in-context
videoRouter.get("/room/:roomId/check-in-context", async (c) => {
  const user = c.get("user")!;
  const roomId = c.req.param("roomId");

  try {
    const data: VideoCheckInContextResponse["data"] =
      await resolveVideoCheckInContext(prisma, user.id, roomId);
    return c.json({ data });
  } catch (error) {
    if (error instanceof VideoRoomAccessError) {
      return c.json(
        {
          error: {
            message: error.message,
            code: error.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
          },
        },
        error.status,
      );
    }
    throw error;
  }
});

videoRouter.post(
  "/room/:roomId/participants/remove",
  zValidator(
    "json",
    z.object({
      sessionId: z.string().min(1),
      userId: z.string().min(1).nullable().optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const roomId = c.req.param("roomId");
    const { sessionId, userId } = c.req.valid("json");
    const apiKey = env.DAILY_API_KEY;
    if (!apiKey) {
      return c.json(
        { error: { message: "Daily API key not configured", code: "NO_API_KEY" } },
        500,
      );
    }

    const access = await assertUserCanAccessVideoRoom(user.id, roomId);
    if (!access.ok) {
      return c.json(
        { error: { message: access.message, code: "FORBIDDEN" } },
        access.status,
      );
    }
    if (!(await isUserVideoRoomHost(prisma, user.id, roomId))) {
      return c.json(
        {
          error: {
            message: "Only the meeting host can remove participants",
            code: "FORBIDDEN",
          },
        },
        403,
      );
    }
    if (userId === user.id) {
      return c.json(
        {
          error: {
            message: "Hosts cannot remove themselves",
            code: "INVALID_PARTICIPANT",
          },
        },
        400,
      );
    }
    if (userId) {
      const targetAccess = await assertUserCanAccessVideoRoom(userId, roomId);
      if (!targetAccess.ok) {
        return c.json(
          {
            error: {
              message: "Participant is not eligible for this meeting",
              code: "INVALID_PARTICIPANT",
            },
          },
          400,
        );
      }
    }

    const roomName = sanitizeRoomName(roomId);
    const ejectResponse = await fetch(
      `https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}/eject`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildDailyParticipantEjectBody(sessionId, userId),
        ),
      },
    );
    if (!ejectResponse.ok) {
      return c.json(
        {
          error: {
            message: "Could not remove this participant",
            code: "EJECT_FAILED",
          },
        },
        502,
      );
    }

    return c.json({ data: { removed: true, rejoinBlocked: !!userId } });
  },
);

videoRouter.post("/room/:roomId/end", async (c) => {
  const user = c.get("user")!;
  const roomId = c.req.param("roomId");
  const event = await prisma.calendarEvent.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      teamId: true,
      isVideoMeeting: true,
      isOneOnOne: true,
      oneOnOneMemberUserId: true,
    },
  });
  if (!event || !event.isVideoMeeting) {
    return c.json(
      { error: { message: "Video meeting not found", code: "NOT_FOUND" } },
      404,
    );
  }
  if (!event.isOneOnOne || !event.oneOnOneMemberUserId) {
    return c.json(
      { error: { message: "This meeting cannot be ended here", code: "INVALID_MEETING" } },
      400,
    );
  }

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId: event.teamId } },
    select: { role: true },
  });
  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "team_leader")
  ) {
    return c.json(
      { error: { message: "Only a workspace leader can end this meeting", code: "FORBIDDEN" } },
      403,
    );
  }

  const response: EndVideoMeetingResponse = { ended: true, roomId };
  return c.json({ data: response });
});

videoRouter.post(
  "/invite",
  zValidator(
    "json",
    z.object({
      to: z.string().email(),
      roomUrl: z.string().url(),
      roomName: z.string(),
      senderName: z.string(),
      roomId: z.string().min(1).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;

    if (!env.RESEND_API_KEY) {
      return c.json(
        { error: { message: "Email not configured", code: "NO_EMAIL_CONFIG" } },
        503,
      );
    }

    const { to, roomUrl, roomName, senderName, roomId } = c.req.valid("json");

    if (!isAllowedDailyRoomUrl(roomUrl)) {
      return c.json(
        { error: { message: "Invalid meeting link", code: "INVALID_ROOM_URL" } },
        400,
      );
    }

    if (roomId) {
      const access = await assertUserCanAccessVideoRoom(user.id, roomId);
      if (!access.ok) {
        return c.json({ error: { message: access.message, code: "FORBIDDEN" } }, access.status);
      }
    } else {
      // Without roomId, require the caller belongs to at least one workplace.
      const membership = await prisma.teamMember.findFirst({
        where: { userId: user.id },
        select: { userId: true },
      });
      if (!membership) {
        return c.json({ error: { message: "Not allowed", code: "FORBIDDEN" } }, 403);
      }
    }

    let inviteUrl = roomUrl;
    const apiKey = env.DAILY_API_KEY;
    if (apiKey && roomId) {
      const roomNameDaily = sanitizeRoomName(roomId);
      const exp = await computeExp(roomId);
      const guestToken = await mintMeetingToken(apiKey, roomNameDaily, {
        userName: "Guest",
        exp,
      });
      if (guestToken) {
        const join = new URL(roomUrl);
        join.searchParams.set("t", guestToken);
        inviteUrl = join.toString();
      }
    }

    const email = buildVideoInviteEmail({
      inviteUrl,
      roomName,
      senderName,
      expiresAt: new Date(
        (apiKey && roomId ? await computeExp(roomId) : Math.floor(Date.now() / 1000) + 86400) *
          1000,
      ),
    });

    try {
      const resend = new Resend(env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: env.FROM_EMAIL,
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      if (result.error) {
        return c.json(
          { error: { message: result.error.message, code: "EMAIL_SEND_FAILED" } },
          500,
        );
      }

      return c.json({ data: { sent: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send email";
      return c.json({ error: { message, code: "EMAIL_SEND_FAILED" } }, 500);
    }
  },
);

export { videoRouter };
