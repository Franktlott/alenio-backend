/**
 * Decides when to ask someone to unmute or speak up during live notes.
 *
 * Daily reports a 0–1 microphone level. Silence (just listening) must not
 * nag. Only a band of quiet speech, held for a moment, should.
 */

export type AudioNudge = "muted" | "speak-up" | null;

export type AudioLevelBand = "silence" | "quiet" | "healthy";

export const SILENCE_MAX = 0.012;
export const QUIET_MAX = 0.045;
export const SPEAK_UP_HOLD_MS = 3000;
export const SPEAK_UP_COOLDOWN_MS = 45_000;

export type AudioNudgeState = {
  quietSinceMs: number | null;
  lastSpeakUpAtMs: number | null;
  nudge: AudioNudge;
};

export function initialAudioNudgeState(): AudioNudgeState {
  return { quietSinceMs: null, lastSpeakUpAtMs: null, nudge: null };
}

export function classifyAudioLevel(level: number): AudioLevelBand {
  if (level <= SILENCE_MAX) return "silence";
  if (level < QUIET_MAX) return "quiet";
  return "healthy";
}

type Sample = {
  level: number;
  muted: boolean;
  atMs: number;
};

/**
 * One sample in, the next banner out. Pure so hold time and cooldown can be
 * unit-tested without a live call.
 */
export function nextAudioNudge(
  state: AudioNudgeState,
  sample: Sample,
): AudioNudgeState {
  if (sample.muted) {
    return {
      quietSinceMs: null,
      lastSpeakUpAtMs: state.lastSpeakUpAtMs,
      nudge: "muted",
    };
  }

  const band = classifyAudioLevel(sample.level);

  if (band !== "quiet") {
    return {
      quietSinceMs: null,
      lastSpeakUpAtMs: state.lastSpeakUpAtMs,
      nudge: null,
    };
  }

  const quietSinceMs = state.quietSinceMs ?? sample.atMs;
  if (state.nudge === "speak-up") {
    return {
      quietSinceMs,
      lastSpeakUpAtMs: state.lastSpeakUpAtMs,
      nudge: "speak-up",
    };
  }

  const heldLongEnough = sample.atMs - quietSinceMs >= SPEAK_UP_HOLD_MS;
  const cooledOff =
    state.lastSpeakUpAtMs === null ||
    sample.atMs - state.lastSpeakUpAtMs >= SPEAK_UP_COOLDOWN_MS;

  if (heldLongEnough && cooledOff) {
    return {
      quietSinceMs,
      lastSpeakUpAtMs: sample.atMs,
      nudge: "speak-up",
    };
  }

  return {
    quietSinceMs,
    lastSpeakUpAtMs: state.lastSpeakUpAtMs,
    nudge: null,
  };
}
