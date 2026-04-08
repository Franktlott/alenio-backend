import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { env } from "../env";

const videoRouter = new Hono();

function sanitizeRoomName(id: string): string {
  return `room-${id}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40);
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

    // Get or create room
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    let roomUrl: string;

    if (getRes.ok) {
      const room = await getRes.json() as { url: string };
      roomUrl = room.url;
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

export { videoRouter };
