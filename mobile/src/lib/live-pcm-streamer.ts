import * as FileSystem from "expo-file-system/legacy";
import type { AudioRecorder, RecordingOptions } from "expo-audio";

import { loadExpoAudio } from "@/lib/expo-audio-module";

/** Clip length for the live PCM tap. Short enough for progressive finals. */
const LIVE_CLIP_MS = 1800;

/**
 * Linear PCM WAV so we can strip the header and forward raw PCM16 to the
 * realtime transcription socket without a second encode step.
 */
export const LIVE_PCM_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".wav",
  sampleRate: 24000,
  numberOfChannels: 1,
  bitRate: 384000,
  isMeteringEnabled: false,
  ios: {
    extension: ".wav",
    audioQuality: 127,
    outputFormat: "lpcm",
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: {
    extension: ".wav",
    outputFormat: "default",
    audioEncoder: "default",
  },
  web: {
    mimeType: "audio/wav",
    bitsPerSecond: 384000,
  },
};

/**
 * Strips a standard 44-byte WAV header when present and returns base64 PCM16.
 * If the payload is already raw PCM, it is returned unchanged.
 */
export function wavBase64ToPcm16Base64(wavBase64: string): string | null {
  try {
    const binary = globalThis.atob(wavBase64);
    if (binary.length < 44) return wavBase64;
    const isRiff =
      binary.charCodeAt(0) === 0x52 &&
      binary.charCodeAt(1) === 0x49 &&
      binary.charCodeAt(2) === 0x46 &&
      binary.charCodeAt(3) === 0x46;
    const pcm = isRiff ? binary.slice(44) : binary;
    if (!pcm.length) return null;
    return globalThis.btoa(pcm);
  } catch {
    return null;
  }
}

/**
 * Secondary short-clip recorder that tees PCM into live transcription.
 * The primary retention recorder keeps ownership of the long-form m4a path.
 * If this tap cannot open the mic (common when two recorders conflict), it
 * reports failure and leaves the primary recording alone.
 */
export class LivePcmStreamer {
  private stopped = true;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly recorder: AudioRecorder,
    private readonly onPcmBase64: (data: string) => void,
    private readonly onUnavailable?: (message: string) => void,
  ) {}

  async start(): Promise<boolean> {
    this.stopped = false;
    try {
      await this.recorder.prepareToRecordAsync(LIVE_PCM_RECORDING_OPTIONS);
      this.recorder.record();
      this.scheduleClip();
      return true;
    } catch (err) {
      this.stopped = true;
      const message =
        err instanceof Error
          ? err.message
          : "Live transcription could not share the microphone.";
      this.onUnavailable?.(message);
      return false;
    }
  }

  pause(): void {
    this.clearTimer();
    try {
      this.recorder.pause();
    } catch {
      /* ignore */
    }
  }

  resume(): void {
    if (this.stopped) return;
    try {
      this.recorder.record();
      this.scheduleClip();
    } catch {
      /* ignore */
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearTimer();
    try {
      await this.recorder.stop();
    } catch {
      /* ignore */
    }
    const uri = this.recorder.uri;
    if (uri) await deleteLocalFile(uri);
  }

  private scheduleClip(): void {
    this.clearTimer();
    if (this.stopped) return;
    this.loopTimer = setTimeout(() => {
      void this.rollClip();
    }, LIVE_CLIP_MS);
  }

  private clearTimer(): void {
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  private async rollClip(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      try {
        await this.recorder.stop();
      } catch {
        /* already stopped */
      }
      const uri = this.recorder.uri;
      if (uri) {
        try {
          const wavBase64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const pcm = wavBase64ToPcm16Base64(wavBase64);
          if (pcm) this.onPcmBase64(pcm);
        } catch {
          /* skip this clip */
        }
        await deleteLocalFile(uri);
      }

      if (this.stopped) return;
      await this.recorder.prepareToRecordAsync(LIVE_PCM_RECORDING_OPTIONS);
      this.recorder.record();
      this.scheduleClip();
    } catch (err) {
      this.stopped = true;
      const message =
        err instanceof Error
          ? err.message
          : "Live transcription stopped.";
      this.onUnavailable?.(message);
    } finally {
      this.running = false;
    }
  }
}

/**
 * Web-only PCM tap from getUserMedia. Used when MediaRecorder already owns
 * the mic — we share the same stream via AudioContext instead of a second file
 * recorder.
 */
export class WebLivePcmStreamer {
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private stopped = true;

  constructor(private readonly onPcmBase64: (data: string) => void) {}

  async start(existingStream?: MediaStream | null): Promise<boolean> {
    if (typeof window === "undefined") return false;
    this.stopped = false;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return false;

      this.stream =
        existingStream ??
        (await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 24000,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        }));

      this.context = new AudioCtx({ sampleRate: 24000 });
      this.source = this.context.createMediaStreamSource(this.stream);
      // ScriptProcessor is deprecated but widely available; AudioWorklet needs bundling.
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        if (this.stopped) return;
        const input = event.inputBuffer.getChannelData(0);
        const pcm = floatTo16BitPcmBase64(input);
        if (pcm) this.onPcmBase64(pcm);
      };
      this.source.connect(this.processor);
      this.processor.connect(this.context.destination);
      return true;
    } catch {
      await this.stop();
      return false;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      await this.context?.close();
    } catch {
      /* ignore */
    }
    this.processor = null;
    this.source = null;
    this.context = null;
    if (this.stream && !this.stream.getTracks().every((t) => t.readyState === "ended")) {
      // Only stop tracks we opened ourselves when no external stream was passed —
      // tracked by whether getUserMedia created them; callers owning MediaRecorder
      // should pass existingStream so we leave tracks alone.
    }
    this.stream = null;
  }
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
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
}

async function deleteLocalFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ignore */
  }
}

/** Ensures the live tap can ask for mic permission before starting. */
export async function ensureLivePcmReady(): Promise<boolean> {
  const audio = loadExpoAudio();
  if (!audio) return false;
  const current = await audio.getRecordingPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await audio.requestRecordingPermissionsAsync();
  return asked.granted;
}
