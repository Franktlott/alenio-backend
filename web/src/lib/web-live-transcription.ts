import {
  startLiveTranscriptionSession,
  upsertCheckInTranscriptSegment,
} from "./member-development-api";

export type LiveTranscriptLine = {
  id: string;
  text: string;
  startMs: number;
  endMs: number | null;
  speakerLabel: string | null;
  interim: boolean;
};

export type LiveTranscriptionStatus =
  | "idle"
  | "connecting"
  | "active"
  | "paused"
  | "error"
  | "closed";

type Handlers = {
  onLines?: (lines: LiveTranscriptLine[]) => void;
  onStatus?: (status: LiveTranscriptionStatus, message?: string) => void;
};

function applyEvent(
  lines: LiveTranscriptLine[],
  event: {
    event: "interim" | "final";
    id: string;
    text: string;
    startMs: number;
    endMs: number | null;
    speakerLabel: string | null;
  },
): LiveTranscriptLine[] {
  const text = event.text?.trim();
  if (!text) return lines;
  if (event.event === "interim") {
    const without = lines.filter((line) => !line.interim || line.id === event.id);
    const next: LiveTranscriptLine = {
      id: event.id,
      text,
      startMs: event.startMs,
      endMs: null,
      speakerLabel: event.speakerLabel,
      interim: true,
    };
    const index = without.findIndex((line) => line.id === event.id);
    if (index >= 0) {
      const copy = [...without];
      copy[index] = next;
      return copy;
    }
    return [...without.filter((line) => !line.interim), next];
  }
  const cleaned = lines.filter(
    (line) => !(line.interim && line.id === event.id) && line.id !== event.id,
  );
  const finals = cleaned.filter((line) => !line.interim);
  const last = finals[finals.length - 1];
  if (last && last.text === text) return finals;
  const next = {
    id: event.id,
    text,
    startMs: event.startMs,
    endMs: event.endMs,
    speakerLabel: event.speakerLabel,
    interim: false as const,
  };
  if (last && shouldMergeFinals(last, next)) {
    return [
      ...finals.slice(0, -1),
      {
        ...last,
        id: next.id,
        text: joinFragments(last.text, next.text),
        endMs: next.endMs ?? last.endMs,
        speakerLabel: last.speakerLabel ?? next.speakerLabel,
      },
    ];
  }
  return [...finals, next];
}

function shouldMergeFinals(
  previous: LiveTranscriptLine,
  next: LiveTranscriptLine,
): boolean {
  const prev = previous.text.trim();
  if (!prev || !next.text.trim()) return false;
  if (previous.speakerLabel && next.speakerLabel && previous.speakerLabel !== next.speakerLabel) {
    return false;
  }
  if (/[.!?…]["')\]]?\s*$/.test(prev)) return false;
  const gapMs = next.startMs - (previous.endMs ?? previous.startMs);
  return gapMs <= 2500;
}

function joinFragments(previous: string, next: string): string {
  const left = previous.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  if (/[A-Za-z]$/.test(left) && /^[a-z]/.test(right)) return `${left}${right}`;
  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}

function floatTo16BitPcmBase64(input: Float32Array): string | null {
  if (!input.length) return null;
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]!));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/**
 * Browser live transcription: shares the MediaRecorder mic stream, sends PCM
 * over the authenticated Alenio WS, and keeps finals via HTTP upsert backup.
 */
export class WebLiveTranscription {
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private lines: LiveTranscriptLine[] = [];
  private status: LiveTranscriptionStatus = "idle";
  private closed = false;
  private paused = false;

  constructor(
    private readonly target: {
      teamId: string;
      memberUserId: string;
      recordingId: string;
    },
    private readonly handlers: Handlers = {},
  ) {}

  async start(stream: MediaStream): Promise<void> {
    if (this.closed) return;
    this.setStatus("connecting");
    try {
      const session = await startLiveTranscriptionSession(
        this.target.teamId,
        this.target.memberUserId,
        this.target.recordingId,
      );
      await this.openSocket(session.wsUrl);
      await this.attachPcm(stream, session.sampleRate || 24000);
    } catch (err) {
      this.setStatus(
        "error",
        err instanceof Error ? err.message : "Live transcription is unavailable.",
      );
    }
  }

  pause() {
    this.paused = true;
    this.send({ type: "pause" });
  }

  resume() {
    this.paused = false;
    this.send({ type: "resume" });
  }

  commit() {
    this.send({ type: "commit" });
  }

  stop() {
    this.closed = true;
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      void this.context?.close();
      this.socket?.close();
    } catch {
      /* ignore */
    }
    this.processor = null;
    this.source = null;
    this.context = null;
    this.socket = null;
    this.setStatus("closed");
  }

  private async attachPcm(stream: MediaStream, sampleRate: number) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error("This browser cannot stream live audio.");
    this.context = new AudioCtx({ sampleRate });
    this.source = this.context.createMediaStreamSource(stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (this.closed || this.paused) return;
      const pcm = floatTo16BitPcmBase64(event.inputBuffer.getChannelData(0));
      if (pcm) this.send({ type: "audio", data: pcm });
    };
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  private openSocket(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(wsUrl);
      this.socket = socket;
      socket.onopen = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
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
        if (!this.closed) this.setStatus("closed");
      };
    });
  }

  private async handleMessage(raw: string) {
    let parsed: {
      type: string;
      status?: LiveTranscriptionStatus;
      message?: string;
      event?: "interim" | "final";
      id?: string;
      text?: string;
      startMs?: number;
      endMs?: number | null;
      speakerLabel?: string | null;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed.type === "status" && parsed.status) {
      this.setStatus(parsed.status, parsed.message);
      return;
    }
    if (parsed.type !== "transcript" || !parsed.event || !parsed.id || !parsed.text) return;
    this.lines = applyEvent(this.lines, {
      event: parsed.event,
      id: parsed.id,
      text: parsed.text,
      startMs: parsed.startMs ?? 0,
      endMs: parsed.endMs ?? null,
      speakerLabel: parsed.speakerLabel ?? null,
    });
    this.handlers.onLines?.([...this.lines]);
    if (parsed.event === "final") {
      void upsertCheckInTranscriptSegment(
        this.target.teamId,
        this.target.memberUserId,
        this.target.recordingId,
        {
          providerEventId: parsed.id,
          startMs: parsed.startMs ?? 0,
          endMs: parsed.endMs,
          text: parsed.text,
          speakerLabel: parsed.speakerLabel,
        },
      ).catch(() => undefined);
    }
  }

  private send(payload: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  private setStatus(status: LiveTranscriptionStatus, message?: string) {
    this.status = status;
    this.handlers.onStatus?.(status, message);
  }
}

export function formatTranscriptClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
