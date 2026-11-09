import { describe, expect, test } from "bun:test";
import {
  MIN_TRANSCRIPT_WORDS,
  spokenWordCount,
  stitchTranscript,
} from "./check-in-recording-service";
import { checkInAudioExtension, checkInAudioFormatForPath } from "./seneca-transcribe";

describe("stitchTranscript", () => {
  test("joins segments in recorded order regardless of row order", () => {
    const transcript = stitchTranscript([
      { index: 1, status: "done", text: "Then we talked about staffing." },
      { index: 0, status: "done", text: "We opened with last week's numbers." },
    ]);
    expect(transcript).toBe(
      "We opened with last week's numbers.\n\nThen we talked about staffing.",
    );
  });

  test("marks a gap where a segment could not be transcribed", () => {
    const transcript = stitchTranscript([
      { index: 0, status: "done", text: "First half." },
      { index: 1, status: "failed", text: null },
      { index: 2, status: "done", text: "Second half." },
    ]);
    expect(transcript).toBe(
      "First half.\n\n[part of this conversation could not be transcribed]\n\nSecond half.",
    );
  });

  test("treats a segment that never finished as a gap, not as silence", () => {
    const transcript = stitchTranscript([
      { index: 0, status: "done", text: "Only part we captured." },
      { index: 1, status: "uploaded", text: null },
    ]);
    expect(transcript).toContain("could not be transcribed");
  });

  test("keeps silence out of the transcript when a segment really was empty", () => {
    const transcript = stitchTranscript([
      { index: 0, status: "done", text: "   " },
      { index: 1, status: "done", text: "Actual words." },
    ]);
    expect(transcript).toBe("Actual words.");
  });

  test("returns an empty string when nothing was captured", () => {
    expect(stitchTranscript([])).toBe("");
    expect(stitchTranscript([{ index: 0, status: "done", text: null }])).toBe("");
  });
});

describe("spokenWordCount", () => {
  test("gap notes alone count as nothing heard", () => {
    const transcript = stitchTranscript([
      { index: 0, status: "failed", text: null },
      { index: 1, status: "failed", text: null },
    ]);
    expect(spokenWordCount(transcript)).toBe(0);
  });

  test("a stray phrase from silence is below the write-up threshold", () => {
    expect(spokenWordCount("Thank you for watching.")).toBeLessThan(MIN_TRANSCRIPT_WORDS);
  });

  test("counts real words around a gap", () => {
    const transcript = stitchTranscript([
      { index: 0, status: "done", text: "We went over the new route and the Friday staffing plan." },
      { index: 1, status: "failed", text: null },
    ]);
    expect(spokenWordCount(transcript)).toBe(11);
  });
});

describe("check-in audio format", () => {
  test("keeps a browser recording's real container", () => {
    expect(checkInAudioExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(checkInAudioFormatForPath("check-in-audio/t/1-abc-segment-0.webm")).toEqual({
      extension: "webm",
      mimeType: "audio/webm",
    });
  });

  test("older segments without a known extension stay m4a", () => {
    expect(checkInAudioExtension("audio/x-m4a")).toBe("m4a");
    expect(checkInAudioFormatForPath("check-in-audio/t/1-abc-segment-0.m4a").mimeType).toBe("audio/m4a");
    expect(checkInAudioFormatForPath(null).extension).toBe("m4a");
  });
});
