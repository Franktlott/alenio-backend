import { describe, expect, test } from "bun:test";
import {
  appendTranscriptEvent,
  formatTranscript,
  transcriptIsUsable,
  transcriptWordCount,
  type TranscriptLine,
} from "./call-transcript";

const speakers: Record<string, string> = { a: "Frank", b: "Tyrell" };
const speakerFor = (id: string) => speakers[id] ?? "Someone";

function build(
  events: Array<{ participantId: string; text: string; timestamp?: number }>,
): TranscriptLine[] {
  return events.reduce<TranscriptLine[]>(
    (lines, event) => appendTranscriptEvent(lines, event, speakerFor),
    [],
  );
}

describe("appendTranscriptEvent", () => {
  test("labels each utterance with the speaker's name", () => {
    const lines = build([
      { participantId: "a", text: "How did the week go?" },
      { participantId: "b", text: "Better than last week." },
    ]);
    expect(lines).toEqual([
      { speaker: "Frank", text: "How did the week go?", atMs: 0 },
      { speaker: "Tyrell", text: "Better than last week.", atMs: 0 },
    ]);
  });

  test("merges consecutive utterances from the same speaker", () => {
    const lines = build([
      { participantId: "b", text: "We hit the target." },
      { participantId: "b", text: "Barely, but we hit it." },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("We hit the target. Barely, but we hit it.");
  });

  test("keeps the first timestamp when merging", () => {
    const lines = build([
      { participantId: "a", text: "First", timestamp: 1000 },
      { participantId: "a", text: "second", timestamp: 5000 },
    ]);
    expect(lines[0]!.atMs).toBe(1000);
  });

  test("drops a repeat of what the speaker just said", () => {
    const lines = build([
      { participantId: "a", text: "Staffing is tight." },
      { participantId: "a", text: "Staffing is tight." },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("Staffing is tight.");
  });

  test("drops a corrected resend that ends with the same text", () => {
    let lines = build([{ participantId: "a", text: "we need more hours" }]);
    lines = appendTranscriptEvent(
      lines,
      { participantId: "a", text: "more hours" },
      speakerFor,
    );
    expect(lines[0]!.text).toBe("we need more hours");
  });

  test("ignores empty or whitespace-only events", () => {
    const lines = build([
      { participantId: "a", text: "   " },
      { participantId: "a", text: "" },
    ]);
    expect(lines).toEqual([]);
  });

  test("falls back to a neutral label for an unknown participant", () => {
    const lines = build([{ participantId: "zzz", text: "Hello." }]);
    expect(lines[0]!.speaker).toBe("Someone");
  });

  test("does not mutate the array it is given", () => {
    const original: TranscriptLine[] = [];
    const next = appendTranscriptEvent(
      original,
      { participantId: "a", text: "Hi" },
      speakerFor,
    );
    expect(original).toHaveLength(0);
    expect(next).toHaveLength(1);
  });
});

describe("formatTranscript", () => {
  test("renders one labelled line per turn", () => {
    const lines = build([
      { participantId: "a", text: "How are the new hires?" },
      { participantId: "b", text: "Coming along well." },
    ]);
    expect(formatTranscript(lines)).toBe(
      "Frank: How are the new hires?\nTyrell: Coming along well.",
    );
  });

  test("returns an empty string for an empty transcript", () => {
    expect(formatTranscript([])).toBe("");
  });
});

describe("transcriptWordCount", () => {
  test("counts words across every line", () => {
    const lines = build([
      { participantId: "a", text: "one two three" },
      { participantId: "b", text: "four five" },
    ]);
    expect(transcriptWordCount(lines)).toBe(5);
  });
});

describe("transcriptIsUsable", () => {
  test("rejects a conversation too thin to summarize", () => {
    const lines = build([{ participantId: "a", text: "Hey, quick one." }]);
    expect(transcriptIsUsable(lines)).toBe(false);
  });

  test("accepts a real conversation", () => {
    const words = Array.from({ length: 45 }, (_, i) => `word${i}`).join(" ");
    const lines = build([{ participantId: "a", text: words }]);
    expect(transcriptIsUsable(lines)).toBe(true);
  });
});
