import type * as ExpoAudio from "expo-audio";

/**
 * `expo-audio` is a native module, so it is only present in builds that were
 * compiled with it. Loading it lazily keeps older builds of the app usable —
 * they simply do not offer recording — instead of red-screening on import.
 */
export type ExpoAudioApi = typeof ExpoAudio;

let cached: ExpoAudioApi | null | undefined;

/**
 * True when the native registry exists and has no audio in it, which is an
 * app binary built before the dependency. Asking anyway is not harmless: a
 * development build reports any error thrown while loading a module as fatal
 * and red-screens, even though the require below catches it.
 */
function nativeAudioMissing(): boolean {
  const modules = (
    globalThis as { expo?: { modules?: Record<string, unknown> } }
  ).expo?.modules;
  return !!modules && !modules.ExpoAudio;
}

export function loadExpoAudio(): ExpoAudioApi | null {
  if (cached !== undefined) return cached;
  if (nativeAudioMissing()) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-audio") as ExpoAudioApi;
    cached = mod && typeof mod.useAudioRecorder === "function" ? mod : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when this build can record audio. */
export function isAudioRecordingSupported(): boolean {
  return loadExpoAudio() !== null;
}

/**
 * True when this build can play audio back. Checked separately from recording
 * because an older build can still be asked to replay a recording made on a
 * newer one, and it should hide the player rather than crash.
 */
export function isAudioPlaybackSupported(): boolean {
  const mod = loadExpoAudio();
  return !!mod && typeof mod.createAudioPlayer === "function";
}
