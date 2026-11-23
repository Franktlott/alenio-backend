import { describe, expect, test } from "bun:test";
import {
  cancelRecordingDecision,
  recordingHasRecoverableContent,
} from "./check-in-recording-service";

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

describe("cancel and abandoned sweep draft safety", () => {
  test("cancel with segments finishes to draft", () => {
    expect(cancelRecordingDecision({ status: "recording", segmentsCount: 3 })).toBe(
      "finish",
    );
  });

  test("cancel empty deletes", () => {
    expect(cancelRecordingDecision({ status: "recording" })).toBe("delete");
  });

  test("abandoned with live transcript finishes", () => {
    expect(
      cancelRecordingDecision({
        status: "recording",
        transcriptSegmentsCount: 1,
      }),
    ).toBe("finish");
  });

  test("abandoned empty purges", () => {
    expect(
      cancelRecordingDecision({
        status: "recording",
        durationSec: 0,
        transcript: "",
        segmentsCount: 0,
        transcriptSegmentsCount: 0,
      }),
    ).toBe("delete");
  });

  test("dismissing a failed write-up always deletes", () => {
    expect(
      cancelRecordingDecision({
        status: "failed",
        durationSec: 45,
        segmentsCount: 2,
        transcript: "too quiet to write up",
      }),
    ).toBe("delete");
  });
});
