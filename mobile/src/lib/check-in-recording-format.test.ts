import { describe, expect, test } from "bun:test";
import {
  formatRecordingClock,
  meteringToLevel,
  processingLabel,
  recordingErrorMessage,
} from "./check-in-recording-format";

describe("formatRecordingClock", () => {
  test("shows minutes and seconds for short recordings", () => {
    expect(formatRecordingClock(0)).toBe("0:00");
    expect(formatRecordingClock(9)).toBe("0:09");
    expect(formatRecordingClock(75)).toBe("1:15");
  });

  test("adds an hours segment once the conversation runs long", () => {
    expect(formatRecordingClock(3600)).toBe("1:00:00");
    expect(formatRecordingClock(3725)).toBe("1:02:05");
  });

  test("never renders a negative clock", () => {
    expect(formatRecordingClock(-30)).toBe("0:00");
  });
});

describe("meteringToLevel", () => {
  test("returns silence for missing or unusable metering", () => {
    expect(meteringToLevel(undefined)).toBe(0);
    expect(meteringToLevel(Number.NaN)).toBe(0);
  });

  test("clamps to the 0-1 range", () => {
    expect(meteringToLevel(-120)).toBe(0);
    expect(meteringToLevel(-60)).toBe(0);
    expect(meteringToLevel(0)).toBe(1);
    expect(meteringToLevel(12)).toBe(1);
  });

  test("scales mid-range levels", () => {
    expect(meteringToLevel(-30)).toBeCloseTo(0.5, 5);
  });
});

describe("processingLabel", () => {
  test("counts the parts still uploading", () => {
    expect(processingLabel("uploading", 3)).toBe(
      "Saving the last 3 parts of your conversation",
    );
    expect(processingLabel("uploading", 1)).toBe("Saving the last part of your conversation");
  });

  test("describes the later stages", () => {
    expect(processingLabel("transcribing", 0)).toBe("Writing up what was said");
    expect(processingLabel("drafting", 0)).toBe("Filling in your check-in");
  });
});

describe("recordingErrorMessage", () => {
  test("explains a recorder that would not open the microphone", () => {
    const raw = new Error(
      "Calling the 'prepareToRecordAsync' function has failed\n→ Caused by: AudioRecordingException: Audio recording error (at ExpoAudio/AudioRecorder.swift:112)",
    );
    expect(recordingErrorMessage(raw)).toBe(
      "This device would not start its microphone. If another app is using the mic, close it and try again.",
    );
  });

  test("points at the microphone setting when permission is the problem", () => {
    expect(recordingErrorMessage(new Error("Recording permission denied"))).toBe(
      "Alenio needs microphone access to record this check-in. You can turn it on in Settings.",
    );
  });

  test("hides raw native exception dumps", () => {
    expect(recordingErrorMessage(new Error("NSInternalInconsistencyException at Foo.swift:9"))).toBe(
      "Something went wrong while recording.",
    );
    expect(recordingErrorMessage(undefined)).toBe("Something went wrong while recording.");
    expect(recordingErrorMessage("   ")).toBe("Something went wrong while recording.");
  });

  test("passes through messages already written for people", () => {
    expect(recordingErrorMessage(new Error("We could not save that recording."))).toBe(
      "We could not save that recording.",
    );
  });
});
