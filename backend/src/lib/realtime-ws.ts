import type { ServerWebSocket } from "bun";
import { getSessionFromHeaders } from "../auth";
import { prisma } from "../prisma";
import {
  detachSocket,
  dmRealtimeKey,
  subscribeSocket,
  teamRealtimeKey,
  unsubscribeSocket,
  type RealtimeSocketData,
} from "./realtime-hub";

type ClientMessage =
  | { type: "subscribe"; channels?: string[] }
  | { type: "unsubscribe"; channels?: string[] }
  | { type: "ping" };

function parseClientMessage(raw: string | Buffer): ClientMessage | null {
  try {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    const parsed = JSON.parse(text) as ClientMessage;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sendJson(ws: ServerWebSocket<RealtimeSocketData>, payload: unknown) {
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    console.error("[realtime] sendJson failed:", err);
  }
}

async function filterAllowedChannels(userId: string, channels: string[]): Promise<string[]> {
  const allowed: string[] = [];
  for (const key of channels) {
    if (typeof key !== "string" || !key.trim()) continue;

    const teamMatch = /^team:([^:]+):topic:(.+)$/.exec(key);
    if (teamMatch) {
      const teamId = teamMatch[1]!;
      const topicKey = teamMatch[2]!;
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId, teamId } },
        select: { id: true },
      });
      if (!membership) continue;
      if (topicKey === "general") {
        allowed.push(teamRealtimeKey(teamId, null));
        continue;
      }
      const topic = await prisma.topic.findFirst({
        where: { id: topicKey, teamId },
        select: { id: true },
      });
      if (topic) allowed.push(teamRealtimeKey(teamId, topic.id));
      continue;
    }

    const dmMatch = /^dm:(.+)$/.exec(key);
    if (dmMatch) {
      const conversationId = dmMatch[1]!;
      const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
        select: { id: true },
      });
      if (participant) allowed.push(dmRealtimeKey(conversationId));
    }
  }
  return allowed;
}

export async function handleRealtimeUpgrade(
  req: Request,
  server: { upgrade: (req: Request, options: { data: RealtimeSocketData }) => boolean },
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return new Response(JSON.stringify({ error: { message: "Missing token", code: "UNAUTHORIZED" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  const session = await getSessionFromHeaders(headers);
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upgraded = server.upgrade(req, {
    data: {
      userId: session.user.id,
      channels: new Set<string>(),
    } satisfies RealtimeSocketData,
  });

  if (!upgraded) {
    return new Response("WebSocket upgrade failed", { status: 400 });
  }
  return undefined;
}

export const realtimeWebsocket = {
  open(ws: ServerWebSocket<RealtimeSocketData>) {
    sendJson(ws, { type: "ready", userId: ws.data.userId });
  },

  async message(ws: ServerWebSocket<RealtimeSocketData>, message: string | Buffer) {
    const parsed = parseClientMessage(message);
    if (!parsed) return;

    if (parsed.type === "ping") {
      sendJson(ws, { type: "pong" });
      return;
    }

    if (parsed.type === "subscribe") {
      const requested = Array.isArray(parsed.channels) ? parsed.channels : [];
      const allowed = await filterAllowedChannels(ws.data.userId, requested);
      subscribeSocket(ws, allowed);
      sendJson(ws, { type: "subscribed", channels: allowed });
      return;
    }

    if (parsed.type === "unsubscribe") {
      const requested = Array.isArray(parsed.channels) ? parsed.channels : [];
      unsubscribeSocket(ws, requested);
      sendJson(ws, { type: "unsubscribed", channels: requested });
    }
  },

  close(ws: ServerWebSocket<RealtimeSocketData>) {
    detachSocket(ws);
  },
};
