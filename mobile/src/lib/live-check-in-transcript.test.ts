import { describe, expect, test } from "bun:test";

import {
  applyLiveTranscriptEvent,
  formatClockMs,
  liveTranscriptWordCount,
} from "./live-check-in-transcript";

describe("live check-in transcript", () => {
  test("formats timestamps", () => {
    expect(formatClockMs(0)).toBe("00:00");
    expect(formatClockMs(35_000)).toBe("00:35");
    expect(formatClockMs(128_000)).toBe("02:08");
  });

  test("replaces interim text for the same id without duplicating finals", () => {
    let lines = applyLiveTranscriptEvent([], {
      event: "interim",
      id: "a",
      text: "hello",
      startMs: 1000,
      endMs: null,
      speakerLabel: null,
    });
    lines = applyLiveTranscriptEvent(lines, {
      event: "interim",
      id: "a",
      text: "hello there",
      startMs: 1000,
      endMs: null,
      speakerLabel: null,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.interim).toBe(true);
    expect(lines[0]?.text).toBe("hello there");

    lines = applyLiveTranscriptEvent(lines, {
      event: "final",
      id: "a",
      text: "hello there",
      startMs: 1000,
      endMs: 2500,
      speakerLabel: null,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.interim).toBe(false);

    lines = applyLiveTranscriptEvent(lines, {
      event: "final",
      id: "a",
      text: "hello there",
      startMs: 1000,
      endMs: 2500,
      speakerLabel: null,
    });
    expect(lines).toHaveLength(1);
    expect(liveTranscriptWordCount(lines)).toBe(2);
  });
});
