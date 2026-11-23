import { describe, expect, test } from "bun:test";
import { recordingHasRecoverableContent } from "./check-in-recording-service";

describe("recordingHasRecoverableContent", () => {
  test("empty consent start has nothing to keep", () => {
    expect(
      recordingHasRecoverableContent({
        durationSec: 0,
        transcript: null,
        segmentsCount: 0,
        transcriptSegmentsCount: 0,
      }),
    ).toBe(false);
  });

  test("whitespace-only transcript is empty", () => {
    expect(
      recordingHasRecoverableContent({
        durationSec: 0,
        transcript: "   ",
        segmentsCount: 0,
        transcriptSegmentsCount: 0,
      }),
    ).toBe(false);
  });

  test("audio segments mean finish, not delete", () => {
    expect(
      recordingHasRecoverableContent({
        durationSec: 0,
        transcript: null,
        segmentsCount: 1,
        transcriptSegmentsCount: 0,
      }),
    ).toBe(true);
  });

  test("live transcript segments mean finish, not delete", () => {
    expect(
      recordingHasRecoverableContent({
        durationSec: 0,
        transcript: null,
        segmentsCount: 0,
        transcriptSegmentsCount: 2,
      }),
    ).toBe(true);
  });

  test("non-zero duration means finish, not delete", () => {
    expect(
      recordingHasRecoverableContent({
        durationSec: 12,
        transcript: null,
        segmentsCount: 0,
        transcriptSegmentsCount: 0,
      }),
    ).toBe(true);
  });

  test("stitched transcript text means finish, not delete", () => {
    expect(
      recordingHasRecoverableContent({
        durationSec: 0,
        transcript: "We covered last week's numbers.",
        segmentsCount: 0,
        transcriptSegmentsCount: 0,
      }),
    ).toBe(true);
  });
});

/**
 * Mirrors the cancel/sweep branch: recoverable content → finish; else purge.
 * Kept here so the product rule stays explicit next to the helper.
 */
function cancelAction(
  recording: Parameters<typeof recordingHasRecoverableContent>[0],
): "finish" | "delete" {
  return recordingHasRecoverableContent(recording) ? "finish" : "delete";
}

describe("cancel and abandoned sweep draft safety", () => {
  test("cancel with segments finishes to draft", () => {
    expect(cancelAction({ segmentsCount: 3 })).toBe("finish");
  });

  test("cancel empty deletes", () => {
    expect(cancelAction({})).toBe("delete");
  });

  test("abandoned with live transcript finishes", () => {
    expect(cancelAction({ transcriptSegmentsCount: 1 })).toBe("finish");
  });

  test("abandoned empty purges", () => {
    expect(
      cancelAction({
        durationSec: 0,
        transcript: "",
        segmentsCount: 0,
        transcriptSegmentsCount: 0,
      }),
    ).toBe("delete");
  });
});
