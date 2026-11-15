import {
  startLiveTranscriptionSession,
  upsertCheckInTranscriptSegment,
} from "@/lib/check-in-recordings-api";
import type { LiveTranscriptEvent } from "@/lib/live-check-in-transcript";

export type LiveTranscriptionStatus =
  | "idle"
  | "connecting"
  | "active"
  | "paused"
  | "error"
  | "closed";

type Handlers = {
  onEvent?: (event: LiveTranscriptEvent) => void;
  onStatus?: (status: LiveTranscriptionStatus, message?: string) => void;
};

type ServerMessage =
  | {
      type: "transcript";
      event: "interim" | "final";
      id: string;
      text: string;
      startMs: number;
      endMs: number | null;
      speakerLabel: string | null;
    }
  | { type: "status"; status: LiveTranscriptionStatus; message?: string }
  | { type: "ready"; recordingId: string }
  | { type: "pong" };

/**
 * Opens an authenticated live-transcription socket and forwards PCM frames.
 * Recording continues even if this client errors or closes.
 */
export class LiveTranscriptionClient {
  private socket: WebSocket | null = null;
  private status: LiveTranscriptionStatus = "idle";
  private closed = false;
  private sampleRate = 24000;

  constructor(
    private readonly target: {
      teamId: string;
      memberUserId: string;
      recordingId: string;
    },
    private readonly handlers: Handlers = {},
  ) {}

  getStatus(): LiveTranscriptionStatus {
    return this.status;
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  async start(): Promise<void> {
    if (this.closed) return;
    this.setStatus("connecting");
    try {
      const session = await startLiveTranscriptionSession(
        this.target.teamId,
        this.target.memberUserId,
        this.target.recordingId,
      );
      this.sampleRate = session.sampleRate || 24000;
      await this.openSocket(session.wsUrl);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Live transcription is unavailable.";
      this.setStatus("error", message);
    }
  }

  pause(): void {
    this.send({ type: "pause" });
  }

  resume(): void {
    this.send({ type: "resume" });
  }

  /** Appends base64 PCM16 little-endian audio at the session sample rate. */
  sendPcmBase64(data: string): void {
    if (!data) return;
    this.send({ type: "audio", data });
  }

  commit(): void {
    this.send({ type: "commit" });
  }

  stop(): void {
    this.closed = true;
    try {
      this.socket?.close();
    } catch {
      /* already closed */
    }
    this.socket = null;
    this.setStatus("closed");
  }

  private async openSocket(wsUrl: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(wsUrl);
      this.socket = socket;

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      socket.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error("Could not open live transcription."));
        }
      };
      socket.onmessage = (event) => {
        void this.handleMessage(String(event.data));
      };
      socket.onclose = () => {
        if (this.closed) return;
        this.setStatus("closed");
      };
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let parsed: ServerMessage;
    try {
      parsed = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    if (parsed.type === "status") {
      this.setStatus(parsed.status, parsed.message);
      return;
    }
    if (parsed.type === "ready") {
      // Wait for provider "active" status from the server.
      return;
    }
    if (parsed.type !== "transcript") return;

    const event: LiveTranscriptEvent = {
      event: parsed.event,
      id: parsed.id,
      text: parsed.text,
      startMs: parsed.startMs,
      endMs: parsed.endMs,
      speakerLabel: parsed.speakerLabel,
    };
    this.handlers.onEvent?.(event);

    if (parsed.event === "final") {
      // Best-effort HTTP backup so a WS persist miss still keeps the line.
      void upsertCheckInTranscriptSegment(
        this.target.teamId,
        this.target.memberUserId,
        this.target.recordingId,
        {
          providerEventId: parsed.id,
          startMs: parsed.startMs,
          endMs: parsed.endMs,
          text: parsed.text,
          speakerLabel: parsed.speakerLabel,
        },
      ).catch(() => undefined);
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  private setStatus(status: LiveTranscriptionStatus, message?: string): void {
    this.status = status;
    this.handlers.onStatus?.(status, message);
  }
}
