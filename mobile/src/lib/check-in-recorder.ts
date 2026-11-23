import * as FileSystem from "expo-file-system/legacy";
import type { AudioRecorder, RecordingOptions } from "expo-audio";

import { uploadCheckInRecordingSegment } from "@/lib/check-in-recordings-api";
import { loadExpoAudio } from "@/lib/expo-audio-module";

export {
  formatRecordingClock,
  meteringToLevel,
} from "@/lib/check-in-recording-format";

/** Rolling a new file every few minutes keeps each upload small and retryable. */
export const SEGMENT_LENGTH_MS = 5 * 60 * 1000;
export const MAX_RECORDING_MS = 90 * 60 * 1000;
const UPLOAD_RETRY_DELAYS_MS = [2000, 6000, 15000];

/**
 * Mono AAC at a speech-friendly bitrate: a 45 minute conversation lands around
 * 11 MB in total, split across segments of roughly 1.2 MB each. Spelled out
 * rather than spread from `RecordingPresets` so this module stays importable
 * when the native audio module is missing.
 */
export const CHECK_IN_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
  ios: {
    extension: ".m4a",
    // AudioQuality.MIN with the MPEG4AAC container.
    audioQuality: 0,
    outputFormat: "aac ",
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 32000,
  },
};

/**
 * Some devices refuse the speech-tuned settings above and `prepareToRecord`
 * fails with nothing but "Failed to prepare recorder". Falling back through
 * progressively more ordinary settings — ending at the stereo CD-quality
 * combination every device supports — costs a little file size but keeps the
 * check-in recordable. A larger file still uploads; a refused recorder does not.
 */
export const CHECK_IN_RECORDING_FALLBACKS: RecordingOptions[] = [
  CHECK_IN_RECORDING_OPTIONS,
  {
    ...CHECK_IN_RECORDING_OPTIONS,
    sampleRate: 44100,
    bitRate: 64000,
    ios: { ...CHECK_IN_RECORDING_OPTIONS.ios, audioQuality: 64 },
    web: { mimeType: "audio/webm", bitsPerSecond: 64000 },
  },
  {
    ...CHECK_IN_RECORDING_OPTIONS,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    ios: { ...CHECK_IN_RECORDING_OPTIONS.ios, audioQuality: 127 },
    web: { mimeType: "audio/webm", bitsPerSecond: 128000 },
  },
];

/** Raised when no settings combination could open the microphone. */
export class RecorderUnavailableError extends Error {
  constructor(readonly cause: unknown) {
    super(
      "This device would not start its microphone. If another app is using the mic, close it and try again — recording is not available on the iOS simulator.",
    );
    this.name = "RecorderUnavailableError";
  }
}

/**
 * Prepares the recorder, walking the fallback list until one is accepted, and
 * returns the settings that worked so later segments reuse them directly.
 */
async function prepareWithFallback(
  recorder: AudioRecorder,
  preferred: RecordingOptions | null,
): Promise<RecordingOptions> {
  const candidates = preferred ? [preferred] : CHECK_IN_RECORDING_FALLBACKS;
  let lastError: unknown;
  for (const options of candidates) {
    try {
      await recorder.prepareToRecordAsync(options);
      return options;
    } catch (err) {
      lastError = err;
    }
  }
  throw new RecorderUnavailableError(lastError);
}

export type SegmentUploadState = {
  index: number;
  status: "uploading" | "uploaded" | "failed";
};

export type CheckInRecorderCallbacks = {
  onSegmentsChange?: (segments: SegmentUploadState[]) => void;
  onError?: (message: string) => void;
};

export async function ensureMicrophoneAccess(): Promise<boolean> {
  const audio = loadExpoAudio();
  if (!audio) return false;
  const current = await audio.getRecordingPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await audio.requestRecordingPermissionsAsync();
  return asked.granted;
}

/** Keeps capture alive when the screen locks or the app goes to the background. */
export async function prepareAudioSession(): Promise<void> {
  const audio = loadExpoAudio();
  if (!audio) return;
  await audio.setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
  });
}

export async function releaseAudioSession(): Promise<void> {
  const audio = loadExpoAudio();
  if (!audio) return;
  await audio.setAudioModeAsync({
    allowsRecording: false,
    shouldPlayInBackground: false,
    // Kept on so replaying the recording afterwards is audible with the ringer
    // switch on silent, which is how most phones sit.
    playsInSilentMode: true,
  });
}

/**
 * Drives one recording session: rolls segment files on a timer, uploads each
 * finished segment with retries, and reports progress back to the screen.
 *
 * The recorder instance comes from the `useAudioRecorder` hook so React owns its
 * lifecycle; this class only sequences it.
 */
export class CheckInSegmentRecorder {
  private segmentIndex = 0;
  private rollTimer: ReturnType<typeof setTimeout> | null = null;
  private segmentStartedAt = 0;
  private segments: SegmentUploadState[] = [];
  private stopped = false;
  /** True between pause() and resume() so ensureRecording does not reopen the mic. */
  private paused = false;
  private acceptedOptions: RecordingOptions | null = null;

  constructor(
    private readonly recorder: AudioRecorder,
    private readonly target: {
      teamId: string;
      memberUserId: string;
      recordingId: string;
    },
    private readonly callbacks: CheckInRecorderCallbacks = {},
  ) {}

  get pendingUploads(): number {
    return this.segments.filter((segment) => segment.status !== "uploaded").length;
  }

  async start(options?: { startIndex?: number }): Promise<void> {
    this.stopped = false;
    this.paused = false;
    if (typeof options?.startIndex === "number" && options.startIndex > 0) {
      this.segmentIndex = options.startIndex;
    }
    this.acceptedOptions = await prepareWithFallback(this.recorder, null);
    this.recorder.record();
    this.segmentStartedAt = Date.now();
    this.scheduleRoll();
  }

  /**
   * Stops the mic and uploads the open segment before parking. That way a kill
   * while paused still has audio on the server for draft recovery.
   */
  async pause(): Promise<void> {
    if (this.stopped || this.paused) return;
    this.paused = true;
    this.clearRoll();
    await this.finishCurrentSegment();
  }

  async resume(): Promise<void> {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    this.acceptedOptions = await prepareWithFallback(
      this.recorder,
      this.acceptedOptions,
    );
    this.recorder.record();
    this.segmentStartedAt = Date.now();
    this.scheduleRoll();
  }

  /**
   * Re-opens the retention recorder if something else stole the mic (a second
   * recorder for live transcription is the usual culprit on iOS).
   */
  async ensureRecording(): Promise<boolean> {
    if (this.stopped || this.paused) return false;
    try {
      const status = this.recorder.getStatus?.();
      if (status?.isRecording) return true;
      this.clearRoll();
      this.acceptedOptions = await prepareWithFallback(
        this.recorder,
        this.acceptedOptions,
      );
      this.recorder.record();
      this.segmentStartedAt = Date.now();
      this.scheduleRoll();
      return true;
    } catch (err) {
      this.reportError(err);
      return false;
    }
  }

  /** Stops capture and waits for the final segment to finish uploading. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.clearRoll();
    await this.finishCurrentSegment();
  }

  /** Abandons capture without uploading whatever is still in flight. */
  async abort(): Promise<void> {
    this.stopped = true;
    this.clearRoll();
    try {
      await this.recorder.stop();
    } catch {
      /* already stopped */
    }
    const uri = this.recorder.uri;
    if (uri) await deleteLocalFile(uri);
  }

  private scheduleRoll(): void {
    this.clearRoll();
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

  /** Closes the current file, starts the next one, then uploads the closed one. */
  private async rollSegment(): Promise<void> {
    if (this.stopped || this.paused) return;
    try {
      const finished = await this.closeSegment();
      if (this.stopped || this.paused) {
        if (finished) void this.uploadSegment(finished.uri, finished.index, finished.durationSec);
        return;
      }
      await prepareWithFallback(this.recorder, this.acceptedOptions);
      this.recorder.record();
      this.segmentStartedAt = Date.now();
      this.scheduleRoll();
      if (finished) void this.uploadSegment(finished.uri, finished.index, finished.durationSec);
    } catch (err) {
      this.reportError(err);
    }
  }

  private async finishCurrentSegment(): Promise<void> {
    const finished = await this.closeSegment();
    if (finished) {
      await this.uploadSegment(finished.uri, finished.index, finished.durationSec);
    }
  }

  private async closeSegment(): Promise<
    { uri: string; index: number; durationSec: number } | null
  > {
    const durationSec = Math.max(
      0,
      Math.round((Date.now() - this.segmentStartedAt) / 1000),
    );
    try {
      await this.recorder.stop();
    } catch {
      /* recorder was already stopped */
    }
    const uri = this.recorder.uri;
    if (!uri) return null;
    const index = this.segmentIndex;
    this.segmentIndex += 1;
    return { uri, index, durationSec };
  }

  private setSegmentState(index: number, status: SegmentUploadState["status"]): void {
    const existing = this.segments.find((segment) => segment.index === index);
    if (existing) {
      existing.status = status;
    } else {
      this.segments.push({ index, status });
    }
    this.callbacks.onSegmentsChange?.([...this.segments]);
  }

  private async uploadSegment(
    uri: string,
    index: number,
    durationSec: number,
  ): Promise<void> {
    this.setSegmentState(index, "uploading");
    let data: string;
    try {
      data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (err) {
      this.setSegmentState(index, "failed");
      this.reportError(err);
      return;
    }

    for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await uploadCheckInRecordingSegment(
          this.target.teamId,
          this.target.memberUserId,
          this.target.recordingId,
          { index, data, contentType: "audio/m4a", durationSec },
        );
        this.setSegmentState(index, "uploaded");
        await deleteLocalFile(uri);
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

  private reportError(err: unknown): void {
    const message =
      err instanceof Error ? err.message : "Something went wrong while recording.";
    this.callbacks.onError?.(message);
  }
}

async function deleteLocalFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* the OS clears the cache directory anyway */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
