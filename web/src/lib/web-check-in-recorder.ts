import { uploadCheckInRecordingSegment } from "./member-development-api";

/** Rolling a new file every few minutes keeps each upload small and retryable. */
const SEGMENT_LENGTH_MS = 5 * 60 * 1000;
export const MAX_RECORDING_SEC = 90 * 60;
const UPLOAD_RETRY_DELAYS_MS = [2000, 6000, 15000];

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function browserCanRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the recording."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Target = { teamId: string; memberUserId: string; recordingId: string };

/**
 * Records a check-in in the browser as a series of standalone audio files.
 * Each part is its own MediaRecorder run, because timesliced chunks are not
 * playable (or transcribable) on their own.
 */
export class WebCheckInRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private mimeType: string | undefined;
  private index = 0;
  private segmentActiveMs = 0;
  private resumedAt = 0;
  private paused = false;
  private stopping = false;
  private rollTimer: ReturnType<typeof setInterval> | null = null;
  private uploads: Promise<void>[] = [];
  private pending = 0;
  private failed = 0;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuffer: Uint8Array<ArrayBuffer> | null = null;

  constructor(
    private readonly target: Target,
    private readonly onUploadsChange: (pending: number, failed: number) => void,
  ) {}

  /** Asks for the microphone. Throws a readable error when the browser says no. */
  static async requestMicrophone(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new Error("Alenio needs microphone access to record this check-in. Allow the microphone in your browser and try again.");
      }
      if (name === "NotFoundError") throw new Error("No microphone was found on this computer.");
      throw new Error("Your browser would not start the microphone. Close other apps using it and try again.");
    }
  }

  start(stream: MediaStream) {
    this.stream = stream;
    this.mimeType = pickMimeType();
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        source.connect(this.analyser);
        this.levelBuffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      }
    } catch {
      /* the level meter is a nicety; recording still works without it */
    }
    this.beginSegment();
    this.rollTimer = setInterval(() => {
      if (this.paused || this.stopping) return;
      if (this.activeMs() >= SEGMENT_LENGTH_MS) this.rollSegment();
    }, 1000);
  }

  /** Shared mic stream for live transcription PCM (do not stop tracks yourself). */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /** 0..1 loudness of the microphone right now. */
  level(): number {
    if (!this.analyser || !this.levelBuffer || this.paused) return 0;
    this.analyser.getByteTimeDomainData(this.levelBuffer);
    let sum = 0;
    for (const v of this.levelBuffer) {
      const centered = (v - 128) / 128;
      sum += centered * centered;
    }
    return Math.min(1, Math.sqrt(sum / this.levelBuffer.length) * 4);
  }

  pause() {
    if (!this.recorder || this.paused) return;
    this.segmentActiveMs += Date.now() - this.resumedAt;
    this.paused = true;
    if (this.recorder.state === "recording") this.recorder.pause();
  }

  resume() {
    if (!this.recorder || !this.paused) return;
    this.paused = false;
    this.resumedAt = Date.now();
    if (this.recorder.state === "paused") this.recorder.resume();
  }

  /** Stops the microphone and waits for every part to finish uploading. */
  async stop(): Promise<{ failed: number }> {
    this.stopping = true;
    if (this.rollTimer) clearInterval(this.rollTimer);
    await this.endSegment();
    this.release();
    await Promise.all(this.uploads);
    return { failed: this.failed };
  }

  /** Drops everything without uploading what is in progress. */
  discard() {
    this.stopping = true;
    if (this.rollTimer) clearInterval(this.rollTimer);
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.release();
  }

  private release() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
  }

  private activeMs(): number {
    return this.segmentActiveMs + (this.paused ? 0 : Date.now() - this.resumedAt);
  }

  private beginSegment() {
    if (!this.stream) return;
    const recorder = new MediaRecorder(this.stream, {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      audioBitsPerSecond: 32000,
    });
    this.recorder = recorder;
    this.segmentActiveMs = 0;
    this.resumedAt = Date.now();
    recorder.start();
    if (this.paused) recorder.pause();
  }

  private endSegment(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return Promise.resolve();
    const durationSec = Math.max(0, Math.round(this.activeMs() / 1000));
    const index = this.index++;
    const chunks: Blob[] = [];
    return new Promise((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const type = (recorder.mimeType || this.mimeType || "audio/webm").split(";")[0]!;
        const blob = new Blob(chunks, { type });
        if (blob.size > 0) this.uploads.push(this.upload(index, blob, type, durationSec));
        resolve();
      };
      recorder.stop();
    });
  }

  private rollSegment() {
    void this.endSegment();
    this.beginSegment();
  }

  private async upload(index: number, blob: Blob, contentType: string, durationSec: number) {
    this.pending += 1;
    this.onUploadsChange(this.pending, this.failed);
    try {
      const data = await blobToBase64(blob);
      for (let attempt = 0; ; attempt += 1) {
        try {
          await uploadCheckInRecordingSegment(this.target.teamId, this.target.memberUserId, this.target.recordingId, {
            index,
            data,
            contentType,
            durationSec,
          });
          return;
        } catch (err) {
          const delay = UPLOAD_RETRY_DELAYS_MS[attempt];
          if (delay === undefined) throw err;
          await wait(delay);
        }
      }
    } catch {
      this.failed += 1;
    } finally {
      this.pending -= 1;
      this.onUploadsChange(this.pending, this.failed);
    }
  }
}

export function formatClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
