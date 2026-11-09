import { describe, expect, test } from "bun:test";
import {
  classifyAudioLevel,
  initialAudioNudgeState,
  nextAudioNudge,
  QUIET_MAX,
  SILENCE_MAX,
  SPEAK_UP_COOLDOWN_MS,
  SPEAK_UP_HOLD_MS,
} from "./call-audio-nudge";

const quiet = (SILENCE_MAX + QUIET_MAX) / 2;
const healthy = QUIET_MAX + 0.02;
const silent = SILENCE_MAX / 2;

describe("classifyAudioLevel", () => {
  test("treats near-zero as listening, not talking", () => {
    expect(classifyAudioLevel(0)).toBe("silence");
    expect(classifyAudioLevel(SILENCE_MAX)).toBe("silence");
  });

  test("treats a low but present level as quiet speech", () => {
    expect(classifyAudioLevel(quiet)).toBe("quiet");
  });

  test("treats a stronger level as healthy", () => {
    expect(classifyAudioLevel(healthy)).toBe("healthy");
  });
});

describe("nextAudioNudge", () => {
  test("asks to unmute as soon as the mic is off", () => {
    const next = nextAudioNudge(initialAudioNudgeState(), {
      level: healthy,
      muted: true,
      atMs: 1_000,
    });
    expect(next.nudge).toBe("muted");
    expect(next.quietSinceMs).toBeNull();
  });

  test("does not nag while the person is only listening", () => {
    const next = nextAudioNudge(initialAudioNudgeState(), {
      level: silent,
      muted: false,
      atMs: 1_000,
    });
    expect(next.nudge).toBeNull();
  });

  test("waits through a short stretch of quiet speech", () => {
    const started = nextAudioNudge(initialAudioNudgeState(), {
      level: quiet,
      muted: false,
      atMs: 1_000,
    });
    const next = nextAudioNudge(started, {
      level: quiet,
      muted: false,
      atMs: 1_000 + SPEAK_UP_HOLD_MS - 1,
    });
    expect(next.nudge).toBeNull();
    expect(next.quietSinceMs).toBe(1_000);
  });

  test("asks them to speak up after quiet speech holds", () => {
    const started = nextAudioNudge(initialAudioNudgeState(), {
      level: quiet,
      muted: false,
      atMs: 1_000,
    });
    const next = nextAudioNudge(started, {
      level: quiet,
      muted: false,
      atMs: 1_000 + SPEAK_UP_HOLD_MS,
    });
    expect(next.nudge).toBe("speak-up");
    expect(next.lastSpeakUpAtMs).toBe(1_000 + SPEAK_UP_HOLD_MS);
  });

  test("clears the prompt when they speak up or go quiet", () => {
    let state = nextAudioNudge(initialAudioNudgeState(), {
      level: quiet,
      muted: false,
      atMs: 1_000,
    });
    state = nextAudioNudge(state, {
      level: quiet,
      muted: false,
      atMs: 1_000 + SPEAK_UP_HOLD_MS,
    });
    expect(nextAudioNudge(state, { level: healthy, muted: false, atMs: 5_000 }).nudge).toBeNull();
    expect(nextAudioNudge(state, { level: silent, muted: false, atMs: 5_000 }).nudge).toBeNull();
  });

  test("keeps the prompt up while they stay in the quiet band", () => {
    let state = nextAudioNudge(initialAudioNudgeState(), {
      level: quiet,
      muted: false,
      atMs: 1_000,
    });
    state = nextAudioNudge(state, {
      level: quiet,
      muted: false,
      atMs: 1_000 + SPEAK_UP_HOLD_MS,
    });
    const held = nextAudioNudge(state, {
      level: quiet,
      muted: false,
      atMs: 1_000 + SPEAK_UP_HOLD_MS + 2_000,
    });
    expect(held.nudge).toBe("speak-up");
  });

  test("does not nag again until the cooldown has passed", () => {
    let state = nextAudioNudge(initialAudioNudgeState(), {
      level: quiet,
      muted: false,
      atMs: 1_000,
    });
    state = nextAudioNudge(state, {
      level: quiet,
      muted: false,
      atMs: 4_000,
    });
    const shownAt = state.lastSpeakUpAtMs!;
    state = nextAudioNudge(state, { level: healthy, muted: false, atMs: shownAt + 100 });
    expect(state.nudge).toBeNull();

    state = nextAudioNudge(state, { level: quiet, muted: false, atMs: shownAt + 200 });
    state = nextAudioNudge(state, {
      level: quiet,
      muted: false,
      atMs: shownAt + 200 + SPEAK_UP_HOLD_MS,
    });
    expect(state.nudge).toBeNull();

    state = nextAudioNudge(state, {
      level: quiet,
      muted: false,
      atMs: shownAt + SPEAK_UP_COOLDOWN_MS,
    });
    state = nextAudioNudge(state, {
      level: quiet,
      muted: false,
      atMs: shownAt + SPEAK_UP_COOLDOWN_MS + SPEAK_UP_HOLD_MS,
    });
    expect(state.nudge).toBe("speak-up");
  });

  test("starts a fresh quiet hold after they unmute", () => {
    let state = nextAudioNudge(initialAudioNudgeState(), {
      level: quiet,
      muted: true,
      atMs: 1_000,
    });
    state = nextAudioNudge(state, {
      level: quiet,
      muted: false,
      atMs: 2_000,
    });
    expect(state.nudge).toBeNull();
    expect(state.quietSinceMs).toBe(2_000);
    state = nextAudioNudge(state, {
      level: quiet,
      muted: false,
      atMs: 2_000 + SPEAK_UP_HOLD_MS,
    });
    expect(state.nudge).toBe("speak-up");
  });
});
