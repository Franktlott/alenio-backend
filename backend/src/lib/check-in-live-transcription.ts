import { env } from "../env";
import { senecaAvailable, senecaOpenAiKey } from "./seneca-openai";
import {
  stitchStoredLiveTranscript,
  upsertFinalTranscriptSegment,
  type SerializedTranscriptSegment,
} from "./check-in-transcript-segments";

/** Short-lived tickets so the WS URL does not carry a long-lived user token forever. */
type LiveTranscriptionTicket = {
  recordingId: string;
  teamId: string;
  memberUserId: string;
  userId: string;
  expiresAt: number;
};

const TICKET_TTL_MS = 2 * 60 * 1000;
const tickets = new Map<string, LiveTranscriptionTicket>();

export function liveTranscriptionAvailable(): boolean {
  return senecaAvailable();
}

/** GA Realtime live-transcription model (not the retired beta realtime=v1 path). */
export function liveTranscriptionModel(): string {
  return env.OPENAI_REALTIME_TRANSCRIBE_MODEL?.trim() || "gpt-live-transcribe";
}

export function createLiveTranscriptionTicket(params: {
  recordingId: string;
  teamId: string;
  memberUserId: string;
  userId: string;
}): { ticket: string; expiresAt: string } {
  const ticket = crypto.randomUUID();
  const expiresAt = Date.now() + TICKET_TTL_MS;
  tickets.set(ticket, { ...params, expiresAt });
  // Opportunistic cleanup of expired tickets.
  for (const [key, value] of tickets) {
    if (value.expiresAt <= Date.now()) tickets.delete(key);
  }
  return { ticket, expiresAt: new Date(expiresAt).toISOString() };
}

export function consumeLiveTranscriptionTicket(
  ticket: string,
): LiveTranscriptionTicket | null {
  const found = tickets.get(ticket);
  if (!found) return null;
  tickets.delete(ticket);
  if (found.expiresAt <= Date.now()) return null;
  return found;
}

export type LiveTranscriptClientEvent =
  | {
      type: "transcript";
      event: "interim" | "final";
      id: string;
      text: string;
      startMs: number;
      endMs: number | null;
      speakerLabel: string | null;
      segment?: SerializedTranscriptSegment;
    }
  | { type: "status"; status: "connecting" | "active" | "paused" | "error" | "closed"; message?: string }
  | { type: "ready"; recordingId: string }
  | { type: "pong" };

type OpenAiRealtimeEvent = {
  type?: string;
  event_id?: string;
  item_id?: string;
  transcript?: string;
  delta?: string;
  error?: { message?: string };
};

/**
 * Proxies PCM16 audio from the Alenio client to OpenAI Realtime transcription
 * and returns interim/final events. Never logs audio or transcript bodies.
 */
/**
 * gpt-live-transcribe has no server VAD. A fixed 2s commit chops mid-sentence
 * (seen as "really under" / "How this is working"). Commit only after silence,
 * with a long-utterance safety valve.
 */
const SILENCE_RMS_THRESHOLD = 0.018;
const SILENCE_BEFORE_COMMIT_MS = 900;
const MAX_UTTERANCE_MS = 12_000;
const VAD_TICK_MS = 200;

/** RMS of little-endian PCM16 base64. */
export function pcm16Base64Rms(base64: string): number {
  try {
    const binary = atob(base64);
    const samples = Math.floor(binary.length / 2);
    if (samples <= 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples; i += 1) {
      const lo = binary.charCodeAt(i * 2)!;
      const hi = binary.charCodeAt(i * 2 + 1)!;
      let sample = (hi << 8) | lo;
      if (sample >= 0x8000) sample -= 0x10000;
      const n = sample / 32768;
      sum += n * n;
    }
    return Math.sqrt(sum / samples);
  } catch {
    return 0;
  }
}

export class CheckInLiveTranscriptionSession {
  private openai: WebSocket | null = null;
  private closed = false;
  private paused = false;
  private interimByItem = new Map<string, { text: string; startMs: number }>();
  private startedAtMs = Date.now();
  private sequence = 0;
  private vadTimer: ReturnType<typeof setInterval> | null = null;
  private hasUncommittedAudio = false;
  private heardSpeechInBuffer = false;
  private silenceStartedAt: number | null = null;
  private utteranceStartedAt: number | null = null;

  constructor(
    private readonly recordingId: string,
    private readonly send: (event: LiveTranscriptClientEvent) => void,
  ) {}

  async start(): Promise<void> {
    if (!liveTranscriptionAvailable()) {
      this.send({
        type: "status",
        status: "error",
        message: "Live transcription is not configured.",
      });
      return;
    }

    const key = senecaOpenAiKey();
    if (!key) {
      this.send({
        type: "status",
        status: "error",
        message: "Live transcription is not configured.",
      });
      return;
    }

    this.send({ type: "status", status: "connecting" });
    this.startedAtMs = Date.now();

    // GA Realtime endpoint — do not send OpenAI-Beta: realtime=v1 (retired).
    const url = `wss://api.openai.com/v1/realtime?intent=transcription`;
    const socket = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    this.openai = socket;

    socket.addEventListener("open", () => {
      if (this.closed) {
        socket.close();
        return;
      }
      socket.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: {
                  type: "audio/pcm",
                  rate: 24000,
                },
                transcription: {
                  model: liveTranscriptionModel(),
                },
                // Required null for gpt-live-transcribe; finals come from commit.
                turn_detection: null,
              },
            },
          },
        }),
      );
      this.startVadLoop();
      this.send({ type: "status", status: "active" });
    });

    socket.addEventListener("message", (event) => {
      void this.handleOpenAiMessage(String(event.data));
    });

    socket.addEventListener("error", () => {
      if (this.closed) return;
      this.send({
        type: "status",
        status: "error",
        message: "Live transcription lost its connection.",
      });
    });

    socket.addEventListener("close", () => {
      this.stopVadLoop();
      if (this.closed) return;
      this.closed = true;
      this.send({ type: "status", status: "closed" });
    });
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      void this.commit();
    }
    this.send({ type: "status", status: paused ? "paused" : "active" });
  }

  appendPcmBase64(data: string) {
    if (this.closed || this.paused || !this.openai || this.openai.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!data || typeof data !== "string") return;
    // Cap a single frame so a runaway client cannot flood the provider.
    if (data.length > 200_000) return;
    this.openai.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data,
      }),
    );
    this.hasUncommittedAudio = true;

    const rms = pcm16Base64Rms(data);
    const now = Date.now();
    if (rms >= SILENCE_RMS_THRESHOLD) {
      this.heardSpeechInBuffer = true;
      this.silenceStartedAt = null;
      if (this.utteranceStartedAt == null) this.utteranceStartedAt = now;
      return;
    }
    // Quiet frame — only start the silence clock after we have heard speech.
    if (!this.heardSpeechInBuffer) return;
    if (this.silenceStartedAt == null) this.silenceStartedAt = now;
  }

  async commit() {
    if (this.closed || !this.openai || this.openai.readyState !== WebSocket.OPEN) return;
    if (!this.hasUncommittedAudio) return;
    this.openai.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    this.hasUncommittedAudio = false;
    this.heardSpeechInBuffer = false;
    this.silenceStartedAt = null;
    this.utteranceStartedAt = null;
  }

  close() {
    this.closed = true;
    this.stopVadLoop();
    void this.commit();
    try {
      this.openai?.close();
    } catch {
      // ignore
    }
    this.openai = null;
    this.send({ type: "status", status: "closed" });
  }

  private startVadLoop() {
    this.stopVadLoop();
    this.vadTimer = setInterval(() => {
      if (this.closed || this.paused || !this.hasUncommittedAudio) return;
      const now = Date.now();
      const silentLongEnough =
        this.heardSpeechInBuffer &&
        this.silenceStartedAt != null &&
        now - this.silenceStartedAt >= SILENCE_BEFORE_COMMIT_MS;
      const utteranceTooLong =
        this.utteranceStartedAt != null &&
        now - this.utteranceStartedAt >= MAX_UTTERANCE_MS;
      if (silentLongEnough || utteranceTooLong) {
        void this.commit();
      }
    }, VAD_TICK_MS);
  }

  private stopVadLoop() {
    if (this.vadTimer) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }
  }

  private elapsedMs(): number {
    return Math.max(0, Date.now() - this.startedAtMs);
  }

  private async handleOpenAiMessage(raw: string) {
    let parsed: OpenAiRealtimeEvent;
    try {
      parsed = JSON.parse(raw) as OpenAiRealtimeEvent;
    } catch {
      return;
    }

    const type = parsed.type ?? "";
    if (type === "error") {
      this.send({
        type: "status",
        status: "error",
        message: parsed.error?.message || "Live transcription failed.",
      });
      return;
    }

    if (
      type === "conversation.item.input_audio_transcription.delta" ||
      type === "input_audio_transcription.delta"
    ) {
      const id = parsed.item_id || parsed.event_id || `interim-${Date.now()}`;
      const delta = (parsed.delta ?? parsed.transcript ?? "").trim();
      if (!delta) return;
      const prior = this.interimByItem.get(id);
      const text = `${prior?.text ?? ""}${delta}`.replace(/\s+/g, " ").trim();
      const startMs = prior?.startMs ?? this.elapsedMs();
      this.interimByItem.set(id, { text, startMs });
      this.send({
        type: "transcript",
        event: "interim",
        id,
        text,
        startMs,
        endMs: null,
        speakerLabel: null,
      });
      return;
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "input_audio_transcription.completed"
    ) {
      const id = parsed.item_id || parsed.event_id || `final-${Date.now()}`;
      const text = (parsed.transcript ?? "").trim();
      if (!text) {
        this.interimByItem.delete(id);
        return;
      }
      const prior = this.interimByItem.get(id);
      this.interimByItem.delete(id);
      const startMs = prior?.startMs ?? this.elapsedMs();
      const endMs = this.elapsedMs();
      const sequence = this.sequence;
      this.sequence += 1;

      let segment: SerializedTranscriptSegment | undefined;
      try {
        segment =
          (await upsertFinalTranscriptSegment(this.recordingId, {
            providerEventId: id,
            sequence,
            startMs,
            endMs,
            text,
            speakerLabel: null,
          })) ?? undefined;
      } catch {
        // Persistence failure must not drop the live UI event.
      }

      this.send({
        type: "transcript",
        event: "final",
        id,
        text,
        startMs,
        endMs,
        speakerLabel: null,
        segment,
      });
    }
  }
}

export async function preferLiveTranscriptForFinish(
  recordingId: string,
  minWords: number,
): Promise<string | null> {
  const live = await stitchStoredLiveTranscript(recordingId);
  const words = live.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  if (words >= minWords) return live;
  return null;
}
