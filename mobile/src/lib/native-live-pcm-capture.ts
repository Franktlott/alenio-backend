import { requireNativeModule } from "expo-modules-core";

import {
  SEGMENT_LENGTH_MS,
  type SegmentUploadState,
} from "@/lib/check-in-recorder";
import { uploadCheckInRecordingSegment } from "@/lib/check-in-recordings-api";

const UPLOAD_RETRY_DELAYS_MS = [2000, 6000, 15000];
/** Batch PCM to the live socket so we are not sending every 100ms frame. */
const LIVE_SEND_MS = 400;

type NativeAudioStream = {
  id: string;
  sampleRate: number;
  channels: number;
  isStreaming: boolean;
  start: () => Promise<void>;
  stop: () => void;
  addListener: (
    event: string,
    listener: (payload: {
      data?: ArrayBuffer | { buffer?: ArrayBuffer };
      sampleRate?: number;
      channels?: number;
      timestamp?: number;
      isStreaming?: boolean;
    }) => void,
  ) => { remove: () => void };
};

type ExpoAudioNative = {
  AudioStream: new (options: {
    sampleRate: number;
    channels: number;
    encoding: string;
  }) => NativeAudioStream;
};

type Handlers = {
  onSegmentsChange?: (segments: SegmentUploadState[]) => void;
  onError?: (message: string) => void;
  onPcmBase64?: (data: string) => void;
  onLevel?: (level: number) => void;
};

/**
 * Single-mic capture for native check-ins: expo-audio AudioStream owns the
 * microphone, tees PCM16 into live transcription, and rolls WAV segments for
 * retention — without a second AVAudioRecorder that would steal the session.
 */
export class NativeLivePcmCapture {
  private stream: NativeAudioStream | null = null;
  private bufferSub: { remove: () => void } | null = null;
  private statusSub: { remove: () => void } | null = null;
  private stopped = true;
  private paused = false;
  private segmentIndex = 0;
  private segmentStartedAt = 0;
  private segmentChunks: Uint8Array[] = [];
  private segmentByteLength = 0;
  private liveChunks: Uint8Array[] = [];
  private liveByteLength = 0;
  private liveFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private rollTimer: ReturnType<typeof setTimeout> | null = null;
  private sampleRate = 24000;
  private segments: SegmentUploadState[] = [];
  private uploads: Promise<void>[] = [];

  constructor(
    private readonly target: {
      teamId: string;
      memberUserId: string;
      recordingId: string;
    },
    private readonly handlers: Handlers = {},
  ) {}

  static isSupported(): boolean {
    try {
      const mod = requireNativeModule("ExpoAudio") as ExpoAudioNative | null;
      return !!mod && typeof mod.AudioStream === "function";
    } catch {
      return false;
    }
  }

  async start(options?: { startIndex?: number }): Promise<boolean> {
    if (typeof options?.startIndex === "number" && options.startIndex > 0) {
      this.segmentIndex = options.startIndex;
    }
    this.stopped = false;
    this.paused = false;
    this.segmentChunks = [];
    this.segmentByteLength = 0;
    this.liveChunks = [];
    this.liveByteLength = 0;
    this.segmentStartedAt = Date.now();

    try {
      const mod = requireNativeModule("ExpoAudio") as ExpoAudioNative;
      const stream = new mod.AudioStream({
        sampleRate: 24000,
        channels: 1,
        encoding: "int16",
      });
      this.stream = stream;
      this.bufferSub = stream.addListener("audioStreamBuffer", (payload) => {
        if (this.stopped || this.paused) return;
        const bytes = toUint8Array(payload.data);
        if (!bytes?.length) return;
        if (typeof payload.sampleRate === "number" && payload.sampleRate > 0) {
          this.sampleRate = payload.sampleRate;
        }
        this.handlers.onLevel?.(pcm16Level(bytes));
        this.appendLive(bytes);
        this.appendSegment(bytes);
      });
      this.statusSub = stream.addListener("audioStreamStatus", () => {
        /* isStreaming mirrored via start/stop */
      });
      await stream.start();
      this.sampleRate = stream.sampleRate || 24000;
      this.scheduleRoll();
      this.scheduleLiveFlush();
      return true;
    } catch (err) {
      this.stopped = true;
      this.teardownStream();
      const message =
        err instanceof Error
          ? err.message
          : "Live transcription could not open the microphone.";
      this.handlers.onError?.(message);
      return false;
    }
  }

  async pause(): Promise<void> {
    if (this.stopped || this.paused) return;
    this.paused = true;
    this.clearRoll();
    this.clearLiveFlush();
    this.flushLive();
    await this.finishCurrentSegment();
    try {
      this.stream?.stop();
    } catch {
      /* ignore */
    }
  }

  async resume(): Promise<void> {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    this.segmentChunks = [];
    this.segmentByteLength = 0;
    this.liveChunks = [];
    this.liveByteLength = 0;
    this.segmentStartedAt = Date.now();
    try {
      if (!this.stream) {
        const ok = await this.start({ startIndex: this.segmentIndex });
        if (!ok) return;
        return;
      }
      await this.stream.start();
      this.scheduleRoll();
      this.scheduleLiveFlush();
    } catch (err) {
      this.reportError(err);
    }
  }

  async ensureRecording(): Promise<boolean> {
    if (this.stopped || this.paused) return false;
    if (this.stream?.isStreaming) return true;
    try {
      await this.stream?.start();
      this.scheduleRoll();
      this.scheduleLiveFlush();
      return true;
    } catch {
      return false;
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.clearRoll();
    this.clearLiveFlush();
    this.flushLive();
    await this.finishCurrentSegment();
    this.teardownStream();
    await Promise.all(this.uploads);
  }

  async abort(): Promise<void> {
    this.stopped = true;
    this.clearRoll();
    this.clearLiveFlush();
    this.segmentChunks = [];
    this.segmentByteLength = 0;
    this.liveChunks = [];
    this.liveByteLength = 0;
    this.teardownStream();
  }

  private appendLive(bytes: Uint8Array): void {
    this.liveChunks.push(bytes);
    this.liveByteLength += bytes.byteLength;
  }

  private appendSegment(bytes: Uint8Array): void {
    this.segmentChunks.push(bytes);
    this.segmentByteLength += bytes.byteLength;
  }

  private scheduleLiveFlush(): void {
    this.clearLiveFlush();
    if (this.stopped || this.paused) return;
    this.liveFlushTimer = setTimeout(() => {
      this.flushLive();
      this.scheduleLiveFlush();
    }, LIVE_SEND_MS);
  }

  private clearLiveFlush(): void {
    if (this.liveFlushTimer) {
      clearTimeout(this.liveFlushTimer);
      this.liveFlushTimer = null;
    }
  }

  private flushLive(): void {
    if (!this.liveByteLength || !this.handlers.onPcmBase64) {
      this.liveChunks = [];
      this.liveByteLength = 0;
      return;
    }
    const merged = mergeChunks(this.liveChunks, this.liveByteLength);
    this.liveChunks = [];
    this.liveByteLength = 0;
    const b64 = uint8ToBase64(merged);
    if (b64) this.handlers.onPcmBase64(b64);
  }

  private scheduleRoll(): void {
    this.clearRoll();
    if (this.stopped || this.paused) return;
    this.rollTimer = setTimeout(() => {
      void this.rollSegment();
    }, SEGMENT_LENGTH_MS);
  }

  private clearRoll(): void {
    if (this.rollTimer) {
      clearTimeout(this.rollTimer);
      this.rollTimer = null;
    }
  }

  private async rollSegment(): Promise<void> {
    if (this.stopped || this.paused) return;
    await this.finishCurrentSegment();
    this.segmentStartedAt = Date.now();
    this.scheduleRoll();
  }

  private async finishCurrentSegment(): Promise<void> {
    if (!this.segmentByteLength) return;
    const durationSec = Math.max(
      0,
      Math.round((Date.now() - this.segmentStartedAt) / 1000),
    );
    const pcm = mergeChunks(this.segmentChunks, this.segmentByteLength);
    this.segmentChunks = [];
    this.segmentByteLength = 0;
    const index = this.segmentIndex;
    this.segmentIndex += 1;
    const upload = this.uploadWav(pcm, index, durationSec);
    this.uploads.push(upload);
    await upload;
  }

  private async uploadWav(
    pcm: Uint8Array,
    index: number,
    durationSec: number,
  ): Promise<void> {
    this.setSegmentState(index, "uploading");
    const wav = pcm16MonoToWav(pcm, this.sampleRate);
    const data = uint8ToBase64(wav);
    if (!data) {
      this.setSegmentState(index, "failed");
      return;
    }

    for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await uploadCheckInRecordingSegment(
          this.target.teamId,
          this.target.memberUserId,
          this.target.recordingId,
          { index, data, contentType: "audio/wav", durationSec },
        );
        this.setSegmentState(index, "uploaded");
        return;
      } catch (err) {
        const delay = UPLOAD_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          this.setSegmentState(index, "failed");
          this.reportError(err);
          return;
        }
        await sleep(delay);
      }
    }
  }

  private setSegmentState(
    index: number,
    status: SegmentUploadState["status"],
  ): void {
    const existing = this.segments.find((segment) => segment.index === index);
    if (existing) {
      existing.status = status;
    } else {
      this.segments.push({ index, status });
    }
    this.handlers.onSegmentsChange?.([...this.segments]);
  }

  private teardownStream(): void {
    try {
      this.bufferSub?.remove();
      this.statusSub?.remove();
      this.stream?.stop();
    } catch {
      /* ignore */
    }
    this.bufferSub = null;
    this.statusSub = null;
    this.stream = null;
  }

  private reportError(err: unknown): void {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong while recording.";
    this.handlers.onError?.(message);
  }
}

function toUint8Array(
  data: ArrayBuffer | { buffer?: ArrayBuffer } | undefined,
): Uint8Array | null {
  if (!data) return null;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof ArrayBuffer !== "undefined" && (data as ArrayBuffer).byteLength != null) {
    try {
      return new Uint8Array(data as ArrayBuffer);
    } catch {
      /* fall through */
    }
  }
  if (typeof data === "object" && data && "buffer" in data && data.buffer) {
    return new Uint8Array(data.buffer);
  }
  return null;
}

function mergeChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function pcm16Level(bytes: Uint8Array): number {
  if (bytes.byteLength < 2) return 0;
  const view = new Int16Array(
    bytes.buffer,
    bytes.byteOffset,
    Math.floor(bytes.byteLength / 2),
  );
  let sum = 0;
  for (let i = 0; i < view.length; i += 1) {
    const n = view[i]! / 32768;
    sum += n * n;
  }
  return Math.min(1, Math.sqrt(sum / Math.max(1, view.length)) * 4);
}

function pcm16MonoToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);

  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function uint8ToBase64(bytes: Uint8Array): string | null {
  try {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode(...slice);
    }
    return globalThis.btoa(binary);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
