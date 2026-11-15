import { describe, expect, test } from "bun:test";

import { stitchLiveTranscriptSegments } from "./check-in-transcript-segments";

describe("stitchLiveTranscriptSegments", () => {
  test("joins finals with optional speakers", () => {
    const text = stitchLiveTranscriptSegments([
      { startMs: 1000, text: "Hello there", speakerLabel: null },
      { startMs: 4000, text: "How are things?", speakerLabel: "Alex" },
    ]);
    expect(text).toBe("Hello there\n\nAlex: How are things?");
  });

  test("skips blank lines", () => {
    expect(
      stitchLiveTranscriptSegments([
        { startMs: 0, text: "  ", speakerLabel: null },
        { startMs: 1, text: "Real words", speakerLabel: null },
      ]),
    ).toBe("Real words");
  });
});
