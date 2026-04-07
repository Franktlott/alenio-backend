import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { env } from "../env";

const videoRouter = new Hono();

// Sanitize room name for Daily (alphanumeric + hyphens, max 40 chars)
function sanitizeRoomName(id: string): string {
  return `room-${id}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40);
}

videoRouter.post(
  "/room",
  zValidator("json", z.object({ roomId: z.string() })),
  async (c) => {
    const { roomId } = c.req.valid("json");
    const apiKey = env.DAILY_API_KEY;

    if (!apiKey) {
      return c.json({ error: { message: "Daily API key not configured", code: "NO_API_KEY" } }, 500);
    }

    const roomName = sanitizeRoomName(roomId);

    // Try to get existing room first
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (getRes.ok) {
      const room = await getRes.json() as { url: string };
      return c.json({ data: { url: room.url } });
    }

    // Create room if it doesn't exist
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
    return c.json({ data: { url: room.url } });
  }
);

export { videoRouter };
