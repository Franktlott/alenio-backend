import { describe, expect, test } from "bun:test";
import { stitchTranscript } from "./check-in-recording-service";

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
