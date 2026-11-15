import type { ServerWebSocket } from "bun";
import { prisma } from "../prisma";
import {
  CheckInLiveTranscriptionSession,
  consumeLiveTranscriptionTicket,
  type LiveTranscriptClientEvent,
} from "./check-in-live-transcription";

export type CheckInLiveSocketData = {
  kind: "check_in_live_transcription";
  userId: string;
  recordingId: string;
  teamId: string;
  memberUserId: string;
  session?: CheckInLiveTranscriptionSession;
};

type ClientMessage =
  | { type: "ping" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "commit" }
  | { type: "audio"; data?: string };

function sendJson(
  ws: ServerWebSocket<CheckInLiveSocketData>,
  payload: LiveTranscriptClientEvent,
) {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // Client gone.
  }
}

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

export async function handleCheckInLiveTranscriptionUpgrade(
  req: Request,
  server: {
    upgrade: (req: Request, options: { data: CheckInLiveSocketData }) => boolean;
  },
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const ticket = url.searchParams.get("ticket")?.trim();
  if (!ticket) {
    return new Response(
      JSON.stringify({ error: { message: "Missing ticket", code: "UNAUTHORIZED" } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const claims = consumeLiveTranscriptionTicket(ticket);
  if (!claims) {
    return new Response(
      JSON.stringify({ error: { message: "Invalid or expired ticket", code: "UNAUTHORIZED" } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const recording = await prisma.checkInRecording.findFirst({
    where: {
      id: claims.recordingId,
      teamId: claims.teamId,
      memberUserId: claims.memberUserId,
      createdById: claims.userId,
      status: "recording",
    },
    select: { id: true },
  });
  if (!recording) {
    return new Response(
      JSON.stringify({ error: { message: "Recording not available", code: "NOT_FOUND" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const upgraded = server.upgrade(req, {
    data: {
      kind: "check_in_live_transcription",
      userId: claims.userId,
      recordingId: claims.recordingId,
      teamId: claims.teamId,
      memberUserId: claims.memberUserId,
    },
  });

  if (!upgraded) {
    return new Response("WebSocket upgrade failed", { status: 400 });
  }
  return undefined;
}

export const checkInLiveTranscriptionWebsocket = {
  open(ws: ServerWebSocket<CheckInLiveSocketData>) {
    const session = new CheckInLiveTranscriptionSession(
      ws.data.recordingId,
      (event) => sendJson(ws, event),
    );
    ws.data.session = session;
    sendJson(ws, { type: "ready", recordingId: ws.data.recordingId });
    void session.start();
  },

  message(ws: ServerWebSocket<CheckInLiveSocketData>, message: string | Buffer) {
    const parsed = parseClientMessage(message);
    if (!parsed) return;
    const session = ws.data.session;
    if (!session) return;

    if (parsed.type === "ping") {
      sendJson(ws, { type: "pong" });
      return;
    }
    if (parsed.type === "pause") {
      session.setPaused(true);
      return;
    }
    if (parsed.type === "resume") {
      session.setPaused(false);
      return;
    }
    if (parsed.type === "commit") {
      void session.commit();
      return;
    }
    if (parsed.type === "audio" && typeof parsed.data === "string") {
      session.appendPcmBase64(parsed.data);
    }
  },

  close(ws: ServerWebSocket<CheckInLiveSocketData>) {
    ws.data.session?.close();
    ws.data.session = undefined;
  },
};
