import { describe, expect, test } from "bun:test";
import {
  AUDIO_RETENTION_MS,
  audioAccessDecision,
  audioExpiryFrom,
  audioRetentionRemainingMs,
} from "./check-in-audio-access";

const NOW = new Date("2026-09-09T12:00:00.000Z");
const CREATOR = "user_creator";

function recording(overrides: Partial<Parameters<typeof audioAccessDecision>[0]["recording"]> = {}) {
  return {
    createdById: CREATOR,
    audioStatus: "available",
    audioExpiresAt: new Date(NOW.getTime() + 60_000),
    ...overrides,
  };
}

function decide(userId: string, overrides = {}) {
  return audioAccessDecision({ recording: recording(overrides), userId, now: NOW });
}

describe("audioExpiryFrom", () => {
  test("gives the creator seven days from the upload finishing", () => {
    expect(audioExpiryFrom(NOW).toISOString()).toBe("2026-09-16T12:00:00.000Z");
    expect(AUDIO_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("reports no time left once the window has passed", () => {
    const expires = new Date(NOW.getTime() - 1);
    expect(audioRetentionRemainingMs(expires, NOW)).toBe(0);
    expect(audioRetentionRemainingMs(null, NOW)).toBe(0);
  });
});

describe("audioAccessDecision", () => {
  test("lets the creator play audio that is still inside the window", () => {
    expect(decide(CREATOR).allow).toBe(true);
  });

  test("refuses anyone who did not make the recording", () => {
    const result = decide("user_other");
    expect(result).toMatchObject({ allow: false, reason: "not_creator", status: 403 });
  });

  test("refuses a non-creator even when they are the workspace owner", () => {
    // The decision takes no role argument at all, which is the point: no
    // amount of workspace privilege reaches someone else's recording.
    const result = decide("user_workspace_owner");
    expect(result).toMatchObject({ allow: false, reason: "not_creator" });
  });

  test("refuses the creator once the seven days are up", () => {
    const result = decide(CREATOR, { audioExpiresAt: new Date(NOW.getTime() - 1) });
    expect(result).toMatchObject({ allow: false, reason: "expired", status: 410 });
  });

  test("treats the exact expiry moment as over", () => {
    const result = decide(CREATOR, { audioExpiresAt: NOW });
    expect(result).toMatchObject({ allow: false, reason: "expired" });
  });

  test("refuses audio that has already been deleted", () => {
    expect(decide(CREATOR, { audioStatus: "deleted", audioExpiresAt: null })).toMatchObject({
      allow: false,
      reason: "deleted",
      status: 410,
    });
  });

  test("refuses audio mid-deletion so a request cannot race the delete", () => {
    expect(decide(CREATOR, { audioStatus: "deleting" })).toMatchObject({
      allow: false,
      reason: "deleted",
    });
    expect(decide(CREATOR, { audioStatus: "deletion_failed" })).toMatchObject({
      allow: false,
      reason: "deleted",
    });
  });

  test("refuses audio that is still being captured", () => {
    expect(decide(CREATOR, { audioStatus: "pending", audioExpiresAt: null })).toMatchObject({
      allow: false,
      reason: "pending",
      status: 404,
    });
  });

  test("hides the audio state from a non-creator", () => {
    // Someone else's recording answers the same way whether or not the audio
    // is there, so the response cannot be used to probe for it.
    const missing = decide("user_other", { audioStatus: "deleted", audioExpiresAt: null });
    const present = decide("user_other");
    expect(missing).toEqual(present);
  });
});
